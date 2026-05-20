from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class JobStep(Base):
    __tablename__ = "job_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    step_name: Mapped[str] = mapped_column(String(100))
    tool_name: Mapped[str] = mapped_column(String(100), default="")
    step_order: Mapped[int] = mapped_column(Integer, default=0)
    input_files: Mapped[str] = mapped_column(Text, default="[]")
    tool_options: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(50), default="queued")
    command: Mapped[str] = mapped_column(String(500))
    stdout_path: Mapped[str] = mapped_column(String(500))
    stderr_path: Mapped[str] = mapped_column(String(500))
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    job = relationship("Job", back_populates="steps")
