import shutil
import os
from pathlib import Path

from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import UPLOADS_DIR
from app.models.job import Job
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.upload_file import UploadFile
from app.models.user import User


def create_project(db: Session, user: User, name: str, description: str | None) -> Project:
    project = Project(user_id=user.id, name=name, description=description)
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=user.id, role="owner"))
    db.commit()
    db.refresh(project)
    return project


def _project_query_for_user(db: Session, user: User):
    return (
        db.query(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == user.id)
        .options(joinedload(Project.user), selectinload(Project.memberships).joinedload(ProjectMember.user))
    )


def get_project_for_user(db: Session, user: User, project_id: int) -> Project | None:
    return _project_query_for_user(db, user).filter(Project.id == project_id).first()


def list_projects_for_user(db: Session, user: User) -> list[Project]:
    return _project_query_for_user(db, user).order_by(Project.created_at.desc()).all()


def can_manage_project_members(project: Project, user: User) -> bool:
    return project.user_id == user.id


def serialize_project_member(member: ProjectMember) -> dict:
    return {
        "user_id": member.user_id,
        "email": member.user.email,
        "role": member.role,
        "created_at": member.created_at,
    }


def serialize_project(project: Project, current_user: User) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at,
        "owner_email": project.user.email,
        "access_role": "owner" if project.user_id == current_user.id else "collaborator",
        "can_manage_members": can_manage_project_members(project, current_user),
        "member_count": len(project.memberships),
    }


def serialize_project_detail(project: Project, current_user: User, uploads: list[UploadFile]) -> dict:
    return {
        **serialize_project(project, current_user),
        "uploads": uploads,
        "members": [serialize_project_member(member) for member in sorted(project.memberships, key=_member_sort_key)],
    }


def _member_sort_key(member: ProjectMember) -> tuple[int, str]:
    return (0 if member.role == "owner" else 1, member.user.email.lower())


def list_project_members(project: Project) -> list[ProjectMember]:
    return sorted(project.memberships, key=_member_sort_key)


def add_project_member(db: Session, project: Project, email: str) -> ProjectMember:
    normalized_email = email.lower().strip()
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user:
        raise ValueError("Nie znaleziono użytkownika o podanym adresie e-mail.")

    existing_member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)
        .first()
    )
    if existing_member:
        raise ValueError("Ta osoba ma już dostęp do projektu.")

    member = ProjectMember(project_id=project.id, user_id=user.id, role="collaborator")
    db.add(member)
    db.commit()
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)
        .options(joinedload(ProjectMember.user))
        .one()
    )


def remove_project_member(db: Session, project: Project, member_user_id: int) -> None:
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == member_user_id)
        .first()
    )
    if not member:
        raise ValueError("Nie znaleziono wskazanego współpracownika.")
    if member.role == "owner":
        raise ValueError("Nie można usunąć właściciela projektu.")

    db.delete(member)
    db.commit()


def list_uploads_for_project(db: Session, project_id: int) -> list[UploadFile]:
    return (
        db.query(UploadFile)
        .filter(UploadFile.project_id == project_id)
        .order_by(UploadFile.created_at.desc())
        .all()
    )


def list_jobs_for_project(db: Session, project_id: int) -> list[Job]:
    return (
        db.query(Job)
        .filter(Job.project_id == project_id)
        .order_by(Job.created_at.desc())
        .all()
    )


def delete_project(db: Session, project: Project) -> None:
    jobs = db.query(Job).filter(Job.project_id == project.id).all()
    
    for job in jobs:
        if job.working_dir and Path(job.working_dir).exists():
            shutil.rmtree(job.working_dir, ignore_errors=True)

    project_uploads_dir = UPLOADS_DIR / str(project.id)
    if project_uploads_dir.exists():
        shutil.rmtree(project_uploads_dir, ignore_errors=True)

    db.delete(project)
    db.commit()


def delete_upload(db: Session, upload: UploadFile) -> None:
    if upload.stored_path and Path(upload.stored_path).exists():
        try:
            os.remove(upload.stored_path)
        except OSError:
            pass

    db.delete(upload)
    db.commit()
