# apps/api/app/core/security.py
# Amaç: "ValueError: password cannot be longer than 72 bytes" hatasını çözmek.
# Çözüm: bcrypt yerine bcrypt_sha256 kullan (uzun şifreleri güvenli şekilde destekler).
# Eski kayıtlarla uyumluluk için "bcrypt" de doğrulama şemaları arasında bırakıldı.

from __future__ import annotations
from passlib.context import CryptContext

# bcrypt_sha256 uzun şifreleri önce SHA256 ile önişler, sonra bcrypt uygular.
# "bcrypt" şemasını da doğrulama için listede tutuyoruz (geriye dönük uyumluluk).
pwd_context = CryptContext(
    schemes=["bcrypt_sha256", "bcrypt"],
    deprecated="auto",
)

# Aşırı uzun girdiler için makul bir üst sınır (isteğe göre ayarlanabilir).
MAX_PASSWORD_LEN = 4096


def get_password_hash(password: str) -> str:
    """
    Yeni şifreleri hash’ler.
    Not: bcrypt_sha256 şeması 72 byte sınırı sorununu ortadan kaldırır.
    """
    if not isinstance(password, str):
        password = str(password or "")
    # İsteğe bağlı sert koruma – gereksizce büyük girdileri kes
    if len(password) > MAX_PASSWORD_LEN:
        password = password[:MAX_PASSWORD_LEN]
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Şifre doğrulama:
    - Önce bcrypt_sha256 ile dener
    - Eski kayıtlar için bcrypt doğrulamayı da destekler
    """
    try:
        return pwd_context.verify(plain_password or "", hashed_password or "")
    except Exception:
        # Beklenmedik formatlarda sessizce False döndür (500 yerine 401/403 akışına izin ver)
        return False
