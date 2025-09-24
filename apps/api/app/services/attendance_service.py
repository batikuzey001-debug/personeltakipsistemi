# apps/api/app/services/attendance_service.py
from __future__ import annotations
from datetime import datetime, timedelta, date
from typing import Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.db.models.models import Employee     # employees
from app.models.events import Event           # events modelinizdeki sınıf yolu buyduysa; aksiysa düzeltin
from app.services.admin_settings_service import get_bool, ATTENDANCE_TG_ENABLED_KEY
from app.core.admin_tasks_config import ADMIN_TASKS_TG_TOKEN, ADMIN_TASKS_TG_CHAT_ID
import requests
from pytz import timezone
IST = timezone("Europe/Istanbul")

def _tg_send_enabled(db: Session) -> bool:
    return get_bool(db, ATTENDANCE_TG_ENABLED_KEY, False) and ADMIN_TASKS_TG_TOKEN and ADMIN_TASKS_TG_CHAT_ID

def _tg_send(text: str) -> bool:
    try:
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(ADMIN_TASKS_TG_CHAT_ID), "text": text},
            timeout=5,
        ); return True
    except Exception:
        return False

def attendance_check_and_report(db: Session, d: date) -> bool:
    """
    Günlük yoklama özeti: check_in/check_out eşleşmeyenler.
    """
    start_utc = IST.localize(datetime(d.year,d.month,d.day,0,0)).astimezone(timezone("UTC"))
    end_utc   = IST.localize(datetime(d.year,d.month,d.day,23,59,59)).astimezone(timezone("UTC"))

    rows = db.query(Event).filter(
        Event.source_channel == "mesai",
        Event.ts >= start_utc,
        Event.ts <= end_utc,
        Event.type.in_(("check_in","check_out")),
        Event.employee_id.isnot(None)
    ).order_by(Event.employee_id, Event.ts).all()

    ins: Dict[str,int]  = {}
    outs: Dict[str,int] = {}
    for e in rows:
        if e.type == "check_in":
            ins[e.employee_id] = ins.get(e.employee_id, 0) + 1
        elif e.type == "check_out":
            outs[e.employee_id] = outs.get(e.employee_id, 0) + 1

    missing_in  = []
    missing_out = []
    for emp in db.query(Employee.employee_id, Employee.full_name).all():
        i = ins.get(emp.employee_id, 0)
        o = outs.get(emp.employee_id, 0)
        if i == 0:
            missing_in.append(f"{emp.full_name} ({emp.employee_id})")
        if o == 0:
            missing_out.append(f"{emp.full_name} ({emp.employee_id})")

    if not _tg_send_enabled(db):
        return False

    txt = [f"📋 Mesai Yoklama — {d.strftime('%d.%m.%Y')}"]
    if missing_in:
        txt += ["\nGiriş yapmayanlar:"] + [f"• {x}" for x in missing_in]
    if missing_out:
        txt += ["\nÇıkış yapmayanlar:"] + [f"• {x}" for x in missing_out]
    if len(txt) == 1:
        txt += ["\nTüm kayıtlar tam."]

    return _tg_send("\n".join(txt))
