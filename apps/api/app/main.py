# apps/api/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# MODELLER
import app.models.events
import app.models.facts
import app.models.identities
import app.models.models

# ROUTERLAR
from app.api.routes_auth import router as auth_router
from app.api.routes_org import router as org_router
from app.api.route_seed import router as seed_router
from app.api.routes_users import router as users_router
from app.api.routes_telegram import router as telegram_router
from app.api.routes_debug import router as debug_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_identities import router as identities_router
from app.api.routes_employee_view import router as employee_view_router

# V1 hızlı başlat
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME)

# ---- CORS ----
ALLOWED_ORIGINS = [
    "https://personeltakipsistemi-production.up.railway.app",  # Admin panel domainin
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # Token header ile gidiyor, cookie yok
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ---- Basit başlangıç migrasyonları ----
MIGRATIONS_SQL = [
    "ALTER TABLE IF EXISTS raw_messages ALTER COLUMN from_user_id TYPE BIGINT USING from_user_id::bigint;",
    "ALTER TABLE IF EXISTS events       ALTER COLUMN from_user_id TYPE BIGINT USING from_user_id::bigint;",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS department VARCHAR(32);",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255);",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS phone VARCHAR(32);",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS salary_gross NUMERIC;",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS notes TEXT;",
]

@app.on_event("startup")
def run_startup_migrations():
    with engine.begin() as conn:
        for stmt in MIGRATIONS_SQL:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                print(f"[startup-migration] skip/err: {e}")

@app.get("/healthz")
def healthz():
    return {"ok": True}

# Router kayıtları
app.include_router(auth_router)
app.include_router(org_router)
app.include_router(seed_router)
app.include_router(users_router)
app.include_router(telegram_router)
app.include_router(debug_router)
app.include_router(jobs_router)
app.include_router(identities_router)
app.include_router(employee_view_router)
