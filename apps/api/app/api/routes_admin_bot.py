# apps/api/app/api/routes_admin_bot.py
from __future__ import annotations

from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pytz import timezone

from app.deps import get_db
from app.services.admin_settings_service import (
    get_bool, set_bool,
    ADMIN_TASKS_TG_ENABLED_KEY,
    BONUS_TG_ENABLED_KEY,
    FINANCE_TG_ENABLED_KEY,
    ATTENDANCE_TG_ENABLED_KEY,
)
# ⚠️ DOĞRU IMPORT: metrics artık bonus_metrics_service içinde
from app.services.bonus_metrics_service import (
    compute_bonus_daily_context,
    compute_bonus_periodic_context,
    IST,  # oradan export ediyorsak; yoksa bir satır altta IST = timezone("Europe/Istanbul")
)
from app.services.template_engine import render
from app.services.telegram_notify import send_text

# Eğer IST'yi metrics servisinden export etmiyorsanız yorum satırını açın:
# IST = timezone("Europe/Istanbul")

router = APIRouter(prefix="/admin-bot", tags=["admin_bot"])

# ------------ Sağlık/Ping ------------
@router.get("/ping")
def ping():
    return {"ok": True, "service": "admin-bot"}

# ------------ Settings ------------
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
    return read_settings(db)

# ------------ Dahili yardımcılar ------------
def _must_bonus_enabled(db: Session):
    if not get_bool(db, BONUS_TG_ENABLED_KEY, False):
        raise HTTPException(status_code=400, detail="bonus notifications disabled")

def _send_text_or_400(msg: str):
    if not send_text(msg):
        raise HTTPException(status_code=400, detail="send failed")

# ------------ BONUS: Gün Sonu (dün) ------------
@router.post("/trigger/bonus/daily")
def trigger_bonus_daily(
    d: str | None = Query(None, description="YYYY-MM-DD (default: yesterday IST)"),
    sla_first_sec: int = Query(60, ge=1, le=3600),
    db: Session = Depends(get_db),
):
    _must_bonus_enabled(db)

    now_ist = datetime.now(IST)
    if d:
        try:
            y, m, dd = map(int, d.split("-"))
            target = date(y, m, dd)
        except Exception:
            raise HTTPException(status_code=400, detail="d format YYYY-MM-DD")
    else:
        target = (now_ist - timedelta(days=1)).date()

    ctx = compute_bonus_daily_context(db, target, sla_first_sec=sla_first_sec)

    slow_text = "\n".join(
        [f"- {i.get('full_name','-')} — {int(i.get('gt60_cnt') or 0)} işlem" for i in ctx["slow_list"]]
    ) or "- —"

    per_emp_text = "\n".join(
        [
            f"- {i.get('full_name','-')} — {int(i.get('close_cnt') or 0)} işlem • Ø "
            f"{(str(int(round(i['avg_first_emp'])))+' sn') if i.get('avg_first_emp') is not None else '—'}"
            for i in ctx["per_emp"]
        ]
    ) or "- —"

    message_ctx = {
        "date": ctx["date_label"],
        "total_close": ctx["total_close"],
        "avg_first": (ctx["avg_first_sec"] if ctx["avg_first_sec"] is not None else "—"),
        "gt60_total": ctx["gt60_total"],
        "slow_list_text": slow_text,
        "per_emp_text": per_emp_text,
    }

    # Çizgisiz & bold fallback (DB'de 'bonus_daily_v2' yoksa bu kullanılır)
    fallback = (
        "📊 *BONUS GÜN SONU RAPORU — {date}*\n"
        "- *Toplam Kapanış:* {total_close}\n"
        "- *Ø İlk Yanıt:* {avg_first} sn\n"
        "- *60 sn üzeri işlemler:* {gt60_total}\n\n"
        "⚠️ *Geç Yanıt Verenler (60 sn üzeri)*\n"
        "{slow_list_text}\n\n"
        "👥 *Personel Bazlı İşlem Sayıları*\n"
        "{per_emp_text}"
    )

    text_msg = render(db, "bonus_daily_v2", message_ctx, fallback, channel="bonus")
    _send_text_or_400(text_msg)
    return {"ok": True, "date": ctx["date_label"]}

# ------------ BONUS: 2 saatlik (hafif) ------------
@router.post("/trigger/bonus/periodic")
def trigger_bonus_periodic(
    end: str | None = Query(None, description="IST bitiş (YYYY-MM-DDTHH:MM); default=now"),
    sla_first_sec: int = Query(60, ge=1, le=3600),
    sla_warn_pct: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    _must_bonus_enabled(db)

    if end:
        try:
            end_ist = IST.localize(datetime.strptime(end, "%Y-%m-%dT%H:%M"))
        except Exception:
            raise HTTPException(status_code=400, detail="end format YYYY-MM-DDTHH:MM")
    else:
        end_ist = datetime.now(IST)

    ctx = compute_bonus_periodic_context(db, end_ist, hours=2, sla_first_sec=sla_first_sec)

    top2_text = "\n".join(
        [
            f"- {i.get('full_name','-')} — {int(i.get('cnt') or 0)} işlem • Ø "
            f"{(str(int(round(i['avg_first_emp'])))+' sn') if i.get('avg_first_emp') is not None else '—'}"
            for i in ctx["top2"]
        ]
    ) or "- —"

    warn_line = f"⚠️ 60 sn üzeri oranı yüksek (%{ctx['gt60_rate']})" if ctx["gt60_rate"] >= sla_warn_pct else ""

    message_ctx = {
        "date": ctx["date_label"],
        "win_start": ctx["win_start"], "win_end": ctx["win_end"],
        "total_close": ctx["total_close"],
        "avg_first": (ctx["avg_first_sec"] if ctx["avg_first_sec"] is not None else "—"),
        "gt60_total": ctx["gt60_total"], "gt60_rate": ctx["gt60_rate"],
        "top2_text": top2_text, "warn_line": warn_line,
    }

    fallback = (
        "⏱️ *BONUS — 2 Saatlik Özet*\n"
        "*Pencere:* {date} • {win_start}–{win_end}\n\n"
        "• *Kapanış:* {total_close}\n"
        "• *Ø İlk KT:* {avg_first} sn\n"
        "• *60 sn üzeri işlemler:* {gt60_total} (%{gt60_rate})\n\n"
        "*Operasyon Özeti (ilk 2)*\n"
        "{top2_text}\n"
        "{warn_line}"
    )

    text_msg = render(db, "bonus_periodic_v1", message_ctx, fallback, channel="bonus")
    _send_text_or_400(text_msg)
    return {"ok": True, "window": f"{ctx['win_start']}-{ctx['win_end']}", "date": ctx["date_label"]}
