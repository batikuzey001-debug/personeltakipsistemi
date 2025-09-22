# apps/api/app/api/routes_reports.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Literal, Dict, List, Tuple, Set

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
    Reply zincirini yukarı takip ederek KÖK origin zamanını döndürür.
    RawMessage.json içindeki reply_to_message.message_id alanı kullanılır.
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
    - İşlem Sayısı = close tipleri adedi (reply_close/approve/reject)
    - Ø İlk Yanıt (sn) = kişinin reply_first.ts − kök origin.ts
    - Ø Sonuçlandırma (sn) = kişinin close.ts − kök origin.ts
    - Trend = kişinin Ø Sonuçlandırma (seçilen aralık) vs **EKİP Ø Son 7 Gün**
    """
    # Seçilen aralık (kişisel metrikler)
    dt_to = _parse_date(to) or (datetime.now(timezone.utc) + timedelta(days=1))
    dt_from = _parse_date(frm) or (dt_to - timedelta(days=7))

    # Trend için baz aralık (her zaman SON 7 GÜN)
    trend_to = datetime.now(timezone.utc) + timedelta(days=1)
    trend_from = trend_to - timedelta(days=7)

    # Bonus departmanındaki personeller
    bonus_emp_rows = db.query(Employee.employee_id, Employee.full_name, Employee.department)\
                       .filter(Employee.department == "Bonus").all()
    bonus_emp_ids = {r[0] for r in bonus_emp_rows}
    emp_info = {r[0]: (r[1] or r[0], r[2] or "Bonus") for r in bonus_emp_rows}
    if not bonus_emp_ids:
        return []

    close_types = ("reply_close", "approve", "reject")

    # first ve close eventleri (seçili aralık)
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

    root_cache: Dict[Tuple[int,int], datetime | None] = {}
    per_emp_first_secs: Dict[str, List[float]] = {}
    per_emp_close_secs: Dict[str, List[float]] = {}

    # Ø İlk Yanıt
    for e in first_rows:
        root_ts = _root_origin_ts(e.chat_id, e.msg_id, db, root_cache)
        if not root_ts:
            continue
        sec = (e.ts - root_ts).total_seconds()
        if sec < 0:
            continue
        per_emp_first_secs.setdefault(e.employee_id, []).append(sec)

    # Ø Sonuçlandırma
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

    # ------- Ekip Ø SON 7 GÜN (trend için sabit baz) -------
    team_close_trend_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "bonus",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            Event.employee_id.in_(bonus_emp_ids),
            Event.ts >= trend_from,
            Event.ts < trend_to,
        )
        .all()
    )
    team_root_cache: Dict[Tuple[int,int], datetime | None] = {}
    team_secs: List[float] = []
    for e in team_close_trend_rows:
        rts = _root_origin_ts(e.chat_id, e.msg_id, db, team_root_cache)
        if not rts:
            continue
        sec = (e.ts - rts).total_seconds()
        if sec >= 0:
            team_secs.append(sec)
    team_avg_close_sec = mean(team_secs) if team_secs else None
    # -------------------------------------------------------

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
            "count_total": len(close_secs),
            "avg_first_sec": int(round(avg_first_sec)) if avg_first_sec is not None else None,
            "avg_close_sec": int(round(avg_close_sec)),
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


# ---------- FINANS: kişi bazlı kapanış ve ilk yanıt raporu (sn) ----------
@router.get(
    "/finance/close-time",
    dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))],
)
def finance_close_time(
    frm: str | None = Query(None, description="YYYY-MM-DD (default: son 7 gün)"),
    to: str | None = Query(None, description="YYYY-MM-DD (exclusive, default: bugün+1)"),
    order: Literal["avg_asc","avg_desc","cnt_desc"] = Query("avg_asc"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    FINANS departmanı için (employees.department='Finans') kişi bazlı rapor.
    Bonus raporuyla aynı şema ve mantık; sadece channel/department farklı.
    Fallback: Eğer 'Finans' departmanında kişi yoksa, seçilen aralıktaki finans kapanışlarını yapan
    employee_id'lere göre liste oluşturulur.
    """
    # Seçilen aralık
    dt_to = _parse_date(to) or (datetime.now(timezone.utc) + timedelta(days=1))
    dt_from = _parse_date(frm) or (dt_to - timedelta(days=7))

    # Trend için sabit baz (son 7 gün, bağımsız)
    trend_to = datetime.now(timezone.utc) + timedelta(days=1)
    trend_from = trend_to - timedelta(days=7)

    close_types = ("reply_close", "approve", "reject")

    # Finans departmanı çalışanları
    fin_emp_rows = db.query(Employee.employee_id, Employee.full_name, Employee.department)\
                     .filter(Employee.department == "Finans").all()
    fin_emp_ids: Set[str] = {r[0] for r in fin_emp_rows}
    emp_info: Dict[str, Tuple[str, str]] = {r[0]: (r[1] or r[0], r[2] or "Finans") for r in fin_emp_rows}

    # Fallback: departmanda kimse yoksa, seçili aralıkta finans kapanışı yapanlardan topla
    if not fin_emp_ids:
        closer_ids = {
            e.employee_id
            for e in db.query(Event.employee_id)
                       .filter(
                           Event.source_channel == "finans",
                           Event.type.in_(close_types),
                           Event.employee_id.isnot(None),
                           Event.ts >= dt_from, Event.ts < dt_to,
                       )
                       .distinct()
                       .all()
            if e.employee_id
        }
        if not closer_ids:
            return []
        # Bu id'ler için isim/departman çek
        emps = db.query(Employee.employee_id, Employee.full_name, Employee.department)\
                 .filter(Employee.employee_id.in_(closer_ids)).all()
        fin_emp_ids = {e[0] for e in emps}
        emp_info.update({e[0]: (e[1] or e[0], e[2] or "Finans") for e in emps})

    # first ve close eventleri (seçili aralık)
    first_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "finans",
            Event.type == "reply_first",
            Event.employee_id.isnot(None),
            Event.employee_id.in_(fin_emp_ids),
            Event.ts >= dt_from,
            Event.ts < dt_to,
        )
        .order_by(Event.ts.asc())
        .all()
    )
    close_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "finans",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            Event.employee_id.in_(fin_emp_ids),
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

    # Ø İlk Yanıt
    for e in first_rows:
        root_ts = _root_origin_ts(e.chat_id, e.msg_id, db, root_cache)
        if not root_ts:
            continue
        sec = (e.ts - root_ts).total_seconds()
        if sec < 0:
            continue
        per_emp_first_secs.setdefault(e.employee_id, []).append(sec)

    # Ø Sonuçlandırma
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

    # ------- Finans Ekip Ø SON 7 GÜN (trend için) -------
    team_close_trend_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "finans",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            # Trend hesabında departman filtresi: sadece finans çalışanları
            Event.employee_id.in_(fin_emp_ids),
            Event.ts >= trend_from,
            Event.ts < trend_to,
        )
        .all()
    )
    team_root_cache: Dict[Tuple[int,int], datetime | None] = {}
    team_secs: List[float] = []
    for e in team_close_trend_rows:
        rts = _root_origin_ts(e.chat_id, e.msg_id, db, team_root_cache)
        if not rts:
            continue
        sec = (e.ts - rts).total_seconds()
        if sec >= 0:
            team_secs.append(sec)
    team_avg_close_sec = mean(team_secs) if team_secs else None
    # ----------------------------------------------------

    # satırlar
    rows = []
    for emp_id, close_secs in per_emp_close_secs.items():
        full_name, dept = emp_info.get(emp_id, (emp_id, "Finans"))
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
            "count_total": len(close_secs),
            "avg_first_sec": int(round(avg_first_sec)) if avg_first_sec is not None else None,
            "avg_close_sec": int(round(avg_close_sec)),
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
