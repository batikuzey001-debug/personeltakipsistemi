# app/jobs/livechat_ingest.py
import os, httpx
from sqlalchemy import text
from app.db.session import engine

LC = os.getenv("TEXT_API_URL", "https://api.text.com/v3.3")
B64 = os.environ["TEXT_BASE64_TOKEN"]
H  = {"Authorization": f"Basic {B64}"}

async def ingest_agents():
    async with httpx.AsyncClient(timeout=30) as c:
        r = await
