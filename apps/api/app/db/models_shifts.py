# apps/api/app/db/models_shifts.py
from sqlalchemy import Column, Integer, String, Time, Boolean, Date, ForeignKey, Enum, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.db.base import Base

class ShiftDefinition(Base):
    __tablename__ = "shift_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(64), nullable=False)
    start_time = Column(Time, nullable=False)   # Europe/Istanbul local time
    end_time = Column(Time, nullable=False)
    is_active = Column(Boolean, default=True)


class WeekStatus(str, enum.Enum):
    draft = "draft"
    published = "published"


class ShiftWeek(Base):
    __tablename__ = "shift_weeks"

    week_start = Column(Date, primary_key=True)  # Pazartesi tarihi (Europe/Istanbul)
    status = Column(Enum(WeekStatus), default=WeekStatus.draft, nullable=False)
    published_at = Column(DateTime, nullable=True)
    published_by = Column(String(64), nullable=True)


class AssignmentStatus(str, enum.Enum):
    ON = "ON"
    OFF = "OFF"


class ShiftAssignment(Base):
    __tablename__ = "shift_assignments"

    id = Column(Integer, primary_key=True, index=True)
    week_start = Column(Date, nullable=False)  # aynı haftanın Pazartesi
    date = Column(Date, nullable=False)        # gün
    employee_id = Column(String, nullable=False)  # employees.id (string key kullanılıyor)
    shift_def_id = Column(Integer, ForeignKey("shift_definitions.id"), nullable=True)
    status = Column(Enum(AssignmentStatus), default=AssignmentStatus.ON, nullable=False)

    shift = relationship("ShiftDefinition")

    __table_args__ = (
        UniqueConstraint("employee_id", "date", name="uq_employee_date"),
    )
