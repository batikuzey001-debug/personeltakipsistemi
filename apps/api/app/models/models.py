# apps/api/app/models/models.py
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Date, Boolean, ForeignKey, Text,
    UniqueConstraint, DateTime, Float, BigInteger, Numeric
)
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="viewer")
    team_scope_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)

class Employee(Base):
    __tablename__ = "employees"
    employee_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=False, nullable=True)

    # >>> Departman (Takım ID yerine)
    department: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "Call Center", "Canlı", "Finans", "Bonus", "Admin"

    # (Eski) team_id dursa da raporlamada kullanılmayacak
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), index=True, nullable=True)

    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    hired_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|inactive

    # Kart ek alanları
    telegram_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    telegram_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    salary_gross: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
