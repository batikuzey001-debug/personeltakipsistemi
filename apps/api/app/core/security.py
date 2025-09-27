# apps/api/app/core/security.py
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

# Doğrulamada GERİYE DÖNÜK uyumluluk:
# - bcrypt: eski hash'ler
# - bcrypt_sha256: önceki düzenlemede oluşmuş olabilecek hash'ler
# Hash ÜRETİMİ varsayılanı bcrypt olarak bırakıyoruz (ilk şema).
pwd_ctx = CryptContext(schemes=["bcrypt", "bcrypt_sha256"], deprecated="auto")

def hash_password(raw: str) -> str:
  return pwd_ctx.hash(raw or "")

def verify_password(raw: str, hashed: str) -> bool:
  try:
    return pwd_ctx.verify(raw or "", hashed or "")
  except Exception:
    return False

def create_access_token(sub: str, role: str, expires_minutes: Optional[int] = None) -> str:
  expire = datetime.utcnow() + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
  payload = {"sub": sub, "role": role, "exp": expire}
  return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGO)
