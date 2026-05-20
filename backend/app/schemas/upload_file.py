from datetime import datetime

from pydantic import BaseModel, Field


class ImportAccessionRequest(BaseModel):
    tool_name: str
    accessions: list[str] = Field(min_length=1)


class UploadFileResponse(BaseModel):
    id: int
    project_id: int
    original_name: str
    stored_path: str
    file_type: str
    created_at: datetime

    model_config = {"from_attributes": True}
