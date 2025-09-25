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
    scan_overdue_and_alert(db, cooldown_min=60)

@_with_db
def job_shift_end_sabah(db):
    now_ist = datetime.now(IST)
    d = date(now_ist.year, now_ist.month, now_ist.day)
    send_shift_end_report_if_pending(db, d, "Sabah")

@_with_db
def job_shift_end_oglen(db):
    now_ist = datetime.now(IST)
    d = date(now_ist.year, now_ist.month, now_ist.day)
    send_shift_end_report_if_pending(db, d, "Öğlen")

@_with_db
def job_shift_end_aksam(db):
    y = datetime.now(IST) - timedelta(days=1)
    d = date(y.year, y.month, y.day)
    send_shift_end_report_if_pending(db, d, "Akşam")

@_with_db
def job_shift_end_gece(db):
    now_ist = datetime.now(IST)
    d = date(now_ist.year, now_ist.month, now_ist.day)
    send_shift_end_report_if_pending(db, d, "Gece")

@_with_db
def job_day_end_0015(db):
    y = datetime.now(IST) - timedelta(days=1)
    d = date(y.year, y.month, y.day)
    send_day_end_report(db, d)

@_with_db
def job_attendance_daily_2000(db):
    now = datetime.now(IST)
    d = date(now.year, now.month, now.day)
    attendance_check_and_report(db, d)

# ---- Scheduler başlatma ----
def start_scheduler():
    scheduler.add_job(job_scan_overdue, "interval", minutes=5, id="scan_overdue_5m", replace_existing=True)
    scheduler.add_job(job_shift_end_sabah, "cron", hour=16, minute=0, id="shift_end_sabah", replace_existing=True)
    scheduler.add_job(job_shift_end_oglen, "cron", hour=20, minute=0, id="shift_end_oglen", replace_existing=True)
    scheduler.add_job(job_shift_end_aksam, "cron", hour=0, minute=0, id="shift_end_aksam", replace_existing=True)
    scheduler.add_job(job_shift_end_gece, "cron", hour=7, minute=59, id="shift_end_gece", replace_existing=True)
    scheduler.add_job(job_attendance_daily_2000, "cron", hour=20, minute=0, id="attendance_2000", replace_existing=True)

    if not scheduler.running:
        scheduler.start()
