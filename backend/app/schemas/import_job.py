from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.upload_file import UploadFileResponse


class ImportJobCreate(BaseModel):
    tool_name: str
    accessions: list[str] = Field(min_length=1)


class ImportJobResponse(BaseModel):
    id: int
    project_id: int
    requested_by_user_id: int
    tool_name: str
    accessions: list[str]
    status: str
    log: str
    error_message: str | None
    imported_files: list[UploadFileResponse] = Field(default_factory=list)
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
