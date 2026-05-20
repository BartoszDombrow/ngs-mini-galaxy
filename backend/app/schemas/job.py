from datetime import datetime

from pydantic import BaseModel, Field


class PipelineOptionValue(BaseModel):
    key: str
    enabled: bool = True
    value: str | None = None


class PipelineInputFile(BaseModel):
    id: int
    original_name: str
    file_type: str


class PipelineStepConfig(BaseModel):
    step_name: str
    tool_name: str
    input_source: str = "project"
    input_from_step_order: int | None = None
    input_file_ids: list[int] = Field(default_factory=list)
    options: list[PipelineOptionValue] = Field(default_factory=list)


class JobCreate(BaseModel):
    sample_name: str
    selected_steps: list[PipelineStepConfig] = Field(min_length=1)


class JobResponse(BaseModel):
    id: int
    project_id: int
    sample_name: str
    status: str
    selected_steps: list[PipelineStepConfig]
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    working_dir: str


class JobStepResponse(BaseModel):
    id: int
    job_id: int
    step_name: str
    tool_name: str
    step_order: int
    input_files: list[PipelineInputFile]
    tool_options: list[PipelineOptionValue]
    status: str
    command: str
    stdout_path: str
    stderr_path: str
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class JobLogsResponse(BaseModel):
    job_id: int
    logs: dict[str, dict[str, str]]


class JobFileResponse(BaseModel):
    name: str
    path: str
    kind: str
