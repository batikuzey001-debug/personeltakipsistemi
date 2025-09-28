# apps/api/app/api/routes_admin_tasks.py
from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from pytz import timezone

from app.deps import get_db, RolesAllowed
from app.db.models_admin_tasks import (
    AdminTask,
    AdminTaskTemplate,
    TaskStatus,
)

router = APIRouter(prefix="/admin-tasks", tags=["admin_tasks"])
IST = timezone("Europe/Istanbul")

# ---------------- Common helpers ----------------
def _today_ist() -> date:
    return datetime.now(IST).date()

def _task_exists(db: Session, d: date, title: str, shift: Optional[str], department: Optional[str]) -> bool:
    q = db.query(AdminTask).filter(AdminTask.date == d, AdminTask.title == title)
    q = q.filter(AdminTask.shift == shift) if shift is not None else q.filter(AdminTask.shift.is_(None))
    q = q.filter(AdminTask.department == department) if department is not None else q.filter(AdminTask.department.is_(None))
    return db.query(q.exists()).scalar() is True

def _materialize_from_template(db: Session, tpl: AdminTaskTemplate, d: date) -> Optional[AdminTask]:
    title = (tpl.title or "").strip()
    if not title:
        return None
    if _task_exists(db, d, title, tpl.shift, tpl.department):
        return None
    t = AdminTask(
        date=d,
        shift=tpl.shift,
        title=title,
        department=tpl.department,
        assignee_employee_id=tpl.default_assignee,
        due_ts=None,
        status=TaskStatus.open,
        is_done=False,
        done_at=None,
        done_by=None,
    )
    db.add(t)
    db.flush()
    return t

# ===================== TASKS =====================
class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    shift: Optional[str] = None
    title: str
    department: Optional[str] = None
    assignee_employee_id: Optional[str] = None
    due_ts: Optional[datetime] = None
    status: TaskStatus
    is_done: bool
    done_at: Optional[datetime] = None
    done_by: Optional[str] = None

def _to_task_out(t: AdminTask) -> TaskOut:
    return TaskOut.model_validate(t, from_attributes=True)

@router.get(
    "",
    response_model=List[TaskOut],
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def list_tasks(
    d: Optional[str] = Query(None, description="YYYY-MM-DD (scope=today için)"),
    shift: Optional[str] = None,
    dept: Optional[str] = None,
    assignee: Optional[str] = None,
    scope: Literal["today", "open", "all"] = Query("open", description="today|open|all"),
    db: Session = Depends(get_db),
):
    qy = db.query(AdminTask)
    if scope == "today":
        if d:
            try:
                y, m, dd = map(int, d.split("-"))
                target = date(y, m, dd)
            except Exception:
                raise HTTPException(status_code=400, detail="d must be YYYY-MM-DD")
        else:
            target = _today_ist()
        qy = qy.filter(AdminTask.date == target)
    elif scope == "open":
        qy = qy.filter(AdminTask.is_done == False)
    # scope=all → tarih filtresi yok

    if shift:
        qy = qy.filter(AdminTask.shift == shift)
    if dept:
        qy = qy.filter(AdminTask.department == dept)
    if assignee:
        qy = qy.filter(AdminTask.assignee_employee_id == assignee)

    qy = qy.order_by(AdminTask.shift.asc().nulls_last(), AdminTask.title.asc())
    return [_to_task_out(t) for t in qy.all()]

class TickIn(BaseModel):
    who: Optional[str] = None

@router.patch(
    "/{task_id}/tick",
    response_model=TaskOut,
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def tick_task(task_id: int, body: TickIn, db: Session = Depends(get_db)):
    # SQLAlchemy 1.x & 2.x uyumlu get
    t: AdminTask | None = db.get(AdminTask, task_id) if hasattr(db, "get") else db.query(AdminTask).get(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="task not found")
    if t.is_done:
        return _to_task_out(t)

    now = datetime.utcnow()
    t.is_done = True
    t.done_at = now
    t.done_by = (body.who or "admin").strip()
    t.status = TaskStatus.late if (t.due_ts and now > t.due_ts) else TaskStatus.done

    db.commit()
    db.refresh(t)
    return _to_task_out(t)

# İsteğe bağlı tekil oluşturma (UI kullanmasa da API dursun)
class TaskCreateIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    shift: Optional[str] = None
    department: Optional[str] = None
    assignee_employee_id: Optional[str] = None

@router.post(
    "",
    response_model=TaskOut,
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def create_task(body: TaskCreateIn, db: Session = Depends(get_db)):
    d = _today_ist()
    t = AdminTask(
        date=d,
        shift=body.shift,
        title=body.title.strip(),
        department=body.department,
        assignee_employee_id=body.assignee_employee_id,
        due_ts=None,
        status=TaskStatus.open,
        is_done=False,
        done_at=None,
        done_by=None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_task_out(t)

# =================== TEMPLATES ===================
class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    shift: Optional[str] = None
    department: Optional[str] = None
    default_assignee: Optional[str] = None
    is_active: bool

class TemplateCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    shift: Optional[str] = None
    department: Optional[str] = None
    default_assignee: Optional[str] = None
    is_active: bool = True

class TemplateUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    shift: Optional[str] = None
    department: Optional[str] = None
    default_assignee: Optional[str] = None
    is_active: Optional[bool] = None

class TemplateBulkIn(BaseModel):
    items: List[TemplateCreate]

def _to_tpl_out(t: AdminTaskTemplate) -> TemplateOut:
    return TemplateOut.model_validate(t, from_attributes=True)

@router.get(
    "/templates",
    response_model=List[TemplateOut],
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def list_templates(shift: Optional[str] = None, dept: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db)):
    qy = db.query(AdminTaskTemplate)
    if shift: qy = qy.filter(AdminTaskTemplate.shift == shift)
    if dept:  qy = qy.filter(AdminTaskTemplate.department == dept)
    if q:
        term = f"%{q.strip()}%"
        qy = qy.filter(
            (AdminTaskTemplate.title.ilike(term))
            | (AdminTaskTemplate.default_assignee.ilike(term))
            | (AdminTaskTemplate.department.ilike(term))
        )
    qy = qy.order_by(AdminTaskTemplate.shift.asc().nulls_last(), AdminTaskTemplate.title.asc())
    return [_to_tpl_out(t) for t in qy.all()]

@router.post(
    "/templates",
    response_model=TemplateOut,
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def create_template(
    body: TemplateCreate,
    materialize: bool = Query(True, description="Oluştururken bugüne görev üret"),
    db: Session = Depends(get_db),
):
    tpl = AdminTaskTemplate(
        title=body.title.strip(),
        shift=(body.shift or None),
        department=(body.department or None),
        default_assignee=(body.default_assignee or None),
        is_active=bool(body.is_active),
    )
    db.add(tpl)
    db.flush()

    if materialize and tpl.is_active:
        _materialize_from_template(db, tpl, _today_ist())

    db.commit()
    db.refresh(tpl)
    return _to_tpl_out(tpl)

@router.post(
    "/templates/bulk",
    response_model=List[TemplateOut],
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def create_templates_bulk(
    payload: TemplateBulkIn,
    materialize: bool = Query(True, description="Oluştururken bugüne görev üret"),
    db: Session = Depends(get_db),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="items is empty")

    created: List[AdminTaskTemplate] = []
    today = _today_ist()
    for item in payload.items:
        tpl = AdminTaskTemplate(
            title=item.title.strip(),
            shift=(item.shift or None),
            department=(item.department or None),
            default_assignee=(item.default_assignee or None),
            is_active=bool(item.is_active),
        )
        db.add(tpl)
        db.flush()
        created.append(tpl)
        if materialize and tpl.is_active:
            _materialize_from_template(db, tpl, today)

    db.commit()
    for t in created:
        db.refresh(t)
    return [_to_tpl_out(t) for t in created]

@router.patch(
    "/templates/{tpl_id}",
    response_model=TemplateOut,
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def update_template(tpl_id: int, body: TemplateUpdate, db: Session = Depends(get_db)):
    t: AdminTaskTemplate | None = db.get(AdminTaskTemplate, tpl_id) if hasattr(db, "get") else db.query(AdminTaskTemplate).get(tpl_id)
    if not t:
        raise HTTPException(status_code=404, detail="template not found")

    if body.title is not None:            t.title = body.title.strip()
    if body.shift is not None:            t.shift = (body.shift or None)
    if body.department is not None:       t.department = (body.department or None)
    if body.default_assignee is not None: t.default_assignee = (body.default_assignee or None)
    if body.is_active is not None:        t.is_active = bool(body.is_active)

    db.commit()
    db.refresh(t)
    return _to_tpl_out(t)

@router.delete(
    "/templates/{tpl_id}",
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def delete_template(tpl_id: int, db: Session = Depends(get_db)):
    # SQLAlchemy 1.x ve 2.x için güvenli get
    t: AdminTaskTemplate | None = db.get(AdminTaskTemplate, tpl_id) if hasattr(db, "get") else db.query(AdminTaskTemplate).get(tpl_id)
    if not t:
        raise HTTPException(status_code=404, detail="template not found")
    db.delete(t)
    db.commit()
    return {"ok": True, "id": tpl_id}
