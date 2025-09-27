# apps/api/app/api/route_seed.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from app.deps import get_db
from app.core.config import settings
from app.core.security import hash_password

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
    # Önce öncelikli tablolara bak
    for t in PRIORITY_TABLES:
        q = text("""
            SELECT 1
            FROM information_schema.tables
            WHERE table_name = :t
            LIMIT 1
        """)
        if db.execute(q, {"t": t}).first():
            # email kolonu var mı?
            qc = text("""
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = :t AND column_name ILIKE 'email'
                LIMIT 1
            """)
            if db.execute(qc, {"t": t}).first():
                return t
    # Sonra email kolonu olan herhangi bir tablo
    any_tab = db.execute(text("""
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name ILIKE 'email'
        ORDER BY table_name
        LIMIT 1
    """)).scalar()
    return any_tab

def _columns_of(db: Session, table: str) -> list[str]:
    rows = db.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = :t
    """), {"t": table}).fetchall()
    return [r[0] for r in rows]

def _pick(cols: list[str], candidates: list[str]) -> Optional[str]:
    for c in candidates:
        if c in cols:
            return c
    return None

@router.api_route("/super", methods=["GET", "POST"])
def seed_super_admin(
    secret: str = Query(..., description="SEED_SECRET"),
    email: str = Query("super@admin.com"),
    password: str = Query("admin123"),
    full_name: str = Query("Super Admin"),
    db: Session = Depends(get_db),
):
    """
    Süper admin oluşturur/günceller (tablo/kolon adlarını otomatik keşfeder).
    Örnek:
      /seed/super?secret=seed-abc123!&email=super@admin.com&password=admin123
    """
    _expect_secret(secret)

    try:
        table = _find_user_table(db)
        if not table:
            raise HTTPException(status_code=500, detail="user table not found")

        cols = _columns_of(db, table)
        cols_lower = [c.lower() for c in cols]
        if "email" not in cols_lower:
            raise HTTPException(status_code=500, detail=f"'email' column not found in {table}")

        # Kolon seçimleri
        pwd_col  = _pick(cols_lower, PASSWORD_COL_CAND)
        role_col = _pick(cols_lower, ROLE_COL_CAND)
        act_col  = _pick(cols_lower, ACTIVE_COL_CAND)
        name_col = _pick(cols_lower, NAME_COL_CAND)

        # Kayıt var mı?
        exists = db.execute(
            text(f"SELECT 1 FROM {table} WHERE email = :e LIMIT 1"),
            {"e": email},
        ).first() is not None

        hpw = hash_password(password)

        if exists:
            # UPDATE
            sets = []
            params = {"e": email}
            if pwd_col:
                sets.append(f"{pwd_col} = :p")
                params["p"] = hpw
            if role_col:
                sets.append(f"{role_col} = :r")
                params["r"] = "super_admin"
            if act_col:
                sets.append(f"{act_col} = :a")
                params["a"] = True
            if name_col:
                sets.append(f"{name_col} = :n")
                params["n"] = full_name

            if not sets:
                # Hiç set yapamıyorsak en azından role/email güncellemeyi deneyelim
                sets.append("email = email")

            sql = text(f"UPDATE {table} SET {', '.join(sets)} WHERE email = :e")
            db.execute(sql, params)
            action = "updated"
        else:
            # INSERT
            insert_cols = ["email"]
            insert_vals = [":e"]
            params = {"e": email}
            if pwd_col:
                insert_cols.append(pwd_col)
                insert_vals.append(":p")
                params["p"] = hpw
            if role_col:
                insert_cols.append(role_col)
                insert_vals.append(":r")
                params["r"] = "super_admin"
            if act_col:
                insert_cols.append(act_col)
                insert_vals.append(":a")
                params["a"] = True
            if name_col:
                insert_cols.append(name_col)
                insert_vals.append(":n")
                params["n"] = full_name

            sql = text(f"INSERT INTO {table} ({', '.join(insert_cols)}) VALUES ({', '.join(insert_vals)})")
            db.execute(sql, params)
            action = "created"

        db.commit()

        # Basit çıktı (kimlik varsa çek)
        user_row = db.execute(
            text(f"SELECT * FROM {table} WHERE email = :e"),
            {"e": email}
        ).mappings().first()
        user_id = user_row.get("id") if user_row else None
        role_val = user_row.get(role_col) if (user_row and role_col) else "super_admin"
        active_val = user_row.get(act_col) if (user_row and act_col) else True
        name_val = user_row.get(name_col) if (user_row and name_col) else full_name

        return {
            "ok": True,
            "action": action,
            "user": {
                "id": user_id,
                "email": email,
                "role": role_val,
                "is_active": active_val,
                "full_name": name_val,
                "table": table,
            },
        }

    except HTTPException:
        raise
    except Exception as ex:
        # hatayı görünür kılalım ki 500 yerine ne olduğunu görelim
        raise HTTPException(status_code=500, detail=f"seed error: {ex}")
