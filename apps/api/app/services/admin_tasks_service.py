# apps/api/app/services/admin_tasks_service.py
from __future__ import annotations
from datetime import datetime, timedelta, date
from typing import Optional
import requests
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import and_

from app.db.session import engine
from app.db.models_admin_tasks import AdminTask, AdminTaskTemplate, TaskStatus
from app.core.admin_tasks_config import ADMIN_TASKS_TG_CHAT_ID, ADMIN_TASKS_TG_TOKEN, shift_end_dt
from app.services.admin_settings_service import (
    get_setting,
    ADMIN_TASKS_TG_ENABLED_KEY,  # paneldeki “Bot İşlemleri” anahtarı
)

# ---------------- Core Queries ----------------

def list_tasks(db: Session, d: date, shift: Optional[str] = None, dept: Optional[str] = None, limit=200, offset=0):
    q = db.query(AdminTask).filter(AdminTask.date == d)
    if shift: q = q.filter(AdminTask.shift == shift)
    if dept:  q = q.filter(AdminTask.department == dept)
    q = q.order_by(AdminTask.shift.asc(), AdminTask.title.asc())
    return q.offset(offset).limit(limit).all()

def create_from_templates_for_day(db: Session, d: date) -> int:
    """
    Şablonlardan günün görevlerini üretir (assignee yok, grace=0).
    """
    tpls = db.query(AdminTaskTemplate).filter(AdminTaskTemplate.is_active == True).all()
    created = 0
    for t in tpls:
        exist = db.query(AdminTask).filter(
            and_(AdminTask.date == d, AdminTask.title == t.title, AdminTask.shift == t.shift)
        ).first()
        if exist:
            continue
        due_ts = shift_end_dt(datetime(d.year, d.month, d.day), t.shift) if t.shift else None
        task = AdminTask(
            date=d, shift=t.shift, title=t.title, department=t.department,
            assignee_employee_id=None, due_ts=due_ts,
            grace_min=0, status=TaskStatus.open, is_done=False
        )
        db.add(task); created += 1
    db.commit()
    return created

def tick_task(db: Session, task_id: int, who: str) -> AdminTask:
    """
    Tick atanınca otomatik assignee = who; grace=0 (anında gecikme kıyası).
    Telegram'a anlık 'done' bildirimi GÖNDERİLMEZ (raporlar vardiya/gün sonunda).
    """
    t = db.get(AdminTask, task_id)
    if not t:
        raise ValueError("task not found")
    now = datetime.utcnow()

    if not t.assignee_employee_id:
        t.assignee_employee_id = who

    t.is_done = True
    t.done_at = now
    t.done_by = who

    is_late = False
    if t.due_ts:
        deadline = t.due_ts  # grace yok
        is_late = now > deadline
    t.status = TaskStatus.late if is_late else TaskStatus.done

    db.commit(); db.refresh(t)
    return t

def scan_overdue_and_alert(db: Session, cooldown_min=60) -> int:
    """
    Done=False ve due geçmişse late + cooldown'a göre uyarı (vardiya içi tarama için).
    Paneldeki Bot İşlemleri anahtarı KAPALIYSA mesaj gönderilmez (durum yine late yapılır).
    """
    now = datetime.utcnow()
    alert_cnt = 0
    rows = db.query(AdminTask).filter(AdminTask.is_done == False, AdminTask.due_ts.isnot(None)).all()
    for t in rows:
        deadline = t.due_ts
        if now <= deadline:
            continue
        if t.last_alert_at and (now - t.last_alert_at) < timedelta(minutes=cooldown_min):
            continue
        t.status = TaskStatus.late
        t.last_alert_at = now
        db.commit()
        _notify_late(t, deadline); alert_cnt += 1
    return alert_cnt

# ---------------- Telegram Helpers (panel anahtarına bağlı) ----------------

def _tg_enabled_from_db() -> bool:
    """
    Paneldeki 'Bot İşlemleri' sayfasındaki anahtarın durumunu DB'den okur.
    """
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionLocal()
    try:
        val = get_setting(db, ADMIN_TASKS_TG_ENABLED_KEY, "0")
        return val in ("1", "true", "True")
    finally:
        db.close()

def _tg_send(text: str) -> bool:
    """
    Tek yerden Telegram gönderimi — panel anahtarı kapalıysa NO-OP.
    """
    if not _tg_enabled_from_db():
        return False
    if not ADMIN_TASKS_TG_TOKEN or not ADMIN_TASKS_TG_CHAT_ID:
        return False
    try:
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(ADMIN_TASKS_TG_CHAT_ID), "text": text},
            timeout=5,
        )
        return True
    except Exception:
        return False

def _notify_late(t: AdminTask, deadline: datetime):
    who = t.assignee_employee_id or "-"
    text = (
        "⏰ Geciken Görev\n"
        f"📌 {t.title}\n"
        f"👤 {who}\n"
        f"🕒 Bitiş: {deadline.isoformat(timespec='minutes')}Z"
    )
    _tg_send(text)

# ---------------- Reports ----------------

def send_summary_report(db: Session, d: date, shift: Optional[str] = None, include_late_list: bool = True) -> bool:
    """
    Gün/şift özeti (panel anahtarı AÇIKSA gönderilir).
    """
    q = db.query(AdminTask).filter(AdminTask.date == d)
    if shift: q = q.filter(AdminTask.shift == shift)
    rows = q.all()

    total = len(rows)
    done = sum(1 for r in rows if r.status == TaskStatus.done)
    late = sum(1 for r in rows if r.status == TaskStatus.late)
    pending = total - done - late

    d_str = d.strftime("%d.%m.%Y")
    title = f"📣 ADMIN GÖREV RAPORU — {d_str}" + (f" • {shift}" if shift else "")
    lines = [
        title,
        f"• 🗂️ Toplam: {total}",
        f"• ✅ Tamamlanan: {done}",
        f"• ❌ Geciken: {late}",
        f"• ⏳ Beklemede: {pending}",
    ]
    if include_late_list and (late or pending):
        lines.append("")
        lines.append("Açık/Geciken:")
        for r in rows:
            if r.status != TaskStatus.done:
                who = r.assignee_employee_id or "-"
                sh  = r.shift or "-"
                lines.append(f"• [{sh}] {r.title} — {who}")
    return _tg_send("\n".join(lines))

def send_shift_end_report_if_pending(db: Session, d: date, shift: str) -> bool:
    """
    Şift bittiğinde SADECE açık/geciken varsa rapor gönder (panel anahtarı AÇIKSA).
    """
    rows = db.query(AdminTask).filter(
        AdminTask.date == d,
        AdminTask.shift == shift
    ).all()
    if not rows:
        return False
    has_pending = any(r.status != TaskStatus.done for r in rows)
    if not has_pending:
        return False

    total = len(rows)
    done = sum(1 for r in rows if r.status == TaskStatus.done)
    late = sum(1 for r in rows if r.status == TaskStatus.late)
    pending = total - done - late

    d_str = d.strftime("%d.%m.%Y")
    lines = [
        f"🔔 ŞİFT SONU — {d_str} • {shift}",
        f"• 🗂️ Toplam: {total}",
        f"• ✅ Tamamlanan: {done}",
        f"• ❌ Geciken: {late}",
        f"• ⏳ Beklemede: {pending}",
        "",
        "Açık/Geciken:",
    ]
    for r in rows:
        if r.status != TaskStatus.done:
            who = r.assignee_employee_id or "-"
            lines.append(f"• {r.title} — {who}")
    return _tg_send("\n".join(lines))

def send_day_end_report(db: Session, d: date) -> bool:
    """
    Gün sonu raporu (panel anahtarı AÇIKSA gönderilir).
    """
    return send_summary_report(db, d, shift=None, include_late_list=True)
