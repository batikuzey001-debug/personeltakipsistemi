# apps/api/app/api/routes_livechat.py
import os, httpx
from fastapi import APIRouter, HTTPException

LC = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
HDR = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/livechat", tags=["livechat"])

def _auth():
    if not B64:
        raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

@router.get("/agents")
async def list_agents():
    _auth()
    url = f"{LC}/configuration/action/list_agents"
    # fields/filters opsiyonel; boş body ile çalışır
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, headers=HDR, json={})
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()

@router.get("/chats")
async def list_chats(from_ts: str, to_ts: str, page: int = 1, limit: int = 50):
    _auth()
    url = f"{LC}/agent/action/list_chats"
    payload = {"filters": {"date_from": from_ts, "date_to": to_ts},
               "pagination": {"page": page, "limit": limit}}
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(url, headers=HDR, json=payload)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()
