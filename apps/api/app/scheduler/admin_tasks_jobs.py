# apps/api/app/scheduler/admin_tasks_jobs.py
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

# apps/api/app/scheduler/admin_tasks_jobs.py  (dosyaya ek)
from app.services.attendance_service import attendance_check_and_report
# ...
@_with_db
def job_attendance_daily_2000(db):
    # Her akşam 20:00 IST — gün içi yoklama özeti
    now = datetime.now(IST)
    d = date(now.year, now.month, now.day)
    attendance_check_and_report(db, d)

def start_scheduler():
    # ... mevcut joblar ...
    scheduler.add_job(job_attendance_daily_2000, "cron", hour=20, minute=0, id="attendance_2000", replace_existing=True)
