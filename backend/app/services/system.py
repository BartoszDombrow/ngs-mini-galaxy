import subprocess
from shutil import which


REQUIRED_TOOLS = [
    ("fastqc", ["fastqc", "--version"]),
    ("multiqc", ["multiqc", "--version"]),
    ("fastq-dump", ["fastq-dump", "--version"]),
    ("fasterq-dump", ["fasterq-dump", "--version"]),
    ("bwa", ["bwa"]),
    ("samtools", ["samtools", "--version"]),
    ("bcftools", ["bcftools", "--version"]),
]


def detect_tool_statuses() -> list[dict]:
    statuses: list[dict] = []
    for name, version_command in REQUIRED_TOOLS:
        executable = which(name)
        if not executable:
            statuses.append(
                {
                    "name": name,
                    "installed": False,
                    "executable": None,
                    "version": None,
                    "notes": "Not found in PATH",
                }
            )
            continue

        version, notes = _read_version(version_command)
        statuses.append(
            {
                "name": name,
                "installed": True,
                "executable": executable,
                "version": version,
                "notes": notes,
            }
        )
    return statuses


def _read_version(command: list[str]) -> tuple[str | None, str | None]:
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except OSError as exc:
        return None, str(exc)
    except Exception as exc:
        return None, f"Unexpected error: {exc}"

    output = (result.stdout or result.stderr).strip()
    if not output:
        if result.returncode != 0:
            return None, f"Exited with code {result.returncode}"
        return None, None
    return output.splitlines()[0], None
