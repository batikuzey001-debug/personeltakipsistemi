# apps/api/app/api/routes_employees.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from app.deps import get_db, RolesAllowed
from app.models.models import Employee  # employees tablosu

from pydantic import BaseModel

router = APIRouter(prefix="/employees", tags=["employees"])

class EmployeeOut(BaseModel):
    id: str
    full_name: str
    department: Optional[str] = None

    class Config:
        orm_mode = True

@router.get("", response_model=List[EmployeeOut], dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def list_employees(db: Session = Depends(get_db)):
    """
    Tüm personelleri departman bilgisiyle birlikte döndür.
    """
    return db.query(Employee).order_by(Employee.department, Employee.id).all()
