# apps/api/app/api/routes_admin_tasks.py
from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from pytz import timezone

from app.deps import get_db, RolesAllowed
from app.db.models_admin_tasks import (
    AdminTask,
    AdminTaskTemplate,
    TaskStatus,  # enum
)

router = APIRouter(prefix="/admin-tasks", tags=["admin_tasks"])

IST = timezone("Europe/Istanbul")

# ==============================
#           TASKS
# ==============================

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
    d: Optional[str] = Query(None, description="YYYY-MM-DD (default: today IST)"),
    shift: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    # Hedef gün (IST)
    if d:
        try:
            y, m, dd = map(int, d.split("-"))
            target = date(y, m, dd)
        except Exception:
            raise HTTPException(status_code=400, detail="d must be YYYY-MM-DD")
    else:
        target = datetime.now(IST).date()

    qy = db.query(AdminTask).filter(AdminTask.date == target)
    if shift:
        qy = qy.filter(AdminTask.shift == shift)
    if dept:
        qy = qy.filter(AdminTask.department == dept)

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
    t: AdminTask | None = db.query(AdminTask).get(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="task not found")
    if t.is_done:
        return _to_task_out(t)

    now = datetime.utcnow()
    t.is_done = True
    t.done_at = now
    t.done_by = (body.who or "admin").strip()

    # Gecikme/normal durumu güncelle
    if t.due_ts and now > t.due_ts:
        t.status = TaskStatus.late
    else:
        t.status = TaskStatus.done

    db.commit()
    db.refresh(t)
    return _to_task_out(t)

# (İsterseniz anlık oluşturma ucu da tutabilirsiniz; UI'de kullanmıyor olsak da API hazır dursun)
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
    today = datetime.now(IST).date()
    t = AdminTask(
        date=today,
        shift=body.shift,
        title=body.title.strip(),
        department=body.department,
        assignee_employee_id=body.assignee_employee_id,
        due_ts=None,  # due_ts hesaplamak isterseniz vardiyadan türetebilirsiniz
        status=TaskStatus.open,
        is_done=False,
        done_at=None,
        done_by=None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_task_out(t)

# ==============================
#         TEMPLATES
# ==============================

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
    shift: Optional[str] = Field(None, description="Gece|Sabah|Öğlen|Akşam")
    department: Optional[str] = Field(None, description="Admin|Finans|Bonus|LC ...")
    default_assignee: Optional[str] = Field(None, description="RD-xxx vb.")
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
def list_templates(
    shift: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="search title/assignee/department"),
    db: Session = Depends(get_db),
):
    qy = db.query(AdminTaskTemplate)
    if shift:
        qy = qy.filter(AdminTaskTemplate.shift == shift)
    if dept:
        qy = qy.filter(AdminTaskTemplate.department == dept)
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
def create_template(body: TemplateCreate, db: Session = Depends(get_db)):
    t = AdminTaskTemplate(
        title=body.title.strip(),
        shift=(body.shift or None),
        department=(body.department or None),
        default_assignee=(body.default_assignee or None),
        is_active=bool(body.is_active),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_tpl_out(t)

@router.post(
    "/templates/bulk",
    response_model=List[TemplateOut],
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def create_templates_bulk(payload: TemplateBulkIn, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="items is empty")

    created: List[AdminTaskTemplate] = []
    for item in payload.items:
        t = AdminTaskTemplate(
            title=item.title.strip(),
            shift=(item.shift or None),
            department=(item.department or None),
            default_assignee=(item.default_assignee or None),
            is_active=bool(item.is_active),
        )
        db.add(t)
        created.append(t)
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
    t: AdminTaskTemplate | None = db.query(AdminTaskTemplate).get(tpl_id)
    if not t:
        raise HTTPException(status_code=404, detail="template not found")

    if body.title is not None:
        t.title = body.title.strip()
    if body.shift is not None:
        t.shift = (body.shift or None)
    if body.department is not None:
        t.department = (body.department or None)
    if body.default_assignee is not None:
        t.default_assignee = (body.default_assignee or None)
    if body.is_active is not None:
        t.is_active = bool(body.is_active)

    db.commit()
    db.refresh(t)
    return _to_tpl_out(t)

@router.delete(
    "/templates/{tpl_id}",
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def delete_template(tpl_id: int, db: Session = Depends(get_db)):
    t: AdminTaskTemplate | None = db.query(AdminTaskTemplate).get(tpl_id)
    if not t:
        raise HTTPException(status_code=404, detail="template not found")
    db.delete(t)
    db.commit()
    return {"ok": True, "id": tpl_id}
