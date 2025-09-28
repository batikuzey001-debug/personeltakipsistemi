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
    TaskStatus,  # enum
)

router = APIRouter(prefix="/admin-tasks", tags=["admin_tasks"])

IST = timezone("Europe/Istanbul")

# ---------- COMMON HELPERS ----------
def _today_ist() -> date:
    return datetime.now(IST).date()

def _task_exists(
    db: Session,
    d: date,
    title: str,
    shift: Optional[str],
    department: Optional[str],
) -> bool:
    q = (
        db.query(AdminTask)
        .filter(AdminTask.date == d)
        .filter(AdminTask.title == title)
    )
    if shift is None:
        q = q.filter(AdminTask.shift.is_(None))
    else:
        q = q.filter(AdminTask.shift == shift)
    if department is None:
        q = q.filter(AdminTask.department.is_(None))
    else:
        q = q.filter(AdminTask.department == department)
    return db.query(q.exists()).scalar() is True

def _materialize_from_template(
    db: Session,
    tpl: AdminTaskTemplate,
    d: date,
) -> Optional[AdminTask]:
    """Aktif şablondan d günü için görev oluştur (dupe kontrolü ile)."""
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
        due_ts=None,                # isterseniz vardiyadan bitiş üretirsiniz
        status=TaskStatus.open,
        is_done=False,
        done_at=None,
        done_by=None,
    )
    db.add(t)
    db.flush()  # id alması için
    return t


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
    d: Optional[str] = Query(None, description="YYYY-MM-DD (scope=today için geçerli)"),
    shift: Optional[str] = None,
    dept: Optional[str] = None,
    assignee: Optional[str] = None,
    scope: Literal["today","open","all"] = Query("open", description="today|open|all"),
    db: Session = Depends(get_db),
):
    """
    scope:
      - today: sadece bugünün (IST) görevleri
      - open : tarihten bağımsız açık/gecikmiş tüm görevler (Varsayılan)
      - all  : tüm görevler
    """
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
    # all: filtre yok

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
    t: AdminTask | None = db.query(AdminTask).get(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="task not found")
    if t.is_done:
        return _to_task_out(t)

    now = datetime.utcnow()
    t.is_done = True
    t.done_at = now
    t.done_by = (body.who or "admin").strip()

    if t.due_ts and now > t.due_ts:
        t.status = TaskStatus.late
    else:
        t.status = TaskStatus.done

    db.commit()
    db.refresh(t)
    return _to_task_out(t)

# (Opsiyonel) Anlık oluşturma ucu – UI kullanmıyor ama API hazır dursun
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
    db.add(t); db.commit(); db.refresh(t)
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
def list_templates(
    shift: Optional[str] = None,
    dept: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    qy = db.query(AdminTaskTemplate)
    if shift: qy = qy.filter(AdminTaskTemplate.shift == shift)
    if dept: qy = qy.filter(AdminTaskTemplate.department == dept)
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
        created = _materialize_from_template(db, tpl, _today_ist())
        # created None ise dupe demektir – sorun değil

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

    out: List[AdminTaskTemplate] = []
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
        out.append(tpl)
        if materialize and tpl.is_active:
            _materialize_from_template(db, tpl, today)

    db.commit()
    for tpl in out: db.refresh(tpl)
    return [_to_tpl_out(t) for t in out]


@router.post(
    "/templates/materialize",
    dependencies=[Depends(RolesAllowed("super_admin", "admin", "manager"))],
)
def materialize_from_templates(
    d: Optional[str] = Query(None, description="YYYY-MM-DD (default: today IST)"),
    shift: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    only_active: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Verilen kriterlere göre şablonlardan görev üretir (dupe kontrollü)."""
    if d:
        try:
            y, m, dd = map(int, d.split("-"))
            target = date(y, m, dd)
        except Exception:
            raise HTTPException(status_code=400, detail="d must be YYYY-MM-DD")
    else:
        target = _today_ist()

    qy = db.query(AdminTaskTemplate)
    if only_active:
        qy = qy.filter(AdminTaskTemplate.is_active == True)
    if shift:
        qy = qy.filter(AdminTaskTemplate.shift == shift)
    if dept:
        qy = qy.filter(AdminTaskTemplate.department == dept)

    created = 0
    for tpl in qy.all():
        if _materialize_from_template(db, tpl, target):
            created += 1
    db.commit()
    return {"ok": True, "created": created, "date": target.isoformat()}
