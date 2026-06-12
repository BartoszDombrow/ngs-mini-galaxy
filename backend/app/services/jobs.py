import json
import shutil
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import JOBS_DIR, RESULTS_DIR
from app.db.session import SessionLocal
from app.models.job import Job
from app.models.job_comment import JobComment
from app.models.job_step import JobStep
from app.models.project import Project
from app.models.upload_file import UploadFile
from app.models.user import User


TOOL_SPECS = {
    "fastqc": {
        "description": "Kontrola jakości odczytów FASTQ.",
        "input_mode": "project",
        "runner_mode": "real",
        "accepted_file_types": ["fastq", "fastq.gz"],
        "options": [
            {
                "key": "nogroup",
                "flag": "--nogroup",
                "label": "Bez grupowania",
                "description": "Nie grupuj pozycji dla długich odczytów na wykresach.",
                "value_type": "boolean",
            },
            {
                "key": "threads",
                "flag": "--threads",
                "label": "Liczba wątków",
                "description": "Liczba wątków roboczych używanych przez FastQC.",
                "value_type": "number",
                "placeholder": "2",
            },
            {
                "key": "kmers",
                "flag": "--kmers",
                "label": "Rozmiar k-merów",
                "description": "Określ rozmiar k-merów do analizy.",
                "value_type": "number",
                "placeholder": "7",
            },
            {
                "key": "min_length",
                "flag": "--min_length",
                "label": "Minimalna długość",
                "description": "Ignoruj odczyty krótsze niż podany próg.",
                "value_type": "number",
                "placeholder": "0",
            },
            {
                "key": "extra_args",
                "flag": "",
                "label": "Dodatkowe argumenty",
                "description": "Własne dodatkowe argumenty CLI przekazane bezpośrednio do FastQC.",
                "value_type": "string",
                "placeholder": "--quiet",
            },
        ],
    },
    "multiqc": {
        "description": "Agregacja raportów QC w jeden raport zbiorczy.",
        "input_mode": "job",
        "runner_mode": "real",
        "accepted_file_types": [],
        "options": [
            {
                "key": "title",
                "flag": "--title",
                "label": "Tytuł raportu",
                "description": "Własny tytuł generowanego raportu MultiQC.",
                "value_type": "string",
                "placeholder": "Podsumowanie projektu",
            },
            {
                "key": "force",
                "flag": "--force",
                "label": "Nadpisz raport",
                "description": "Nadpisz pliki wynikowe, jeśli już istnieją.",
                "value_type": "boolean",
            },
            {
                "key": "filename",
                "flag": "--filename",
                "label": "Nazwa pliku raportu",
                "description": "Nazwa wynikowego raportu HTML.",
                "value_type": "string",
                "placeholder": "multiqc_report.html",
            },
            {
                "key": "comment",
                "flag": "--comment",
                "label": "Komentarz w raporcie",
                "description": "Komentarz dodany do nagłówka raportu MultiQC.",
                "value_type": "string",
                "placeholder": "Wersja demonstracyjna",
            },
            {
                "key": "extra_args",
                "flag": "",
                "label": "Dodatkowe argumenty",
                "description": "Własne dodatkowe argumenty CLI przekazane bezpośrednio do MultiQC.",
                "value_type": "string",
                "placeholder": "--verbose",
            },
        ],
    },
    "trimmomatic": {
        "description": "Przycinanie odczytów z konfigurowalnymi progami jakości i adapterami.",
        "input_mode": "project",
        "runner_mode": "real",
        "accepted_file_types": ["fastq", "fastq.gz"],
        "options": [
            {
                "key": "threads",
                "flag": "-threads",
                "label": "Liczba wątków",
                "description": "Liczba wątków roboczych używanych przez Trimmomatic.",
                "value_type": "number",
                "placeholder": "4",
            },
            {
                "key": "phred33",
                "flag": "-phred33",
                "label": "Phred+33",
                "description": "Interpretuj wartości jakości jako Phred+33.",
                "value_type": "boolean",
            },
            {
                "key": "phred64",
                "flag": "-phred64",
                "label": "Phred+64",
                "description": "Interpretuj wartości jakości jako Phred+64.",
                "value_type": "boolean",
            },
            {
                "key": "illuminaclip",
                "flag": "ILLUMINACLIP",
                "label": "Usuwanie adapterów",
                "description": "Reguła usuwania adapterów, np. adapters.fa:2:30:10.",
                "value_type": "string",
                "placeholder": "TruSeq3-PE.fa:2:30:10",
            },
            {
                "key": "slidingwindow",
                "flag": "SLIDINGWINDOW",
                "label": "Okno przesuwne",
                "description": "Przytnij odczyt, gdy średnia jakość w oknie spadnie, np. 4:20.",
                "value_type": "string",
                "placeholder": "4:20",
            },
            {
                "key": "leading",
                "flag": "LEADING",
                "label": "Jakość na początku",
                "description": "Usuń niskiej jakości zasady z początku odczytu.",
                "value_type": "number",
                "placeholder": "3",
            },
            {
                "key": "trailing",
                "flag": "TRAILING",
                "label": "Jakość na końcu",
                "description": "Usuń niskiej jakości zasady z końca odczytu.",
                "value_type": "number",
                "placeholder": "3",
            },
            {
                "key": "minlen",
                "flag": "MINLEN",
                "label": "Minimalna długość",
                "description": "Odrzuć odczyty krótsze niż ten próg po przycięciu.",
                "value_type": "number",
                "placeholder": "36",
            },
            {
                "key": "headcrop",
                "flag": "HEADCROP",
                "label": "Ucięcie początku",
                "description": "Usuń stałą liczbę zasad z początku każdego odczytu.",
                "value_type": "number",
                "placeholder": "10",
            },
            {
                "key": "crop",
                "flag": "CROP",
                "label": "Docelowa długość",
                "description": "Zachowaj tylko pierwsze N zasad odczytu.",
                "value_type": "number",
                "placeholder": "100",
            },
            {
                "key": "avgqual",
                "flag": "AVGQUAL",
                "label": "Średnia jakość",
                "description": "Odrzuć odczyty o średniej jakości niższej niż próg.",
                "value_type": "number",
                "placeholder": "20",
            },
            {
                "key": "extra_args",
                "flag": "",
                "label": "Dodatkowe argumenty",
                "description": "Własne dodatkowe argumenty CLI przekazane bezpośrednio do Trimmomatic.",
                "value_type": "string",
                "placeholder": "TOPHRED33",
            },
        ],
    },
    "bwa": {
        "description": "Mapowanie odczytów do genomu referencyjnego.",
        "input_mode": "project",
        "runner_mode": "demo",
        "accepted_file_types": ["fastq", "fastq.gz", "fasta"],
        "options": [
            {
                "key": "algorithm",
                "flag": "__algorithm__",
                "label": "Wariant BWA",
                "description": "Wybierz wariant programu BWA uruchamiany w tym kroku, np. mem albo mem2.",
                "value_type": "choice",
                "choices": ["mem", "mem2", "aln"],
            },
            {
                "key": "threads",
                "flag": "-t",
                "label": "Liczba wątków",
                "description": "Liczba wątków roboczych używanych przez BWA.",
                "value_type": "number",
                "placeholder": "4",
            },
            {
                "key": "min_seed_len",
                "flag": "-k",
                "label": "Minimalna długość ziarna",
                "description": "Minimalna długość seeda dla BWA MEM.",
                "value_type": "number",
                "placeholder": "19",
            },
            {
                "key": "band_width",
                "flag": "-w",
                "label": "Szerokość pasma",
                "description": "Szerokość pasma podczas rozszerzania dopasowania.",
                "value_type": "number",
                "placeholder": "100",
            },
            {
                "key": "match_score",
                "flag": "-A",
                "label": "Punkty za dopasowanie",
                "description": "Wartość punktowa za zgodną zasadę.",
                "value_type": "number",
                "placeholder": "1",
            },
            {
                "key": "mismatch_penalty",
                "flag": "-B",
                "label": "Kara za niedopasowanie",
                "description": "Kara za niedopasowaną zasadę.",
                "value_type": "number",
                "placeholder": "4",
            },
            {
                "key": "gap_open_penalty",
                "flag": "-O",
                "label": "Kara za otwarcie luki",
                "description": "Kara za rozpoczęcie luki.",
                "value_type": "string",
                "placeholder": "6,6",
            },
            {
                "key": "gap_extend_penalty",
                "flag": "-E",
                "label": "Kara za wydłużenie luki",
                "description": "Kara za wydłużenie istniejącej luki.",
                "value_type": "string",
                "placeholder": "1,1",
            },
            {
                "key": "mark_short_split",
                "flag": "-M",
                "label": "Oznacz krótkie split hits",
                "description": "Oznacz krótkie split hits jako secondary.",
                "value_type": "boolean",
            },
            {
                "key": "extra_args",
                "flag": "",
                "label": "Dodatkowe argumenty",
                "description": "Własne dodatkowe argumenty CLI przekazane bezpośrednio do BWA.",
                "value_type": "string",
                "placeholder": "-R '@RG\\tID:1\\tSM:sample'",
            },
        ],
    },
    "samtools": {
        "description": "Pakiet narzędzi Samtools z wyborem konkretnej subkomendy i flag dopasowanych do wybranego modułu.",
        "input_mode": "project",
        "runner_mode": "real",
        "accepted_file_types": ["bam", "sam", "cram", "fasta"],
        "options": [
            {
                "key": "subcommand",
                "flag": "__subcommand__",
                "label": "Moduł Samtools",
                "description": "Wybierz konkretny moduł Samtools do uruchomienia, np. faidx, flagstat, view albo dict.",
                "value_type": "choice",
                "choices": ["sort", "index", "flagstat", "faidx", "stats", "idxstats", "depth", "view", "coverage", "quickcheck", "fasta", "fastq", "dict"],
            },
            {
                "key": "threads",
                "flag": "-@",
                "label": "Liczba wątków",
                "description": "Liczba wątków używanych przez Samtools.",
                "value_type": "number",
                "placeholder": "4",
                "applies_to": ["sort", "index", "flagstat", "stats", "idxstats", "depth", "view"],
            },
            {
                "key": "memory",
                "flag": "-m",
                "label": "Pamięć na wątek",
                "description": "Pamięć przypisana na wątek podczas sortowania.",
                "value_type": "string",
                "placeholder": "1G",
                "applies_to": ["sort"],
            },
            {
                "key": "output_format",
                "flag": "-O",
                "label": "Format wyjściowy",
                "description": "Format pliku wyjściowego dla poleceń `sort` lub `view`.",
                "value_type": "choice",
                "choices": ["BAM", "SAM", "CRAM"],
                "applies_to": ["sort", "view"],
            },
            {
                "key": "name_sort",
                "flag": "-n",
                "label": "Sortowanie po nazwie",
                "description": "Sortuj rekordy według nazwy odczytu zamiast pozycji.",
                "value_type": "boolean",
                "applies_to": ["sort"],
            },
            {
                "key": "include_header",
                "flag": "-h",
                "label": "Dołącz nagłówek",
                "description": "Dla `view` dołącz nagłówek SAM do wyniku.",
                "value_type": "boolean",
                "applies_to": ["view"],
            },
            {
                "key": "count_only",
                "flag": "-c",
                "label": "Tylko liczba rekordów",
                "description": "Dla `view` zwróć tylko liczbę rekordów spełniających filtr.",
                "value_type": "boolean",
                "applies_to": ["view"],
            },
            {
                "key": "target_region",
                "flag": "__region__",
                "label": "Region docelowy",
                "description": "Region genomowy przekazany pozycyjnie, np. `chr1:1-100000`, dla `view` lub `faidx`.",
                "value_type": "string",
                "placeholder": "chr1:1-100000",
                "applies_to": ["view", "faidx"],
            },
            {
                "key": "read_group",
                "flag": "-r",
                "label": "Read group",
                "description": "W `view` ogranicz wynik do konkretnej grupy odczytów.",
                "value_type": "string",
                "placeholder": "RG1",
                "applies_to": ["view"],
            },
            {
                "key": "depth_region",
                "flag": "-r",
                "label": "Region",
                "description": "W `depth` ogranicz analizę do wskazanego regionu, np. `chr1:1-100000`.",
                "value_type": "string",
                "placeholder": "chr1:1-100000",
                "applies_to": ["depth"],
            },
            {
                "key": "min_mapping_quality",
                "flag": "__min_mapping_quality__",
                "label": "Minimalny MAPQ",
                "description": "Minimalna jakość mapowania; dla `view` i `depth` używane są odpowiednie flagi dla danej subkomendy.",
                "value_type": "number",
                "placeholder": "20",
                "applies_to": ["view", "depth"],
            },
            {
                "key": "min_base_quality",
                "flag": "-q",
                "label": "Minimalny base quality",
                "description": "W `depth` pomiń bazy poniżej wskazanego progu jakości.",
                "value_type": "number",
                "placeholder": "13",
                "applies_to": ["depth"],
            },
            {
                "key": "include_deletions",
                "flag": "-J",
                "label": "Uwzględnij delecje",
                "description": "W `depth` wlicz pozycje z delecjami do pokrycia.",
                "value_type": "boolean",
                "applies_to": ["depth"],
            },
            {
                "key": "reference_fasta",
                "flag": "-T",
                "label": "Referencja FASTA",
                "description": "W `view` wskaż referencję potrzebną np. przy odczycie plików CRAM.",
                "value_type": "string",
                "placeholder": "/path/to/reference.fa",
                "applies_to": ["view"],
            },
            {
                "key": "dict_assembly",
                "flag": "-a",
                "label": "Assembly",
                "description": "W `dict` wpisz nazwę assembly dodawaną do słownika sekwencji.",
                "value_type": "string",
                "placeholder": "GRCh38",
                "applies_to": ["dict"],
            },
            {
                "key": "dict_species",
                "flag": "-s",
                "label": "Species",
                "description": "W `dict` wpisz nazwę gatunku dodawaną do metadanych słownika.",
                "value_type": "string",
                "placeholder": "Homo sapiens",
                "applies_to": ["dict"],
            },
            {
                "key": "dict_uri",
                "flag": "-u",
                "label": "URI referencji",
                "description": "W `dict` dodaj URI opisujące źródło sekwencji referencyjnej.",
                "value_type": "string",
                "placeholder": "file:///data/reference.fa",
                "applies_to": ["dict"],
            },
            {
                "key": "extra_args",
                "flag": "",
                "label": "Dodatkowe argumenty",
                "description": "Własne dodatkowe argumenty CLI przekazane bezpośrednio do Samtools.",
                "value_type": "string",
                "placeholder": "--write-index",
            },
        ],
    },
    "bcftools": {
        "description": "Wywoływanie wariantów i podstawowe filtrowanie wyników.",
        "input_mode": "project",
        "runner_mode": "demo",
        "accepted_file_types": ["bam", "sam", "cram", "bcf", "vcf", "vcf.gz"],
        "options": [
            {
                "key": "call_mode",
                "flag": "__call_mode__",
                "label": "Tryb wywoływania",
                "description": "Wybierz główny tryb pracy bcftools call.",
                "value_type": "choice",
                "choices": ["consensus-caller", "multiallelic-caller"],
            },
            {
                "key": "variants_only",
                "flag": "-v",
                "label": "Tylko warianty",
                "description": "Pokaż wyłącznie pozycje wariantowe bez referencji.",
                "value_type": "boolean",
            },
            {
                "key": "ploidy",
                "flag": "--ploidy",
                "label": "Ploidalność",
                "description": "Założona ploidalność genomu dla wywoływania wariantów.",
                "value_type": "choice",
                "choices": ["haploid", "diploid"],
            },
            {
                "key": "samples",
                "flag": "-s",
                "label": "Próbki",
                "description": "Lista próbek do uwzględnienia przy wywoływaniu wariantów.",
                "value_type": "string",
                "placeholder": "sample1,sample2",
            },
            {
                "key": "regions",
                "flag": "-r",
                "label": "Regiony",
                "description": "Analiza tylko dla wskazanych regionów genomowych.",
                "value_type": "string",
                "placeholder": "chr1:1-100000",
            },
            {
                "key": "extra_args",
                "flag": "",
                "label": "Dodatkowe argumenty",
                "description": "Własne dodatkowe argumenty CLI przekazane bezpośrednio do BCFtools.",
                "value_type": "string",
                "placeholder": "--skip-variants indels",
            },
        ],
    },
}

AVAILABLE_TOOLS = list(TOOL_SPECS.keys())


def _enabled_option_map(options: list[dict]) -> dict[str, dict]:
    return {item["key"]: item for item in options if item.get("enabled", True)}


def _enabled_option_value(options: list[dict], key: str, default: str | None = None) -> str | None:
    option = _enabled_option_map(options).get(key)
    if not option:
        return default
    return option.get("value") or default


def get_allowed_file_types(tool_name: str, options: list[dict] | None = None) -> list[str]:
    base_types = list(TOOL_SPECS[tool_name].get("accepted_file_types", []))
    if tool_name != "samtools":
        return base_types

    subcommand = _enabled_option_value(options or [], "subcommand", "sort")
    if subcommand in {"faidx", "dict"}:
        return ["fasta"]
    if subcommand in {"sort", "index", "flagstat", "stats", "idxstats", "depth", "view", "coverage", "quickcheck", "fasta", "fastq"}:
        return ["bam", "sam", "cram"]
    return base_types


def get_tool_specs() -> list[dict]:
    specs = []
    for name, config in TOOL_SPECS.items():
        specs.append(
            {
                "name": name,
                "description": config["description"],
                "input_mode": config["input_mode"],
                "runner_mode": config["runner_mode"],
                "accepted_file_types": config.get("accepted_file_types", []),
                "option_definitions": config["options"],
            }
        )
    return specs


def create_job(db: Session, project: Project, sample_name: str, selected_steps: list[dict]) -> Job:
    job_dir = JOBS_DIR / f"job_{int(time.time())}_{sample_name.replace(' ', '_')}"
    job_dir.mkdir(parents=True, exist_ok=True)

    normalized_steps = normalize_pipeline_steps(db, project, selected_steps, sample_name, job_dir)

    job = Job(
        project_id=project.id,
        sample_name=sample_name,
        status="queued",
        selected_steps=json.dumps(normalized_steps),
        working_dir=str(job_dir),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    for index, step in enumerate(normalized_steps, start=1):
        step_dir = job_dir / f"{index:02d}_{step['tool_name']}"
        step_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = step_dir / "stdout.log"
        stderr_path = step_dir / "stderr.log"
        command_text = " ".join(build_command_args(step["tool_name"], sample_name, step["input_files"], step["options"], step_dir, job_dir))
        db.add(
            JobStep(
                job_id=job.id,
                step_name=step["step_name"],
                tool_name=step["tool_name"],
                step_order=index,
                input_files=json.dumps(step["input_files"]),
                tool_options=json.dumps(step["options"]),
                status="queued",
                command=command_text,
                stdout_path=str(stdout_path),
                stderr_path=str(stderr_path),
            )
        )

    db.commit()
    return db.query(Job).filter(Job.id == job.id).first()


def delete_job(db: Session, job: Job) -> None:
    if job.working_dir and Path(job.working_dir).exists():
        shutil.rmtree(job.working_dir, ignore_errors=True)
    db.delete(job)
    db.commit()


def normalize_pipeline_steps(
    db: Session,
    project: Project,
    selected_steps: list[dict],
    sample_name: str,
    job_dir: Path,
) -> list[dict]:
    project_files = (
        db.query(UploadFile)
        .filter(UploadFile.project_id == project.id)
        .order_by(UploadFile.created_at.asc())
        .all()
    )
    project_file_map = {item.id: item for item in project_files}
    normalized: list[dict] = []

    for index, step in enumerate(selected_steps, start=1):
        tool_name = step["tool_name"]
        if tool_name not in AVAILABLE_TOOLS:
            raise ValueError(f"Unsupported tool: {tool_name}")
        tool_spec = TOOL_SPECS[tool_name]

        options = normalize_tool_options(tool_name, step.get("options", []))
        allowed_file_types = get_allowed_file_types(tool_name, options)
        input_file_ids = step.get("input_file_ids", [])
        input_source = step.get("input_source", "project")
        input_from_step_order = step.get("input_from_step_order")
        if tool_spec["input_mode"] != "job" and not input_file_ids:
            if input_source != "step":
                raise ValueError(f"Tool `{tool_name}` requires at least one input file from the project")
        if tool_spec["input_mode"] == "job" and index == 1:
            raise ValueError(f"Tool `{tool_name}` must come after a result-producing step in the same job")
        if tool_name == "multiqc":
            prior_tools = [item["tool_name"] for item in normalized]
            if not any(previous_tool in {"fastqc"} for previous_tool in prior_tools):
                raise ValueError("MultiQC requires earlier FastQC results in the same job")

        input_files: list[dict] = []
        if tool_spec["input_mode"] != "job" and input_source == "step":
            if input_from_step_order is None:
                raise ValueError(f"Tool `{tool_name}` requires choosing an earlier step as the input source")
            if input_from_step_order >= index or input_from_step_order < 1:
                raise ValueError(f"Tool `{tool_name}` can only use outputs from an earlier step in the same job")

            upstream_step = normalized[input_from_step_order - 1]
            input_files = [
                output
                for output in upstream_step.get("output_files", [])
                if not allowed_file_types or output["file_type"] in allowed_file_types
            ]
            if not input_files:
                allowed_text = ", ".join(allowed_file_types) if allowed_file_types else "any"
                raise ValueError(
                    f"Step {input_from_step_order} does not expose compatible outputs for `{tool_name}`. Allowed: {allowed_text}"
                )
        elif tool_spec["input_mode"] != "job":
            for file_id in input_file_ids:
                upload = project_file_map.get(file_id)
                if not upload:
                    raise ValueError(f"Upload file {file_id} does not belong to project {project.id}")
                if allowed_file_types and upload.file_type not in allowed_file_types:
                    allowed_text = ", ".join(allowed_file_types)
                    raise ValueError(
                        f"Tool `{tool_name}` does not accept file type `{upload.file_type}`. Allowed: {allowed_text}"
                    )
                input_files.append(
                    {
                        "id": upload.id,
                        "original_name": upload.original_name,
                        "file_type": upload.file_type,
                        "stored_path": upload.stored_path,
                    }
                )

        if tool_name == "trimmomatic" and len(input_files) > 2:
            raise ValueError("Trimmomatic currently supports one file (SE) or two files (PE) per step")
        if tool_name == "samtools" and len(input_files) != 1:
            raise ValueError("Samtools currently expects exactly one input file per step")

        step_dir = job_dir / f"{index:02d}_{tool_name}"
        output_files = predict_step_outputs(
            tool_name=tool_name,
            step_order=index,
            input_files=input_files,
            options=options,
            step_dir=step_dir,
        )

        normalized.append(
            {
                "step_name": step.get("step_name") or f"Krok {index}",
                "tool_name": tool_name,
                "input_source": input_source,
                "input_from_step_order": input_from_step_order,
                "input_file_ids": input_file_ids,
                "input_files": input_files,
                "options": options,
                "output_files": output_files,
            }
        )

    return normalized


def normalize_tool_options(tool_name: str, options: list[dict]) -> list[dict]:
    definitions = {item["key"]: item for item in TOOL_SPECS[tool_name]["options"]}
    normalized: list[dict] = []

    for option in options:
        key = option["key"]
        if key not in definitions:
            raise ValueError(f"Unsupported option `{key}` for tool `{tool_name}`")
        definition = definitions[key]
        enabled = bool(option.get("enabled", True))
        value = option.get("value")
        if definition["value_type"] != "boolean" and enabled and (value is None or str(value).strip() == ""):
            raise ValueError(f"Option `{key}` for tool `{tool_name}` requires a value")

        normalized.append(
            {
                "key": key,
                "enabled": enabled,
                "value": None if value is None else str(value),
            }
        )

    return normalized


def predict_step_outputs(
    tool_name: str,
    step_order: int,
    input_files: list[dict],
    options: list[dict],
    step_dir: Path,
) -> list[dict]:
    synthetic_id_base = -(step_order * 100)

    if tool_name == "trimmomatic":
        if len(input_files) == 1:
            input_path = Path(input_files[0]["stored_path"])
            output_path = step_dir / f"{input_path.stem}.trimmed.fastq.gz"
            return [
                {
                    "id": synthetic_id_base - 1,
                    "original_name": output_path.name,
                    "file_type": "fastq.gz",
                    "stored_path": str(output_path),
                }
            ]
        if len(input_files) == 2:
            return [
                {
                    "id": synthetic_id_base - 1,
                    "original_name": "paired_R1.fastq.gz",
                    "file_type": "fastq.gz",
                    "stored_path": str(step_dir / "paired_R1.fastq.gz"),
                },
                {
                    "id": synthetic_id_base - 2,
                    "original_name": "paired_R2.fastq.gz",
                    "file_type": "fastq.gz",
                    "stored_path": str(step_dir / "paired_R2.fastq.gz"),
                },
            ]

    if tool_name == "samtools" and input_files:
        input_path = Path(input_files[0]["stored_path"])
        input_name = input_path.name
        subcommand = _enabled_option_value(options, "subcommand", "sort") or "sort"
        if subcommand == "sort":
            output_format = _enabled_option_value(options, "output_format", "BAM") or "BAM"
            suffix_map = {"BAM": "bam", "SAM": "sam", "CRAM": "cram"}
            file_type_map = {"BAM": "bam", "SAM": "sam", "CRAM": "cram"}
            suffix = suffix_map.get(output_format, "bam")
            return [
                {
                    "id": synthetic_id_base - 1,
                    "original_name": f"{input_path.stem}.sorted.{suffix}",
                    "file_type": file_type_map.get(output_format, "bam"),
                    "stored_path": str(step_dir / f"{input_path.stem}.sorted.{suffix}"),
                }
            ]
        if subcommand == "index":
            return [
                {
                    "id": synthetic_id_base - 1,
                    "original_name": f"{input_name}.bai",
                    "file_type": "bai",
                    "stored_path": str(step_dir / f"{input_name}.bai"),
                }
            ]
        if subcommand == "faidx":
            return [
                {
                    "id": synthetic_id_base - 1,
                    "original_name": f"{input_name}.fai",
                    "file_type": "fai",
                    "stored_path": str(step_dir / f"{input_name}.fai"),
                }
            ]
        if subcommand == "view":
            output_format = _enabled_option_value(options, "output_format", "BAM") or "BAM"
            suffix_map = {"BAM": "bam", "SAM": "sam", "CRAM": "cram"}
            file_type_map = {"BAM": "bam", "SAM": "sam", "CRAM": "cram"}
            suffix = suffix_map.get(output_format, "bam")
            return [
                {
                    "id": synthetic_id_base - 1,
                    "original_name": f"{input_path.stem}.view.{suffix}",
                    "file_type": file_type_map.get(output_format, "bam"),
                    "stored_path": str(step_dir / f"{input_path.stem}.view.{suffix}"),
                }
            ]

    if tool_name == "bwa":
        return [
            {
                "id": synthetic_id_base - 1,
                "original_name": f"{step_order:02d}_aligned_reads.bam",
                "file_type": "bam",
                "stored_path": str(step_dir / f"{step_order:02d}_aligned_reads.bam"),
            }
        ]

    if tool_name == "bcftools":
        return [
            {
                "id": synthetic_id_base - 1,
                "original_name": f"{step_order:02d}_variants.vcf",
                "file_type": "vcf",
                "stored_path": str(step_dir / f"{step_order:02d}_variants.vcf"),
            }
        ]

    return []


def render_option_args(tool_name: str, options: list[dict]) -> list[str]:
    definitions = {item["key"]: item for item in TOOL_SPECS[tool_name]["options"]}
    args: list[str] = []
    for option in options:
        if not option.get("enabled", True):
            continue
        definition = definitions[option["key"]]
        if option["key"] == "extra_args":
            if option.get("value"):
                args.extend(str(option["value"]).split())
            continue
        if definition["flag"] == "__algorithm__":
            continue
        if definition["flag"] == "__call_mode__":
            continue
        if definition["flag"] == "__subcommand__":
            continue
        if tool_name == "trimmomatic" and not definition["flag"].startswith("-"):
            if definition["value_type"] != "boolean":
                args.append(f"{definition['flag']}:{option['value']}")
            else:
                args.append(definition["flag"])
            continue
        args.append(definition["flag"])
        if definition["value_type"] != "boolean":
            args.append(str(option["value"]))
    return args


def build_command_args(
    tool_name: str,
    sample_name: str,
    input_files: list[dict],
    options: list[dict],
    step_dir: Path,
    job_dir: Path,
) -> list[str]:
    option_args = render_option_args(tool_name, options)
    input_paths = [item["stored_path"] for item in input_files]
    option_map = _enabled_option_map(options)

    if tool_name == "fastqc":
        return ["fastqc", "-o", str(step_dir), *option_args, *input_paths]
    if tool_name == "multiqc":
        return ["multiqc", str(job_dir), "-o", str(step_dir), *option_args]
    if tool_name == "trimmomatic":
        return _build_trimmomatic_command(input_files, options, step_dir)
    if tool_name == "bwa":
        algorithm = option_map.get("algorithm", {}).get("value") or "mem"
        if algorithm == "mem2":
            return ["bwa-mem2", "mem", *option_args, *input_paths]
        return ["bwa", algorithm, *option_args, *input_paths]
    if tool_name == "samtools":
        return _build_samtools_command(input_files, options, step_dir)
    if tool_name == "bcftools":
        call_mode = option_map.get("call_mode", {}).get("value") or "multiallelic-caller"
        mode_flag = "-m" if call_mode == "multiallelic-caller" else "-c"
        return ["bcftools", "call", mode_flag, *option_args, *input_paths]
    return [tool_name, "--sample", sample_name, *option_args, *input_paths]


def _build_trimmomatic_command(input_files: list[dict], options: list[dict], step_dir: Path) -> list[str]:
    prefix_args, step_args = _render_trimmomatic_args(options)
    if len(input_files) == 1:
        input_path = input_files[0]["stored_path"]
        output_path = step_dir / f"{Path(input_path).stem}.trimmed.fastq.gz"
        return ["trimmomatic", "SE", *prefix_args, input_path, str(output_path), *step_args]

    input_1 = input_files[0]["stored_path"]
    input_2 = input_files[1]["stored_path"]
    output_1_paired = step_dir / "paired_R1.fastq.gz"
    output_1_unpaired = step_dir / "unpaired_R1.fastq.gz"
    output_2_paired = step_dir / "paired_R2.fastq.gz"
    output_2_unpaired = step_dir / "unpaired_R2.fastq.gz"
    return [
        "trimmomatic",
        "PE",
        *prefix_args,
        input_1,
        input_2,
        str(output_1_paired),
        str(output_1_unpaired),
        str(output_2_paired),
        str(output_2_unpaired),
        *step_args,
    ]


def _render_trimmomatic_args(options: list[dict]) -> tuple[list[str], list[str]]:
    definitions = {item["key"]: item for item in TOOL_SPECS["trimmomatic"]["options"]}
    prefix_args: list[str] = []
    step_args: list[str] = []
    for option in options:
        if not option.get("enabled", True):
            continue
        definition = definitions[option["key"]]
        if option["key"] == "extra_args":
            if option.get("value"):
                step_args.extend(str(option["value"]).split())
            continue
        if definition["flag"].startswith("-"):
            prefix_args.append(definition["flag"])
            if definition["value_type"] != "boolean":
                prefix_args.append(str(option["value"]))
        else:
            if definition["value_type"] == "boolean":
                step_args.append(definition["flag"])
            else:
                step_args.append(f"{definition['flag']}:{option['value']}")
    return prefix_args, step_args


def _build_samtools_command(input_files: list[dict], options: list[dict], step_dir: Path) -> list[str]:
    input_path = input_files[0]["stored_path"]
    subcommand = _enabled_option_value(options, "subcommand", "sort") or "sort"
    input_name = Path(input_path).name
    option_args = _render_samtools_args(subcommand, options)
    target_region = _enabled_option_value(options, "target_region")

    if subcommand == "sort":
        output_format = _enabled_option_value(options, "output_format", "BAM") or "BAM"
        suffix_map = {"BAM": "bam", "SAM": "sam", "CRAM": "cram"}
        output_name = f"{Path(input_name).stem}.sorted.{suffix_map.get(output_format, 'bam')}"
        return ["samtools", "sort", "-o", str(step_dir / output_name), *option_args, input_path]
    if subcommand == "index":
        output_name = f"{input_name}.bai"
        return ["samtools", "index", *option_args, input_path, str(step_dir / output_name)]
    if subcommand == "flagstat":
        return ["samtools", "flagstat", *option_args, input_path]
    if subcommand == "faidx":
        return ["samtools", "faidx", *option_args, input_path]
    if subcommand == "stats":
        return ["samtools", "stats", *option_args, input_path]
    if subcommand == "idxstats":
        return ["samtools", "idxstats", *option_args, input_path]
    if subcommand == "depth":
        return ["samtools", "depth", *option_args, input_path]
    if subcommand == "view":
        output_format = _enabled_option_value(options, "output_format", "BAM") or "BAM"
        suffix_map = {"BAM": "bam", "SAM": "sam", "CRAM": "cram"}
        output_name = f"{Path(input_name).stem}.view.{suffix_map.get(output_format, 'bam')}"
        command = ["samtools", "view", "-o", str(step_dir / output_name), *option_args, input_path]
        if target_region:
            command.append(target_region)
        return command
    if subcommand == "coverage":
        return ["samtools", "coverage", *option_args, input_path]
    if subcommand == "quickcheck":
        return ["samtools", "quickcheck", *option_args, input_path]
    if subcommand == "fasta":
        return ["samtools", "fasta", *option_args, input_path]
    if subcommand == "fastq":
        return ["samtools", "fastq", *option_args, input_path]
    if subcommand == "dict":
        return ["samtools", "dict", *option_args, input_path]
    if subcommand == "faidx":
        command = ["samtools", "faidx", *option_args, input_path]
        if target_region:
            command.append(target_region)
        return command

    return ["samtools", subcommand, *option_args, input_path]


def _render_samtools_args(subcommand: str, options: list[dict]) -> list[str]:
    option_map = _enabled_option_map(options)
    args: list[str] = []

    def append_if_present(key: str, flag: str) -> None:
        option = option_map.get(key)
        if option and option.get("value"):
            args.extend([flag, str(option["value"])])

    def append_if_enabled(key: str, flag: str) -> None:
        if key in option_map:
            args.append(flag)

    if subcommand in {"sort", "view"}:
        append_if_present("threads", "-@")
        append_if_present("output_format", "-O")
    if subcommand == "sort":
        append_if_present("memory", "-m")
        append_if_enabled("name_sort", "-n")
    if subcommand == "view":
        append_if_enabled("include_header", "-h")
        append_if_enabled("count_only", "-c")
        append_if_present("read_group", "-r")
        append_if_present("reference_fasta", "-T")
        append_if_present("min_mapping_quality", "-q")
    if subcommand in {"index", "flagstat", "stats", "idxstats", "depth"}:
        append_if_present("threads", "-@")
    if subcommand == "depth":
        append_if_present("depth_region", "-r")
        append_if_present("min_base_quality", "-q")
        append_if_present("min_mapping_quality", "-Q")
        append_if_enabled("include_deletions", "-J")
    if subcommand == "dict":
        append_if_present("dict_assembly", "-a")
        append_if_present("dict_species", "-s")
        append_if_present("dict_uri", "-u")

    extra = option_map.get("extra_args")
    if extra and extra.get("value"):
        args.extend(str(extra["value"]).split())
    return args


def serialize_job(job: Job) -> dict:
    return {
        "id": job.id,
        "project_id": job.project_id,
        "sample_name": job.sample_name,
        "status": job.status,
        "selected_steps": json.loads(job.selected_steps),
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "working_dir": job.working_dir,
    }


def serialize_job_comment(comment: JobComment) -> dict:
    return {
        "id": comment.id,
        "job_id": comment.job_id,
        "user_id": comment.user_id,
        "author_email": comment.user.email,
        "content": comment.content,
        "created_at": comment.created_at,
    }


def list_job_comments(db: Session, job: Job) -> list[JobComment]:
    return (
        db.query(JobComment)
        .filter(JobComment.job_id == job.id)
        .order_by(JobComment.created_at.asc(), JobComment.id.asc())
        .all()
    )


def create_job_comment(db: Session, job: Job, user: User, content: str) -> JobComment:
    normalized_content = content.strip()
    if not normalized_content:
        raise ValueError("Comment cannot be empty")

    comment = JobComment(job_id=job.id, user_id=user.id, content=normalized_content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def list_job_files(job: Job) -> list[dict[str, str]]:
    job_dir = Path(job.working_dir)
    result_dir = RESULTS_DIR / f"job_{job.id}"
    items: list[dict[str, str]] = []

    for path in sorted(job_dir.rglob("*")):
        if path.is_file():
            kind = "log" if path.suffix == ".log" else "result"
            items.append({"name": path.name, "path": str(path), "kind": kind})

    if result_dir.exists():
        for path in sorted(result_dir.rglob("*")):
            if path.is_file():
                items.append({"name": path.name, "path": str(path), "kind": "result"})

    return items


def read_job_logs(job: Job, steps: list[JobStep]) -> dict[str, dict[str, str]]:
    logs: dict[str, dict[str, str]] = {}
    for step in steps:
        stdout = Path(step.stdout_path).read_text() if Path(step.stdout_path).exists() else ""
        stderr = Path(step.stderr_path).read_text() if Path(step.stderr_path).exists() else ""
        key = f"{step.step_order:02d}_{step.tool_name}"
        logs[key] = {"stdout": stdout, "stderr": stderr}
    return logs


def start_job_runner(job_id: int) -> None:
    threading.Thread(target=_run_pipeline, args=(job_id,), daemon=True).start()


def _run_pipeline(job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return

        job.status = "running"
        job.started_at = datetime.utcnow()
        db.commit()

        steps = (
            db.query(JobStep)
            .filter(JobStep.job_id == job.id)
            .order_by(JobStep.step_order.asc(), JobStep.id.asc())
            .all()
        )

        for step in steps:
            step.status = "running"
            step.started_at = datetime.utcnow()
            db.commit()

            try:
                _run_single_step(job, step)
                step.status = "completed"
                step.finished_at = datetime.utcnow()
                db.commit()
            except Exception as exc:
                Path(step.stderr_path).write_text(f"{exc}\n", encoding="utf-8")
                step.status = "failed"
                step.finished_at = datetime.utcnow()
                job.status = "failed"
                job.finished_at = datetime.utcnow()
                db.commit()
                return

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def _run_single_step(job: Job, step: JobStep) -> None:
    step_dir = Path(step.stdout_path).parent
    stdout_path = Path(step.stdout_path)
    stderr_path = Path(step.stderr_path)
    input_files = json.loads(step.input_files)
    tool_options = json.loads(step.tool_options)
    command = build_command_args(step.tool_name, job.sample_name, input_files, tool_options, step_dir, Path(job.working_dir))
    step.command = " ".join(command)

    if step.tool_name in {"fastqc", "multiqc", "trimmomatic", "samtools"}:
        stdout_path.write_text(
            f"[{datetime.utcnow().isoformat()}] Starting {step.tool_name}\n"
            f"Command: {' '.join(command)}\n",
            encoding="utf-8",
        )
        stderr_path.write_text("", encoding="utf-8")
        return_code = _run_streaming_command(command, stdout_path, stderr_path, cwd=step_dir)
        if return_code != 0:
            raise RuntimeError(f"{step.tool_name} failed with exit code {return_code}")
        if step.tool_name == "samtools":
            _collect_samtools_outputs(input_files, tool_options, step_dir)
        with stdout_path.open("a", encoding="utf-8") as handle:
            handle.write(f"[{datetime.utcnow().isoformat()}] Finished {step.tool_name}\n")
        return

    stdout_path.write_text(
        f"[{datetime.utcnow().isoformat()}] Starting {step.step_name}\n"
        f"Tool: {step.tool_name}\n"
        f"Command: {' '.join(command)}\n"
        f"Input files: {', '.join(item['original_name'] for item in input_files)}\n"
        "Placeholder runner executed for non-implemented step.\n",
        encoding="utf-8",
    )
    stderr_path.write_text("", encoding="utf-8")
    time.sleep(0.5)
    _write_demo_result(job, step.tool_name, step_dir, step.step_order)
    with stdout_path.open("a", encoding="utf-8") as handle:
        handle.write(f"[{datetime.utcnow().isoformat()}] Finished {step.tool_name}\n")


def _collect_samtools_outputs(input_files: list[dict], options: list[dict], step_dir: Path) -> None:
    subcommand = _enabled_option_value(options, "subcommand", "sort") or "sort"
    input_path = Path(input_files[0]["stored_path"])
    if subcommand == "faidx":
        generated_index = Path(f"{input_path}.fai")
        if generated_index.exists():
            shutil.copy2(generated_index, step_dir / generated_index.name)


def _run_streaming_command(command: list[str], stdout_path: Path, stderr_path: Path, cwd: Path | None = None) -> int:
    process = subprocess.Popen(
        command,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    def forward_stream(stream, destination: Path) -> None:
        assert stream is not None
        with destination.open("a", encoding="utf-8") as handle:
            for chunk in iter(stream.readline, b""):
                handle.write(chunk.decode("utf-8", errors="ignore"))
                handle.flush()
        stream.close()

    stdout_thread = threading.Thread(target=forward_stream, args=(process.stdout, stdout_path), daemon=True)
    stderr_thread = threading.Thread(target=forward_stream, args=(process.stderr, stderr_path), daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    return_code = process.wait()
    stdout_thread.join()
    stderr_thread.join()
    return return_code


def serialize_job_step(step: JobStep) -> dict:
    public_input_files = [
        {
            "id": item["id"],
            "original_name": item["original_name"],
            "file_type": item["file_type"],
        }
        for item in json.loads(step.input_files)
    ]
    return {
        "id": step.id,
        "job_id": step.job_id,
        "step_name": step.step_name,
        "tool_name": step.tool_name,
        "step_order": step.step_order,
        "input_files": public_input_files,
        "tool_options": json.loads(step.tool_options),
        "status": step.status,
        "command": step.command,
        "stdout_path": step.stdout_path,
        "stderr_path": step.stderr_path,
        "started_at": step.started_at,
        "finished_at": step.finished_at,
    }


def _write_demo_result(job: Job, tool_name: str, result_dir: Path, step_order: int) -> None:
    result_dir.mkdir(parents=True, exist_ok=True)
    outputs = {
        "trimmomatic": "trimmed_reads.fastq.gz",
        "bwa": "aligned_reads.bam",
        "samtools": "aligned_reads.bam.bai",
        "bcftools": "variants.vcf",
    }
    filename = outputs.get(tool_name, f"{tool_name}.txt")
    if "." in filename:
        stem, suffix = filename.split(".", 1)
        filename = f"{step_order:02d}_{stem}.{suffix}"
    else:
        filename = f"{step_order:02d}_{filename}"
    (result_dir / filename).write_text(
        f"Demo output for job {job.id}, sample {job.sample_name}, tool {tool_name}.\n",
        encoding="utf-8",
    )
