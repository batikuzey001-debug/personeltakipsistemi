# apps/api/app/api/routes_admin_tasks.py
from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from pytz import timezone

from app.deps import get_db, RolesAllowed
from app.db.models_admin_tasks import AdminTask, TaskStatus
from app.core.admin_tasks_config import shift_end_dt

router = APIRouter(prefix="/admin-tasks", tags=["admin_tasks"])
IST = timezone("Europe/Istanbul")

# ---- Mevcut: listeleme (varsa sizdeki ile aynı kalsın) ----
class AdminTaskOut(BaseModel):
    id: int
    date: date
    shift: Optional[str]
    title: str
    department: Optional[str]
    assignee_employee_id: Optional[str]
    due_ts: Optional[datetime]
    status: TaskStatus
    is_done: bool
    done_at: Optional[datetime]
    done_by: Optional[str]

    class Config:
        orm_mode = True

@router.get("", response_model=List[AdminTaskOut], dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def list_tasks_api(
    d: Optional[str] = Query(None, description="YYYY-MM-DD (default: today IST)"),
    shift: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    # Bugünü IST'ye göre al
    today = datetime.now(IST).date()
    target_date = today
    if d:
        try:
            y, m, dd = map(int, d.split("-"))
            target_date = date(y, m, dd)
        except Exception:
            raise HTTPException(status_code=400, detail="d must be YYYY-MM-DD")

    q = db.query(AdminTask).filter(AdminTask.date == target_date)
    if shift: q = q.filter(AdminTask.shift == shift)
    if dept:  q = q.filter(AdminTask.department == dept)
    q = q.order_by(AdminTask.shift.asc(), AdminTask.title.asc())
    return q.all()

# ---- YENİ: anlık oluşturma ----
class AdminTaskCreateIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    shift: Optional[str] = Field(None, description="Gece|Sabah|Öğlen|Akşam (opsiyonel)")
    department: Optional[str] = Field(None, description="Admin|Finans|Bonus|LC vb.")
    assignee_employee_id: Optional[str] = Field(None, description="RD-xxx vb. (opsiyonel)")

@router.post("", response_model=AdminTaskOut, dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def create_task_api(body: AdminTaskCreateIn, db: Session = Depends(get_db)):
    # Tarihi IST "bugün" olarak sabitle (günlük yenileme kuralı kalktı; anlık)
    today_ist = datetime.now(IST)
    d = today_ist.date()

    # due_ts: vardiya verilmişse vardiya bitişini hesapla
    due_ts = None
    if body.shift:
        try:
            # shift_end_dt: IST-tarih alır, vardiya adına göre bitiş datetime döner (UTC aware)
            due_ts = shift_end_dt(IST.localize(datetime(d.year, d.month, d.day)), body.shift)
        except Exception:
            due_ts = None  # vardiya ismi beklenmedikse boş bırak

    t = AdminTask(
        date=d,
        shift=body.shift,
        title=body.title.strip(),
        department=body.department,
        assignee_employee_id=body.assignee_employee_id,
        due_ts=due_ts,
        status=TaskStatus.open,
        is_done=False,
        done_at=None,
        done_by=None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t

# ---- (Opsiyonel) Mevcut tick ucu sizde varsa aynen kalsın; örnek: ----
class TickIn(BaseModel):
    who: Optional[str] = None

@router.patch("/{task_id}/tick", response_model=AdminTaskOut, dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def tick_task_api(task_id: int, body: TickIn, db: Session = Depends(get_db)):
    t = db.query(AdminTask).get(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="task not found")
    if t.is_done:
        return t
    now = datetime.utcnow()
    t.is_done = True
    t.done_at = now
    t.done_by = (body.who or "admin").strip()
    # gecikme/normal durumu koru
    if t.due_ts and now > t.due_ts:
        t.status = TaskStatus.late
    else:
        t.status = TaskStatus.done
    db.commit(); db.refresh(t)
    return t
