# apps/api/app/services/admin_tasks_service.py
from __future__ import annotations
from datetime import datetime, timedelta, date
from typing import Optional
import requests
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.db.models_admin_tasks import AdminTask, AdminTaskTemplate, TaskStatus
from app.core.admin_tasks_config import ADMIN_TASKS_TG_CHAT_ID, ADMIN_TASKS_TG_TOKEN, shift_end_dt

def list_tasks(db: Session, d: date, shift: Optional[str] = None, dept: Optional[str] = None, limit=200, offset=0):
    q = db.query(AdminTask).filter(AdminTask.date == d)
    if shift:
        q = q.filter(AdminTask.shift == shift)
    if dept:
        q = q.filter(AdminTask.department == dept)
    q = q.order_by(AdminTask.shift.asc(), AdminTask.title.asc())
    return q.offset(offset).limit(limit).all()

def create_from_templates_for_day(db: Session, d: date) -> int:
    """
    Şablonlardan günün görevlerini üretir.
    - due_ts: Vardiya bitişine göre hesaplanır (IST → UTC dönüşümü shift_end_dt içinde yapılır).
    """
    tpls = db.query(AdminTaskTemplate).filter(AdminTaskTemplate.is_active == True).all()
    created = 0
    for t in tpls:
        exist = db.query(AdminTask).filter(
            and_(AdminTask.date == d, AdminTask.title == t.title, AdminTask.shift == t.shift)
        ).first()
        if exist:
            continue
        due_ts = None
        if t.shift:
            # DÜZELTME: shift_end_dt'ye naive datetime veriyoruz (içeride IST lokalize ediliyor).
            due_ts = shift_end_dt(datetime(d.year, d.month, d.day), t.shift)

        task = AdminTask(
            date=d,
            shift=t.shift,
            title=t.title,
            department=t.department,
            assignee_employee_id=t.default_assignee,
            due_ts=due_ts,
            grace_min=t.grace_min,
            status=TaskStatus.open,
            is_done=False,
        )
        db.add(task)
        created += 1
    db.commit()
    return created

def tick_task(db: Session, task_id: int, who: str) -> AdminTask:
    """
    Görevi işaretle (tick). SQLAlchemy 2.0 için Session.get kullanılır.
    Geçikme: due_ts + grace_min sonrasında tick atılırsa status=late.
    """
    t = db.get(AdminTask, task_id)
    if not t:
        raise ValueError("task not found")

    now = datetime.utcnow()
    t.is_done = True
    t.done_at = now
    t.done_by = who

    is_late = False
    if t.due_ts:
        deadline = t.due_ts + timedelta(minutes=t.grace_min or 0)
        is_late = now > deadline
    t.status = TaskStatus.late if is_late else TaskStatus.done

    db.commit()
    db.refresh(t)
    _notify_done(t)
    return t

def _notify_done(t: AdminTask):
    if not ADMIN_TASKS_TG_TOKEN or not ADMIN_TASKS_TG_CHAT_ID:
        return
    try:
        text = f"✅ {t.department or '-'} • {t.title} — {t.assignee_employee_id or '-'}"
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(ADMIN_TASKS_TG_CHAT_ID), "text": text},
            timeout=5,
        )
    except Exception:
        pass  # ağ hatası vb. sessiz geçilir

def scan_overdue_and_alert(db: Session, cooldown_min=60) -> int:
    """
    Geçikmiş görevleri tarar, status=late yapar ve cooldown’a göre Telegram uyarısı gönderir.
    """
    now = datetime.utcnow()
    alert_cnt = 0
    rows = db.query(AdminTask).filter(AdminTask.is_done == False, AdminTask.due_ts.isnot(None)).all()
    for t in rows:
        deadline = (t.due_ts or now) + timedelta(minutes=t.grace_min or 0)
        if now <= deadline:
            continue
        if t.last_alert_at and (now - t.last_alert_at) < timedelta(minutes=cooldown_min):
            continue  # spam/cooldown koruması
        t.status = TaskStatus.late
        t.last_alert_at = now
        db.commit()
        _notify_late(t, deadline)
        alert_cnt += 1
    return alert_cnt

def _notify_late(t: AdminTask, deadline: datetime):
    if not ADMIN_TASKS_TG_TOKEN or not ADMIN_TASKS_TG_CHAT_ID:
        return
    try:
        text = (
            "⏰ Geciken Görev\n"
            f"📌 {t.title}\n"
            f"👤 {t.assignee_employee_id or '-'}\n"
            f"🕒 Bitiş: {deadline.isoformat(timespec='minutes')}Z"
        )
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(ADMIN_TASKS_TG_CHAT_ID), "text": text},
            timeout=5,
        )
    except Exception:
        pass

def send_summary_report(db: Session, d: date, shift: Optional[str] = None, include_late_list: bool = True) -> bool:
    """
    Bugüne/şifte göre özet Telegram raporu gönderir.
    """
    if not ADMIN_TASKS_TG_TOKEN or not ADMIN_TASKS_TG_CHAT_ID:
        return False

    q = db.query(AdminTask).filter(AdminTask.date == d)
    if shift:
        q = q.filter(AdminTask.shift == shift)
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

    if include_late_list and late:
        lines.append("")
        lines.append("Gecikenler:")
        for r in rows:
            if r.status == TaskStatus.late:
                who = r.assignee_employee_id or "-"
                sh = r.shift or "-"
                lines.append(f"• [{sh}] {r.title} — {who}")

    text = "\n".join(lines)
    try:
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TASKS_TG_TOKEN}/sendMessage",
            json={"chat_id": int(ADMIN_TASKS_TG_CHAT_ID), "text": text},
            timeout=5,
        )
        return True
    except Exception:
        return False
