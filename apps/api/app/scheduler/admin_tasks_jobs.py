# apps/api/app/scheduler/admin_tasks_jobs.py
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import sessionmaker
from app.db.session import engine
from app.services.admin_tasks_service import scan_overdue_and_alert

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

scheduler = BackgroundScheduler(timezone="Europe/Istanbul")

def job_scan_overdue():
    db = SessionLocal()
    try:
        scan_overdue_and_alert(db, cooldown_min=60)
    finally:
        db.close()

def start_scheduler():
    scheduler.add_job(job_scan_overdue, "interval", minutes=5, id="scan_overdue_5m", replace_existing=True)
    if not scheduler.running:
        scheduler.start()
