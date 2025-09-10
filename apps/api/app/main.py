# apps/api/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

from app.api.routes_auth import router as auth_router
from app.api.routes_org import router as org_router
from app.api.route_seed import router as seed_router  # tek seferlik kurulum için

# V1: hızlı başlat; prod'da Alembic kullanılacak
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME)

# CORS: V1 açık; prod’da panel domain ile sınırla
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

# Router'lar
app.include_router(auth_router)
app.include_router(org_router)
app.include_router(seed_router)
