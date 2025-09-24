# apps/api/app/api/routes_admin_tasks.py
from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.deps import get_db, RolesAllowed
from app.services.admin_tasks_service import list_tasks, create_from_templates_for_day, tick_task, scan_overdue_and_alert
from app.db.models_admin_tasks import AdminTask

router = APIRouter(prefix="/admin-tasks", tags=["admin_tasks"])

class TaskOut(BaseModel):
    id: int
    date: date
    shift: Optional[str]
    title: str
    department: Optional[str]
    assignee_employee_id: Optional[str]
    due_ts: Optional[datetime]
    grace_min: int
    status: str
    is_done: bool
    done_at: Optional[datetime]
    done_by: Optional[str]
    class Config: orm_mode = True

@router.get("", response_model=List[TaskOut], dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def get_tasks(
    d: Optional[str] = Query(None, description="YYYY-MM-DD (default: today)"),
    shift: Optional[str] = None,
    dept: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    _d = date.fromisoformat(d) if d else datetime.utcnow().date()
    rows = list_tasks(db, _d, shift, dept, limit, offset)
    return rows

@router.post("/generate", dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def generate(d: Optional[str] = None, db: Session = Depends(get_db)):
    _d = date.fromisoformat(d) if d else datetime.utcnow().date()
    n = create_from_templates_for_day(db, _d)
    return {"created": n, "date": _d.isoformat()}

class TickIn(BaseModel):
    who: str

@router.patch("/{task_id}/tick", response_model=TaskOut, dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def tick(task_id: int, body: TickIn, db: Session = Depends(get_db)):
    try:
        t = tick_task(db, task_id, body.who)
        return t
    except ValueError:
        raise HTTPException(status_code=404, detail="task not found")

@router.post("/scan-overdue", dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def scan_overdue(cooldown_min: int = 60, db: Session = Depends(get_db)):
    n = scan_overdue_and_alert(db, cooldown_min=cooldown_min)
    return {"alerts": n}
