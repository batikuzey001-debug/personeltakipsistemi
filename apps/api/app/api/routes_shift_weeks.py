# apps/api/app/api/routes_shift_weeks.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import Optional

from app.deps import get_db, RolesAllowed
from app.db.models_shifts import ShiftWeek, WeekStatus

from pydantic import BaseModel

router = APIRouter(prefix="/shift-weeks", tags=["shift-weeks"])

class ShiftWeekOut(BaseModel):
    week_start: date
    status: WeekStatus
    published_at: Optional[datetime] = None
    published_by: Optional[str] = None

    class Config:
        orm_mode = True

@router.get("/{week_start}", response_model=ShiftWeekOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def get_week(week_start: date, db: Session = Depends(get_db)):
    w = db.query(ShiftWeek).get(week_start)
    if not w:
        w = ShiftWeek(week_start=week_start, status=WeekStatus.draft)
        db.add(w)
        db.commit()
        db.refresh(w)
    return w

@router.post("/{week_start}/publish", response_model=ShiftWeekOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def publish_week(week_start: date, db: Session = Depends(get_db), user: str = "super_admin"):
    w = db.query(ShiftWeek).get(week_start)
    if not w:
        raise HTTPException(status_code=404, detail="week not found")
    if w.status == WeekStatus.published:
        raise HTTPException(status_code=400, detail="already published")
    w.status = WeekStatus.published
    w.published_at = datetime.utcnow()
    w.published_by = user
    db.commit()
    db.refresh(w)
    # TODO: entegrasyon → Telegram/e-posta paylaşımını tetikle
    return w
