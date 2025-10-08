# app/routes/livechat.py
import os, httpx
from fastapi import APIRouter, HTTPException

LC = os.getenv("TEXT_API_URL", "https://api.text.com/v3.3")
B64 = os.environ["TEXT_BASE64_TOKEN"]

r = APIRouter(prefix="/livechat", tags=["livechat"])

@r.get("/agents")
async def agents():
    async with httpx.AsyncClient(timeout=30) as c:
        h = {"Authorization": f"Basic {B64}"}
        res = await c.get(f"{LC}/agents", headers=h)
        if res.status_code != 200:
            raise HTTPException(res.status_code, res.text)
        return res.json()

@r.get("/chats")
async def chats(from_ts: str, to_ts: str, page: str | None = None):
    params = {"from": from_ts, "to": to_ts}
    if page: params["page"] = page  # varsa sayfalama
    async with httpx.AsyncClient(timeout=60) as c:
        h = {"Authorization": f"Basic {B64}"}
        res = await c.get(f"{LC}/chats", headers=h, params=params)
        if res.status_code != 200:
            raise HTTPException(res.status_code, res.text)
        return res.json()
