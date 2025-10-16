# apps/api/app/api/routes_livechat.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

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
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{LC}/configuration/action/list_agents", headers=HDR, json={})
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()

@router.get("/chats")
async def list_chats(
    from_ts: str, to_ts: str,
    page: int = 1, limit: int = 100,
    agent_email: str | None = Query(None, description="İsteğe bağlı: ajan e-postası")
):
    _auth()
    payload = {"filters": {"date_from": from_ts, "date_to": to_ts}, "pagination": {"page": page, "limit": limit}}
    if agent_email:  # e-posta ile filtre
        payload["filters"]["agents"] = [agent_email]
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{LC}/agent/action/list_chats", headers=HDR, json=payload)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return r.json()
