# apps/api/app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # App
    APP_NAME: str = "Personnel API"
    DEBUG: bool = True
    TZ: str = "Europe/Istanbul"

    # DB & Auth
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGO: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Telegram / Core Bot
    TELEGRAM_WEBHOOK_SECRET: str = "CHANGE_ME"
    TG_BOT_TOKEN: str = ""                 # sendMessage için (ileride)
    TG_BONUS_CHAT_IDS: str = ""            # "-100..., -100..." (comma-separated)
    TG_FINANS_CHAT_IDS: str = ""
    TG_MESAI_CHAT_ID: str = ""             # tek ID (string bıraktık)

    # .env desteği ve fazla env'leri görmezden gel
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
