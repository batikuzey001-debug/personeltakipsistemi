# apps/api/app/api/routes_admin_bot.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.deps import get_db, RolesAllowed
from app.services.admin_settings_service import (
    get_setting, set_setting, ADMIN_TASKS_TG_ENABLED_KEY
)

router = APIRouter(prefix="/admin-bot", tags=["admin_bot"])

class BotSettingsOut(BaseModel):
    admin_tasks_tg_enabled: bool

@router.get("/settings", response_model=BotSettingsOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def read_settings(db: Session = Depends(get_db)):
    val = get_setting(db, ADMIN_TASKS_TG_ENABLED_KEY, "0")
    return BotSettingsOut(admin_tasks_tg_enabled = (val in ("1", "true", "True")))

class BotSettingsIn(BaseModel):
    admin_tasks_tg_enabled: bool

@router.put("/settings", response_model=BotSettingsOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def update_settings(body: BotSettingsIn, db: Session = Depends(get_db)):
    set_setting(db, ADMIN_TASKS_TG_ENABLED_KEY, "1" if body.admin_tasks_tg_enabled else "0")
    return read_settings(db)
