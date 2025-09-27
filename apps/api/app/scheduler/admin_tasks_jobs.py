# apps/api/app/scheduler/admin_tasks_jobs.py
from datetime import datetime, timedelta, date
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import sessionmaker
from pytz import timezone

from app.db.session import engine
from app.services.admin_tasks_service import (
    scan_overdue_and_alert,
    send_shift_end_report_if_pending,
    send_day_end_report,
)
from app.services.attendance_service import attendance_check_and_report
from app.services.bonus_summary_service import send_bonus_daily_summary  # ← BONUS gün sonu (00:15)

# ---- DB session factory ----
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
scheduler = BackgroundScheduler(timezone="Europe/Istanbul")
IST = timezone("Europe/Istanbul")

# ---- Decorator (önce tanımlıyoruz!) ----
def _with_db(fn):
    def inner(*args, **kwargs):
        db = SessionLocal()
        try:
            return fn(db, *args, **kwargs)
        finally:
            db.close()
    return inner

# ---- Jobs ----
@_with_db
def job_scan_overdue(db):
    # Admin görevlerinde gecikenleri periyodik tarama (cooldown=60 dk)
    scan_overdue_and_alert(db, cooldown_min=60)

@_with_db
def job_shift_end_sabah(db):
    # 16:00 IST → bugünün sabah şifti
    now_ist = datetime.now(IST)
    d = date(now_ist.year, now_ist.month, now_ist.day)
    send_shift_end_report_if_pending(db, d, "Sabah")

@_with_db
def job_shift_end_oglen(db):
    # 20:00 IST → bugünün öğlen şifti
    now_ist = datetime.now(IST)
    d = date(now_ist.year, now_ist.month, now_ist.day)
    send_shift_end_report_if_pending(db, d, "Öğlen")

@_with_db
def job_shift_end_aksam(db):
    # 00:00 IST → bir önceki günün akşam şifti
    y = datetime.now(IST) - timedelta(days=1)
    d = date(y.year, y.month, y.day)
    send_shift_end_report_if_pending(db, d, "Akşam")

@_with_db
def job_shift_end_gece(db):
    # 07:59 IST → bugünün gece şifti
    now_ist = datetime.now(IST)
    d = date(now_ist.year, now_ist.month, now_ist.day)
    send_shift_end_report_if_pending(db, d, "Gece")

@_with_db
def job_day_end_0015(db):
    # Admin görevleri — 00:15 IST → bir önceki günün genel raporu
    y = datetime.now(IST) - timedelta(days=1)
    d = date(y.year, y.month, y.day)
    send_day_end_report(db, d)

@_with_db
def job_attendance_daily_2000(db):
    # Mesai yoklama — 20:00 IST → bugünün özeti
    now = datetime.now(IST)
    d = date(now.year, now.month, now.day)
    attendance_check_and_report(db, d)

@_with_db
def job_bonus_day_end_0015(db):
    # BONUS gün sonu — 00:15 IST → bir önceki gün, SLA(İlk KT)>60 sn
    y = datetime.now(IST) - timedelta(days=1)
    d = date(y.year, y.month, y.day)
    send_bonus_daily_summary(db, d, sla_first_sec=60)

# ---- Scheduler başlatma ----
def start_scheduler():
    # Periyodik gecikme taraması
    scheduler.add_job(job_scan_overdue, "interval", minutes=5, id="scan_overdue_5m", replace_existing=True)

    # Şift sonları (IST)
    scheduler.add_job(job_shift_end_sabah, "cron", hour=16, minute=0, id="shift_end_sabah", replace_existing=True)
    scheduler.add_job(job_shift_end_oglen, "cron", hour=20, minute=0, id="shift_end_oglen", replace_existing=True)
    scheduler.add_job(job_shift_end_aksam, "cron", hour=0, minute=0, id="shift_end_aksam", replace_existing=True)
    scheduler.add_job(job_shift_end_gece, "cron", hour=7, minute=59, id="shift_end_gece", replace_existing=True)

    # Mesai (attendance) günlük kontrol (IST)
    scheduler.add_job(job_attendance_daily_2000, "cron", hour=20, minute=0, id="attendance_2000", replace_existing=True)

    # BONUS gün sonu (00:15 IST) — dünü raporla
    scheduler.add_job(job_bonus_day_end_0015, "cron", hour=0, minute=15, id="bonus_day_end_0015", replace_existing=True)

    if not scheduler.running:
        scheduler.start()
