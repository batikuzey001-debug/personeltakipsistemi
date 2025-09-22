from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from typing import Generator

from app.core.config import settings

# Engine
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

# Session factory
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Model base class (tüm modeller buradan extend eder)
Base = declarative_base()

# FastAPI dependency — DB oturumu aç/kapat
def get_db() -> Generator[Session, None, None]:
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
