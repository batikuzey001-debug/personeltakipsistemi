# apps/api/app/api/routes_admin_tasks.py
from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, exists
from pytz import timezone

from app.deps import get_db, RolesAllowed
from app.db.models_admin_tasks import (
    AdminTask,
    AdminTaskTemplate,
    TaskStatus,
)

router = APIRouter(prefix="/admin-tasks", tags=["admin_tasks"])
IST = timezone("Europe/Istanbul")

# --- DEV NO AUTH SWITCH ---
NO_AUTH = True
def auth_deps(*roles: str):
    # Neden: İskelette 401 sorununu by-pass etmek.
    return [] if NO_AUTH else [Depends(RolesAllowed(*roles))]

# ---------------- Common helpers ----------------
def _today_ist() -> date:
    return datetime.now(IST).date()

def _now_ist() -> datetime:
    return datetime.now(IST)

def _norm_title_expr(col):
    return func.lower(func.trim(col))

def _norm_str(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = " ".join(str(s).split())
    return s.strip().lower()

# ===================== TASKS (Liste + Tamamlama) =====================
class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    shift: Optional[str] = None
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
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def list_tasks(
    date_: Optional[date] = Query(None, alias="date", description="Varsayılan: bugün"),
    shift: Optional[str] = None,
    dept: Optional[str] = None,
    assignee: Optional[str] = None,
    scope: Literal["open", "all"] = Query("open", description="open: yalnız açık/gecikmiş, all: tüm görevler"),
    db: Session = Depends(get_db),
):
    """
    Sadece şablondan türeyen bugünkü görevler.
    """
    target_date = date_ or _today_ist()

    tpl_exists = exists().where(
        and_(
            _norm_title_expr(AdminTaskTemplate.title) == _norm_title_expr(AdminTask.title),
            (AdminTaskTemplate.shift == AdminTask.shift) if shift is None else (AdminTaskTemplate.shift == shift),
            (AdminTaskTemplate.department == AdminTask.department) if dept is None else (AdminTaskTemplate.department == dept),
            AdminTaskTemplate.is_active.is_(True),
        )
    )

    qy = db.query(AdminTask).filter(AdminTask.date == target_date, tpl_exists)

    if scope == "open":
        qy = qy.filter(AdminTask.is_done == False)

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
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def tick_task(task_id: int, body: TickIn, db: Session = Depends(get_db)):
    t: AdminTask | None = db.get(AdminTask, task_id) if hasattr(db, "get") else db.query(AdminTask).get(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="task not found")
    if t.is_done:
        return _to_task_out(t)

    now = _now_ist()
    t.is_done = True
    t.done_at = now
    t.done_by = (body.who or "admin").strip()
    t.status = TaskStatus.done

    db.commit()
    db.refresh(t)
    return _to_task_out(t)

# ========= MANUEL OLUŞTURMA KAPALI =========
class TaskCreateIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    shift: Optional[str] = None
    department: Optional[str] = None
    assignee_employee_id: Optional[str] = None
    due_ts: Optional[datetime] = None

@router.post(
    "",
    response_model=TaskOut,
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def create_task_disabled(_: TaskCreateIn, __: Session = Depends(get_db)):
    raise HTTPException(status_code=400, detail="Manual task creation disabled. Use /admin-tasks/materialize or /admin-tasks/templates/{id}/assign")

# ======= TEMPLATES (Yönetim) =======
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
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def list_templates(shift: Optional[str] = None, dept: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db)):
    qy = db.query(AdminTaskTemplate).filter(AdminTaskTemplate.is_active.is_(True))
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
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def create_template(
    body: TemplateCreate,
    materialize: bool = Query(False, description="Oluştururken anında görev ata (varsayılan: False)"),
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
        t = AdminTask(
            date=_today_ist(),
            title=tpl.title,
            shift=tpl.shift,
            department=tpl.department,
            assignee_employee_id=tpl.default_assignee,
            due_ts=None,
            status=TaskStatus.open,
            is_done=False,
            done_at=None,
            done_by=None,
        )
        db.add(t)

    db.commit()
    db.refresh(tpl)
    return _to_tpl_out(tpl)

@router.post(
    "/templates/bulk",
    response_model=List[TemplateOut],
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def create_templates_bulk(
    payload: TemplateBulkIn,
    materialize: bool = Query(False, description="Oluştururken her satır için anında görev ata (varsayılan: False)"),
    db: Session = Depends(get_db),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="items is empty")

    created: List[AdminTaskTemplate] = []
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
            t = AdminTask(
                date=_today_ist(),
                title=tpl.title,
                shift=tpl.shift,
                department=tpl.department,
                assignee_employee_id=tpl.default_assignee,
                due_ts=None,
                status=TaskStatus.open,
                is_done=False,
                done_at=None,
                done_by=None,
            )
            db.add(t)

    db.commit()
    for t in created:
        db.refresh(t)
    return [_to_tpl_out(t) for t in created]

@router.patch(
    "/templates/{tpl_id}",
    response_model=TemplateOut,
    dependencies=auth_deps("super_admin", "admin", "manager"),
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
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def delete_template(tpl_id: int, db: Session = Depends(get_db)):
    t: AdminTaskTemplate | None = db.get(AdminTaskTemplate, tpl_id) if hasattr(db, "get") else db.query(AdminTaskTemplate).get(tpl_id)
    if not t:
        raise HTTPException(status_code=404, detail="template not found")
    db.delete(t)
    db.commit()
    return {"ok": True, "id": tpl_id}

# ===== ŞABLONDAN TEK TIKLA GÖREV ATAMA =====
class AssignFromTemplateIn(BaseModel):
    assignee_employee_id: Optional[str] = None
    shift: Optional[str] = None
    department: Optional[str] = None
    due_ts: Optional[datetime] = None

@router.post(
    "/templates/{tpl_id}/assign",
    response_model=TaskOut,
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def assign_from_template(tpl_id: int, body: AssignFromTemplateIn, db: Session = Depends(get_db)):
    tpl: AdminTaskTemplate | None = db.get(AdminTaskTemplate, tpl_id) if hasattr(db, "get") else db.query(AdminTaskTemplate).get(tpl_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="template not found")
    if not tpl.is_active:
        raise HTTPException(status_code=400, detail="template is not active")

    t = AdminTask(
        date=_today_ist(),
        title=tpl.title,
        shift=(body.shift if body.shift is not None else tpl.shift),
        department=(body.department if body.department is not None else tpl.department),
        assignee_employee_id=(body.assignee_employee_id if body.assignee_employee_id is not None else tpl.default_assignee),
        due_ts=body.due_ts,
        status=TaskStatus.open,
        is_done=False,
        done_at=None,
        done_by=None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_task_out(t)

# ===== Günlük İdempotent Üretim (materialize) =====
class MaterializeOut(BaseModel):
    created: int
    skipped: int

@router.post(
    "/materialize",
    response_model=MaterializeOut,
    dependencies=auth_deps("super_admin", "admin", "manager"),
)
def materialize_tasks_for_day(
    date_: Optional[date] = Query(None, alias="date", description="Varsayılan: bugün"),
    shift: Optional[str] = Query(None, description="Sadece bu vardiya"),
    dept: Optional[str] = Query(None, alias="department", description="Sadece bu departman"),
    db: Session = Depends(get_db),
):
    target_date = date_ or _today_ist()

    tpl_q = db.query(AdminTaskTemplate).filter(AdminTaskTemplate.is_active.is_(True))
    if shift:
        tpl_q = tpl_q.filter(AdminTaskTemplate.shift == shift)
    if dept:
        tpl_q = tpl_q.filter(AdminTaskTemplate.department == dept)
    templates = tpl_q.all()

    created = 0
    skipped = 0

    for tpl in templates:
        title_norm = _norm_str(tpl.title)
        shift_val = tpl.shift or None
        dept_val = tpl.department or None

        exists_q = db.query(AdminTask).filter(
            AdminTask.date == target_date,
            (_norm_title_expr(AdminTask.title) == title_norm),
            (AdminTask.shift == shift_val) if shift_val is not None else AdminTask.shift.is_(None),
            (AdminTask.department == dept_val) if dept_val is not None else AdminTask.department.is_(None),
        )

        if db.query(exists_q.exists()).scalar():
            skipped += 1
            continue

        t = AdminTask(
            date=target_date,
            title=tpl.title,
            shift=tpl.shift,
            department=tpl.department,
            assignee_employee_id=tpl.default_assignee,
            due_ts=None,
            status=TaskStatus.open,
            is_done=False,
            done_at=None,
            done_by=None,
        )
        db.add(t)
        created += 1

    db.commit()
    return MaterializeOut(created=created, skipped=skipped)

# ---- Opsiyonel: Görevlerden şablon üret (kalabilir) ----
class BackfillResult(BaseModel):
    created: int
    skipped: int
    preview: Optional[List[TemplateOut]] = None

@router.post(
    "/templates/backfill-from-tasks",
    response_model=BackfillResult,
    dependencies=auth_deps("super_admin","admin"),
)
def backfill_templates_from_tasks(
    include_done: bool = Query(False, description="True → tamamlanmış görevlerden de üret"),
    shift: Optional[str] = Query(None, description="Sadece bu vardiya (örn: Sabah)"),
    dept: Optional[str] = Query(None, description="Sadece bu departman (örn: Admin)"),
    dry_run: bool = Query(False, description="True → sadece önizleme"),
    db: Session = Depends(get_db),
):
    q = db.query(
        _norm_title_expr(AdminTask.title).label("title_norm"),
        AdminTask.title.label("title_raw"),
        AdminTask.shift.label("shift"),
        AdminTask.department.label("department"),
    )
    if not include_done:
        q = q.filter(AdminTask.is_done == False)
    if shift:
        q = q.filter(AdminTask.shift == shift)
    if dept:
        q = q.filter(AdminTask.department == dept)

    combos = q.group_by(
        _norm_title_expr(AdminTask.title),
        AdminTask.title,
        AdminTask.shift,
        AdminTask.department
    ).all()

    created = 0
    skipped = 0
    preview_items: List[AdminTaskTemplate] = []

    for row in combos:
        title_norm = _norm_str(row.title_raw)
        shift_val = row.shift or None
        dept_val = row.department or None

        if not title_norm:
            skipped += 1
            continue

        exists_q = db.query(AdminTaskTemplate).filter(
            func.lower(func.trim(AdminTaskTemplate.title)) == title_norm,
            (AdminTaskTemplate.shift == shift_val) if shift_val is not None else AdminTaskTemplate.shift.is_(None),
            (AdminTaskTemplate.department == dept_val) if dept_val is not None else AdminTaskTemplate.department.is_(None),
        )
        if db.query(exists_q.exists()).scalar():
            skipped += 1
            continue

        t = AdminTaskTemplate(
            title=" ".join((row.title_raw or "").split()).strip(),
            shift=shift_val,
            department=dept_val,
            default_assignee=None,
            is_active=True,
        )
        if dry_run:
            preview_items.append(t)
        else:
            db.add(t)
            created += 1

    if not dry_run:
        db.commit()

    return BackfillResult(
        created=created,
        skipped=skipped,
        preview=[TemplateOut.model_validate(x, from_attributes=True) for x in preview_items] if dry_run else None
    )
