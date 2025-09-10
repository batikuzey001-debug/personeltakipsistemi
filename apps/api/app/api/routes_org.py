from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.deps import get_db, RolesAllowed
from app.models.models import Team, Employee
from app.schemas.org import TeamOut, EmployeeOut

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
