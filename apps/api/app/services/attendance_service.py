# apps/api/app/services/attendance_service.py
from __future__ import annotations
from datetime import datetime, date
from typing import Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pytz import timezone

# ✔ Doğru import yolları (repo yapısına göre)
from app.models.models import Employee            # employees tablosu
from app.models.events import Event               # events tablosu (type: check_in/check_out vb.)

from app.services.admin_settings_service import get_bool, ATTENDANCE_TG_ENABLED_KEY
from app.core.admin_tasks_config import ADMIN_TASKS_TG_TOKEN, ADMIN_TASKS_TG_CHAT_ID
import requests

IST = timezone("Europe/Istanbul")
UTC = timezone("UTC")


def _tg_send_enabled(db: Session) -> bool:
    """Paneldeki attendance anahtarı ve token/chat ayarları uygun mu?"""
    return (
        get_bool(db, ATTENDANCE_TG_ENABLED_KEY, False)
        and bool(ADMIN_TASKS_TG_TOKEN)
        and bool(ADMIN_TASKS_TG_CHAT_ID)
    )


def _tg_send(text: str) -> bool:
    try:
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(ADMIN_TASKS_TG_CHAT_ID), "text": text},
            timeout=5,
        )
        return True
    except Exception:
        return False


def attendance_check_and_report(db: Session, d: date) -> bool:
    """
    Günlük yoklama özeti (IST gününe göre):
      - check_in / check_out eşleşmeyenleri listeler
      - Bildirim anahtarı açıksa Telegram'a gönderir
    """
    # IST gününü UTC aralığına çevir
    start_utc = IST.localize(datetime(d.year, d.month, d.day, 0, 0)).astimezone(UTC)
    end_utc = IST.localize(datetime(d.year, d.month, d.day, 23, 59, 59)).astimezone(UTC)

    # Gün içi mesai eventleri
    rows = (
        db.query(Event)
        .filter(
            Event.source_channel == "mesai",
            Event.ts >= start_utc,
            Event.ts <= end_utc,
            Event.type.in_(("check_in", "check_out")),
            Event.employee_id.isnot(None),
        )
        .order_by(Event.employee_id, Event.ts)
        .all()
    )

    ins: Dict[str, int] = {}
    outs: Dict[str, int] = {}
    for e in rows:
        if e.type == "check_in":
            ins[e.employee_id] = ins.get(e.employee_id, 0) + 1
        elif e.type == "check_out":
            outs[e.employee_id] = outs.get(e.employee_id, 0) + 1

    # Tüm çalışanlar üzerinden eksikleri bul
    missing_in = []
    missing_out = []
    for emp_id, full_name in db.query(Employee.employee_id, Employee.full_name).all():
        i = ins.get(emp_id, 0)
        o = outs.get(emp_id, 0)
        if i == 0:
            missing_in.append(f"{full_name} ({emp_id})")
        if o == 0:
            missing_out.append(f"{full_name} ({emp_id})")

    # Bildirim kapalıysa, sadece hesapla ve çık
    if not _tg_send_enabled(db):
        return False

    # Mesajı oluştur
    title = f"📋 Mesai Yoklama — {d.strftime('%d.%m.%Y')}"
    parts = [title]
    if missing_in:
        parts.append("\nGiriş yapmayanlar:")
        parts.extend([f"• {x}" for x in missing_in])
    if missing_out:
        parts.append("\nÇıkış yapmayanlar:")
        parts.extend([f"• {x}" for x in missing_out])
    if len(parts) == 1:
        parts.append("\nTüm kayıtlar tam.")

    return _tg_send("\n".join(parts))
