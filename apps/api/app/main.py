# apps/api/app/main.py
import os
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

# Admin & Bot modelleri
import app.db.models_admin_tasks
import app.db.models_admin_settings
import app.db.models_admin_notifications
import app.db.models_shifts

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
from app.api.routes_admin_bot import router as admin_bot_router
from app.api.routes_admin_notifications import router as admin_notify_router

# ⬇️ SHIFT routerları
from app.api.routes_shifts import router as shifts_router
from app.api.routes_shift_assignments import router as shift_assignments_router
from app.api.routes_shift_weeks import router as shift_weeks_router

# ⬇️ LIVECHAT keşif router (opsiyonel)
_livechat_router = None
try:
    from app.api.routes_livechat import router as livechat_router
    _livechat_router = livechat_router
except Exception as e:
    print(f"[livechat] router not loaded: {e}")

# ⬇️ LIVECHAT RAPOR router (opsiyonel)
_livechat_report_router = None
try:
    from app.api.routes_livechat_report import router as livechat_report_router
    _livechat_report_router = livechat_report_router
except Exception as e:
    print(f"[livechat-report] router not loaded: {e}")

# ⬇️ LIVECHAT SUPERVISE router (opsiyonel)
_livechat_supervise_router = None
try:
    from app.api.routes_livechat_supervise import router as livechat_supervise_router
    _livechat_supervise_router = livechat_supervise_router
except Exception as e:
    print(f"[livechat-supervise] router not loaded: {e}")

# Scheduler
from app.scheduler.admin_tasks_jobs import start_scheduler

app = FastAPI(title=settings.APP_NAME)

# ---------------- CORS (PROD origin + local) ----------------
# ENV ile override edilebilir: CORS_ALLOW_ORIGINS="https://foo.com,https://bar.com"
_env_origins = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
if _env_origins:
    FRONT_ORIGINS = [o.strip() for o in _env_origins.split(",") if o.strip()]
else:
    FRONT_ORIGINS = [
        "https://personeltakipsistemi-production.up.railway.app",  # prod web
        "http://localhost:5173",                                    # local vite
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONT_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)
print(f"[cors] allow_origins={FRONT_ORIGINS}")

# tabloları oluştur
Base.metadata.create_all(bind=engine)

# ---- Startup migrasyonları ----
MIGRATIONS_SQL = [
    "ALTER TABLE IF EXISTS raw_messages ALTER COLUMN from_user_id TYPE BIGINT USING from_user_id::bigint;",
    "ALTER TABLE IF EXISTS events       ALTER COLUMN from_user_id TYPE BIGINT USING from_user_id::bigint;",

    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS department VARCHAR(32);",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255);",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS phone VARCHAR(32);",
    "ALTER TABLE IF EXISTS employees ADD COLUMN IF NOT EXISTS salary_gross NUMERIC;",
    "ALTER TABLE IF NOT EXISTS employees ADD COLUMN IF NOT EXISTS notes TEXT;",

    "DO $$ BEGIN "
    "  IF EXISTS (SELECT 1 FROM information_schema.columns "
    "             WHERE table_name='employees' AND column_name='telegram_user_id' AND data_type='integer') THEN "
    "    EXECUTE 'ALTER TABLE employees ALTER COLUMN telegram_user_id TYPE BIGINT USING telegram_user_id::bigint'; "
    "  END IF; "
    "END $$;",

    "CREATE INDEX IF NOT EXISTS idx_admin_tasks_date ON admin_tasks(date);",
    "CREATE INDEX IF NOT EXISTS idx_admin_tasks_status ON admin_tasks(status);",
    "CREATE INDEX IF NOT EXISTS idx_admin_tasks_assignee ON admin_tasks(assignee_employee_id);",

    "CREATE TABLE IF NOT EXISTS admin_settings ("
    " key TEXT PRIMARY KEY,"
    " value TEXT NOT NULL,"
    " updated_at TIMESTAMP NOT NULL DEFAULT NOW()"
    ");",
    "INSERT INTO admin_settings(key,value) VALUES ('admin_tasks_tg_enabled','0') ON CONFLICT (key) DO NOTHING;",
    "INSERT INTO admin_settings(key,value) VALUES ('bonus_tg_enabled','0')        ON CONFLICT (key) DO NOTHING;",
    "INSERT INTO admin_settings(key,value) VALUES ('finance_tg_enabled','0')      ON CONFLICT (key) DO NOTHING;",
    "INSERT INTO admin_settings(key,value) VALUES ('attendance_tg_enabled','0')   ON CONFLICT (key) DO NOTHING;",

    "CREATE TABLE IF NOT EXISTS admin_notifications ("
    " id SERIAL PRIMARY KEY,"
    " channel VARCHAR(32) NOT NULL,"
    " name VARCHAR(120) NOT NULL,"
    " template TEXT NOT NULL,"
    " is_active BOOLEAN NOT NULL DEFAULT TRUE,"
    " created_at TIMESTAMP NOT NULL DEFAULT NOW(),"
    " updated_at TIMESTAMP NOT NULL DEFAULT NOW()"
    ");",

    "CREATE TABLE IF NOT EXISTS admin_notifications_log ("
    " id SERIAL PRIMARY KEY,"
    " channel VARCHAR(32) NOT NULL,"
    " type VARCHAR(32) NOT NULL,"
    " period_key VARCHAR(64) NOT NULL,"
    " sent_at TIMESTAMP NOT NULL DEFAULT NOW(),"
    " UNIQUE(channel, type, period_key)"
    ");",

    "CREATE TABLE IF NOT EXISTS shift_definitions ("
    " id SERIAL PRIMARY KEY,"
    " name VARCHAR(64) NOT NULL,"
    " start_time TIME NOT NULL,"
    " end_time TIME NOT NULL,"
    " is_active BOOLEAN NOT NULL DEFAULT TRUE"
    ");",
    "DO $$ BEGIN "
    "  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_shift_def_start_end') THEN "
    "    ALTER TABLE shift_definitions ADD CONSTRAINT uq_shift_def_start_end UNIQUE (start_time, end_time); "
    "  END IF; "
    "END $$;",

    "CREATE TABLE IF NOT EXISTS shift_weeks ("
    " week_start DATE PRIMARY KEY,"
    " status VARCHAR(16) NOT NULL DEFAULT 'draft',"
    " published_at TIMESTAMP NULL,"
    " published_by VARCHAR(64) NULL"
    ");",

    "CREATE TABLE IF NOT EXISTS shift_assignments ("
    " id SERIAL PRIMARY KEY,"
    " week_start DATE NOT NULL,"
    " date DATE NOT NULL,"
    " employee_id VARCHAR NOT NULL,"
    " shift_def_id INT REFERENCES shift_definitions(id),"
    " status VARCHAR(8) NOT NULL DEFAULT 'ON',"
    " UNIQUE(employee_id, date)"
    ");",
]

@app.on_event("startup")
def run_startup_migrations():
    with engine.begin() as conn:
        for stmt in MIGRATIONS_SQL:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                print(f"[startup-migration] skip/err: {e}")

    # Scheduler
    try:
        if os.getenv("RUN_SCHEDULER", "1") == "1":
            start_scheduler()
            print("[scheduler] started")
        else:
            print("[scheduler] disabled by RUN_SCHEDULER")
    except Exception as e:
        print(f"[scheduler] start err: {e}")

    # LiveChat env kontrol (log)
    if os.getenv("TEXT_BASE64_TOKEN"):
        print("[livechat] env ok (TEXT_BASE64_TOKEN set)")
    else:
        print("[livechat] TEXT_BASE64_TOKEN not set; /livechat ve /report uçları 401 dönebilir")

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/_routes")
def list_routes():
    return sorted({f"{getattr(r, 'methods', {'GET'})} {getattr(r, 'path', getattr(r, 'path_regex', ''))}" for r in app.router.routes})

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
app.include_router(admin_bot_router)
app.include_router(admin_notify_router)

# ⬇️ EKLENENLER
app.include_router(shifts_router)                # /shifts
app.include_router(shift_assignments_router)     # /shift-assignments
app.include_router(shift_weeks_router)           # /shift-weeks
if _livechat_router:
    print("[livechat] router included at /livechat")
    app.include_router(_livechat_router)         # /livechat
else:
    print("[livechat] router missing")

if _livechat_report_router:
    print("[livechat-report] router included at /report")
    app.include_router(_livechat_report_router)  # /report/*
else:
    print("[livechat-report] router missing")

if _livechat_supervise_router:
    print("[livechat-supervise] router included at /report")
    app.include_router(_livechat_supervise_router)  # /report/supervise
else:
    print("[livechat-supervise] router missing")
