from fastapi import FastAPI
from app.core.config import settings
from app.api.routes_auth import router as auth_router
from app.api.routes_org import router as org_router
from app.db.session import engine
from app.db.base import Base
from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)  # Neden: V1 hızlı başlat; üretimde Alembic'e geçilecek.

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Neden: V1 hızlı; prod'da panel domain ile sınırla.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
def healthz():
    return {"ok": True}

app.include_router(auth_router)
app.include_router(org_router)
