from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.user import User
from app.services.auth import hash_password
from app.services.jobs import create_job, start_fake_runner
from app.services.projects import create_project


def seed(db: Session) -> None:
    existing = db.query(User).filter(User.email == "demo@example.com").first()
    if existing:
        return

    user = User(email="demo@example.com", password_hash=hash_password("demo12345"))
    db.add(user)
    db.commit()
    db.refresh(user)

    project = create_project(db, user, "Demo NGS Run", "Starter project with fake pipeline output.")
    job = create_job(
        db,
        project,
        "demo_sample",
        ["fastqc_raw", "multiqc", "bwa", "samtools", "bcftools"],
    )
    start_fake_runner(job.id)


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)

