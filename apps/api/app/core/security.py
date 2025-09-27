# apps/api/app/core/security.py
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

# Doğrulamada iki şemayı da destekle (eski bcrypt + olası bcrypt_sha256)
_pwd_verify_ctx = CryptContext(schemes=["bcrypt", "bcrypt_sha256"], deprecated="auto")
# Hash üretiminde öncelik bcrypt; uzun şifrelerde bcrypt_sha256'a otomatik geçeceğiz
_pwd_hash_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(raw: str) -> str:
    """
    Yeni şifreleri hash’ler.
    - <=72 byte ise bcrypt
    - >72 byte ise otomatik bcrypt_sha256
    """
    s = raw or ""
    b = s.encode("utf-8")
    if len(b) > 72:
        # uzun şifreler için güvenli yol
        from passlib.hash import bcrypt_sha256
        return bcrypt_sha256.hash(s)
    return _pwd_hash_ctx.hash(s)

def verify_password(raw: str, hashed: str) -> bool:
    """
    Hem bcrypt hem bcrypt_sha256 hash’lerini doğrular.
    """
    try:
        return _pwd_verify_ctx.verify(raw or "", hashed or "")
    except Exception:
        return False

def create_access_token(sub: str, role: str, expires_minutes: Optional[int] = None) -> str:
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": sub, "role": role, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGO)
