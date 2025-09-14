# apps/api/app/api/routes_employee_view.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timezone, timedelta

from app.deps import get_db, RolesAllowed
from app.models.events import Event
from app.models.facts import FactDaily

router = APIRouter(prefix="/employees", tags=["employees-view"])

def _parse_date(s: str | None):
    if not s: return None
    try:
        d = datetime.strptime(s, "%Y-%m-%d")
        return d.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

@router.get("/{employee_id}/activity", dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def employee_activity(
    employee_id: str,
    frm: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    dt_from = _parse_date(frm)
    dt_to   = _parse_date(to)
    q = db.query(Event).filter(Event.employee_id == employee_id).order_by(Event.ts.desc())
    if dt_from: q = q.filter(Event.ts >= dt_from)
    if dt_to:   q = q.filter(Event.ts < dt_to)
    rows = q.limit(limit).all()
    return [
        {
            "id": r.id,
            "ts": r.ts.isoformat(),
            "channel": r.source_channel,
            "type": r.type,
            "corr": r.correlation_id,
            "payload": r.payload_json,
        }
        for r in rows
    ]

@router.get("/{employee_id}/daily", dependencies=[Depends(RolesAllowed("super_admin","admin","manager"))])
def employee_daily(
    employee_id: str,
    frm: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    db: Session = Depends(get_db),
):
    # facts_daily.actor_key yerine ileride employee_id kolonu açarız; şimdilik actor_key = employee_id formatına geçmedik.
    # Geçici çözüm: facts_daily tarafını employee_id ile tutmadıysak bu uç sadece events’ten derive edilenleri gösterir.
    # Eğer facts_daily.actor_key yerine employee_id’yi yazıyorsan aşağıdaki satırı ona göre değiştir.
    q = db.query(FactDaily).filter(FactDaily.actor_key == employee_id).order_by(FactDaily.day.asc())
    # Tarih aralığı
    d_from = frm or None
    d_to = to or None
    if d_from:
        q = q.filter(FactDaily.day >= datetime.strptime(d_from, "%Y-%m-%d").date())
    if d_to:
        q = q.filter(FactDaily.day <= datetime.strptime(d_to, "%Y-%m-%d").date())
    rows = q.all()
    return [
        {
            "day": r.day.isoformat(),
            "kpi_code": r.kpi_code,
            "value": r.value,
            "samples": r.samples,
            "source": r.source,
        }
        for r in rows
    ]
