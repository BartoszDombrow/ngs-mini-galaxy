from datetime import datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import UPLOADS_DIR
from app.models.project import Project
from app.models.upload_file import UploadFile
from app.models.upload_session import UploadSession
from app.models.user import User
from app.services.files import detect_file_type, register_stored_file


def create_upload_session(db: Session, project: Project, user: User, original_name: str, size_bytes: int) -> UploadSession:
    project_dir = UPLOADS_DIR / f"project_{project.id}"
    temp_dir = project_dir / ".upload_sessions"
    temp_dir.mkdir(parents=True, exist_ok=True)

    temp_path = temp_dir / f"{uuid4().hex}.part"
    session = UploadSession(
        project_id=project.id,
        created_by_user_id=user.id,
        original_name=Path(original_name).name,
        file_type=detect_file_type(original_name),
        size_bytes=size_bytes,
        uploaded_bytes=0,
        status="created",
        temp_path=str(temp_path),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_upload_session(db: Session, upload_session_id: int) -> UploadSession | None:
    return db.query(UploadSession).filter(UploadSession.id == upload_session_id).first()


def append_chunk(db: Session, session: UploadSession, chunk: bytes) -> UploadSession:
    temp_path = Path(session.temp_path)
    temp_path.parent.mkdir(parents=True, exist_ok=True)
    with temp_path.open("ab") as handle:
        handle.write(chunk)

    session.uploaded_bytes += len(chunk)
    session.status = "uploading"
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


def complete_upload_session(db: Session, session: UploadSession, project: Project) -> UploadFile:
    if session.upload_file_id:
        existing = db.query(UploadFile).filter(UploadFile.id == session.upload_file_id).first()
        if existing:
            return existing

    temp_path = Path(session.temp_path)
    if not temp_path.exists():
        raise ValueError("Upload temporary file not found")
    if session.uploaded_bytes != session.size_bytes:
        raise ValueError("Upload is incomplete")

    project_dir = UPLOADS_DIR / f"project_{project.id}"
    project_dir.mkdir(parents=True, exist_ok=True)
    final_path = project_dir / f"{uuid4().hex}-{session.original_name}"
    temp_path.replace(final_path)

    upload = register_stored_file(db, project, session.original_name, final_path)
    session.upload_file_id = upload.id
    session.status = "completed"
    session.updated_at = datetime.utcnow()
    session.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return upload


def serialize_upload_session(session: UploadSession, uploaded_file: UploadFile | None = None) -> dict:
    return {
        "id": session.id,
        "project_id": session.project_id,
        "created_by_user_id": session.created_by_user_id,
        "original_name": session.original_name,
        "file_type": session.file_type,
        "size_bytes": session.size_bytes,
        "uploaded_bytes": session.uploaded_bytes,
        "status": session.status,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "finished_at": session.finished_at,
        "uploaded_file": uploaded_file,
    }
