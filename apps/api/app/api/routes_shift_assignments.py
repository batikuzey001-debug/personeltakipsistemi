# apps/api/app/api/routes_shift_assignments.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import date

from app.deps import get_db, RolesAllowed
from app.db.models_shifts import ShiftAssignment, AssignmentStatus

from pydantic import BaseModel

router = APIRouter(prefix="/shift-assignments", tags=["shift-assignments"])

class ShiftAssignIn(BaseModel):
    employee_id: str
    date: date
    shift_def_id: int | None = None
    status: AssignmentStatus = AssignmentStatus.ON
    week_start: date

class ShiftAssignOut(BaseModel):
    id: int
    employee_id: str
    date: date
    shift_def_id: int | None
    status: AssignmentStatus
    week_start: date

    class Config:
        orm_mode = True

@router.get("", response_model=List[ShiftAssignOut], dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def list_assignments(
    week_start: date = Query(..., description="Haftanın Pazartesi tarihi"),
    db: Session = Depends(get_db)
):
    return db.query(ShiftAssignment).filter(ShiftAssignment.week_start == week_start).all()

@router.post("/bulk", response_model=List[ShiftAssignOut], dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def bulk_upsert(assignments: List[ShiftAssignIn], db: Session = Depends(get_db)):
    out = []
    for a in assignments:
        existing = db.query(ShiftAssignment).filter(
            ShiftAssignment.employee_id == a.employee_id,
            ShiftAssignment.date == a.date,
        ).first()
        if existing:
            existing.shift_def_id = a.shift_def_id
            existing.status = a.status
            existing.week_start = a.week_start
            out.append(existing)
        else:
            na = ShiftAssignment(
                employee_id=a.employee_id,
                date=a.date,
                week_start=a.week_start,
                shift_def_id=a.shift_def_id,
                status=a.status,
            )
            db.add(na)
            out.append(na)
    db.commit()
    return out

@router.delete("/{assign_id}", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def delete_assignment(assign_id: int, db: Session = Depends(get_db)):
    s = db.query(ShiftAssignment).get(assign_id)
    if not s:
        raise HTTPException(status_code=404, detail="assignment not found")
    db.delete(s)
    db.commit()
    return {"ok": True}
