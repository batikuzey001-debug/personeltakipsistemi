# apps/api/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# MODELLER (create_all tüm tabloları görsün)
import app.models.events        # raw_messages, events
import app.models.facts         # facts_daily, facts_monthly
import app.models.identities    # employee_identities

# ROUTERLAR
from app.api.routes_auth import router as auth_router
from app.api.routes_org import router as org_router
from app.api.route_seed import router as seed_router
from app.api.routes_users import router as users_router
from app.api.routes_telegram import router as telegram_router
from app.api.routes_debug import router as debug_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_identities import router as identities_router
from app.api.routes_employee_view import router as employee_view_router  # EKLE
# ...
app.include_router(employee_view_router)  # EKLE

# V1: hızlı başlat (prod'da Alembic'e geçilecek)
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME)

# CORS: V1 geniş; prod'da panel domaini ile sınırla
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Basit başlangıç migrasyonları (startup'ta bir kez çalışır) ----
MIGRATIONS_SQL = [
    # Telegram UID'leri 32-bit'e sığmıyor → BIGINT'e yükselt
    "ALTER TABLE IF EXISTS raw_messages "
    "  ALTER COLUMN from_user_id TYPE BIGINT USING from_user_id::bigint;",
    "ALTER TABLE IF EXISTS events "
    "  ALTER COLUMN from_user_id TYPE BIGINT USING from_user_id::bigint;",
]

@app.on_event("startup")
def run_startup_migrations():
    with engine.begin() as conn:
        for stmt in MIGRATIONS_SQL:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                # idempotent: hata olsa da (örn. zaten BIGINT ise) servis devam etsin
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
