# apps/api/app/api/routes_identities.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone

from app.deps import get_db, RolesAllowed
from app.models.identities import EmployeeIdentity
from app.models.models import Employee
from app.models.events import Event

router = APIRouter(prefix="/identities", tags=["identities"])

def _parse_actor_key(key: str):
    # "uid:123" | "uname:@nick"
    if key.startswith("uid:"):
        try:
            return ("uid", int(key.split(":", 1)[1]))
        except Exception:
            return (None, None)
    if key.startswith("uname:"):
        return ("uname", key.split(":", 1)[1])
    return (None, None)

@router.get("/pending", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def list_pending(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(EmployeeIdentity)
        .filter(EmployeeIdentity.status == "pending")
        .order_by(EmployeeIdentity.inserted_at.desc())
        .offset(offset).limit(limit).all()
    )
    return [
        {
            "actor_key": r.actor_key,
            "hint_name": r.hint_name,
            "hint_team": r.hint_team,
            "inserted_at": r.inserted_at.isoformat()
        } for r in rows
    ]

@router.post("/bind", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def bind_identity(
    actor_key: str = Query(..., description="uid:123 veya uname:@nick"),
    employee_id: str | None = Query(None, description="Var olan employee_id; yoksa create_* alanlarını doldurun"),
    create_employee_id: str | None = Query(None),
    create_full_name: str | None = Query(None),
    create_team: str | None = Query(None),
    create_title: str | None = Query(None),
    create_email: str | None = Query(None),
    retro_days: int = Query(14, ge=0, le=60, description="Geriye dönük gün sayısı (eventlere employee_id yaz)"),
    db: Session = Depends(get_db),
):
    # 1) Identity var mı?
    rec = db.query(EmployeeIdentity).filter(EmployeeIdentity.actor_key == actor_key).first()
    if not rec:
        raise HTTPException(status_code=404, detail="identity not found")

    # 2) Hedef employee (var olan ya da yeni)
    if employee_id:
        emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="employee not found")
    else:
        if not (create_employee_id and create_full_name):
            raise HTTPException(status_code=400, detail="provide employee_id/full_name or existing employee_id")
        exists = db.query(Employee).filter(Employee.employee_id == create_employee_id).first()
        if exists:
            raise HTTPException(status_code=409, detail="employee_id already exists")
        emp = Employee(
            employee_id=create_employee_id,
            full_name=create_full_name,
            email=create_email,
            team_id=None,
            title=create_title,
            hired_at=None,
            status="active",
        )
        db.add(emp)
        db.flush()  # id üretimi gerekmiyor; employee_id zaten dışarıdan

    # 3) Identity'yi onayla
    rec.employee_id = emp.employee_id
    rec.status = "confirmed"
    db.add(rec)

    # 4) Geriye dönük eventlere employee_id yaz
    kind, val = _parse_actor_key(actor_key)
    if kind and retro_days > 0:
        since = datetime.now(timezone.utc) - timedelta(days=retro_days)
        if kind == "uid":
            q = db.query(Event).filter(and_(Event.from_user_id == val, Event.ts >= since))
        else:
            q = db.query(Event).filter(and_(Event.from_username == val, Event.ts >= since))
        for e in q.all():
            if not e.employee_id:
                e.employee_id = emp.employee_id
                db.add(e)

    db.commit()
    return {"ok": True, "actor_key": actor_key, "employee_id": emp.employee_id, "retro_days": retro_days}
