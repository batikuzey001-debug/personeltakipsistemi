# apps/api/app/services/admin_settings_service.py
from sqlalchemy.orm import Session
from app.db.models_admin_settings import AdminSetting

def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.get(AdminSetting, key)
    return row.value if row else default

def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AdminSetting, key)
    if row:
        row.value = value
    else:
        row = AdminSetting(key=key, value=value)
        db.add(row)
    db.commit()

# Kullanacağımız anahtar
ADMIN_TASKS_TG_ENABLED_KEY = "admin_tasks_tg_enabled"
