# apps/api/app/api/routes_reports_finance.py
from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional, Literal, TypedDict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(prefix="/reports/finance", tags=["reports:finance"])

# ---- ŞEMA/Tablo adları ----
EVENTS_TABLE = "events"
EMPLOYEES_TABLE = "employees"

# Kolon adları
TS_COL = "ts"
TYPE_COL = "type"
EMPLOYEE_ID_COL = "employee_id"
EMPLOYEE_FULLNAME_COL = "full_name"
EMPLOYEE_DEPT_COL = "department"

# Thread kolonu (şimdilik sabit; kanalı daha sonra ekleyebiliriz)
THREAD_COL = "correlation_id"

FIRST_REPLY_TYPES = ("reply_first",)
CLOSE_TYPES = ("approve", "reply_close", "reject")
DEPT_NAME = "Finans"  # employees.department filtresi

# ---- Panel (Bonus) ile birebir uyumlu şema ----
class Trend(TypedDict):
    emoji: str
    pct: float | None
    team_avg_close_sec: float | None

class Row(TypedDict):
    employee_id: str
    full_name: str
    department: str
    count_total: int
    avg_first_sec: float | None
    avg_close_sec: float
    trend: Trend


def _parse_date(val: Optional[str], default_dt: datetime) -> datetime:
    if not val:
        return default_dt
    try:
        return datetime.fromisoformat(val)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid date: {val}")


def _order_sql(order: str) -> str:
    mapping = {
        "avg_asc": "avg_close_sec ASC, count_total DESC",
        "avg_desc": "avg_close_sec DESC, count_total DESC",
        "cnt_desc": "count_total DESC, avg_close_sec ASC",
    }
    return mapping.get(order, mapping["avg_asc"])


def _sql_finance_without_channel(order_clause: str) -> str:
    """
    Kanal sütunu adı belirsiz olduğu için yalnızca departman filtresi ile hesaplanır.
    """
    return f"""
    WITH
    origin AS (
      SELECT
        e.{EMPLOYEE_ID_COL} AS employee_id,
        e.{THREAD_COL}      AS thread_key,
        MIN(e.{TS_COL})     AS origin_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{TYPE_COL} = 'origin'
      GROUP BY 1,2
    ),
    first_reply AS (
      SELECT
        e.{THREAD_COL}  AS thread_key,
        MIN(e.{TS_COL}) AS first_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{TYPE_COL} IN :first_types
      GROUP BY 1
    ),
    first_close AS (
      SELECT
        e.{THREAD_COL}  AS thread_key,
        MIN(e.{TS_COL}) AS close_ts
      FROM {EVENTS_TABLE} e
      WHERE e.{TYPE_COL} IN :close_types
      GROUP BY 1
    ),
    joined AS (
      SELECT
        o.employee_id,
        o.thread_key,
        o.origin_ts,
        fr.first_ts,
        fc.close_ts
      FROM origin o
      LEFT JOIN first_reply fr ON fr.thread_key = o.thread_key
      LEFT JOIN first_close fc ON fc.thread_key = o.thread_key
    ),
    ranged AS (
      SELECT *
      FROM joined
      WHERE origin_ts >= :frm AND origin_ts < :to
    ),
    per_thread AS (
      SELECT
        r.employee_id,
        r.origin_ts,
        r.first_ts,
        r.close_ts,
        EXTRACT(EPOCH FROM (r.first_ts  - r.origin_ts)) AS first_sec,
        EXTRACT(EPOCH FROM (r.close_ts  - r.origin_ts)) AS close_sec
      FROM ranged r
      WHERE r.close_ts IS NOT NULL
    ),
    per_emp AS (
      SELECT
        p.employee_id,
        COUNT(*)         AS count_total,
        AVG(p.first_sec) AS avg_first_sec,
        AVG(p.close_sec) AS avg_close_sec
      FROM per_thread p
      GROUP BY 1
    ),
    team_7d AS (
      SELECT
        AVG(EXTRACT(EPOCH FROM (fc.close_ts - o.origin_ts))) AS team_avg_close_sec
      FROM origin o
      JOIN first_close fc ON fc.thread_key = o.thread_key
      WHERE o.origin_ts >= :to - INTERVAL '7 day' AND o.origin_ts < :to
    )
    SELECT
      emp.{EMPLOYEE_ID_COL}       AS employee_id,
      emp.{EMPLOYEE_FULLNAME_COL} AS full_name,
      emp.{EMPLOYEE_DEPT_COL}     AS department,
      per_emp.count_total,
      per_emp.avg_first_sec,
      per_emp.avg_close_sec,
      team.team_avg_close_sec
    FROM per_emp
    JOIN {EMPLOYEES_TABLE} emp ON emp.{EMPLOYEE_ID_COL} = per_emp.employee_id
    LEFT JOIN team_7d team ON TRUE
    WHERE emp.{EMPLOYEE_DEPT_COL} = :dept_name
    ORDER BY {order_clause}
    LIMIT :limit
    ;
    """


def _to_float(x: object) -> float | None:
    """Decimal/str/int → float; None ise None."""
    if x is None:
        return None
    try:
        return float(x)
    except Exception:
        return None


def _trend_emoji(pct: Optional[float]) -> str:
    if pct is None:
        return "•"
    return "🟢" if pct >= 0 else "🔴"


@router.get("/close-time", response_model=list[Row])
def finance_close_time(
    frm: Optional[str] = Query(None, description="YYYY-MM-DD"),
    to: Optional[str] = Query(None, description="YYYY-MM-DD (exclusive)"),
    order: Literal["avg_asc", "avg_desc", "cnt_desc"] = "avg_asc",
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Finance (departman=Finans) kapanış performansı — Bonus şemasına birebir Row[] döner.
    """
    today = datetime.utcnow().date()
    _frm = _parse_date(frm, default_dt=datetime.combine(today - timedelta(days=6), datetime.min.time()))
    _to = _parse_date(to, default_dt=datetime.combine(today + timedelta(days=1), datetime.min.time()))

    sql = _sql_finance_without_channel(order_clause=_order_sql(order))
    params = {
        "first_types": FIRST_REPLY_TYPES,
        "close_types": CLOSE_TYPES,
        "frm": _frm,
        "to": _to,
        "dept_name": DEPT_NAME,
        "limit": limit,
    }

    try:
        rows = db.execute(text(sql), params).mappings().all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Finance close-time query failed (department-only). Error: {exc}")

    out: List[Row] = []
    team_avg = _to_float(rows[0]["team_avg_close_sec"]) if rows else None

    for r in rows:
        avg_close = _to_float(r["avg_close_sec"])
        avg_first = _to_float(r["avg_first_sec"])

        # Trend: ekibin son 7g ortalamasına göre (pozitif = daha hızlı)
        if team_avg is not None and team_avg > 0 and avg_close is not None:
            pct = round((team_avg - avg_close) * 100.0 / team_avg, 2)
        else:
            pct = None

        out.append(
            Row(
                employee_id=r["employee_id"],
                full_name=r["full_name"],
                department=r["department"],
                count_total=int(r["count_total"]),
                avg_first_sec=avg_first,
                avg_close_sec=avg_close or 0.0,
                trend=Trend(
                    emoji=_trend_emoji(pct),
                    pct=pct,
                    team_avg_close_sec=team_avg,
                ),
            )
        )

    return out
