# apps/api/app/api/routes_admin_bot.py  (YALNIZ BONUS TETİKLERİ GÜNCELLENDİ)
from __future__ import annotations
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pytz import timezone

from app.deps import get_db, RolesAllowed
from app.services.admin_settings_service import get_bool, BONUS_TG_ENABLED_KEY
from app.services.bonus_metrics_service import (
    compute_bonus_daily_context,
    compute_bonus_periodic_context,
    IST,
)
from app.services.template_engine import render
from app.services.telegram_notify import send_text

router = APIRouter(prefix="/admin-bot", tags=["admin_bot"])

# ---- BONUS: Gün Sonu (dün) ----
@router.post("/trigger/bonus/daily", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def trigger_bonus_daily(
    d: str | None = Query(None, description="YYYY-MM-DD; default: yesterday"),
    sla_first_sec: int = Query(60, ge=1, le=3600),
    db: Session = Depends(get_db),
):
    if not get_bool(db, BONUS_TG_ENABLED_KEY, False):
        raise HTTPException(status_code=400, detail="bonus notifications disabled")
    # hedef gün
    now_ist = datetime.now(IST)
    if d:
        y, m, day = map(int, d.split("-"))
        target = date(y, m, day)
    else:
        target = (now_ist - timedelta(days=1)).date()

    ctx = compute_bonus_daily_context(db, target, sla_first_sec=sla_first_sec)

    # listeleri stringe çevir
    slow_text = "\n".join([f"• {i.get('full_name','-')} — {int(i.get('gt60_cnt') or 0)} işlem" for i in ctx["slow_list"]]) or "• —"
    per_emp_text = "\n".join([
        f"• {i.get('full_name','-')} — {int(i.get('close_cnt') or 0)} işlem • Ø { (str(int(round(i['avg_first_emp'])))+' sn') if i.get('avg_first_emp') is not None else '—' }"
        for i in ctx["per_emp"]
    ]) or "• —"

    message_ctx = {
        "date": ctx["date_label"],
        "total_close": ctx["total_close"],
        "avg_first": ctx["avg_first_sec"] if ctx["avg_first_sec"] is not None else "—",
        "gt60_total": ctx["gt60_total"],
        "slow_list_text": slow_text,
        "per_emp_text": per_emp_text,
    }

    fallback = (
        "━━━━━━━━━━━━━━━━━━\n"
        "📣 BONUS • Gün Sonu Raporu\n"
        f"🗓️ {{date}}\n"
        "━━━━━━━━━━━━━━━━━━\n\n"
        "📊 Genel\n"
        "• Toplam Kapanış: {total_close}\n"
        "• Ø İlk Yanıt: {avg_first} sn\n"
        "• 60 sn üzeri işlemler: {gt60_total}\n\n"
        "⚠️ Geç Yanıt Verenler (60 sn üzeri)\n"
        "{slow_list_text}\n\n"
        "👥 Personel Bazlı İşlem Sayıları\n"
        "{per_emp_text}"
    )

    text_msg = render(db, "bonus_daily_v1", message_ctx, fallback, channel="bonus")
    if not send_text(text_msg):
        raise HTTPException(status_code=400, detail="send failed")
    return {"ok": True, "date": ctx["date_label"]}

# ---- BONUS: 2 saatlik ----
@router.post("/trigger/bonus/periodic", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def trigger_bonus_periodic(
    end: str | None = Query(None, description="IST bitiş (YYYY-MM-DDTHH:MM); default=now"),
    sla_first_sec: int = Query(60, ge=1, le=3600),
    sla_warn_pct: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if not get_bool(db, BONUS_TG_ENABLED_KEY, False):
        raise HTTPException(status_code=400, detail="bonus notifications disabled")
    end_ist = datetime.now(IST) if not end else IST.localize(datetime.strptime(end, "%Y-%m-%dT%H:%M"))

    ctx = compute_bonus_periodic_context(db, end_ist, hours=2, sla_first_sec=sla_first_sec)

    top2_text = "\n".join([
        f"• {i.get('full_name','-')} — {int(i.get('cnt') or 0)} işlem • Ø { (str(int(round(i['avg_first_emp'])))+' sn') if i.get('avg_first_emp') is not None else '—' }"
        for i in ctx["top2"]
    ]) or "• —"

    message_ctx = {
        "date": ctx["date_label"],
        "win_start": ctx["win_start"], "win_end": ctx["win_end"],
        "total_close": ctx["total_close"],
        "avg_first": ctx["avg_first_sec"] if ctx["avg_first_sec"] is not None else "—",
        "gt60_total": ctx["gt60_total"],
        "gt60_rate": ctx["gt60_rate"],
        "top2_text": top2_text,
        "warn_line": (f"⚠️ 60 sn üzeri oranı yüksek (%{ctx['gt60_rate']})" if ctx["gt60_rate"] >= sla_warn_pct else "")
    }

    fallback = (
        "⏱️ BONUS • {date} {win_start}-{win_end}\n\n"
        "• Kapanış: {total_close}\n"
        "• Ø İlk KT: {avg_first} sn\n"
        "• 60 sn üzeri işlemler: {gt60_total} (%{gt60_rate})\n\n"
        "İyi Gidenler\n"
        "{top2_text}\n"
        "{warn_line}"
    )

    text_msg = render(db, "bonus_periodic_v1", message_ctx, fallback, channel="bonus")
    if not send_text(text_msg):
        raise HTTPException(status_code=400, detail="send failed")
    return {"ok": True, "window": f"{ctx['win_start']}-{ctx['win_end']}", "date": ctx["date_label"]}
