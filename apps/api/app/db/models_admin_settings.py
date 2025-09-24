# apps/api/app/db/models_admin_settings.py
from sqlalchemy import Column, String, Text, DateTime, func
from app.db.base import Base

class AdminSetting(Base):
    __tablename__ = "admin_settings"
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
