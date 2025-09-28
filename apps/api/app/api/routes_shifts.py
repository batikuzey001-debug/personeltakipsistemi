# apps/api/app/api/routes_shifts.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import time

from app.deps import get_db, RolesAllowed
from app.db.models_shifts import ShiftDefinition
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/shifts", tags=["shifts"])

class ShiftDefIn(BaseModel):
    name: str
    start_time: str  # "HH:MM"
    end_time: str    # "HH:MM"
    is_active: Optional[bool] = True

class ShiftDefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    start_time: time   # ← time olarak döndür
    end_time: time     # ← time olarak döndür
    is_active: bool

@router.get("", response_model=List[ShiftDefOut], dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def list_shifts(db: Session = Depends(get_db)):
    return db.query(ShiftDefinition).order_by(ShiftDefinition.start_time).all()

@router.post("", response_model=ShiftDefOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def create_shift(body: ShiftDefIn, db: Session = Depends(get_db)):
    s = ShiftDefinition(
        name=body.name.strip(),
        start_time=time.fromisoformat(body.start_time),
        end_time=time.fromisoformat(body.end_time),
        is_active=bool(body.is_active),
    )
    db.add(s)
    db.commit()
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
    db.delete(s)
    db.commit()
    return {"ok": True}
