# apps/api/app/api/routes_admin_tasks.py
from __future__ import annotations
from datetime import date
from typing import Optional, List, Iterable

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.deps import get_db, RolesAllowed
from app.db.models_admin_tasks import AdminTaskTemplate  # ← Model: id,title,shift,department,default_assignee,is_active

router = APIRouter(prefix="/admin-tasks", tags=["admin_tasks:templates"])

# ---------- SCHEMAS ----------
class TemplateOut(BaseModel):
    id: int
    title: str
    shift: Optional[str] = None
    department: Optional[str] = None
    default_assignee: Optional[str] = None
    is_active: bool

    class Config:
        orm_mode = True

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


# ---------- HELPERS ----------
def _to_out(t: AdminTaskTemplate) -> TemplateOut:
    return TemplateOut.from_orm(t)


# ---------- ROUTES ----------
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
    qy = qy.order_by(
        AdminTaskTemplate.shift.asc().nulls_last(),
        AdminTaskTemplate.title.asc(),
    )
    return [_to_out(t) for t in qy.all()]


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
    return _to_out(t)


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
    # refresh
    for t in created:
        db.refresh(t)
    return [_to_out(t) for t in created]


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
    return _to_out(t)


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
