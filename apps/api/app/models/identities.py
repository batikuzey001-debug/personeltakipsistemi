# apps/api/app/models/identities.py
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class EmployeeIdentity(Base):
    """
    Telegram aktörlerini (uid/uname) sistemdeki employee kaydına bağlamak için
    keşif/bağlantı tablosu.
    """
    __tablename__ = "employee_identities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # actor_key örnekleri: "uid:123456789" | "uname:@kullanici"
    actor_key: Mapped[str] = mapped_column(String(128), index=True)

    # Bağlandığında employee_id dolar (employees.employee_id FK)
    employee_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("employees.employee_id"), nullable=True
    )

    # pending | confirmed
    status: Mapped[str] = mapped_column(String(16), default="pending")

    # Mesajlardan yakalanan ipuçları
    hint_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hint_team: Mapped[str | None] = mapped_column(String(128), nullable=True)

    inserted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("actor_key", name="uq_identity_actor_key"),)
