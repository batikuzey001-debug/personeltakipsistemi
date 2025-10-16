# apps/api/app/api/routes_livechat_report.py
import os, httpx
from fastapi import APIRouter, HTTPException, Query

LC = "https://api.livechatinc.com/v3.6"
LC_V35 = os.getenv("TEXT_API_URL", "https://api.livechatinc.com/v3.5")
B64 = os.getenv("TEXT_BASE64_TOKEN", "")
if not B64:
    raise HTTPException(401, "TEXT_BASE64_TOKEN missing")

HDR = {"Authorization": f"Basic {B64}", "Content-Type": "application/json", "X-API-Version": "3.6"}
HDR_V35 = {"Authorization": f"Basic {B64}", "Content-Type": "application/json"}

router = APIRouter(prefix="/report", tags=["livechat-report"])

def _day(d: str) -> tuple[str, str]:
    d = d[:10]
    return f"{d}T00:00:00Z", f"{d}T23:59:59Z"

# ---------- ART (ajan bazlı) ----------
async def _agent_art(c: httpx.AsyncClient, fr: str, to: str, email: str) -> float | None:
    q = {
        "filters.from": fr, "filters.to": to,
        "filters.agents.values": email
    }
    r = await c.get(f"{LC}/reports/chats/response_time", headers=HDR, params=q, timeout=60)
    if r.status_code != 200:
        return None
    # distribution yoksa tek gün için records.<gün>.response_time
    # GET ile distribution paramı vermedik; tek gün olduğundan yeterli
    recs = r.json().get("records") or {}
    # tek anahtar beklenir
    for _, v in recs.items():
        return v.get("response_time")
    return None

# ---------- Supervise (adaylar → detay) ----------
async def _list_chats_summary(c: httpx.AsyncClient, fr: str, to: str, page_limit=20, page_size=100):
    url = f"{LC_V35}/agent/action/list_chats"
    payload = {"filters": {"date_from": fr, "date_to": to}, "pagination": {"page": 1, "limit": page_size}}
    out = []
    for _ in range(page_limit):
        r = await c.post(url, headers=HDR_V35, json=payload, timeout=60)
        if r.status_code != 200:
            break
        j = r.json()
        items = j.get("chats_summary") or j.get("chats") or j.get("items") or []
        out.extend(items)
        nxt = j.get("next_page_id")
        if not nxt: break
        payload["pagination"]["page"] += 1
        payload["next_page_id"] = nxt
    return out

def _agent_set_from_summary(chat: dict) -> set[str]:
    s = set()
    for u in (chat.get("users") or []):
        if u.get("type") == "agent":
            em = u.get("email") or u.get("id")
            if em and "@" in em: s.add(em)
    return s

def _internal_hint(chat: dict) -> bool:
    lep = chat.get("last_event_per_type") or {}
    for ev in lep.values():
        evt = (ev or {}).get("event") or {}
        if evt.get("visibility") == "agents":
            return True
    return False

# detail: list_threads → tüm event’lerde tarama
async def _list_threads(c: httpx.AsyncClient, chat_id: str):
    url = f"{LC_V35}/agent/action/list_threads"
    r = await c.post(url, headers=HDR_V35, json={"chat_id": chat_id}, timeout=60)
    if r.status_code != 200:
        return []
    return r.json().get("threads") or []

def _count_supervise_internal(threads: list[dict]) -> tuple[set[str], int]:
    """dönen: (supervise_agents, internal_msg_count toplamı)"""
    authors = set()
    internal_cnt = 0
    for th in threads:
        for ev in th.get("events", []):
            vis = ev.get("visibility")
            aid = ev.get("author_id")
            if aid and "@" in aid and ev.get("type") in ("message","system_message","file","annotation"):
                authors.add(aid)
            if vis == "agents":
                internal_cnt += 1
    # 1’den fazla ajan mesaj yazdıysa supervise var
    supervise_agents = authors if len(authors) > 1 else set()
    return supervise_agents, internal_cnt

@router.get("/daily")
async def daily_summary(date: str = Query(..., description="YYYY-MM-DD (tek gün)")):
    fr, to = _day(date)
    async with httpx.AsyncClient(timeout=60) as c:
        # performans
        pb = {"distribution": "day", "filters": {"from": fr, "to": to}}
        r1 = await c.post(f"{LC}/reports/agents/performance", headers=HDR, json=pb);  r1.raise_for_status()
        perf = r1.json().get("records", {})  # {email:{...}}

        # rating
        rb = {"filters": {"from": fr, "to": to}}
        r2 = await c.post(f"{LC}/reports/chats/ranking", headers=HDR, json=rb);       r2.raise_for_status()
        rank = r2.json().get("records", {})

        # transfer_out (ajan bazlı)
        transfer_out = {}
        for email in perf.keys():
            q = {
              "filters.from": fr, "filters.to": to,
              "filters.event_types.values": "chat_transferred",
              "filters.agents.values": email, "distribution": "day"
            }
            r4 = await c.get(f"{LC}/reports/chats/total_chats", headers=HDR, params=q)
            if r4.status_code == 200:
                day_rec = (r4.json().get("records") or {}).get(date[:10]) or {}
                transfer_out[email] = int(day_rec.get("total") or 0)
            else:
                transfer_out[email] = 0

        # supervise adayları → summary’den seç
        summary = await _list_chats_summary(c, fr, to, page_limit=20, page_size=100)
        candidate_ids = []
        for ch in summary:
            # birden fazla agent görünüyor veya internal hint varsa detay adayı
            if len(_agent_set_from_summary(ch)) > 1 or _internal_hint(ch):
                candidate_ids.append(ch.get("id"))

        # detay tarama (sadece adaylar)
        sup_map, int_map = {}, {}
        for cid in candidate_ids[:500]:  # güvenlik sınırı
            ths = await _list_threads(c, cid)
            sup_agents, internal_cnt = _count_supervise_internal(ths)
            for em in sup_agents:
                sup_map[em] = sup_map.get(em, 0) + 1
            if internal_cnt > 0:
                # iç yazışmayı belirli ajana bağlamak için author_id bazlı sayım gerekir.
                # özet: toplamı "en çok yazan" ajanlara eşitlemek yerine genel sayaç:
                owner_candidates = {ev.get("author_id") for t in ths for ev in t.get("events", []) if ev.get("visibility")=="agents" and ev.get("author_id") and "@" in ev.get("author_id")}
                for em in owner_candidates:
                    int_map[em] = int_map.get(em, 0) + 1  # chat başına 1 artış (detay sayımı ağırlaştırmamak için)

        # ajan bazlı ART (tek tek çağrı)
        art_map = {}
        for email in perf.keys():
            art_map[email] = await _agent_art(c, fr, to, email)

    # birleşik çıktı
    rows = []
    for email, p in perf.items():
        chats = int(p.get("chats_count") or 0)
        frt = p.get("first_response_time")
        chat_sec = int(p.get("chatting_time") or 0)
        aht = (chat_sec / chats) if chats else None
        li, ac, nac = int(p.get("logged_in_time") or 0), int(p.get("accepting_chats_time") or 0), int(p.get("not_accepting_chats_time") or 0)
        rr = rank.get(email, {})
        good, bad, tot = rr.get("good"), rr.get("bad"), rr.get("total")
        csat = (good / tot * 100) if (isinstance(good,(int,float)) and isinstance(tot,(int,float)) and tot) else None

        rows.append({
            "agent_email": email,
            "total_chats": chats,
            "first_response_time_sec": frt,
            "avg_response_time_sec": art_map.get(email),   # artık ajan bazlı
            "avg_handle_time_sec": aht,
            "csat_good": good, "csat_bad": bad, "csat_total": tot,
            "csat_percent": round(csat, 2) if csat is not None else None,
            "logged_in_hours": round(li/3600, 2) if li else 0,
            "accepting_hours": round(ac/3600, 2) if ac else 0,
            "not_accepting_hours": round(nac/3600, 2) if nac else 0,
            "chatting_hours": round(chat_sec/3600, 2) if chat_sec else 0,
            "transfer_out": transfer_out.get(email, 0),
            "supervised_chats": sup_map.get(email, 0),
            "internal_msg_count": int_map.get(email, 0),
        })

    return {"date": date[:10], "count": len(rows), "rows": rows}
