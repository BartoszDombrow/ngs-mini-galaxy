from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.project_import_job import ProjectImportJob
from app.models.upload_file import UploadFile as UploadFileModel
from app.models.upload_session import UploadSession
from app.models.user import User
from app.routers.deps import get_current_user
from app.schemas.import_job import ImportJobCreate, ImportJobResponse
from app.schemas.job import JobResponse
from app.schemas.project import (
    ProjectCreate,
    ProjectDetailResponse,
    ProjectMemberAdd,
    ProjectMemberResponse,
    ProjectResponse,
)
from app.schemas.upload_file import ImportAccessionRequest, UploadFileResponse
from app.schemas.upload_session import UploadSessionCreate, UploadSessionResponse
from app.services.files import import_accessions, store_upload
from app.services.import_jobs import create_import_job, get_import_job, list_import_jobs_for_project, serialize_import_job, start_import_job_runner
from app.services.jobs import serialize_job
from app.services.projects import (
    add_project_member,
    can_manage_project_members,
    create_project,
    get_project_for_user,
    list_jobs_for_project,
    list_project_members,
    list_projects_for_user,
    list_uploads_for_project,
    remove_project_member,
    serialize_project,
    serialize_project_detail,
    serialize_project_member,
)
from app.services.uploads import append_chunk, complete_upload_session, create_upload_session, get_upload_session, serialize_upload_session


router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse)
def create_project_endpoint(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = create_project(db, current_user, payload.name, payload.description)
    return ProjectResponse(**serialize_project(project, current_user))


@router.get("", response_model=list[ProjectResponse])
def list_projects_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [ProjectResponse(**serialize_project(project, current_user)) for project in list_projects_for_user(db, current_user)]


@router.get("/{project_id}", response_model=ProjectDetailResponse)
def get_project_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    uploads = list_uploads_for_project(db, project.id)
    return ProjectDetailResponse(**serialize_project_detail(project, current_user, uploads))


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
def list_project_members_endpoint(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return [ProjectMemberResponse(**serialize_project_member(member)) for member in list_project_members(project)]


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
def add_project_member_endpoint(
    project_id: int,
    payload: ProjectMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_manage_project_members(project, current_user):
        raise HTTPException(status_code=403, detail="Only the project owner can manage collaborators")

    try:
        member = add_project_member(db, project, payload.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ProjectMemberResponse(**serialize_project_member(member))


@router.delete("/{project_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_member_endpoint(
    project_id: int,
    member_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_manage_project_members(project, current_user):
        raise HTTPException(status_code=403, detail="Only the project owner can manage collaborators")

    try:
        remove_project_member(db, project, member_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/upload", response_model=list[UploadFileResponse])
def upload_project_files(
    project_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return [store_upload(db, project, item) for item in files]


@router.post("/{project_id}/import-accessions", response_model=list[UploadFileResponse])
def import_project_accessions(
    project_id: int,
    payload: ImportAccessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        return import_accessions(db, project, payload.tool_name, payload.accessions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{project_id}/import-jobs", response_model=ImportJobResponse, status_code=status.HTTP_201_CREATED)
def create_project_import_job(
    project_id: int,
    payload: ImportJobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    job = create_import_job(db, project, current_user, payload.tool_name, payload.accessions)
    start_import_job_runner(job.id)
    return ImportJobResponse(**serialize_import_job(db, job))


@router.get("/{project_id}/import-jobs", response_model=list[ImportJobResponse])
def list_project_import_jobs(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return [ImportJobResponse(**serialize_import_job(db, job)) for job in list_import_jobs_for_project(db, project.id)]


@router.get("/import-jobs/{import_job_id}", response_model=ImportJobResponse)
def get_project_import_job(
    import_job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = get_import_job(db, import_job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    project = get_project_for_user(db, current_user, job.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ImportJobResponse(**serialize_import_job(db, job))


@router.post("/{project_id}/upload-sessions", response_model=UploadSessionResponse, status_code=status.HTTP_201_CREATED)
def create_project_upload_session(
    project_id: int,
    payload: UploadSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    session = create_upload_session(db, project, current_user, payload.original_name, payload.size_bytes)
    return UploadSessionResponse(**serialize_upload_session(session))


@router.get("/upload-sessions/{upload_session_id}", response_model=UploadSessionResponse)
def get_project_upload_session(
    upload_session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_upload_session(db, upload_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    project = get_project_for_user(db, current_user, session.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    uploaded_file = None
    if session.upload_file_id:
        uploaded_file = db.query(UploadFileModel).filter(UploadFileModel.id == session.upload_file_id).first()
    return UploadSessionResponse(**serialize_upload_session(session, uploaded_file))


@router.put("/upload-sessions/{upload_session_id}/chunk", response_model=UploadSessionResponse)
async def upload_project_chunk(
    upload_session_id: int,
    request: Request,
    offset: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_upload_session(db, upload_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    project = get_project_for_user(db, current_user, session.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if session.status == "completed":
        uploaded_file = None
        if session.upload_file_id:
            uploaded_file = db.query(UploadFileModel).filter(UploadFileModel.id == session.upload_file_id).first()
        return UploadSessionResponse(**serialize_upload_session(session, uploaded_file))
    if offset != session.uploaded_bytes:
        raise HTTPException(status_code=409, detail=f"Offset mismatch. Expected {session.uploaded_bytes}.")

    chunk = await request.body()
    if not chunk:
        raise HTTPException(status_code=400, detail="Chunk body is empty")
    if session.uploaded_bytes + len(chunk) > session.size_bytes:
        raise HTTPException(status_code=400, detail="Chunk exceeds declared file size")

    session = append_chunk(db, session, chunk)
    return UploadSessionResponse(**serialize_upload_session(session))


@router.post("/upload-sessions/{upload_session_id}/complete", response_model=UploadFileResponse)
def complete_project_upload(
    upload_session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_upload_session(db, upload_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    project = get_project_for_user(db, current_user, session.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        upload = complete_upload_session(db, session, project)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return UploadFileResponse.model_validate(upload)


@router.get("/{project_id}/jobs", response_model=list[JobResponse])
def list_project_jobs(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return [JobResponse(**serialize_job(job)) for job in list_jobs_for_project(db, project.id)]
