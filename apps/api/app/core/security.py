# apps/api/app/core/security.py
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from passlib.context import CryptContext
from jose import jwt

from app.core.config import settings

# -------------------------------------------------------------------
# Parola hash/doğrulama
# - bcrypt_sha256: 72 byte sınırını ortadan kaldırır (önce SHA256, sonra bcrypt)
# - bcrypt: eski kayıtlar için geriye dönük doğrulama
# -------------------------------------------------------------------
pwd_context = CryptContext(
    schemes=["bcrypt_sha256", "bcrypt"],
    deprecated="auto",
)

MAX_PASSWORD_LEN = 4096  # isteğe bağlı üst sınır


def get_password_hash(password: str) -> str:
    if not isinstance(password, str):
        password = str(password or "")
    if len(password) > MAX_PASSWORD_LEN:
        password = password[:MAX_PASSWORD_LEN]
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password or "", hashed_password or "")
    except Exception:
        # beklenmedik formatlarda 500 atmamak için False
        return False


# -------------------------------------------------------------------
# JWT Access Token üretimi
# routes_auth.py bu fonksiyonu import ediyor: create_access_token
# -------------------------------------------------------------------
def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Varsayılan olarak 12 saatlik access token üretir.
    settings.JWT_SECRET ve settings.JWT_ALGO kullanılır.
    """
    to_encode = dict(data or {})
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=12))
    to_encode.update({"exp": expire})
    token = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGO)
    return token
