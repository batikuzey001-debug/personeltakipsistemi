from datetime import datetime, date
from sqlalchemy import Integer, String, Date, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class FactDaily(Base):
    __tablename__ = "facts_daily"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_key: Mapped[str] = mapped_column(String(128), index=True)  # "uid:123" | "uname:@nick" | ileride employee_id
    day: Mapped[date] = mapped_column(Date, index=True)
    kpi_code: Mapped[str] = mapped_column(String(64), index=True)    # KPI_FIRST_SEC | KPI_CLOSE_SEC | KPI_KT_COUNT
    value: Mapped[float] = mapped_column(Float)
    samples: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(16), default="telegram")
    inserted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class FactMonthly(Base):
    __tablename__ = "facts_monthly"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_key: Mapped[str] = mapped_column(String(128), index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)       # "YYYY-MM"
    kpi_code: Mapped[str] = mapped_column(String(64), index=True)
    value: Mapped[float] = mapped_column(Float)
    samples: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(16), default="telegram")
    inserted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
