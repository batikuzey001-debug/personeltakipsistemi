# apps/api/app/db/models_admin_notifications.py
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, func
from app.db.base import Base

class AdminNotification(Base):
    __tablename__ = "admin_notifications"
    id = Column(Integer, primary_key=True, autoincrement=True)
    channel = Column(String(32), nullable=False)   # bonus/finans/admin_tasks/attendance/custom
    name = Column(String(120), nullable=False)
    template = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
