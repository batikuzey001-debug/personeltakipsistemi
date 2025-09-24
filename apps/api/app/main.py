# apps/api/app/main.py
import os
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
import app.models.models        # employees (department + kart alanları)

# Admin Görevleri modelleri
import app.db.models_admin_tasks     # admin_tasks, admin_task_templates
import app.db.models_admin_settings  # admin_settings (bot ayarları)

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
from app.api.routes_reports import router as reports_router
from app.api.routes_admin_tasks import router as admin_tasks_router
from app.api.routes_admin_bot import router as admin_bot_router  # Bot İşlemleri

# Scheduler (geciken görev tarayıcı)
from app.scheduler.admin_tasks_jobs import start_scheduler

# V1: hızlı başlat (prod'da Alembic'e geçilecek)
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME)

# CORS – panel → API istekleri için serbest bırakıyoruz (Bearer token header kullanıyoruz)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Startup migrasyonları (kolon yoksa ekle; tip yanlışsa düzelt) ----
MIGRATIONS_SQL = [
    # UID kolonlarını BIGINT'e yükselt
    "ALTER TABLE IF EXISTS raw_messages ALTER COLUMN from_user_id TYPE BIGINT USING from_user_id::bigint;",
    "ALTER TABLE IF EXISTS events       ALTER COLUMN from_user_id TYPE BIGINT USING from_user_id::bigint;",

    # employees: kart alanları (varsa atlar)
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS department VARCHAR(32);",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255);",
    "ALTER TABLE IF NOT EXISTS employees ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;",
    "ALTER TABLE IF NOT EXISTS employees ADD COLUMN IF NOT EXISTS phone VARCHAR(32);",
    "ALTER TABLE IF NOT EXISTS employees ADD COLUMN IF NOT EXISTS salary_gross NUMERIC;",
    "ALTER TABLE IF NOT EXISTS employees ADD COLUMN IF NOT EXISTS notes TEXT;",

    # **kritik düzeltme**: telegram_user_id sütunu daha önce INTEGER ise BIGINT'e çevir
    "DO $$ BEGIN "
    "  IF EXISTS (SELECT 1 FROM information_schema.columns "
    "             WHERE table_name='employees' AND column_name='telegram_user_id' AND data_type='integer') THEN "
    "    EXECUTE 'ALTER TABLE employees ALTER COLUMN telegram_user_id TYPE BIGINT USING telegram_user_id::bigint'; "
    "  END IF; "
    "END $$;",

    # admin_tasks için faydalı indeksler
    "CREATE INDEX IF NOT EXISTS idx_admin_tasks_date ON admin_tasks(date);",
    "CREATE INDEX IF NOT EXISTS idx_admin_tasks_status ON admin_tasks(status);",
    "CREATE INDEX IF NOT EXISTS idx_admin_tasks_assignee ON admin_tasks(assignee_employee_id);",

    # admin_settings tablosu
    "CREATE TABLE IF NOT EXISTS admin_settings ("
    " key TEXT PRIMARY KEY,"
    " value TEXT NOT NULL,"
    " updated_at TIMESTAMP NOT NULL DEFAULT NOW()"
    ");",
    "INSERT INTO admin_settings(key,value) VALUES ('admin_tasks_tg_enabled','0') "
    "ON CONFLICT (key) DO NOTHING;",
]

@app.on_event("startup")
def run_startup_migrations():
    # idempotent migrationlar
    with engine.begin() as conn:
        for stmt in MIGRATIONS_SQL:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                print(f"[startup-migration] skip/err: {e}")

    # Admin Görevleri: geciken görev tarayıcısını başlat (çoklu worker için guard)
    try:
        if os.getenv("RUN_SCHEDULER", "1") == "1":
            start_scheduler()  # interval 5 dk; Europe/Istanbul
            print("[scheduler] admin_tasks started")
        else:
            print("[scheduler] disabled by RUN_SCHEDULER")
    except Exception as e:
        print(f"[scheduler] start err: {e}")

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
app.include_router(reports_router)
app.include_router(admin_tasks_router)
app.include_router(admin_bot_router)   # Bot İşlemleri uçları
