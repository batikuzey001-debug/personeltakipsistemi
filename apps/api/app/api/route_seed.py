from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from app.deps import get_db
from app.models.models import User
from app.core.security import hash_password
from app.core.config import settings

router = APIRouter(prefix="/internal", tags=["internal"])

@router.post("/seed-super-admin")
def seed_super_admin(
    secret: str = Query(...),
    email: str = Query("super@admin.com"),
    password: str = Query("Passw0rd!"),
    db: Session = Depends(get_db),
):
    # Neden: Tek seferlik kurulum; yanlış kullanım riskini azaltmak için secret istiyoruz.
    import os
    seed_secret = os.getenv("SEED_SECRET")
    if not seed_secret or secret != seed_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return {"ok": True, "msg": "already-exists"}

    user = User(
        email=email,
        password_hash=hash_password(password),
        role="super_admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    return {"ok": True, "msg": "created"}
