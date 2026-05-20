from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.upload_file import UploadFileResponse


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: datetime
    owner_email: str
    access_role: Literal["owner", "collaborator"]
    can_manage_members: bool
    member_count: int

    model_config = {"from_attributes": True}


class ProjectMemberAdd(BaseModel):
    email: str


class ProjectMemberResponse(BaseModel):
    user_id: int
    email: str
    role: Literal["owner", "collaborator"]
    created_at: datetime


class ProjectDetailResponse(ProjectResponse):
    uploads: list[UploadFileResponse] = Field(default_factory=list)
    members: list[ProjectMemberResponse] = Field(default_factory=list)
