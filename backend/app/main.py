from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.core.config import CORS_ORIGINS, ensure_directories
from app.db.base import Base
from app.db.session import engine
from app.models import job, job_comment, job_step, project, project_import_job, project_member, upload_file, upload_session, user
from app.routers.auth import router as auth_router
from app.routers.jobs import router as jobs_router
from app.routers.projects import router as projects_router
from app.routers.system import router as system_router


def ensure_sqlite_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "job_steps" in tables:
        columns = {column["name"] for column in inspector.get_columns("job_steps")}
        statements: list[str] = []
        if "tool_name" not in columns:
            statements.append("ALTER TABLE job_steps ADD COLUMN tool_name VARCHAR(100) DEFAULT ''")
        if "step_order" not in columns:
            statements.append("ALTER TABLE job_steps ADD COLUMN step_order INTEGER DEFAULT 0")
        if "input_files" not in columns:
            statements.append("ALTER TABLE job_steps ADD COLUMN input_files TEXT DEFAULT '[]'")
        if "tool_options" not in columns:
            statements.append("ALTER TABLE job_steps ADD COLUMN tool_options TEXT DEFAULT '[]'")

        with engine.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))

    if "project_members" in tables:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO project_members (project_id, user_id, role, created_at)
                    SELECT projects.id, projects.user_id, 'owner', projects.created_at
                    FROM projects
                    LEFT JOIN project_members
                      ON project_members.project_id = projects.id
                     AND project_members.user_id = projects.user_id
                    WHERE project_members.id IS NULL
                    """
                )
            )


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_directories()
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_schema()
    yield


app = FastAPI(title="NGS Mini Galaxy API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(jobs_router)
app.include_router(system_router)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}
