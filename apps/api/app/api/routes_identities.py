# apps/api/app/api/routes_identities.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone

from app.deps import get_db, RolesAllowed
from app.models.identities import EmployeeIdentity
from app.models.models import Employee
from app.models.events import Event

router = APIRouter(prefix="/identities", tags=["identities"])

def _parse_actor_key(key: str):
    # "uid:123" | "uname:@nick"
    if key.startswith("uid:"):
        try:
            return ("uid", int(key.split(":", 1)[1]))
        except Exception:
            return (None, None)
    if key.startswith("uname:"):
        return ("uname", key.split(":", 1)[1])
    return (None, None)

@router.get("/pending", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def list_pending(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(EmployeeIdentity)
        .filter(EmployeeIdentity.status == "pending")
        .order_by(EmployeeIdentity.inserted_at.desc())
        .offset(offset).limit(limit).all()
    )
    return [
        {
            "actor_key": r.actor_key,
            "hint_name": r.hint_name,
            "hint_team": r.hint_team,
            "inserted_at": r.inserted_at.isoformat()
        } for r in rows
    ]

@router.post("/bind", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def bind_identity(
    actor_key: str = Query(..., description="uid:123 veya uname:@nick"),
    employee_id: str | None = Query(None, description="Var olan employee_id; yoksa create_* alanlarını doldurun"),
    create_employee_id: str | None = Query(None),
    create_full_name: str | None = Query(None),
    create_team: str | None = Query(None),
    create_title: str | None = Query(None),
    create_email: str | None = Query(None),
    retro_days: int = Query(14, ge=0, le=60, description="Geriye dönük gün sayısı (eventlere employee_id yaz)"),
    db: Session = Depends(get_db),
):
    # 1) Identity var mı?
    rec = db.query(EmployeeIdentity).filter(EmployeeIdentity.actor_key == actor_key).first()
    if not rec:
        raise HTTPException(status_code=404, detail="identity not found")

    # 2) Hedef employee (var olan ya da yeni)
    if employee_id:
        emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="employee not found")
    else:
        if not (create_employee_id and create_full_name):
            raise HTTPException(status_code=400, detail="provide employee_id/full_name or existing employee_id")
        exists = db.query(Employee).filter(Employee.employee_id == create_employee_id).first()
        if exists:
            raise HTTPException(status_code=409, detail="employee_id already exists")
        emp = Employee(
            employee_id=create_employee_id,
            full_name=create_full_name,
            email=create_email,
            team_id=None,
            title=create_title,
            hired_at=None,
            status="active",
        )
        db.add(emp)
        db.flush()  # id üretimi gerekmiyor; employee_id zaten dışarıdan

    # 3) Identity'yi onayla
    rec.employee_id = emp.employee_id
    rec.status = "confirmed"
    db.add(rec)

    # 4) Geriye dönük eventlere employee_id yaz
    kind, val = _parse_actor_key(actor_key)
    if kind and retro_days > 0:
        since = datetime.now(timezone.utc) - timedelta(days=retro_days)
        if kind == "uid":
            q = db.query(Event).filter(and_(Event.from_user_id == val, Event.ts >= since))
        else:
            q = db.query(Event).filter(and_(Event.from_username == val, Event.ts >= since))
        for e in q.all():
            if not e.employee_id:
                e.employee_id = emp.employee_id
                db.add(e)

    db.commit()
    return {"ok": True, "actor_key": actor_key, "employee_id": emp.employee_id, "retro_days": retro_days}

# apps/api/app/api/routes_identities.py  → dosyanın SONUNA EKLE
from typing import Dict, Tuple

def _actor_key(uid: int | None, uname: str | None) -> str | None:
    if uid: return f"uid:{uid}"
    if uname: return f"uname:{uname}"
    return None

@router.post("/backfill-from-events", dependencies=[Depends(RolesAllowed("super_admin","admin"))])
def backfill_from_events(
    since_days: int = Query(90, ge=0, le=365, description="Kaç gün geriye bakılacak (0 = tüm veriler)"),
    auto_create: bool = Query(False, description="True ise yeni employee taslakları oluşturup bağlar"),
    db: Session = Depends(get_db),
):
    """
    Geçmiş events tablosundan actor_key üretir:
      - identities.pending kayıtları ekler (yoksa)
      - mesai payload'ından (person) isim ipucu doldurur
      - auto_create=True ise: yeni employee (draft) oluşturur ve identity'yi confirmed yapar
    """
    # 1) Zaman filtresi
    from datetime import datetime, timedelta, timezone
    since_ts = None
    if since_days > 0:
        since_ts = datetime.now(timezone.utc) - timedelta(days=since_days)

    # 2) Eventleri çek (sondan başa; aynı actor için son mesai isim ipucunu yakalamak için)
    q = db.query(Event.from_user_id, Event.from_username, Event.source_channel, Event.payload_json, Event.ts)
    if since_ts:
        q = q.filter(Event.ts >= since_ts)
    q = q.order_by(Event.ts.desc())
    evs = q.all()

    # 3) Var olan identity anahtarlarını al
    existing_keys = {r.actor_key for r in db.query(EmployeeIdentity.actor_key).all()}

    # 4) actor_key -> (hint_name, seen_channel)
    found: Dict[str, Tuple[str | None, str | None]] = {}

    for uid, uname, ch, payload, _ in evs:
        key = _actor_key(uid, uname)
        if not key or key in existing_keys or key in found:
            continue
        hint_name = None
        if ch == "mesai":
            try:
                hint_name = (payload or {}).get("person") or None
            except Exception:
                hint_name = None
        found[key] = (hint_name, ch)

    inserted = 0
    auto_created = 0

    for key, (hint_name, ch) in found.items():
        if not auto_create:
            # pending identity ekle
            db.add(EmployeeIdentity(actor_key=key, status="pending", hint_name=hint_name))
            inserted += 1
        else:
            # Taslak employee oluştur + identity'yi confirmed yap
            # employee_id üret: TG-UID-xxxxx veya TG-UNAME-@nick
            if key.startswith("uid:"):
                emp_id = f"TG-UID-{key.split(':',1)[1]}"
                full_name = hint_name or emp_id
            else:
                raw = key.split(":",1)[1]
                safe = raw.replace("@","").replace(" ","").upper()[:32]
                emp_id = f"TG-UNAME-{safe}"
                full_name = hint_name or raw

            # Çakışma varsa sonuna sayı ekle
            suffix = 1
            base_id = emp_id
            while db.query(Employee).filter(Employee.employee_id == emp_id).first():
                suffix += 1
                emp_id = f"{base_id}-{suffix}"

            emp = Employee(
                employee_id=emp_id,
                full_name=full_name,
                email=None,
                team_id=None,
                title=None,
                hired_at=None,
                status="active",
            )
            db.add(emp)
            db.flush()

            # identity confirmed
            db.add(EmployeeIdentity(actor_key=key, employee_id=emp.employee_id, status="confirmed", hint_name=hint_name))
            auto_created += 1

    db.commit()
    return {
        "ok": True,
        "since_days": since_days,
        "pending_inserted": inserted,
        "auto_created_employees": auto_created,
        "scanned_events": len(evs),
        "new_actor_keys": len(found),
    }
