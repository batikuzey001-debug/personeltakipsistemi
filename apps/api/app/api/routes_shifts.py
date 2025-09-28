# apps/api/app/api/routes_shifts.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import time

from app.deps import get_db, RolesAllowed
from app.db.models_shifts import ShiftDefinition, ShiftAssignment
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/shifts", tags=["shifts"])

# --------- Schemas ----------
class ShiftDefIn(BaseModel):
    name: str
    start_time: str  # "HH:MM"
    end_time: str    # "HH:MM"
    is_active: Optional[bool] = True

class ShiftDefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    start_time: time
    end_time: time
    is_active: bool

# --------- CRUD ----------
@router.get("", response_model=List[ShiftDefOut], dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def list_shifts(db: Session = Depends(get_db)):
    return db.query(ShiftDefinition).order_by(ShiftDefinition.start_time).all()

@router.post("", response_model=ShiftDefOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def create_shift(body: ShiftDefIn, db: Session = Depends(get_db)):
    # UNIQUE(start_time,end_time) sayesinde aynı slot tek id olur
    s = ShiftDefinition(
        name=body.name.strip(),
        start_time=time.fromisoformat(body.start_time),
        end_time=time.fromisoformat(body.end_time),
        is_active=bool(body.is_active),
    )
    db.add(s)
    try:
        db.commit()
    except Exception:
        db.rollback()
        # varsa mevcut satırı döndür
        s = db.query(ShiftDefinition).filter(
            ShiftDefinition.start_time == time.fromisoformat(body.start_time),
            ShiftDefinition.end_time == time.fromisoformat(body.end_time),
        ).first()
        if not s:
            raise
    db.refresh(s)
    return s

@router.patch("/{shift_id}", response_model=ShiftDefOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def update_shift(shift_id: int, body: ShiftDefIn, db: Session = Depends(get_db)):
    s = db.query(ShiftDefinition).get(shift_id)
    if not s:
        raise HTTPException(status_code=404, detail="shift not found")
    s.name = body.name.strip()
    s.start_time = time.fromisoformat(body.start_time)
    s.end_time = time.fromisoformat(body.end_time)
    s.is_active = bool(body.is_active)
    db.commit()
    db.refresh(s)
    return s

@router.delete("/{shift_id}", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def delete_shift(shift_id: int, db: Session = Depends(get_db)):
    s = db.query(ShiftDefinition).get(shift_id)
    if not s:
        raise HTTPException(status_code=404, detail="shift not found")
    # güvenli: assignment varsa silme hatırlat
    used = db.query(ShiftAssignment).filter(ShiftAssignment.shift_def_id == shift_id).first()
    if used:
        raise HTTPException(status_code=409, detail="shift in use by assignments")
    db.delete(s)
    db.commit()
    return {"ok": True}

# --------- DEBUG / SEED ---------
@router.get("/debug/defs", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def debug_list_defs(db: Session = Depends(get_db)):
    rows = db.query(ShiftDefinition).order_by(ShiftDefinition.start_time).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "start_time": r.start_time.strftime("%H:%M"),
            "end_time": r.end_time.strftime("%H:%M"),
            "is_active": r.is_active,
        } for r in rows
    ]

@router.post("/debug/seed-24", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def debug_seed_24(db: Session = Depends(get_db)):
    # 00-08, 01-09, ... 23-07 -> 24 slotu idempotent yarat
    created = 0
    for h in range(24):
        st = time(hour=h)
        en = time(hour=(h + 8) % 24)
        exists = db.query(ShiftDefinition).filter(
            ShiftDefinition.start_time == st,
            ShiftDefinition.end_time == en,
        ).first()
        if exists:
            continue
        s = ShiftDefinition(
            name=f"{st.strftime('%H:%M')}-{en.strftime('%H:%M')}",
            start_time=st,
            end_time=en,
            is_active=True,
        )
        db.add(s)
        created += 1
    db.commit()
    return {"ok": True, "created": created}
