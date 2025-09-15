# apps/api/app/api/routes_reports.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Literal, Dict, List, Tuple

from app.deps import get_db, RolesAllowed
from app.models.events import Event
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

def _sign_emoji(pct: float) -> str:
    # pct > 0 => ekipten yavaş (kötü), pct < 0 => hızlı (iyi)
    if pct is None:
        return "⚪"
    if pct > 3:
        return "🔴⬆️"
    if pct < -3:
        return "🟢⬇️"
    return "⚪"  # ±3% aralığı nötr

# ---------- BONUS: kişi bazlı kapanış raporu ----------
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
    BONUS departmanı için 'kapanış süresi' raporu.
    Sütunlar: personel, işlem sayısı, Ø ilk yanıt (sn), Ø sonuçlandırma (sn), trend (ekip ort. karşı).
    - close tipleri: reply_close, approve, reject
    - base = corr_id'de reply_first varsa first.ts, yoksa origin.ts
    - ilk yanıt = first.ts - origin.ts (ikisi de varsa)
    - sadece employee_id eşleşmiş kişiler (employees.department='Bonus')
    """
    # Tarih aralığı
    dt_to = _parse_date(to) or datetime.now(timezone.utc) + timedelta(days=1)
    dt_from = _parse_date(frm) or (dt_to - timedelta(days=7))

    # Bonus departmanındaki personeller
    bonus_emp_ids = {
        r.employee_id for r in db.query(Employee.employee_id).filter(Employee.department == "Bonus").all()
    }
    if not bonus_emp_ids:
        return []

    # Close eventleri
    close_types = ("reply_close", "approve", "reject")
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
    if not close_rows:
        return []

    # İlgili corr_id seti
    corr_ids = list({e.correlation_id for e in close_rows})

    # İlk first'ler
    first_map: Dict[str, datetime] = {}
    for e in (
        db.query(Event)
        .filter(Event.correlation_id.in_(corr_ids), Event.type == "reply_first")
        .order_by(Event.ts.asc())
        .all()
    ):
        if e.correlation_id not in first_map:
            first_map[e.correlation_id] = e.ts

    # İlk origin'ler
    origin_map: Dict[str, datetime] = {}
    for e in (
        db.query(Event)
        .filter(Event.correlation_id.in_(corr_ids), Event.type == "origin")
        .order_by(Event.ts.asc())
        .all()
    ):
        if e.correlation_id not in origin_map:
            origin_map[e.correlation_id] = e.ts

    # İlk yanıt süreleri için origin->first farkları
    # corr_id bazında tek bir ilk-yanıt süresi olacak (first ve origin varsa)
    first_diff_sec_map: Dict[str, float] = {}
    for cid, fts in first_map.items():
        ots = origin_map.get(cid)
        if ots and fts >= ots:
            first_diff_sec_map[cid] = (fts - ots).total_seconds()

    # Kişi bazında topla
    per_emp_close_secs: Dict[str, List[float]] = {}
    per_emp_first_secs: Dict[str, List[float]] = {}
    per_emp_count: Dict[str, int] = {}

    # ekip ortalaması (tüm close kayıtları üzerinden)
    all_close_secs: List[float] = []

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
        per_emp_close_secs.setdefault(emp_id, []).append(sec)
        per_emp_count[emp_id] = per_emp_count.get(emp_id, 0) + 1
        all_close_secs.append(sec)

        # ilk yanıt süresi aynı corr için varsa ekle
        first_sec = first_diff_sec_map.get(c.correlation_id)
        if first_sec is not None and first_sec >= 0:
            per_emp_first_secs.setdefault(emp_id, []).append(first_sec)

    if not per_emp_close_secs:
        return []

    # Ekip ortalaması (close)
    team_avg_close_sec = mean(all_close_secs) if all_close_secs else None

    # Personel bilgileri
    emp_info: Dict[str, Tuple[str, str]] = {}
    for e in db.query(Employee).filter(Employee.employee_id.in_(list(per_emp_close_secs.keys()))).all():
        emp_info[e.employee_id] = (e.full_name or e.employee_id, e.department or "-")

    # Satırları oluştur
    rows = []
    for emp_id, close_secs in per_emp_close_secs.items():
        avg_close_sec = mean(close_secs)
        first_secs = per_emp_first_secs.get(emp_id, [])
        avg_first_sec = mean(first_secs) if first_secs else None
        # Trend: ekip ortalamasına göre
        trend_pct = None
        if team_avg_close_sec and team_avg_close_sec > 0:
            trend_pct = round(((avg_close_sec - team_avg_close_sec) / team_avg_close_sec) * 100, 0)
        emoji = _sign_emoji(trend_pct if trend_pct is not None else 0)
        full_name, dept = emp_info.get(emp_id, (emp_id, "-"))

        rows.append({
            "employee_id": emp_id,
            "full_name": full_name,
            "department": dept,
            "count_total": len(close_secs),                    # İşlem Sayısı
            "avg_first_sec": round(avg_first_sec, 1) if avg_first_sec is not None else None,  # Ø İlk Yanıt (sn)
            "avg_close_sec": round(avg_close_sec, 1),          # Ø Sonuçlandırma (sn)
            "trend": {
                "emoji": emoji,
                "pct": trend_pct,  # negatif = iyi (hızlı), pozitif = kötü (yavaş)
                "team_avg_close_sec": round(team_avg_close_sec, 1) if team_avg_close_sec else None,
            }
        })

    # Sıralama
    if order == "avg_desc":
        rows.sort(key=lambda r: (r["avg_close_sec"],), reverse=True)
    elif order == "cnt_desc":
        rows.sort(key=lambda r: (r["count_total"], r["avg_close_sec"]), reverse=True)
    else:  # avg_asc default
        rows.sort(key=lambda r: (r["avg_close_sec"], r["count_total"] * -1))

    # Sayfalama
    return rows[offset: offset + limit]
