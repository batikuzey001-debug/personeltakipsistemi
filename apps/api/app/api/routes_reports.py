# apps/api/app/api/routes_reports.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Literal, Dict, List, Tuple

from app.deps import get_db, RolesAllowed
from app.models.events import Event
from app.models.models import Employee

router = APIRouter(prefix="/reports", tags=["reports"])

# -------- helpers --------
def _parse_date(s: str | None):
    if not s:
        return None
    try:
        d = datetime.strptime(s, "%Y-%m-%d")
        return d.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

def _to_minutes(sec: float) -> float:
    return round(sec / 60.0, 1)

# -------- endpoint --------
@router.get(
    "/bonus/close-time",
    dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))],
)
def bonus_close_time(
    frm: str | None = Query(None, description="YYYY-MM-DD (default: 7 gün önce)"),
    to: str | None = Query(None, description="YYYY-MM-DD (exclusive, default: bugün+1)"),
    order: Literal["avg_asc","avg_desc","cnt_desc"] = Query("avg_asc"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Bonus departmanındaki (employees.department='Bonus') personeller için
    kapanış süreleri (dakika) raporu.
    - base = aynı corr_id'de reply_first.ts varsa o, yoksa origin.ts
    - close tipleri: reply_close, approve, reject
    - yalnız employee_id dolu event'ler (eşleşmiş kişiler) dahil edilir
    """
    # Tarih aralığı
    dt_to = _parse_date(to) or datetime.now(timezone.utc) + timedelta(days=1)
    dt_from = _parse_date(frm) or (dt_to - timedelta(days=7))

    # 1) Bonus departmanındaki personeller
    bonus_emp_ids = {
        r.employee_id for r in db.query(Employee.employee_id).filter(Employee.department == "Bonus").all()
    }
    if not bonus_emp_ids:
        return []

    # 2) Kapanış eventlerini çek (bonus kanalı + close tipleri + employee_id var + tarih aralığında)
    close_types = ("reply_close", "approve", "reject")
    close_rows: List[Event] = (
        db.query(Event)
        .filter(
            Event.source_channel == "bonus",
            Event.type.in_(close_types),
            Event.employee_id.isnot(None),
            Event.ts >= dt_from,
            Event.ts < dt_to,
            Event.employee_id.in_(bonus_emp_ids),
        )
        .order_by(Event.ts.asc())
        .all()
    )
    if not close_rows:
        return []

    # 3) Bu close'ların corr_id seti → base (first veya origin) map'ini kur
    corr_ids = list({e.correlation_id for e in close_rows})
    # first'ler (ilk first alınır)
    first_map: Dict[str, datetime] = {}
    for e in (
        db.query(Event)
        .filter(Event.correlation_id.in_(corr_ids), Event.type == "reply_first")
        .order_by(Event.ts.asc())
        .all()
    ):
        if e.correlation_id not in first_map:
            first_map[e.correlation_id] = e.ts
    # origin'ler
    origin_map: Dict[str, datetime] = {}
    for e in (
        db.query(Event)
        .filter(Event.correlation_id.in_(corr_ids), Event.type == "origin")
        .order_by(Event.ts.asc())
        .all()
    ):
        if e.correlation_id not in origin_map:
            origin_map[e.correlation_id] = e.ts

    # 4) Kişi bazında kapanış sürelerini topla
    per_emp_secs: Dict[str, List[float]] = {}
    per_emp_bounds: Dict[str, Tuple[datetime, datetime]] = {}  # (first_close, last_close)
    for c in close_rows:
        base_ts = first_map.get(c.correlation_id) or origin_map.get(c.correlation_id)
        if not base_ts:
            continue
        sec = (c.ts - base_ts).total_seconds()
        if sec < 0:
            continue
        emp_id = c.employee_id
        if not emp_id:
            continue
        per_emp_secs.setdefault(emp_id, []).append(sec)
        if emp_id in per_emp_bounds:
            first_ts, last_ts = per_emp_bounds[emp_id]
            if c.ts < first_ts:
                first_ts = c.ts
            if c.ts > last_ts:
                last_ts = c.ts
            per_emp_bounds[emp_id] = (first_ts, last_ts)
        else:
            per_emp_bounds[emp_id] = (c.ts, c.ts)

    if not per_emp_secs:
        return []

    # 5) Personel bilgilerini çek
    emps: Dict[str, Tuple[str, str]] = {}  # employee_id -> (full_name, department)
    for e in db.query(Employee).filter(Employee.employee_id.in_(list(per_emp_secs.keys()))).all():
        emps[e.employee_id] = (e.full_name or e.employee_id, e.department or "-")

    # 6) İstatistikleri hesapla
    rows = []
    for emp_id, secs in per_emp_secs.items():
        mins = [_to_minutes(s) for s in secs]
        avg_min = round(sum(mins) / len(mins), 1)
        med_min = round(median(mins), 1)
        p90_min = round(sorted(mins)[int(0.9 * (len(mins) - 1))], 1) if len(mins) > 1 else avg_min
        first_ts, last_ts = per_emp_bounds.get(emp_id, (None, None))
        full_name, dept = emps.get(emp_id, (emp_id, "-"))
        rows.append({
            "employee_id": emp_id,
            "full_name": full_name,
            "department": dept,
            "count_closed": len(secs),
            "avg_close_min": avg_min,
            "p50_close_min": med_min,
            "p90_close_min": p90_min,
            "first_close_ts": first_ts.isoformat() if first_ts else None,
            "last_close_ts": last_ts.isoformat() if last_ts else None,
        })

    # 7) Sıralama
    if order == "avg_desc":
        rows.sort(key=lambda r: (r["avg_close_min"],), reverse=True)
    elif order == "cnt_desc":
        rows.sort(key=lambda r: (r["count_closed"], r["avg_close_min"]), reverse=True)
    else:  # avg_asc (default)
        rows.sort(key=lambda r: (r["avg_close_min"], r["count_closed"] * -1))

    # 8) Sayfalama
    return rows[offset: offset + limit]
