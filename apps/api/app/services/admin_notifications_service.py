# apps/api/app/services/admin_notifications_service.py
from __future__ import annotations
from typing import Optional, Dict
from sqlalchemy.orm import Session
from app.db.models_admin_notifications import AdminNotification
from app.services.admin_settings_service import (
    get_bool,
    BONUS_TG_ENABLED_KEY, FINANCE_TG_ENABLED_KEY, ADMIN_TASKS_TG_ENABLED_KEY, ATTENDANCE_TG_ENABLED_KEY
)
from app.core.admin_tasks_config import ADMIN_TASKS_TG_TOKEN, ADMIN_TASKS_TG_CHAT_ID
import requests

def _tg_send(text: str) -> bool:
    if not ADMIN_TASKS_TG_TOKEN or not ADMIN_TASKS_TG_CHAT_ID:
        return False
    try:
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(ADMIN_TASKS_TG_CHAT_ID), "text": text},
            timeout=5,
        ); return True
    except Exception:
        return False

def _enabled_for_channel(db: Session, channel: str) -> bool:
    m = {
        "bonus": BONUS_TG_ENABLED_KEY,
        "finans": FINANCE_TG_ENABLED_KEY,
        "admin_tasks": ADMIN_TASKS_TG_ENABLED_KEY,
        "attendance": ATTENDANCE_TG_ENABLED_KEY,
        "custom": ADMIN_TASKS_TG_ENABLED_KEY,  # custom'ı admin_tasks anahtarına bağladık (istersen ayrı açarız)
    }
    key = m.get(channel, ADMIN_TASKS_TG_ENABLED_KEY)
    return get_bool(db, key, False)

def list_templates(db: Session, channel: Optional[str]=None):
    q = db.query(AdminNotification)
    if channel: q = q.filter(AdminNotification.channel==channel)
    return q.order_by(AdminNotification.is_active.desc(), AdminNotification.name.asc()).all()

def create_template(db: Session, channel: str, name: str, template: str, is_active: bool=True):
    row = AdminNotification(channel=channel, name=name, template=template, is_active=is_active)
    db.add(row); db.commit(); db.refresh(row); return row

def update_template(db: Session, tpl_id: int, payload: Dict):
    row = db.get(AdminNotification, tpl_id)
    if not row: return None
    for k,v in payload.items():
        if hasattr(row, k): setattr(row,k,v)
    db.commit(); db.refresh(row); return row

def delete_template(db: Session, tpl_id: int) -> bool:
    row = db.get(AdminNotification, tpl_id)
    if not row: return False
    db.delete(row); db.commit(); return True

def render_template(tpl: str, ctx: Dict[str, str]) -> str:
    # çok basit {key} değişimi
    out = tpl
    for k,v in ctx.items():
        out = out.replace("{"+k+"}", str(v))
    return out

def send_manual(db: Session, channel: str, text: Optional[str]=None, template_id: Optional[int]=None, context: Optional[Dict[str,str]]=None) -> bool:
    if not _enabled_for_channel(db, channel):
        return False
    msg = text or ""
    if not msg and template_id:
        tpl = db.get(AdminNotification, template_id)
        if not tpl or not tpl.is_active: return False
        msg = render_template(tpl.template, context or {})
    if not msg.strip(): return False
    return _tg_send(msg)
