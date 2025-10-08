# apps/api/app/api/routes_livechat.py
import os, httpx
from fastapi import APIRouter, HTTPException

LC = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
H  = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/livechat", tags=["livechat"])

def _check():
    if not B64:
        raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

@router.get("/agents")
async def agents():
    _check()
    url = f"{LC}/configuration/agents"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(url, headers=H)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()

@router.get("/chats")
async def chats(from_ts: str, to_ts: str, page: int = 1, limit: int = 50):
    _check()
    url = f"{LC}/agent/action/list_chats"
    payload = {
        "filters": {"date_from": from_ts, "date_to": to_ts},
        "pagination": {"page": page, "limit": limit}
    }
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(url, headers=H, json=payload)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()
