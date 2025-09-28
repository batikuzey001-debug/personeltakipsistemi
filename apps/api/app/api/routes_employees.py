# apps/api/app/api/routes_employees.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from app.deps import get_db, RolesAllowed
from app.models.models import Employee  # employees tablosu
from pydantic import BaseModel

router = APIRouter(prefix="/employees", tags=["employees"])

class EmployeeOut(BaseModel):
    pk: int                 # benzersiz PK (tablonun integer id'si)
    employee_id: str        # işte kullanılan kod (RD-xxx)
    full_name: str
    department: Optional[str] = None

    class Config:
        orm_mode = True

@router.get("", response_model=List[EmployeeOut], dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def list_employees(db: Session = Depends(get_db)):
    """
    Personeller: pk (benzersiz), employee_id (iş kodu), isim, departman.
    """
    q = db.query(Employee).order_by(Employee.department, Employee.id)
    rows = q.all()
    out: List[EmployeeOut] = []
    for r in rows:
        out.append(EmployeeOut(
            pk = getattr(r, "id"),                 # tabloda integer PK
            employee_id = getattr(r, "employee_id", getattr(r, "code", getattr(r, "external_id", ""))),
            full_name = getattr(r, "full_name", getattr(r, "name", "")),
            department = getattr(r, "department", None),
        ))
    return out
