# apps/api/app/api/routes_admin_bot.py
from __future__ import annotations
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pytz import timezone

from app.deps import get_db, RolesAllowed
from app.services.admin_settings_service import (
    get_bool, set_bool,
    ADMIN_TASKS_TG_ENABLED_KEY,
    BONUS_TG_ENABLED_KEY,
    FINANCE_TG_ENABLED_KEY,
    ATTENDANCE_TG_ENABLED_KEY,
)

# ⬇ mevcut settings GET/PUT kodun burada kalacak (değiştirme)

# ========= Manuel Tetik Uçları =========
from app.services.admin_tasks_service import send_day_end_report, send_shift_end_report_if_pending
from app.services.attendance_service import attendance_check_and_report
from app.services.bonus_summary_service import send_bonus_daily_summary

IST = timezone("Europe/Istanbul")

router = APIRouter(prefix="/admin-bot", tags=["admin_bot"])

# ----- Yardımcı -----
def _parse_date_ist(d_str: str | None, default: str = "today") -> date:
    now_ist = datetime.now(IST)
    if not d_str:
        if default == "yesterday":
            ref = now_ist - timedelta(days=1)
        else:
            ref = now_ist
        return date(ref.year, ref.month, ref.day)
    try:
        y, m, d = map(int, d_str.split("-"))
        return date(y, m, d)
    except Exception:
        raise HTTPException(status_code=400, detail="d formatı YYYY-MM-DD olmalı")

# ----- Admin Görevleri: Gün Sonu -----
@router.post(
    "/trigger/admin-tasks/day-end",
    dependencies=[Depends(RolesAllowed("super_admin","admin"))],
)
def trigger_admin_tasks_day_end(d: str | None = Query(None, description="YYYY-MM-DD; default: yesterday"), db: Session = Depends(get_db)):
    target = _parse_date_ist(d, default="yesterday")
    ok = send_day_end_report(db, target)
    if not ok:
        raise HTTPException(status_code=400, detail="Gönderilemedi (kapalı olabilir veya içerik yok).")
    return {"ok": True, "date": target.isoformat()}

# ----- Admin Görevleri: Vardiya Sonu -----
@router.post(
    "/trigger/admin-tasks/shift-end",
    dependencies=[Depends(RolesAllowed("super_admin","admin"))],
)
def trigger_admin_tasks_shift_end(
    shift: str = Query(..., description="Sabah|Öğlen|Akşam|Gece"),
    d: str | None = Query(None, description="YYYY-MM-DD; default: today (Akşam için genelde dün)"),
    db: Session = Depends(get_db),
):
    s_norm = shift.strip()
    if s_norm not in ("Sabah","Öğlen","Akşam","Gece"):
        raise HTTPException(status_code=400, detail="shift 'Sabah|Öğlen|Akşam|Gece' olmalı")
    # Akşam vardiyası raporu genelde ertesi 00:00'da dünü raporlar
    default = "yesterday" if s_norm == "Akşam" else "today"
    target = _parse_date_ist(d, default=default)
    ok = send_shift_end_report_if_pending(db, target, s_norm)
    if not ok:
        raise HTTPException(status_code=400, detail="Gönderilemedi (açık/geciken yok veya kapalı).")
    return {"ok": True, "date": target.isoformat(), "shift": s_norm}

# ----- Attendance: Günlük Yoklama -----
@router.post(
    "/trigger/attendance/daily",
    dependencies=[Depends(RolesAllowed("super_admin","admin"))],
)
def trigger_attendance_daily(d: str | None = Query(None, description="YYYY-MM-DD; default: today"), db: Session = Depends(get_db)):
    target = _parse_date_ist(d, default="today")
    ok = attendance_check_and_report(db, target)
    if not ok:
        raise HTTPException(status_code=400, detail="Gönderilemedi (kapalı olabilir).")
    return {"ok": True, "date": target.isoformat()}

# ----- BONUS: Gün Sonu (İlk KT SLA>60) -----
@router.post(
    "/trigger/bonus/daily",
    dependencies=[Depends(RolesAllowed("super_admin","admin"))],
)
def trigger_bonus_daily(
    d: str | None = Query(None, description="YYYY-MM-DD; default: yesterday"),
    sla_first_sec: int = Query(60, ge=1, le=3600),
    db: Session = Depends(get_db),
):
    target = _parse_date_ist(d, default="yesterday")
    ok = send_bonus_daily_summary(db, target, sla_first_sec=sla_first_sec)
    if not ok:
        raise HTTPException(status_code=400, detail="Gönderilemedi (kapalı olabilir veya aynı gün için daha önce gönderildi).")
    return {"ok": True, "date": target.isoformat(), "sla_first_sec": sla_first_sec}
