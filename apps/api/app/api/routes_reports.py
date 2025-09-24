# apps/api/app/api/routes_reports.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
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
    """Reply zincirini yukarı takip edip kök origin ts döndürür."""
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
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
    min_kt: int = Query(5, ge=0, le=1000, description="En az kaç reply_first (KT) olan personel dahil edilsin"),
    db: Session = Depends(get_db),
):
    """
    BONUS departmanı için kişi bazlı rapor (+ min_kt filtresi).
    İşlem = close tipleri (reply_close/approve/reject)
    Ø İlk Yanıt = reply_first.ts − kök origin.ts
    Ø Sonuçlandırma = close.ts − kök origin.ts
    Trend = kişinin Ø sonuçlandırması vs ekip Ø (son 7 gün)
    """
    dt_to = _parse_date(to) or (datetime.now(timezone.utc) + timedelta(days=1))
    dt_from = _parse_date(frm) or (dt_to - timedelta(days=7))

    trend_to = datetime.now(timezone.utc) + timedelta(days=1)
    trend_from = trend_to - timedelta(days=7)

    # Bonus çalışanları
    bonus_emp_rows = db.query(Employee.employee_id, Employee.full_name, Employee.department)\
                       .filter(Employee.department == "Bonus").all()
    bonus_emp_ids = {r[0] for r in bonus_emp_rows}
    emp_info = {r[0]: (r[1] or r[0], r[2] or "Bonus") for r in bonus_emp_rows}
    if not bonus_emp_ids:
        return []

    close_types = ("reply_close", "approve", "reject")

    first_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "bonus",
            Event.type == "reply_first",
            Event.employee_id.isnot(None),
            Event.employee_id.in_(bonus_emp_ids),
            Event.ts >= dt_from, Event.ts < dt_to,
        ).order_by(Event.ts.asc()).all()
    )
    close_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "bonus",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            Event.employee_id.in_(bonus_emp_ids),
            Event.ts >= dt_from, Event.ts < dt_to,
        ).order_by(Event.ts.asc()).all()
    )
    if not first_rows and not close_rows:
        return []

    # Kişi bazında metrikler + KT sayacı
    root_cache: Dict[Tuple[int,int], datetime | None] = {}
    per_emp_first_secs: Dict[str, List[float]] = {}
    per_emp_close_secs: Dict[str, List[float]] = {}
    per_emp_first_count: Dict[str, int] = {}

    for e in first_rows:
        rts = _root_origin_ts(e.chat_id, e.msg_id, db, root_cache)
        if not rts: 
            continue
        sec = (e.ts - rts).total_seconds()
        if sec >= 0:
            per_emp_first_secs.setdefault(e.employee_id, []).append(sec)
            per_emp_first_count[e.employee_id] = per_emp_first_count.get(e.employee_id, 0) + 1  # KT++

    for e in close_rows:
        rts = _root_origin_ts(e.chat_id, e.msg_id, db, root_cache)
        if not rts: 
            continue
        sec = (e.ts - rts).total_seconds()
        if sec >= 0:
            per_emp_close_secs.setdefault(e.employee_id, []).append(sec)

    if not per_emp_close_secs:
        return []

    # Ekip Ø (trend baz)
    team_close_trend_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "bonus",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            Event.employee_id.in_(bonus_emp_ids),
            Event.ts >= trend_from, Event.ts < trend_to,
        ).all()
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

    rows = []
    for emp_id, close_secs in per_emp_close_secs.items():
        # KT eşiği
        kt_cnt = per_emp_first_count.get(emp_id, 0)
        if min_kt > 0 and kt_cnt < min_kt:
            continue

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

    if order == "avg_desc":
        rows.sort(key=lambda r: (r["avg_close_sec"],), reverse=True)
    elif order == "cnt_desc":
        rows.sort(key=lambda r: (r["count_total"], r["avg_close_sec"]), reverse=True)
    else:
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
    limit: int = Query(500, ge=1, le=500),  # Bonus ile aynı sınırlar
    offset: int = Query(0, ge=0),
    min_kt: int = Query(5, ge=0, le=1000, description="En az kaç reply_first (KT) olan personel dahil edilsin"),
    db: Session = Depends(get_db),
):
    """
    FINANS kanalı için kişi bazlı rapor (Bonus mantığıyla + min_kt filtresi).
    - Kanal: Event.source_channel == 'finans'
    - Kişi: employee_id IS NOT NULL
    - Şema: Bonus ile birebir (Row[])
    """
    dt_to = _parse_date(to) or (datetime.now(timezone.utc) + timedelta(days=1))
    dt_from = _parse_date(frm) or (dt_to - timedelta(days=7))

    trend_to = datetime.now(timezone.utc) + timedelta(days=1)
    trend_from = trend_to - timedelta(days=7)

    close_types = ("reply_close", "approve", "reject")

    # İsim/departman lookup
    all_emp_rows = db.query(Employee.employee_id, Employee.full_name, Employee.department).all()
    emp_info: Dict[str, Tuple[str, str]] = {r[0]: (r[1] or r[0], r[2] or "-") for r in all_emp_rows}

    first_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "finans",
            Event.type == "reply_first",
            Event.employee_id.isnot(None),
            Event.ts >= dt_from, Event.ts < dt_to,
        ).order_by(Event.ts.asc()).all()
    )
    close_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "finans",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            Event.ts >= dt_from, Event.ts < dt_to,
        ).order_by(Event.ts.asc()).all()
    )
    if not first_rows and not close_rows:
        return []

    # Kişi bazında metrikler + KT sayacı
    root_cache: Dict[Tuple[int,int], datetime | None] = {}
    per_emp_first_secs: Dict[str, List[float]] = {}
    per_emp_close_secs: Dict[str, List[float]] = {}
    per_emp_first_count: Dict[str, int] = {}

    for e in first_rows:
        rts = _root_origin_ts(e.chat_id, e.msg_id, db, root_cache)
        if not rts: 
            continue
        sec = (e.ts - rts).total_seconds()
        if sec >= 0:
            per_emp_first_secs.setdefault(e.employee_id, []).append(sec)
            per_emp_first_count[e.employee_id] = per_emp_first_count.get(e.employee_id, 0) + 1  # KT++

    for e in close_rows:
        rts = _root_origin_ts(e.chat_id, e.msg_id, db, root_cache)
        if not rts: 
            continue
        sec = (e.ts - rts).total_seconds()
        if sec >= 0:
            per_emp_close_secs.setdefault(e.employee_id, []).append(sec)

    if not per_emp_close_secs:
        return []

    # Ekip Ø (trend baz)
    team_close_trend_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "finans",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            Event.ts >= trend_from, Event.ts < trend_to,
        ).all()
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

    rows = []
    for emp_id, close_secs in per_emp_close_secs.items():
        # KT eşiği
        kt_cnt = per_emp_first_count.get(emp_id, 0)
        if min_kt > 0 and kt_cnt < min_kt:
            continue

        full_name, dept = emp_info.get(emp_id, (emp_id, "-"))
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

    if order == "avg_desc":
        rows.sort(key=lambda r: (r["avg_close_sec"],), reverse=True)
    elif order == "cnt_desc":
        rows.sort(key=lambda r: (r["count_total"], r["avg_close_sec"]), reverse=True)
    else:
        rows.sort(key=lambda r: (r["avg_close_sec"], -r["count_total"]))

    return rows[offset: offset + limit]


# apps/api/app/api/routes_reports.py
# ... (dosyanızın mevcut içeriği aynen kalsın; bu bloğu en alta ekleyin) ...

from sqlalchemy import func

CloseTypes = ("approve", "reply_close", "reject")

def _threads_core(
    db: Session,
    channel: Literal["bonus", "finans"],
    frm: str | None,
    to: str | None,
    order: Literal["close_desc","close_asc","dur_asc","dur_desc"] = "close_desc",
    limit: int = 200,
    offset: int = 0,
    sla_sec: int = 900,
):
    """
    Thread bazlı rapor çekirdeği:
    - Aralık: KAPANIŞ tarihine göre (frm ≤ first_close_ts < to)
    - İlk kapanışı yapan kişi/close_type döner
    - Süreler: origin→first_reply ve origin→first_close
    """
    # Tarih aralığı (UTC)
    dt_to = _parse_date(to) or (datetime.now(timezone.utc) + timedelta(days=1))
    dt_from = _parse_date(frm) or (dt_to - timedelta(days=1))  # varsayılan: bugün

    # 1) Bu aralıkta KAPANAN thread'leri yakala (ilk kapanış)
    close_rows = (
        db.query(
            Event.correlation_id.label("corr"),
            Event.employee_id.label("closer_emp"),
            Event.type.label("close_type"),
            Event.ts.label("close_ts"),
            Event.chat_id.label("close_chat_id"),
            Event.msg_id.label("close_msg_id"),
        )
        .filter(
            Event.source_channel == channel,
            Event.type.in_(CloseTypes),
            Event.ts >= dt_from,
            Event.ts < dt_to,
        )
        .order_by(Event.correlation_id.asc(), Event.ts.asc())
        .all()
    )

    if not close_rows:
        return []

    # İlk kapanışları seç (corr başına ilk kayıt)
    first_close_by_corr: Dict[str, Dict] = {}
    for r in close_rows:
        c = r.corr
        if c not in first_close_by_corr:
            first_close_by_corr[c] = {
                "corr": c,
                "first_close_ts": r.close_ts,
                "close_type": r.close_type,
                "closer_emp": r.closer_emp,
                "close_chat_id": r.close_chat_id,
                "close_msg_id": r.close_msg_id,
            }

    corrs = list(first_close_by_corr.keys())

    # 2) Origin MIN(ts) (corr bazında)
    origin_rows = (
        db.query(
            Event.correlation_id.label("corr"),
            func.min(Event.ts).label("origin_ts"),
        )
        .filter(
            Event.source_channel == channel,
            Event.type == "origin",
            Event.correlation_id.in_(corrs),
        )
        .group_by(Event.correlation_id)
        .all()
    )
    origin_by_corr = {r.corr: r.origin_ts for r in origin_rows}

    # 3) First reply MIN(ts) (corr bazında)
    first_rows = (
        db.query(
            Event.correlation_id.label("corr"),
            func.min(Event.ts).label("first_reply_ts"),
        )
        .filter(
            Event.source_channel == channel,
            Event.type == "reply_first",
            Event.correlation_id.in_(corrs),
        )
        .group_by(Event.correlation_id)
        .all()
    )
    first_by_corr = {r.corr: r.first_reply_ts for r in first_rows}

    # 4) Personel isim/department lookup (tek sefer)
    emp_lookup = {
        e.employee_id: (e.full_name or e.employee_id, e.department or "-")
        for e in db.query(Employee.employee_id, Employee.full_name, Employee.department).all()
    }

    # 5) Satırları kur
    rows = []
    for corr, fc in first_close_by_corr.items():
        origin_ts = origin_by_corr.get(corr)
        if not origin_ts:
            # origin yoksa süreleri hesaplayamayız; yine de satır döndürelim mi? -> Atlıyoruz.
            continue

        first_reply_ts = first_by_corr.get(corr)
        first_close_ts = fc["first_close_ts"]

        first_resp = (first_reply_ts - origin_ts).total_seconds() if first_reply_ts else None
        close_dur = (first_close_ts - origin_ts).total_seconds() if first_close_ts else None

        emp_id = fc["closer_emp"]
        full_name, dept = emp_lookup.get(emp_id, (emp_id or "-", "-"))

        rows.append({
            "corr": corr,
            "origin_ts": origin_ts,
            "first_reply_ts": first_reply_ts,
            "first_close_ts": first_close_ts,
            "close_type": fc["close_type"],
            "closer_employee_id": emp_id,
            "closer_full_name": full_name,
            "closer_department": dept,
            "first_response_sec": int(first_resp) if first_resp is not None and first_resp >= 0 else None,
            "close_sec": int(close_dur) if close_dur is not None and close_dur >= 0 else None,
            "sla_breach": (close_dur is not None and close_dur > sla_sec),
            "close_chat_id": fc["close_chat_id"],
            "close_msg_id": fc["close_msg_id"],
        })

    # 6) Sıralama
    if order == "close_asc":
        rows.sort(key=lambda r: (r["first_close_ts"] or datetime.max))
    elif order == "dur_asc":
        rows.sort(key=lambda r: (r["close_sec"] if r["close_sec"] is not None else 10**12))
    elif order == "dur_desc":
        rows.sort(key=lambda r: (r["close_sec"] if r["close_sec"] is not None else -1), reverse=True)
    else:  # close_desc
        rows.sort(key=lambda r: (r["first_close_ts"] or datetime.min), reverse=True)

    return rows[offset: offset + limit]

# ---------- THREAD RAPORLARI ----------
@router.get(
    "/finance/threads",
    dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))],
)
def finance_threads(
    frm: str | None = Query(None, description="YYYY-MM-DD (default: bugün)"),
    to: str | None = Query(None, description="YYYY-MM-DD (exclusive)"),
    order: Literal["close_desc","close_asc","dur_asc","dur_desc"] = Query("close_desc"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sla_sec: int = Query(900, ge=1, le=86400, description="SLA eşiği (sn)"),
    db: Session = Depends(get_db),
):
    """
    Finans kanalı — thread bazlı günlük rapor.
    Kapanışa göre aralık; ilk kapanış & süreler & kişi bilgisi.
    """
    return _threads_core(db, "finans", frm, to, order, limit, offset, sla_sec)

@router.get(
    "/bonus/threads",
    dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))],
)
def bonus_threads(
    frm: str | None = Query(None, description="YYYY-MM-DD (default: bugün)"),
    to: str | None = Query(None, description="YYYY-MM-DD (exclusive)"),
    order: Literal["close_desc","close_asc","dur_asc","dur_desc"] = Query("close_desc"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sla_sec: int = Query(900, ge=1, le=86400, description="SLA eşiği (sn)"),
    db: Session = Depends(get_db),
):
    """
    Bonus kanalı — thread bazlı günlük rapor.
    Kapanışa göre aralık; ilk kapanış & süreler & kişi bilgisi.
    """
    return _threads_core(db, "bonus", frm, to, order, limit, offset, sla_sec)
