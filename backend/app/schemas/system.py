from pydantic import BaseModel, Field


class ToolStatusResponse(BaseModel):
    name: str
    installed: bool
    executable: str | None
    version: str | None
    notes: str | None = None


class ToolOptionDefinitionResponse(BaseModel):
    key: str
    flag: str
    label: str
    description: str
    value_type: str
    placeholder: str | None = None
    choices: list[str] = Field(default_factory=list)
    applies_to: list[str] = Field(default_factory=list)


class ToolSpecResponse(BaseModel):
    name: str
    description: str
    input_mode: str
    runner_mode: str
    accepted_file_types: list[str] = Field(default_factory=list)
    option_definitions: list[ToolOptionDefinitionResponse] = Field(default_factory=list)
