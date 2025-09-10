from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Date, Boolean, ForeignKey, Text,
    UniqueConstraint, DateTime
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.db.base import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # super_admin|admin|manager|employee
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
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), index=True)
    title: Mapped[str | None] = mapped_column(String(120))
    hired_at: Mapped[Date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|inactive
    telegram_user_id: Mapped[int | None]
    telegram_username: Mapped[str | None]
    manager_id: Mapped[str | None] = mapped_column(String(64))  # fk to employees.employee_id (soft)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("telegram_user_id", name="uq_emp_tg_user_id"),
    )
