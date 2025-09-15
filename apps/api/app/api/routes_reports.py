# apps/api/app/api/routes_reports.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Literal, Dict, List, Tuple

from app.deps import get_db, RolesAllowed
from app.models.events import Event, RawMessage
from app.models.models import Employee

router = APIRouter(prefix="/reports", tags=["reports"])

# ---------- helpers ----------
def _parse_date(s: str | None):
    if not s:
        return None
    try:
        d = datetime.strptime(s, "%Y-%m-%d")
        return d.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

def _sign_emoji(pct: float | None) -> str:
    if pct is None:
        return "⚪"
    if pct > 3:
        return "🔴⬆️"
    if pct < -3:
        return "🟢⬇️"
    return "⚪"  # ±3%

def _root_origin_ts(chat_id: int, start_msg_id: int, db: Session, cache: Dict[Tuple[int,int], datetime | None]) -> datetime | None:
    """
    Reply zincirini yukarı doğru takip ederek KÖK origin mesajının zamanını döndürür.
    RawMessage.json içindeki reply_to_message.message_id alanını kullanır.
    """
    current_id = start_msg_id
    visited = set()
    while True:
        key = (chat_id, current_id)
        if key in cache:
            return cache[key]
        if key in visited:
            cache[key] = None
            return None
        visited.add(key)

        raw: RawMessage | None = (
            db.query(RawMessage)
            .filter(RawMessage.chat_id == chat_id, RawMessage.msg_id == current_id)
            .first()
        )
        if not raw:
            cache[key] = None
            return None

        try:
            j = raw.json or {}
            rt = j.get("message") or j.get("edited_message") or j.get("channel_post") or j.get("edited_channel_post") or {}
            replied = rt.get("reply_to_message") or {}
            parent_id = replied.get("message_id")
        except Exception:
            parent_id = None

        if parent_id:
            current_id = int(parent_id)
            continue
        else:
            cache[(chat_id, start_msg_id)] = raw.ts
            return raw.ts

# ---------- BONUS: kişi bazlı kapanış ve ilk yanıt raporu (sn) ----------
@router.get(
    "/bonus/close-time",
    dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))],
)
def bonus_close_time(
    frm: str | None = Query(None, description="YYYY-MM-DD (default: son 7 gün)"),
    to: str | None = Query(None, description="YYYY-MM-DD (exclusive, default: bugün+1)"),
    order: Literal["avg_asc","avg_desc","cnt_desc"] = Query("avg_asc"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    BONUS departmanı için (employees.department='Bonus') kişi bazlı rapor.
    Sütunlar:
      - personel
      - işlem sayısı (close tipleri adedi)
      - Ø İlk Yanıt (sn): kişinin reply_first.ts - KÖK origin.ts
      - Ø Sonuçlandırma (sn): kişinin close.ts - KÖK origin.ts
      - Trend: kişinin Ø sonuçlandırması, ekip Ø sonuçlandırmasına göre (% ve emoji)
    Kurallar:
      - close tipleri: reply_close, approve, reject
      - KÖK origin, reply zinciri en baştaki mesajdır (reply_to_message zinciri takip edilir).
      - employee_id eşleşmiş kayıtlar ve department='Bonus' dikkate alınır.
    """
    dt_to = _parse_date(to) or (datetime.now(timezone.utc) + timedelta(days=1))
    dt_from = _parse_date(frm) or (dt_to - timedelta(days=7))

    # Bonus departmanındaki personeller
    bonus_emp_rows = db.query(Employee.employee_id, Employee.full_name, Employee.department).filter(Employee.department == "Bonus").all()
    bonus_emp_ids = {r[0] for r in bonus_emp_rows}
    emp_info = {r[0]: (r[1] or r[0], r[2] or "Bonus") for r in bonus_emp_rows}
    if not bonus_emp_ids:
        return []

    close_types = ("reply_close", "approve", "reject")

    # first ve close eventleri (bonus + employee_id var + tarih)
    first_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "bonus",
            Event.type == "reply_first",
            Event.employee_id.isnot(None),
            Event.employee_id.in_(bonus_emp_ids),
            Event.ts >= dt_from,
            Event.ts < dt_to,
        )
        .order_by(Event.ts.asc())
        .all()
    )
    close_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "bonus",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            Event.employee_id.in_(bonus_emp_ids),
            Event.ts >= dt_from,
            Event.ts < dt_to,
        )
        .order_by(Event.ts.asc())
        .all()
    )
    if not first_rows and not close_rows:
        return []

    # kök origin ts cache
    root_cache: Dict[Tuple[int,int], datetime | None] = {}

    # kişi bazında süreler (sn)
    per_emp_first_secs: Dict[str, List[float]] = {}
    per_emp_close_secs: Dict[str, List[float]] = {}

    # Ø İlk Yanıt: reply_first.ts - kök origin.ts
    for e in first_rows:
        root_ts = _root_origin_ts(e.chat_id, e.msg_id, db, root_cache)
        if not root_ts:
            continue
        sec = (e.ts - root_ts).total_seconds()
        if sec < 0:
            continue
        per_emp_first_secs.setdefault(e.employee_id, []).append(sec)

    # Ø Sonuçlandırma: close.ts - kök origin.ts
    for e in close_rows:
        root_ts = _root_origin_ts(e.chat_id, e.msg_id, db, root_cache)
        if not root_ts:
            continue
        sec = (e.ts - root_ts).total_seconds()
        if sec < 0:
            continue
        per_emp_close_secs.setdefault(e.employee_id, []).append(sec)

    if not per_emp_close_secs:
        return []

    # ekip Ø (close)
    all_close = [s for arr in per_emp_close_secs.values() for s in arr]
    team_avg_close_sec = mean(all_close) if all_close else None

    # satırlar
    rows = []
    for emp_id, close_secs in per_emp_close_secs.items():
        full_name, dept = emp_info.get(emp_id, (emp_id, "Bonus"))
        avg_close_sec = mean(close_secs)
        first_secs = per_emp_first_secs.get(emp_id, [])
        avg_first_sec = mean(first_secs) if first_secs else None
        trend_pct = None
        if team_avg_close_sec and team_avg_close_sec > 0:
            trend_pct = round(((avg_close_sec - team_avg_close_sec) / team_avg_close_sec) * 100, 0)

        rows.append({
            "employee_id": emp_id,
            "full_name": full_name,
            "department": dept,
            "count_total": len(close_secs),                              # İşlem Sayısı
            "avg_first_sec": int(round(avg_first_sec)) if avg_first_sec is not None else None,  # saniye (tam sayı)
            "avg_close_sec": int(round(avg_close_sec)),                  # saniye (tam sayı)
            "trend": {
                "emoji": _sign_emoji(trend_pct),
                "pct": trend_pct,
                "team_avg_close_sec": int(round(team_avg_close_sec)) if team_avg_close_sec else None,
            }
        })

    # sıralama
    if order == "avg_desc":
        rows.sort(key=lambda r: (r["avg_close_sec"],), reverse=True)
    elif order == "cnt_desc":
        rows.sort(key=lambda r: (r["count_total"], r["avg_close_sec"]), reverse=True)
    else:  # avg_asc default
        rows.sort(key=lambda r: (r["avg_close_sec"], -r["count_total"]))

    return rows[offset: offset + limit]
