from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.upload_file import UploadFileResponse


class UploadSessionCreate(BaseModel):
    original_name: str
    size_bytes: int = Field(gt=0)


class UploadSessionResponse(BaseModel):
    id: int
    project_id: int
    created_by_user_id: int
    original_name: str
    file_type: str
    size_bytes: int
    uploaded_bytes: int
    status: str
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None
    uploaded_file: UploadFileResponse | None = None
