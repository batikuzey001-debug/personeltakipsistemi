# apps/api/app/api/routes_admin_bot.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.deps import get_db  # sadece DB oturumu için
from app.services.admin_settings_service import (
    get_bool, set_bool,
    ADMIN_TASKS_TG_ENABLED_KEY,
    BONUS_TG_ENABLED_KEY,
    FINANCE_TG_ENABLED_KEY,
    ATTENDANCE_TG_ENABLED_KEY,
)

# Bu değişken adı ÖNEMLİ: main.py import ederken 'router' arıyor
router = APIRouter(prefix="/admin-bot", tags=["admin_bot"])

# ---- Basit ping: route gerçekten register edilmiş mi hızlı kontrol ----
@router.get("/ping")
def admin_bot_ping():
    return {"ok": True, "service": "admin-bot"}

# ---- Settings şemaları ----
class BotSettingsOut(BaseModel):
    admin_tasks_tg_enabled: bool
    bonus_tg_enabled: bool
    finance_tg_enabled: bool
    attendance_tg_enabled: bool

class BotSettingsIn(BaseModel):
    admin_tasks_tg_enabled: bool | None = None
    bonus_tg_enabled: bool | None = None
    finance_tg_enabled: bool | None = None
    attendance_tg_enabled: bool | None = None

@router.get("/settings", response_model=BotSettingsOut)
def read_settings(db: Session = Depends(get_db)):
    return BotSettingsOut(
        admin_tasks_tg_enabled=get_bool(db, ADMIN_TASKS_TG_ENABLED_KEY, False),
        bonus_tg_enabled=get_bool(db, BONUS_TG_ENABLED_KEY, False),
        finance_tg_enabled=get_bool(db, FINANCE_TG_ENABLED_KEY, False),
        attendance_tg_enabled=get_bool(db, ATTENDANCE_TG_ENABLED_KEY, False),
    )

@router.put("/settings", response_model=BotSettingsOut)
def update_settings(body: BotSettingsIn, db: Session = Depends(get_db)):
    if body.admin_tasks_tg_enabled is not None:
        set_bool(db, ADMIN_TASKS_TG_ENABLED_KEY, body.admin_tasks_tg_enabled)
    if body.bonus_tg_enabled is not None:
        set_bool(db, BONUS_TG_ENABLED_KEY, body.bonus_tg_enabled)
    if body.finance_tg_enabled is not None:
        set_bool(db, FINANCE_TG_ENABLED_KEY, body.finance_tg_enabled)
    if body.attendance_tg_enabled is not None:
        set_bool(db, ATTENDANCE_TG_ENABLED_KEY, body.attendance_tg_enabled)
    # Güncel değerleri dön
    return read_settings(db)
