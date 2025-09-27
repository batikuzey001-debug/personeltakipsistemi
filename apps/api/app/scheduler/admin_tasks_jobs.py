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

# BONUS raporları artık "metrics + template + notify" üçlüsüyle çalışıyor
from app.services.bonus_metrics_service import (
    compute_bonus_daily_context,
    compute_bonus_periodic_context,
)
from app.services.template_engine import render
from app.services.telegram_notify import send_text

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

# ---------------- BONUS: Gün Sonu (00:15, dün) ----------------
@_with_db
def job_bonus_day_end_0015(db):
    # Dün için metrikleri hesapla
    y = datetime.now(IST) - timedelta(days=1)
    target = date(y.year, y.month, y.day)
    ctx = compute_bonus_daily_context(db, target, sla_first_sec=60)

    # listeleri stringe çevir
    slow_text = "\n".join(
        [f"• {i.get('full_name','-')} — {int(i.get('gt60_cnt') or 0)} işlem" for i in ctx["slow_list"]]
    ) or "• —"
    per_emp_text = "\n".join(
        [
            f"• {i.get('full_name','-')} — {int(i.get('close_cnt') or 0)} işlem • Ø "
            f"{(str(int(round(i['avg_first_emp'])))+' sn') if i.get('avg_first_emp') is not None else '—'}"
            for i in ctx["per_emp"]
        ]
    ) or "• —"

    message_ctx = {
        "date": ctx["date_label"],
        "total_close": ctx["total_close"],
        "avg_first": ctx["avg_first_sec"] if ctx["avg_first_sec"] is not None else "—",
        "gt60_total": ctx["gt60_total"],
        "slow_list_text": slow_text,
        "per_emp_text": per_emp_text,
    }

    # DB'de şablon yoksa kullanılacak fallback metin
    fallback = (
        "━━━━━━━━━━━━━━━━━━\n"
        "📣 BONUS • Gün Sonu Raporu\n"
        "🗓️ {date}\n"
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
    send_text(text_msg)

# ---------------- BONUS: 2 saatlik (çift saatlerde) ----------------
@_with_db
def job_bonus_periodic_2h(db):
    end_ist = datetime.now(IST)
    ctx = compute_bonus_periodic_context(db, end_ist, hours=2, sla_first_sec=60)

    top2_text = "\n".join(
        [
            f"• {i.get('full_name','-')} — {int(i.get('cnt') or 0)} işlem • Ø "
            f"{(str(int(round(i['avg_first_emp'])))+' sn') if i.get('avg_first_emp') is not None else '—'}"
            for i in ctx["top2"]
        ]
    ) or "• —"

    message_ctx = {
        "date": ctx["date_label"],
        "win_start": ctx["win_start"],
        "win_end": ctx["win_end"],
        "total_close": ctx["total_close"],
        "avg_first": ctx["avg_first_sec"] if ctx["avg_first_sec"] is not None else "—",
        "gt60_total": ctx["gt60_total"],
        "gt60_rate": ctx["gt60_rate"],
        "top2_text": top2_text,
        "warn_line": (f"⚠️ 60 sn üzeri oranı yüksek (%{ctx['gt60_rate']})" if ctx["gt60_rate"] >= 25 else ""),
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
    send_text(text_msg)

# ---- Scheduler başlatma ----
def start_scheduler():
    # Periyodik gecikme taraması
    scheduler.add_job(
        job_scan_overdue,
        "interval",
        minutes=5,
        id="scan_overdue_5m",
        replace_existing=True,
    )

    # Şift sonları (IST)
    scheduler.add_job(
        job_shift_end_sabah,
        "cron",
        hour=16,
        minute=0,
        id="shift_end_sabah",
        replace_existing=True,
    )
    scheduler.add_job(
        job_shift_end_oglen,
        "cron",
        hour=20,
        minute=0,
        id="shift_end_oglen",
        replace_existing=True,
    )
    scheduler.add_job(
        job_shift_end_aksam,
        "cron",
        hour=0,
        minute=0,
        id="shift_end_aksam",
        replace_existing=True,
    )
    scheduler.add_job(
        job_shift_end_gece,
        "cron",
        hour=7,
        minute=59,
        id="shift_end_gece",
        replace_existing=True,
    )

    # Mesai (attendance) günlük kontrol (IST)
    scheduler.add_job(
        job_attendance_daily_2000,
        "cron",
        hour=20,
        minute=0,
        id="attendance_2000",
        replace_existing=True,
    )

    # BONUS: gün sonu (00:15 IST) — dünü raporla (metrics+template)
    scheduler.add_job(
        job_bonus_day_end_0015,
        "cron",
        hour=0,
        minute=15,
        id="bonus_day_end_0015",
        replace_existing=True,
    )

    # BONUS: 2 saatlik özet — her çift saatte (metrics+template)
    scheduler.add_job(
        job_bonus_periodic_2h,
        "cron",
        hour="0,2,4,6,8,10,12,14,16,18,20,22",
        minute=0,
        id="bonus_periodic_2h",
        replace_existing=True,
    )

    if not scheduler.running:
        scheduler.start()
