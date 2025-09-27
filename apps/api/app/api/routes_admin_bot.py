# apps/api/app/api/routes_admin_bot.py
from __future__ import annotations
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pytz import timezone

from app.deps import get_db
from app.services.admin_settings_service import get_bool, BONUS_TG_ENABLED_KEY
from app.services.bonus_summary_service import compute_bonus_daily_context
from app.services.admin_notifications_service import render, send_text

IST = timezone("Europe/Istanbul")

router = APIRouter(prefix="/admin-bot", tags=["admin_bot"])


@router.post("/trigger/bonus/daily")
def trigger_bonus_daily(
    d: str | None = Query(None, description="YYYY-MM-DD (default: yesterday IST)"),
    sla_first_sec: int = Query(60, ge=1, le=3600),
    db: Session = Depends(get_db),
):
    if not get_bool(db, BONUS_TG_ENABLED_KEY, False):
        raise HTTPException(status_code=400, detail="bonus notifications disabled")

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

    fallback = (
        "📊 *BONUS GÜN SONU RAPORU — {date}*\n"
        f"- *Toplam Kapanış:* {{total_close}}\n"
        f"- *Ø İlk Yanıt:* {{avg_first}} sn\n"
        f"- *60 sn üzeri işlemler:* {{gt60_total}}\n\n"
        "⚠️ *Geç Yanıt Verenler (60 sn üzeri)*\n"
        "{slow_list_text}\n\n"
        "👥 *Personel Bazlı İşlem Sayıları*\n"
        "{per_emp_text}"
    )

    text_msg = render(db, "bonus_daily_v2", message_ctx, fallback, channel="bonus")

    if not send_text(text_msg):
        raise HTTPException(status_code=400, detail="send failed")

    return {"ok": True, "date": ctx["date_label"]}
