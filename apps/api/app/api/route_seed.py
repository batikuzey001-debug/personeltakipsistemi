# apps/api/app/api/route_seed.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.deps import get_db
from app.core.config import settings
from app.core.security import hash_password
from app.models.models import User  # Projendeki User modelinin yolu buysa böyle; değilse doğrusu ile değiştir

router = APIRouter(prefix="/seed", tags=["seed"])

@router.api_route("/super", methods=["GET", "POST"])
def seed_super_admin(
    secret: str = Query(..., description="SEED_SECRET"),
    email: str = Query("super@admin.com"),
    password: str = Query("admin123"),
    full_name: str = Query("Super Admin"),
    db: Session = Depends(get_db),
):
    """
    Super admin kullanıcıyı oluşturur / günceller.
    Tarayıcıdan GET ile de çağrılabilir:
      /seed/super?secret=seed-abc123!&email=super@admin.com&password=admin123
    """
    expected = getattr(settings, "SEED_SECRET", None) or "seed-abc123!"
    if secret != expected:
        raise HTTPException(status_code=401, detail="invalid seed secret")

    # Var mı?
    user = db.query(User).filter(User.email == email).first()
    if user:
        # Güncelle
        if hasattr(user, "password_hash"):
            user.password_hash = hash_password(password)
        elif hasattr(user, "password"):
            user.password = hash_password(password)
        if hasattr(user, "full_name"):
            user.full_name = full_name
        if hasattr(user, "is_active"):
            user.is_active = True
        if hasattr(user, "role"):
            user.role = "super_admin"
        action = "updated"
    else:
        fields = {"email": email}
        if hasattr(User, "password_hash"):
            fields["password_hash"] = hash_password(password)
        else:
            fields["password"] = hash_password(password)
        if hasattr(User, "full_name"):
            fields["full_name"] = full_name
        if hasattr(User, "is_active"):
            fields["is_active"] = True
        if hasattr(User, "role"):
            fields["role"] = "super_admin"
        user = User(**fields)
        db.add(user)
        action = "created"

    db.commit()
    db.refresh(user)
    return {
        "ok": True,
        "action": action,
        "user": {
            "id": getattr(user, "id", None),
            "email": user.email,
            "role": getattr(user, "role", "super_admin"),
            "is_active": getattr(user, "is_active", True),
            "full_name": getattr(user, "full_name", full_name),
        },
    }
