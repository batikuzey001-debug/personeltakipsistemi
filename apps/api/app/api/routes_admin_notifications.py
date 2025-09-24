# apps/api/app/api/routes_admin_notifications.py
from __future__ import annotations
from typing import Optional, Dict, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.deps import get_db, RolesAllowed
from app.services.admin_notifications_service import (
    list_templates, create_template, update_template, delete_template, send_manual
)
from app.db.models_admin_notifications import AdminNotification

router = APIRouter(prefix="/admin-notify", tags=["admin_notify"])

# ---- Templates CRUD ----
class TemplateIn(BaseModel):
    channel: str        # bonus | finans | admin_tasks | attendance | custom
    name: str
    template: str
    is_active: bool = True

class TemplateOut(TemplateIn):
    id: int
    class Config: orm_mode = True

@router.get("/templates", response_model=List[TemplateOut], dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def api_list_templates(channel: Optional[str] = None, db: Session = Depends(get_db)):
    return list_templates(db, channel)

@router.post("/templates", response_model=TemplateOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def api_create_template(body: TemplateIn, db: Session = Depends(get_db)):
    return create_template(db, body.channel, body.name, body.template, body.is_active)

@router.patch("/templates/{tpl_id}", response_model=TemplateOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def api_update_template(tpl_id: int, body: TemplateIn, db: Session = Depends(get_db)):
    row = update_template(db, tpl_id, body.dict())
    if not row: raise HTTPException(status_code=404, detail="template not found")
    return row

@router.delete("/templates/{tpl_id}", dependencies=[Depends(RolesAllowed("super_admin"))])
def api_delete_template(tpl_id: int, db: Session = Depends(get_db)):
    ok = delete_template(db, tpl_id)
    if not ok: raise HTTPException(status_code=404, detail="template not found")
    return {"ok": True}

# ---- Manual send ----
class ManualSendIn(BaseModel):
    channel: str                      # bonus | finans | admin_tasks | attendance | custom
    text: Optional[str] = None
    template_id: Optional[int] = None
    context: Optional[Dict[str,str]] = None

@router.post("/manual", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def api_manual_send(body: ManualSendIn, db: Session = Depends(get_db)):
    sent = send_manual(db, body.channel, body.text, body.template_id, body.context)
    if not sent:
        raise HTTPException(status_code=400, detail="not sent (disabled, empty, or invalid template)")
    return {"ok": True}
