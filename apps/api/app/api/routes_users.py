from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.deps import get_db, RolesAllowed
from app.models.models import User
from app.core.security import hash_password
from app.schemas.user import UserCreateIn, UserOut

router = APIRouter(prefix="/users", tags=["users"])

@router.post("", response_model=UserOut, dependencies=[Depends(RolesAllowed("super_admin"))])
def create_user(body: UserCreateIn, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == body.email).first()
    if exists:
        raise HTTPException(status_code=409, detail="Email already exists")
    u = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        team_scope_id=body.team_scope_id,
        is_active=body.is_active,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u

@router.get("", response_model=list[UserOut], dependencies=[Depends(RolesAllowed("super_admin"))])
def list_users(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id.desc()).offset(offset).limit(limit).all()
