# apps/api/app/db/models_admin_tasks.py
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, Date, DateTime, Enum, Text, func
from app.db.base import Base
import enum

class TaskStatus(str, enum.Enum):
    open = "open"
    done = "done"
    late = "late"

class AdminTask(Base):
    __tablename__ = "admin_tasks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False)
    shift = Column(String(20), nullable=True)
    title = Column(String(200), nullable=False)
    department = Column(String(50), nullable=True)
    assignee_employee_id = Column(String(50), nullable=True)
    due_ts = Column(DateTime, nullable=True)
    grace_min = Column(Integer, nullable=False, default=0)
    status = Column(Enum(TaskStatus), nullable=False, default=TaskStatus.open)
    is_done = Column(Boolean, nullable=False, default=False)
    done_at = Column(DateTime, nullable=True)
    done_by = Column(String(50), nullable=True)
    last_alert_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

class AdminTaskTemplate(Base):
    __tablename__ = "admin_task_templates"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    department = Column(String(50), nullable=True)
    shift = Column(String(20), nullable=True)
    repeat = Column(String(20), nullable=False, default="daily")  # daily/weekly/shift/once
    grace_min = Column(Integer, nullable=False, default=0)
    default_assignee = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
