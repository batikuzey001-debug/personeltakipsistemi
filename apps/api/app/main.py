# apps/api/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

from app.api.routes_auth import router as auth_router
from app.api.routes_org import router as org_router
from app.api.route_seed import router as seed_router
from app.api.routes_users import router as users_router  # <- EKLENDİ

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME)

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

app.include_router(auth_router)
app.include_router(org_router)
app.include_router(seed_router)
app.include_router(users_router)  # <- EKLENDİ
