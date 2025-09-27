# apps/api/app/core/security.py
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

# Not: bcrypt_sha256 önce SHA256 uygular, sonra bcrypt; 72-byte sınırını aşan şifreleri güvenli destekler.
# "bcrypt" şemasını listede tutuyoruz ki eski hash'lerle de doğrulama çalışsın.
pwd_ctx = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated="auto")

# Eski KULLANIMLA uyum: fonksiyon adları ve imzalar aynen korunur
def hash_password(raw: str) -> str:
    """Yeni şifreleri hash'ler (uzun şifre desteği). Eski bcrypt hash'leri doğrulamada geçerlidir."""
    if not isinstance(raw, str):
        raw = str(raw or "")
    return pwd_ctx.hash(raw)

def verify_password(raw: str, hashed: str) -> bool:
    """Şifre doğrulama: bcrypt_sha256 + (geriye dönük) bcrypt"""
    try:
        return pwd_ctx.verify(raw or "", hashed or "")
    except Exception:
        return False

def create_access_token(sub: str, role: str, expires_minutes: Optional[int] = None) -> str:
    """
    JWT access token üretir (eski imza ile). Varsayılan süre settings.ACCESS_TOKEN_EXPIRE_MINUTES.
    Payload: {"sub": <email/id>, "role": <rol>, "exp": <utc>}  (önceki yapıyla uyumlu)
    """
    minutes = expires_minutes or getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 720)
    expire = datetime.utcnow() + timedelta(minutes=minutes)
    payload = {"sub": sub, "role": role, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGO)
