# apps/api/app/api/route_seed.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from app.deps import get_db
from app.core.config import settings
from app.core.security import hash_password

# Kullanıcı modelinizi buradan import edin.
# Projende zaten "routes_users" var; genelde User modeli app.models.models içinde olur.
from app.models.models import User  # gerekiyorsa doğru yola göre düzelt

router = APIRouter(prefix="/seed", tags=["seed"])

class SeedSuperIn:
    # Body opsiyonel kullanılacak; Pydantic'e gerek olmadan dict ile okuyacağız
    pass

@router.post("/super")
def seed_super_admin(
    secret: str = Query(..., description="SEED_SECRET"),
    email: str | None = Query(None, description="Varsayılan: super@admin.com"),
    password: str | None = Query(None, description="Varsayılan: admin123"),
    full_name: str | None = Query(None, description="Varsayılan: Super Admin"),
    body: dict | None = Body(None, description="İstersen JSON body ile email/password/full_name gönderebilirsin"),
    db: Session = Depends(get_db),
):
    """
    Super admin kullanıcıyı oluşturur / günceller.
    Kullanım (tarayıcı veya curl):
      POST /seed/super?secret=seed-abc123!
      POST /seed/super?secret=seed-abc123!&email=super@admin.com&password=MyPass123
    """
    # 1) Secret doğrulama
    expected = getattr(settings, "SEED_SECRET", None) or "seed-abc123!"
    if secret != expected:
        raise HTTPException(status_code=401, detail="invalid seed secret")

    # 2) Parametreleri topla (query > body > varsayılan)
    if body is None:
        body = {}
    email = (email or body.get("email") or "super@admin.com").strip()
    password = (password or body.get("password") or "admin123").strip()
    full_name = (full_name or body.get("full_name") or "Super Admin").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="email/password gerekli")

    # 3) Var mı bak
    user = db.query(User).filter(User.email == email).first()

    if user:
        # Güncelle
        user.password = hash_password(password)
        # Bazı şemalarda kolon adı password_hash olabilir; varsa onu da set et
        if hasattr(user, "password_hash"):
            setattr(user, "password_hash", user.password)
        user.role = getattr(user, "role", None) or "super_admin"
        if hasattr(user, "is_active"):
            user.is_active = True
        if hasattr(user, "full_name"):
            user.full_name = full_name
        action = "updated"
    else:
        # Oluştur
        fields = {
            "email": email,
            "role": "super_admin",
        }
        if hasattr(User, "password_hash"):
            fields["password_hash"] = hash_password(password)
        else:
            fields["password"] = hash_password(password)
        if hasattr(User, "is_active"):
            fields["is_active"] = True
        if hasattr(User, "full_name"):
            fields["full_name"] = full_name

        user = User(**fields)
        db.add(user)
        action = "created"

    db.commit()
    db.refresh(user)

    # 4) Yanıt
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
