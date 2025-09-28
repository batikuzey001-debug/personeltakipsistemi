# apps/api/app/scheduler/admin_tasks_jobs.py
from datetime import datetime, timedelta, date
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import sessionmaker
from pytz import timezone

from app.db.session import engine

# Admin görevleri, attendance
from app.services.admin_tasks_service import (
    scan_overdue_and_alert,
    send_shift_end_report_if_pending,
    send_day_end_report,
)
from app.services.attendance_service import attendance_check_and_report

# BONUS: metrics + template + telegram
from app.services.bonus_metrics_service import (
    compute_bonus_daily_context,
    compute_bonus_periodic_context,
)
from app.services.template_engine import render
from app.services.telegram_notify import send_text

# Settings
from app.services.admin_settings_service import (
    get_bool,
    BONUS_TG_ENABLED_KEY,
    ADMIN_TASKS_TG_ENABLED_KEY,
    ATTENDANCE_TG_ENABLED_KEY,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
scheduler = BackgroundScheduler(timezone="Europe/Istanbul")
IST = timezone("Europe/Istanbul")


def _with_db(fn):
    def inner(*args, **kwargs):
      db = SessionLocal()
      try:
          return fn(db, *args, **kwargs)
      finally:
          db.close()
    return inner


def _enabled(db, key: str) -> bool:
    # Her tetikte DB’den okur ⇒ kalıcı toggle davranışı
    return bool(get_bool(db, key, False))


# --------- Admin Tasks ---------
@_with_db
def job_scan_overdue(db):
    if not _enabled(db, ADMIN_TASKS_TG_ENABLED_KEY):
        return
    scan_overdue_and_alert(db, cooldown_min=60)

@_with_db
def job_shift_end_sabah(db):
    if not _enabled(db, ADMIN_TASKS_TG_ENABLED_KEY):
        return
    d = datetime.now(IST).date()
    send_shift_end_report_if_pending(db, d, "Sabah")

@_with_db
def job_shift_end_oglen(db):
    if not _enabled(db, ADMIN_TASKS_TG_ENABLED_KEY):
        return
    d = datetime.now(IST).date()
    send_shift_end_report_if_pending(db, d, "Öğlen")

@_with_db
def job_shift_end_aksam(db):
    if not _enabled(db, ADMIN_TASKS_TG_ENABLED_KEY):
        return
    y = datetime.now(IST) - timedelta(days=1)
    send_shift_end_report_if_pending(db, date(y.year, y.month, y.day), "Akşam")

@_with_db
def job_shift_end_gece(db):
    if not _enabled(db, ADMIN_TASKS_TG_ENABLED_KEY):
        return
    d = datetime.now(IST).date()
    send_shift_end_report_if_pending(db, d, "Gece")

@_with_db
def job_day_end_0015(db):
    if not _enabled(db, ADMIN_TASKS_TG_ENABLED_KEY):
        return
    y = datetime.now(IST) - timedelta(days=1)
    send_day_end_report(db, date(y.year, y.month, y.day))


# --------- Attendance ---------
@_with_db
def job_attendance_daily_2000(db):
    if not _enabled(db, ATTENDANCE_TG_ENABLED_KEY):
        return
    now = datetime.now(IST)
    attendance_check_and_report(db, date(now.year, now.month, now.day))


# --------- BONUS: Gün Sonu (00:15, dün) ---------
@_with_db
def job_bonus_day_end_0015(db):
    if not _enabled(db, BONUS_TG_ENABLED_KEY):
        return
    y = datetime.now(IST) - timedelta(days=1)
    target = date(y.year, y.month, y.day)
    ctx = compute_bonus_daily_context(db, target, sla_first_sec=60)

    slow_text = "\n".join([f"- {i.get('full_name','-')} — {int(i.get('gt60_cnt') or 0)} işlem" for i in ctx["slow_list"]]) or "- —"
    per_emp_text = "\n".join([
        f"- {i.get('full_name','-')} — {int(i.get('close_cnt') or 0)} işlem • Ø "
        f"{(str(int(round(i['avg_first_emp'])))+' sn') if i.get('avg_first_emp') is not None else '—'}"
        for i in ctx["per_emp"]
    ]) or "- —"

    msg = render(
        db, "bonus_daily_v2",
        {
            "date": ctx["date_label"],
            "total_close": ctx["total_close"],
            "avg_first": (ctx["avg_first_sec"] if ctx["avg_first_sec"] is not None else "—"),
            "gt60_total": ctx["gt60_total"],
            "slow_list_text": slow_text,
            "per_emp_text": per_emp_text,
        },
        fallback=(
            "📊 *BONUS GÜN SONU RAPORU — {date}*\n"
            "- *Toplam Kapanış:* {total_close}\n"
            "- *Ø İlk Yanıt:* {avg_first} sn\n"
            "- *60 sn üzeri işlemler:* {gt60_total}\n\n"
            "⚠️ *Geç Yanıt Verenler (60 sn üzeri)*\n{slow_list_text}\n\n"
            "👥 *Personel Bazlı İşlem Sayıları*\n{per_emp_text}"
        ),
        channel="bonus",
    )
    send_text(msg)


# --------- BONUS: 2 saatlik (çift saatler) ---------
@_with_db
def job_bonus_periodic_2h(db):
    if not _enabled(db, BONUS_TG_ENABLED_KEY):
        return
    end_ist = datetime.now(IST)
    ctx = compute_bonus_periodic_context(db, end_ist, hours=2, kt30_sec=30)

    per_emp_text = "\n".join(
        [f"- {i.get('full_name','-')} — *{int(i.get('close_cnt') or 0)}* işlem" for i in ctx.get("per_emp", [])]
    ) or "- —"
    slow30_list = ctx.get("slow_30", [])
    slow30_text = "\n".join(
        [f"- {i.get('full_name','-')} — *{int(i.get('gt30_cnt') or 0)}* işlem" for i in slow30_list]
    )
    slow30_block = f"\n\n⚠️ *30 sn üzeri İlk KT*\n{slow30_text}" if slow30_text else ""

    msg = render(
        db, "bonus_periodic_v2",
        {
            "date": ctx["date_label"],
            "win_start": ctx["win_start"], "win_end": ctx["win_end"],
            "total_close": ctx["total_close"],
            "per_emp_text": per_emp_text,
            "slow30_block": slow30_block,
        },
        fallback=(
            "⏱️ *BONUS 2 SAATLİK RAPOR* — *{date} {win_start}–{win_end}*\n\n"
            "• *Toplam Kapanış:* {total_close}\n\n"
            "👤 *Personel Bazında*\n{per_emp_text}{slow30_block}"
        ),
        channel="bonus",
    )
    send_text(msg)


def start_scheduler():
    # Periyodik tarama
    scheduler.add_job(job_scan_overdue, "interval", minutes=5, id="scan_overdue_5m", replace_existing=True)

    # Şift sonları
    scheduler.add_job(job_shift_end_sabah, "cron", hour=16, minute=0, id="shift_end_sabah", replace_existing=True)
    scheduler.add_job(job_shift_end_oglen, "cron", hour=20, minute=0, id="shift_end_oglen", replace_existing=True)
    scheduler.add_job(job_shift_end_aksam, "cron", hour=0, minute=0, id="shift_end_aksam", replace_existing=True)
    scheduler.add_job(job_shift_end_gece, "cron", hour=7, minute=59, id="shift_end_gece", replace_existing=True)

    # Attendance
    scheduler.add_job(job_attendance_daily_2000, "cron", hour=20, minute=0, id="attendance_2000", replace_existing=True)

    # BONUS
    scheduler.add_job(job_bonus_day_end_0015, "cron", hour=0, minute=15, id="bonus_day_end_0015", replace_existing=True)
    scheduler.add_job(
        job_bonus_periodic_2h, "cron",
        hour="0,2,4,6,8,10,12,14,16,18,20,22", minute=0,
        id="bonus_periodic_2h", replace_existing=True
    )

    if not scheduler.running:
        scheduler.start()
