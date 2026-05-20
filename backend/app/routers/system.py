from fastapi import APIRouter

from app.schemas.system import ToolSpecResponse, ToolStatusResponse
from app.services.jobs import get_tool_specs
from app.services.system import detect_tool_statuses


router = APIRouter(prefix="/system", tags=["system"])


@router.get("/tools", response_model=list[ToolStatusResponse])
def get_tool_statuses():
    return [ToolStatusResponse(**item) for item in detect_tool_statuses()]


@router.get("/tool-specs", response_model=list[ToolSpecResponse])
def get_tool_specs_endpoint():
    return [ToolSpecResponse(**item) for item in get_tool_specs()]
