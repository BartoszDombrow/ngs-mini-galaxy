import json
import subprocess
import threading
from datetime import datetime
from pathlib import Path
from shutil import which

from sqlalchemy.orm import Session

from app.core.config import UPLOADS_DIR
from app.db.session import SessionLocal
from app.models.project import Project
from app.models.project_import_job import ProjectImportJob
from app.models.upload_file import UploadFile
from app.models.user import User
from app.services.files import find_imported_files, register_stored_file


SUPPORTED_IMPORT_TOOLS = {"fastq-dump", "fasterq-dump"}


def create_import_job(db: Session, project: Project, user: User, tool_name: str, accessions: list[str]) -> ProjectImportJob:
    job = ProjectImportJob(
        project_id=project.id,
        requested_by_user_id=user.id,
        tool_name=tool_name,
        accessions=json.dumps(accessions),
        status="queued",
        log="Utworzono zadanie importu.\n",
        imported_file_ids="[]",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def list_import_jobs_for_project(db: Session, project_id: int) -> list[ProjectImportJob]:
    return (
        db.query(ProjectImportJob)
        .filter(ProjectImportJob.project_id == project_id)
        .order_by(ProjectImportJob.created_at.desc(), ProjectImportJob.id.desc())
        .all()
    )


def get_import_job(db: Session, import_job_id: int) -> ProjectImportJob | None:
    return db.query(ProjectImportJob).filter(ProjectImportJob.id == import_job_id).first()


def serialize_import_job(db: Session, job: ProjectImportJob) -> dict:
    imported_file_ids = json.loads(job.imported_file_ids or "[]")
    imported_files: list[UploadFile] = []
    if imported_file_ids:
        imported_files = (
            db.query(UploadFile)
            .filter(UploadFile.id.in_(imported_file_ids))
            .order_by(UploadFile.created_at.asc(), UploadFile.id.asc())
            .all()
        )

    return {
        "id": job.id,
        "project_id": job.project_id,
        "requested_by_user_id": job.requested_by_user_id,
        "tool_name": job.tool_name,
        "accessions": json.loads(job.accessions),
        "status": job.status,
        "log": job.log,
        "error_message": job.error_message,
        "imported_files": imported_files,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }


def start_import_job_runner(import_job_id: int) -> None:
    threading.Thread(target=_run_import_job, args=(import_job_id,), daemon=True).start()


def _run_import_job(import_job_id: int) -> None:
    db = SessionLocal()
    try:
        job = get_import_job(db, import_job_id)
        if not job:
            return

        project = db.query(Project).filter(Project.id == job.project_id).first()
        if not project:
            job.status = "failed"
            job.error_message = "Project not found"
            job.finished_at = datetime.utcnow()
            db.commit()
            return

        job.status = "running"
        job.started_at = datetime.utcnow()
        _append_log(db, job, f"Start importu przez {job.tool_name}.")

        if job.tool_name not in SUPPORTED_IMPORT_TOOLS:
            raise ValueError(f"Unsupported import tool: {job.tool_name}")
        if which(job.tool_name) is None:
            raise ValueError(f"Tool `{job.tool_name}` is not installed or not available in PATH")

        imported_file_ids = json.loads(job.imported_file_ids or "[]")
        accessions = [item.strip() for item in json.loads(job.accessions) if item.strip()]
        project_dir = UPLOADS_DIR / f"project_{project.id}"
        project_dir.mkdir(parents=True, exist_ok=True)

        for accession in accessions:
            _append_log(db, job, f"Pobieram accession {accession}.")
            command = [job.tool_name]
            if job.tool_name == "fasterq-dump":
                command.extend(["--split-files", "-O", str(project_dir), accession])
            else:
                command.extend(["--split-files", "--gzip", "-O", str(project_dir), accession])

            result = subprocess.run(
                command,
                cwd=project_dir,
                check=False,
                capture_output=True,
                text=True,
            )
            if result.stdout.strip():
                _append_log(db, job, result.stdout.strip())
            if result.stderr.strip():
                _append_log(db, job, result.stderr.strip())
            if result.returncode != 0:
                raise ValueError(
                    f"{job.tool_name} failed for accession {accession}: "
                    f"{result.stderr.strip() or result.stdout.strip() or 'unknown error'}"
                )

            matched_files = find_imported_files(project_dir, accession)
            if not matched_files:
                raise ValueError(f"No FASTQ files were produced for accession {accession}")

            _append_log(db, job, f"Znaleziono {len(matched_files)} plik(ów) dla {accession}.")
            for path in matched_files:
                upload = register_stored_file(db, project, path.name, path)
                imported_file_ids.append(upload.id)
                job.imported_file_ids = json.dumps(imported_file_ids)
                db.commit()

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        _append_log(db, job, f"Import zakończony. Dodano {len(imported_file_ids)} plik(ów).")
        db.commit()
    except Exception as exc:
        if "job" in locals() and job:
            job.status = "failed"
            job.error_message = str(exc)
            job.finished_at = datetime.utcnow()
            _append_log(db, job, f"Błąd: {exc}")
            db.commit()
    finally:
        db.close()


def _append_log(db: Session, job: ProjectImportJob, message: str) -> None:
    timestamp = datetime.utcnow().strftime("%H:%M:%S")
    suffix = "" if message.endswith("\n") else "\n"
    job.log = f"{job.log}[{timestamp}] {message}{suffix}"
    db.commit()
