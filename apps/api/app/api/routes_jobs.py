from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, date, timedelta, timezone
from app.deps import get_db, RolesAllowed
from app.models.events import Event
from app.models.facts import FactDaily

router = APIRouter(prefix="/jobs", tags=["jobs"])

K_FIRST = "KPI_FIRST_SEC"
K_CLOSE = "KPI_CLOSE_SEC"
K_KT    = "KPI_KT_COUNT"

def _actor_key(from_user_id: int | None, from_username: str | None) -> str:
    if from_user_id: return f"uid:{from_user_id}"
    if from_username: return f"uname:{from_username}"
    return "unknown"

def _to_day(dt: datetime) -> date:
    return dt.date()

@router.post("/derive/daily", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def derive_daily(
    day: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Belirtilen günde (TZ UTC varsayımıyla) reply_first / reply_close ilişkisine göre first_sec, close_sec ve kt_count üretir."""
    try:
        d = datetime.strptime(day, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid day format; expected YYYY-MM-DD")

    start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    end   = start + timedelta(days=1)

    # Güne ait tüm event'ler (yalnızca ilgili tipler)
    evs = db.query(Event).filter(
        and_(Event.ts >= start, Event.ts < end),
        Event.source_channel.in_(["bonus","finans"])
    ).all()

    # Corr id -> origin/first/close map'leri hızlı erişim için (gün dışı olan origin/first da lazım olabilir)
    # 1) Bu günün first/close'larının corr_id'lerini topla, sonra gerekli origin & first'leri tüm DB'den çek
    corr_ids_first = [e.correlation_id for e in evs if e.type == "reply_first"]
    corr_ids_close = [e.correlation_id for e in evs if e.type in ("reply_close","approve","reject")]
    corr_ids = list(set(corr_ids_first + corr_ids_close))

    if corr_ids:
        origins = {e.correlation_id: e for e in db.query(Event).filter(
            Event.correlation_id.in_(corr_ids), Event.type=="origin"
        ).all()}
        firsts_all = {}
        for e in db.query(Event).filter(
            Event.correlation_id.in_(corr_ids), Event.type=="reply_first"
        ).order_by(Event.ts.asc()).all():
            # corr_id başına ilk reply_first
            firsts_all.setdefault(e.correlation_id, e)
    else:
        origins = {}
        firsts_all = {}

    # Biriktiriciler: actor_key -> list
    acc_first: dict[str, list[float]] = {}
    acc_close: dict[str, list[float]] = {}
    acc_count: dict[str, int] = {}

    # 1) Bugünün reply_first event'lerinden FIRST_SEC hesapla (actor = yanıtı atan kişi)
    for e in evs:
        if e.type != "reply_first":
            continue
        origin = origins.get(e.correlation_id)
        if not origin:
            # origin bulunamadıysa atla
            continue
        sec = (e.ts - origin.ts).total_seconds()
        if sec < 0: 
            continue
        actor = _actor_key(e.from_user_id, e.from_username)
        acc_first.setdefault(actor, []).append(sec)
        # kt_count = reply_first sayısı (o gün)
        acc_count[actor] = acc_count.get(actor, 0) + 1

    # 2) Bugünün close (veya approve/reject) event'lerinden CLOSE_SEC hesapla (actor = close yapan kişi)
    for e in evs:
        if e.type not in ("reply_close","approve","reject"):
            continue
        base = firsts_all.get(e.correlation_id) or origins.get(e.correlation_id)
        if not base:
            continue
        sec = (e.ts - base.ts).total_seconds()
        if sec < 0:
            continue
        actor = _actor_key(e.from_user_id, e.from_username)
        acc_close.setdefault(actor, []).append(sec)

    # Çıktıları facts_daily'ye yaz
    inserted = 0
    def _upsert(actor: str, code: str, vals: list[float] | None, count: int | None):
        nonlocal inserted
        if code == K_KT:
            v = float(count or 0)
            s = int(count or 0)
        else:
            if not vals:
                return
            v = sum(vals) / len(vals)
            s = len(vals)

        db.add(FactDaily(actor_key=actor, day=d, kpi_code=code, value=v, samples=s, source="telegram"))
        inserted += 1

    for actor, vals in acc_first.items():
        _upsert(actor, K_FIRST, vals, None)
    for actor, vals in acc_close.items():
        _upsert(actor, K_CLOSE, vals, None)
    for actor, cnt in acc_count.items():
        _upsert(actor, K_KT, None, cnt)

    db.commit()
    return {"ok": True, "day": day, "inserted": inserted, "actors": len(set(list(acc_first.keys()) + list(acc_close.keys()) + list(acc_count.keys())))}
