from datetime import datetime
from sqlalchemy import Integer, String, DateTime, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class EmployeeIdentity(Base):
    __tablename__ = "employee_identities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_key: Mapped[str] = mapped_column(String(128), index=True)   # "uid:123" | "uname:@nick"
    employee_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("employees.employee_id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending") # pending|confirmed
    hint_name: Mapped[str | None] = mapped_column(String(255), nullable=True)    # Mesajdan parse edilen isim
    hint_team: Mapped[str | None] = mapped_column(String(128), nullable=True)    # Mesajdan parse edilen birim/bölüm
    inserted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("actor_key", name="uq_identity_actor_key"),)
