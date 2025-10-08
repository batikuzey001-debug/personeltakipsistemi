# apps/api/app/api/routes_livechat.py
import os
import httpx
from fastapi import APIRouter, HTTPException

LC_BASE = os.getenv("TEXT_API_URL", "https://api.text.com/v3.3")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")

router = APIRouter(prefix="/livechat", tags=["livechat"])

def _auth():
    if not B64:
        raise HTTPException(401, "TEXT_BASE64_TOKEN missing")
    return {"Authorization": f"Basic {B64}"}

@router.get("/agents")
async def list_agents():
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{LC_BASE}/agents", headers=_auth())
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()

@router.get("/chats")
async def list_chats(from_ts: str, to_ts: str, page: str | None = None):
    params = {"from": from_ts, "to": to_ts}
    if page:
        params["page"] = page
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(f"{LC_BASE}/chats", headers=_auth(), params=params)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()
