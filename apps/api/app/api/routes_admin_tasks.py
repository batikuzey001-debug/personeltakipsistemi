# apps/api/app/api/routes_admin_tasks.py
from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.deps import get_db, RolesAllowed
from app.services.admin_tasks_service import (
    list_tasks,
    create_from_templates_for_day,
    tick_task,
    scan_overdue_and_alert,
    send_summary_report,
)
from app.db.models_admin_tasks import AdminTask, AdminTaskTemplate

router = APIRouter(prefix="/admin-tasks", tags=["admin_tasks"])

# ========= Tasks =========
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
    class Config:
        orm_mode = True

@router.get("", response_model=List[TaskOut], dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def get_tasks(
    d: Optional[str] = Query(None, description="YYYY-MM-DD (default: IST bugünü)"),
    shift: Optional[str] = None,
    dept: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    # Not: IST defaultu route_main tarafında da ekledik ama burada da destekliyoruz.
    if d:
        _d = date.fromisoformat(d)
    else:
        from pytz import timezone
        now_ist = datetime.now(timezone("Europe/Istanbul"))
        _d = date(now_ist.year, now_ist.month, now_ist.day)
    return list_tasks(db, _d, shift, dept, limit, offset)

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
        return tick_task(db, task_id, body.who)
    except ValueError:
        raise HTTPException(status_code=404, detail="task not found")

@router.post("/scan-overdue", dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def scan_overdue(cooldown_min: int = 60, db: Session = Depends(get_db)):
    n = scan_overdue_and_alert(db, cooldown_min=cooldown_min)
    return {"alerts": n}

# ========= Report =========
class ReportIn(BaseModel):
    d: Optional[str] = None
    shift: Optional[str] = None
    include_late_list: bool = True

@router.post("/report", dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def send_report(body: ReportIn, db: Session = Depends(get_db)):
    _d = date.fromisoformat(body.d) if body.d else datetime.utcnow().date()
    sent = send_summary_report(db, _d, shift=body.shift, include_late_list=body.include_late_list)
    if not sent:
        raise HTTPException(status_code=400, detail="report not sent")
    return {"ok": True, "date": _d.isoformat(), "shift": body.shift or None}

# ========= Templates (CRUD + Bulk) =========
class TemplateIn(BaseModel):
    title: str
    department: Optional[str] = None
    shift: Optional[str] = None              # "Sabah/Öğlen/Akşam/Gece" veya None
    repeat: str = "daily"                    # daily/weekly/shift/once
    grace_min: int = 0                       # kullanılmıyor ama DB alanı var
    default_assignee: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True

class TemplateOut(TemplateIn):
    id: int
    class Config:
        orm_mode = True

@router.get("/templates", response_model=List[TemplateOut], dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def list_templates(active: Optional[bool] = None, db: Session = Depends(get_db)):
    q = db.query(AdminTaskTemplate)
    if active is not None:
        q = q.filter(AdminTaskTemplate.is_active == active)
    q = q.order_by(AdminTaskTemplate.shift.asc().nullsfirst(), AdminTaskTemplate.title.asc())
    return q.all()

@router.post("/templates", response_model=TemplateOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def create_template(body: TemplateIn, db: Session = Depends(get_db)):
    tpl = AdminTaskTemplate(**body.dict())
    db.add(tpl); db.commit(); db.refresh(tpl)
    return tpl

@router.patch("/templates/{tpl_id}", response_model=TemplateOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def update_template(tpl_id: int, body: TemplateIn, db: Session = Depends(get_db)):
    tpl = db.get(AdminTaskTemplate, tpl_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="template not found")
    for k, v in body.dict().items():
        setattr(tpl, k, v)
    db.commit(); db.refresh(tpl)
    return tpl

@router.patch("/templates/{tpl_id}/toggle", response_model=TemplateOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def toggle_template(tpl_id: int, is_active: bool = True, db: Session = Depends(get_db)):
    tpl = db.get(AdminTaskTemplate, tpl_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="template not found")
    tpl.is_active = is_active
    db.commit(); db.refresh(tpl)
    return tpl

@router.delete("/templates/{tpl_id}", dependencies=[Depends(RolesAllowed("super_admin"))])
def delete_template(tpl_id: int, db: Session = Depends(get_db)):
    tpl = db.get(AdminTaskTemplate, tpl_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="template not found")
    db.delete(tpl); db.commit()
    return {"ok": True}

class BulkTemplatesIn(BaseModel):
    shift: str                      # "Sabah" | "Öğlen" | "Akşam" | "Gece"
    department: str = "Admin"
    titles: List[str]
    is_active: bool = True
    repeat: str = "daily"

@router.post("/templates/bulk", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def bulk_create_templates(body: BulkTemplatesIn, db: Session = Depends(get_db)):
    created = 0
    for raw in body.titles:
        title = (raw or "").strip()
        if not title:
            continue
        exists = db.query(AdminTaskTemplate).filter(
            AdminTaskTemplate.title == title,
            AdminTaskTemplate.shift == body.shift
        ).first()
        if exists:
            continue
        tpl = AdminTaskTemplate(
            title=title,
            department=body.department,
            shift=body.shift,
            repeat=body.repeat,
            grace_min=0,
            default_assignee=None,
            notes=None,
            is_active=body.is_active
        )
        db.add(tpl); created += 1
    db.commit()
    return {"created": created}
