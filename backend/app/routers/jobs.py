from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.job import Job
from app.models.job_step import JobStep
from app.models.project_member import ProjectMember
from app.models.user import User
from app.routers.deps import get_current_user
from app.schemas.job import JobCreate, JobFileResponse, JobLogsResponse, JobResponse, JobStepResponse
from app.services.jobs import (
    create_job,
    get_tool_specs,
    list_job_files,
    read_job_logs,
    serialize_job,
    serialize_job_step,
    start_job_runner,
    delete_job,
)
from app.services.projects import get_project_for_user


router = APIRouter(tags=["jobs"])


def _get_job_for_user(db: Session, current_user: User, job_id: int) -> Job | None:
    return (
        db.query(Job)
        .join(Job.project)
        .join(ProjectMember, ProjectMember.project_id == Job.project_id)
        .filter(Job.id == job_id, ProjectMember.user_id == current_user.id)
        .first()
    )


@router.post("/projects/{project_id}/jobs", response_model=JobResponse)
def create_job_endpoint(
    project_id: int,
    payload: JobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_for_user(db, current_user, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        job = create_job(
            db,
            project,
            payload.sample_name,
            [step.model_dump() for step in payload.selected_steps],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    start_job_runner(job.id)
    return JobResponse(**serialize_job(job))


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job_endpoint(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_for_user(db, current_user, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(**serialize_job(job))


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job_endpoint(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_for_user(db, current_user, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    delete_job(db, job)
    return 


@router.get("/jobs/{job_id}/steps", response_model=list[JobStepResponse])
def get_job_steps_endpoint(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_for_user(db, current_user, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    steps = (
        db.query(JobStep)
        .filter(JobStep.job_id == job.id)
        .order_by(JobStep.step_order.asc(), JobStep.id.asc())
        .all()
    )
    return [JobStepResponse(**serialize_job_step(step)) for step in steps]


@router.get("/jobs/{job_id}/logs", response_model=JobLogsResponse)
def get_job_logs_endpoint(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_for_user(db, current_user, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    steps = (
        db.query(JobStep)
        .filter(JobStep.job_id == job.id)
        .order_by(JobStep.step_order.asc(), JobStep.id.asc())
        .all()
    )
    return JobLogsResponse(job_id=job.id, logs=read_job_logs(job, steps))


@router.get("/jobs/{job_id}/files", response_model=list[JobFileResponse])
def get_job_files_endpoint(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_for_user(db, current_user, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return [JobFileResponse(**item) for item in list_job_files(job)]


@router.get("/jobs/{job_id}/file")
def get_job_file_endpoint(
    job_id: int,
    path: str = Query(...),
    download: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = _get_job_for_user(db, current_user, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    target_path = Path(path).resolve()
    job_root = Path(job.working_dir).resolve()
    allowed_prefixes = [job_root]

    results_dir = Path("/data/storage/results") / f"job_{job.id}"
    if results_dir.exists():
        allowed_prefixes.append(results_dir.resolve())

    if not any(str(target_path).startswith(str(prefix)) for prefix in allowed_prefixes):
        raise HTTPException(status_code=403, detail="File is outside the job scope")
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    media_type = None
    if target_path.suffix == ".html":
        media_type = "text/html"
    elif target_path.suffix == ".zip":
        media_type = "application/zip"

    return FileResponse(
        path=target_path,
        media_type=media_type,
        filename=target_path.name,
        content_disposition_type="attachment" if download else "inline",
    )
