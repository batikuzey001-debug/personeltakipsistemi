# apps/api/app/api/route_seed.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from app.deps import get_db
from app.core.config import settings

router = APIRouter(prefix="/seed", tags=["seed"])

PRIORITY_TABLES = ["users", "user_accounts", "app_users", "accounts", "auth_users"]
PASSWORD_COL_CAND = ["password_hash", "password", "hashed_password", "passwd"]
ROLE_COL_CAND     = ["role", "user_role", "roles"]
ACTIVE_COL_CAND   = ["is_active", "active", "enabled"]
NAME_COL_CAND     = ["full_name", "name", "display_name", "username"]

def _expect_secret(secret: str):
    expected = getattr(settings, "SEED_SECRET", None) or "seed-abc123!"
    if secret != expected:
        raise HTTPException(status_code=401, detail="invalid seed secret")

def _find_user_table(db: Session) -> Optional[str]:
    for t in PRIORITY_TABLES:
        r = db.execute(text(
            "SELECT 1 FROM information_schema.tables WHERE table_name=:t LIMIT 1"
        ), {"t": t}).first()
        if r:
            # email kolonu var mı bak
            has_email = db.execute(text(
                "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name ILIKE 'email' LIMIT 1"
            ), {"t": t}).first()
            if has_email:
                return t
    # fallback: herhangi bir 'email' kolonu olan tabloyu bul
    any_tab = db.execute(text(
        "SELECT table_name FROM information_schema.columns WHERE column_name ILIKE 'email' ORDER BY table_name LIMIT 1"
    )).scalar()
    return any_tab

def _columns_of(db: Session, table: str) -> list[str]:
    rows = db.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name=:t"
    ), {"t": table}).fetchall()
    return [r[0] for r in rows]

def _pick(cols: list[str], candidates: list[str]) -> Optional[str]:
    for c in candidates:
        if c in cols:
            return c
    return None

def _truncate_to_72_bytes_utf8(s: str) -> str:
    """
    Gerektiğinde bcrypt için 72-byte sınırını bayt düzeyinde uygular.
    Ancak normalde tercihimiz bcrypt_sha256 ya da pbkdf2_sha256 kullanmak.
    """
    if not isinstance(s, str):
        s = str(s or "")
    b = s.encode("utf-8")
    if len(b) <= 72:
        return s
    tb = b[:72]
    return tb.decode("utf-8", errors="ignore")

def _safe_hash(pw: str) -> str:
    """
    Öncelik:
      1) bcrypt_sha256 (uzun parolalar için uygundur çünkü önce SHA256 uygular)
      2) pbkdf2_sha256 (uzun parolalar için uygundur - bcrypt alternatifi)
      3) fallback: bcrypt (72 byte sınırı nedeniyle input'u truncate edip kullan)
    Eğer hiçbiri yoksa 500 hatası fırlatılır.
    """
    if pw is None:
        pw = ""

    # 1) bcrypt_sha256
    try:
        from passlib.hash import bcrypt_sha256
        try:
            return bcrypt_sha256.hash(pw)
        except Exception as ex:
            # beklenmedik, fallback denenecek
            fallback_err = ex
    except Exception as import_ex:
        bcrypt_sha256 = None
        fallback_err = import_ex

    # 2) pbkdf2_sha256 (güvenli ve uzun şifre destekler)
    try:
        from passlib.hash import pbkdf2_sha256
        try:
            return pbkdf2_sha256.hash(pw)
        except Exception as ex2:
            fallback_err = ex2
    except Exception as import_ex2:
        pbkdf2_sha256 = None
        # devam, bcrypt'a düşecek

    # 3) Son çare: bcrypt (72 byte sınırı) — bu durumda truncate et
    try:
        from passlib.hash import bcrypt
    except Exception as import_ex3:
        raise HTTPException(status_code=500, detail=f"seed error (no passlib hash available): {fallback_err} / {import_ex3}")

    # truncate to 72 bytes (bayt bazında) before bcrypt
    try:
        pw_trunc = _truncate_to_72_bytes_utf8(pw)
        return bcrypt.hash(pw_trunc)
    except Exception as ex3:
        raise HTTPException(status_code=500, detail=f"seed error (hash fallback): {ex3}")

@router.api_route("/super", methods=["GET", "POST"])
def seed_super_admin(
    secret: str = Query(..., description="SEED_SECRET"),
    email: str = Query("super@admin.com"),
    password: str = Query("admin123"),
    full_name: str = Query("Super Admin"),
    db: Session = Depends(get_db),
):
    """
    Süper admin oluşturur/günceller.
    Örnek:
      GET /seed/super?secret=seed-abc123!&email=super@admin.com&password=admin123
    """
    _expect_secret(secret)

    try:
        table = _find_user_table(db)
        if not table:
            raise HTTPException(status_code=500, detail="user table not found")

        cols = [c.lower() for c in _columns_of(db, table)]
        if "email" not in cols:
            raise HTTPException(status_code=500, detail=f"'email' column not found in {table}")

        pwd_col  = _pick(cols, PASSWORD_COL_CAND)
        role_col = _pick(cols, ROLE_COL_CAND)
        act_col  = _pick(cols, ACTIVE_COL_CAND)
        name_col = _pick(cols, NAME_COL_CAND)

        if not pwd_col:
            raise HTTPException(status_code=500, detail=f"password column not found in {table}")

        # Güvenli hash: tercih edilen methodları kullan
        hpw = _safe_hash(password or "")

        exists = db.execute(
            text(f"SELECT 1 FROM {table} WHERE email = :e LIMIT 1"),
            {"e": email},
        ).first() is not None

        if exists:
            sets = [f"{pwd_col}=:p"]
            params = {"e": email, "p": hpw}
            if role_col: sets.append(f"{role_col}=:r"); params["r"] = "super_admin"
            if act_col:  sets.append(f"{act_col}=:a");   params["a"] = True
            if name_col: sets.append(f"{name_col}=:n");  params["n"] = full_name

            db.execute(text(f"UPDATE {table} SET {', '.join(sets)} WHERE email=:e"), params)
            action = "updated"
        else:
            cols_i = ["email", pwd_col]
            vals_i = [":e", ":p"]
            params = {"e": email, "p": hpw}
            if role_col: cols_i.append(role_col); vals_i.append(":r"); params["r"] = "super_admin"
            if act_col:  cols_i.append(act_col);  vals_i.append(":a"); params["a"] = True
            if name_col: cols_i.append(name_col); vals_i.append(":n"); params["n"] = full_name

            db.execute(text(f"INSERT INTO {table} ({', '.join(cols_i)}) VALUES ({', '.join(vals_i)})"), params)
            action = "created"

        db.commit()

        row = db.execute(text(f"SELECT * FROM {table} WHERE email=:e"), {"e": email}).mappings().first()
        return {
            "ok": True,
            "action": action,
            "user": {
                "id": row.get("id") if row else None,
                "email": email,
                "role": row.get(role_col) if (row and role_col) else "super_admin",
                "is_active": row.get(act_col) if (row and act_col) else True,
                "full_name": row.get(name_col) if (row and name_col) else full_name,
                "table": table,
            },
        }
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"seed error: {ex}")
