# apps/api/app/api/routes_org.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db, RolesAllowed
from app.models.models import Team, Employee
from app.schemas.org import TeamOut, EmployeeOut, EmployeeUpdateIn

router = APIRouter(tags=["org"])

@router.get("/teams", response_model=list[TeamOut], dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def list_teams(db: Session = Depends(get_db)):
    return db.query(Team).order_by(Team.name).all()

@router.get("/employees", response_model=list[EmployeeOut], dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def list_employees(
    q: str | None = None,
    team_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    qry = db.query(Employee)
    if q:
        like = f"%{q}%"
        qry = qry.filter((Employee.full_name.ilike(like)) | (Employee.email.ilike(like)))
    if team_id:
        qry = qry.filter(Employee.team_id == team_id)
    return qry.order_by(Employee.full_name).offset(offset).limit(limit).all()

@router.get("/employees/{employee_id}", response_model=EmployeeOut, dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def get_employee(employee_id: str, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="employee not found")
    return emp

@router.patch("/employees/{employee_id}", response_model=EmployeeOut, dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def update_employee(employee_id: str, body: EmployeeUpdateIn, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="employee not found")

    # Sadece gönderilen alanları güncelle
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        # Modelinde olmayan alanlar tanımlıysa (telegram_username/uid/phone/salary_gross/notes),
        # Employee modeline eklendiyse çalışır; eklenmediyse sessiz geçilir.
        if hasattr(emp, k):
            setattr(emp, k, v)

    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp
