from fastapi import APIRouter

from app.schemas.system import ToolSpecResponse, ToolStatusResponse, GenomeSearchResult
from app.services.jobs import get_tool_specs
from app.services.system import detect_tool_statuses


router = APIRouter(prefix="/system", tags=["system"])


@router.get("/tools", response_model=list[ToolStatusResponse])
def get_tool_statuses():
    return [ToolStatusResponse(**item) for item in detect_tool_statuses()]


@router.get("/tool-specs", response_model=list[ToolSpecResponse])
def get_tool_specs_endpoint():
    return [ToolSpecResponse(**item) for item in get_tool_specs()]


@router.get("/genomes/search", response_model=list[GenomeSearchResult])
def search_genomes_endpoint(
    query: str,
    source: str = "ncbi"
):
    from app.services.external_db import search_ncbi_genomes, search_ensembl_genomes
    if source == "ncbi":
        return search_ncbi_genomes(query)
    elif source == "ensembl":
        return search_ensembl_genomes(query)
    return []
