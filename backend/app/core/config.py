import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
APP_DIR = BASE_DIR / "app"
STORAGE_DIR = Path(os.getenv("NGS_STORAGE_DIR", BASE_DIR / "storage"))
UPLOADS_DIR = STORAGE_DIR / "uploads"
JOBS_DIR = STORAGE_DIR / "jobs"
RESULTS_DIR = STORAGE_DIR / "results"
DB_PATH = Path(os.getenv("NGS_DB_PATH", BASE_DIR / "ngs_mini_galaxy.db"))

JWT_SECRET = os.getenv("NGS_JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = os.getenv("NGS_JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("NGS_ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)))

default_cors = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ORIGINS = [origin.strip() for origin in os.getenv("NGS_CORS_ORIGINS", default_cors).split(",") if origin.strip()]


def ensure_directories() -> None:
    for directory in (STORAGE_DIR, UPLOADS_DIR, JOBS_DIR, RESULTS_DIR):
        directory.mkdir(parents=True, exist_ok=True)
