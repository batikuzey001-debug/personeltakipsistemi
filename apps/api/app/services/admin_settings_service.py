# apps/api/app/services/admin_settings_service.py
from sqlalchemy.orm import Session
from app.db.models_admin_settings import AdminSetting

# Tekil okuma/yazma
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

# Bool helper
def get_bool(db: Session, key: str, default: bool = False) -> bool:
    val = get_setting(db, key, "1" if default else "0")
    return val in ("1", "true", "True")

def set_bool(db: Session, key: str, value: bool) -> None:
    set_setting(db, key, "1" if value else "0")

# Anahtar isimleri
ADMIN_TASKS_TG_ENABLED_KEY = "admin_tasks_tg_enabled"
BONUS_TG_ENABLED_KEY       = "bonus_tg_enabled"
FINANCE_TG_ENABLED_KEY     = "finance_tg_enabled"
