import subprocess
import shutil
from shutil import which
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile as FastAPIUploadFile
from sqlalchemy.orm import Session

from app.core.config import UPLOADS_DIR
from app.models.project import Project
from app.models.upload_file import UploadFile

SUPPORTED_IMPORT_TOOLS = {"fastq-dump", "fasterq-dump"}


def detect_file_type(filename: str) -> str:
    lowered = filename.lower()
    if lowered.endswith(".fastq.gz") or lowered.endswith(".fq.gz"):
        return "fastq.gz"
    if lowered.endswith(".fastq") or lowered.endswith(".fq"):
        return "fastq"
    if lowered.endswith(".bam"):
        return "bam"
    if lowered.endswith(".bai"):
        return "bai"
    if lowered.endswith(".sam"):
        return "sam"
    if lowered.endswith(".cram"):
        return "cram"
    if lowered.endswith(".crai"):
        return "crai"
    if lowered.endswith(".fasta") or lowered.endswith(".fa") or lowered.endswith(".fna"):
        return "fasta"
    if lowered.endswith(".fai"):
        return "fai"
    if lowered.endswith(".vcf.gz"):
        return "vcf.gz"
    if lowered.endswith(".vcf"):
        return "vcf"
    if lowered.endswith(".bcf"):
        return "bcf"
    return "other"


def store_upload(db: Session, project: Project, upload: FastAPIUploadFile) -> UploadFile:
    project_dir = UPLOADS_DIR / f"project_{project.id}"
    project_dir.mkdir(parents=True, exist_ok=True)

    safe_name = upload.filename or f"upload-{uuid4().hex}"
    stored_name = f"{uuid4().hex}-{Path(safe_name).name}"
    destination = project_dir / stored_name

    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)

    record = UploadFile(
        project_id=project.id,
        original_name=safe_name,
        stored_path=str(destination),
        file_type=detect_file_type(safe_name),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def register_stored_file(db: Session, project: Project, original_name: str, stored_path: Path) -> UploadFile:
    record = UploadFile(
        project_id=project.id,
        original_name=original_name,
        stored_path=str(stored_path),
        file_type=detect_file_type(original_name),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def import_accessions(
    db: Session,
    project: Project,
    tool_name: str,
    accessions: list[str],
) -> list[UploadFile]:
    if tool_name not in SUPPORTED_IMPORT_TOOLS:
        raise ValueError(f"Unsupported import tool: {tool_name}")
    if which(tool_name) is None:
        raise ValueError(f"Tool `{tool_name}` is not installed or not available in PATH")

    project_dir = UPLOADS_DIR / f"project_{project.id}"
    project_dir.mkdir(parents=True, exist_ok=True)
    imported: list[UploadFile] = []

    for accession in accessions:
        accession_code = accession.strip()
        if not accession_code:
            continue

        command = [tool_name]
        if tool_name == "fasterq-dump":
            command.extend(["--split-files", "-O", str(project_dir), accession_code])
        else:
            command.extend(["--split-files", "--gzip", "-O", str(project_dir), accession_code])

        result = subprocess.run(
            command,
            cwd=project_dir,
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise ValueError(
                f"{tool_name} failed for accession {accession_code}: "
                f"{result.stderr.strip() or result.stdout.strip() or 'unknown error'}"
            )

        matched_files = find_imported_files(project_dir, accession_code)
        if not matched_files:
            raise ValueError(f"No FASTQ files were produced for accession {accession_code}")

        for path in matched_files:
            imported.append(register_stored_file(db, project, path.name, path))

    return imported


def find_imported_files(project_dir: Path, accession_code: str) -> list[Path]:
    patterns = [
        f"{accession_code}*.fastq",
        f"{accession_code}*.fastq.gz",
        f"{accession_code}*.fq",
        f"{accession_code}*.fq.gz",
    ]
    matched: list[Path] = []
    for pattern in patterns:
        matched.extend(sorted(project_dir.glob(pattern)))

    unique_paths: list[Path] = []
    seen: set[Path] = set()
    for path in matched:
        if path.is_file() and path not in seen:
            seen.add(path)
            unique_paths.append(path)
    return unique_paths
