from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Personnel API"
    DEBUG: bool = True
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGO: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    TZ: str = "Europe/Istanbul"

    class Config:
        env_file = ".env"

settings = Settings()
