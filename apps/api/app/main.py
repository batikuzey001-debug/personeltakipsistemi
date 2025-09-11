# apps/api/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# MODELLERİ YÜKLE (create_all yeni tabloları görsün)
import app.models.events  # raw_messages, events

# ROUTERLAR
from app.api.routes_auth import router as auth_router
from app.api.routes_org import router as org_router
from app.api.route_seed import router as seed_router
from app.api.routes_users import router as users_router
from app.api.routes_telegram import router as telegram_router
from app.api.routes_debug import router as debug_router

# V1 hızlı: Alembic yerine create_all (prod'da migration'a geçeceğiz)
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME)

# CORS: V1 geniş; prod'da panel domain'ine indir
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
