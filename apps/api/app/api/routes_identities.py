# apps/api/app/api/routes_identities.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta, timezone

from app.deps import get_db, RolesAllowed
from app.models.identities import EmployeeIdentity
from app.models.models import Employee
from app.models.events import Event

router = APIRouter(prefix="/identities", tags=["identities"])

# ---------------- helpers ----------------
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

def _next_rd_id(db: Session) -> str:
    last = (
        db.query(Employee)
        .filter(Employee.employee_id.like("RD-%"))
        .order_by(Employee.employee_id.desc())
        .first()
    )
    last_num = 0
    if last and last.employee_id.startswith("RD-"):
        try:
            last_num = int(last.employee_id.split("-", 1)[1])
        except Exception:
            last_num = 0
    next_num = last_num + 1
    return f"RD-{next_num:03d}"

# ---------------- models ----------------
class BindIn(BaseModel):
    actor_key: str
    create_full_name: str | None = None
    employee_id: str | None = None            # boşsa RD-xxx otomatik
    create_department: str | None = None      # "Call Center" | "Canlı" | "Finans" | "Bonus" | "Admin"
    retro_days: int = 14

# --------------- endpoints ----------------
@router.get("/pending", dependencies=[Depends(RolesAllowed("super_admin", "admin"))])
def list_pending(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(EmployeeIdentity)
        .filter(EmployeeIdentity.status == "pending")
        .order_by(EmployeeIdentity.inserted_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "actor_key": r.actor_key,
            "hint_name": r.hint_name,
            "hint_team": r.hint_team,
            "inserted_at": r.inserted_at.isoformat(),
        }
        for r in rows
    ]

@router.post("/bind", dependencies=[Depends(RolesAllowed("super_admin", "admin"))])
def bind_identity(
    body: BindIn,
    db: Session = Depends(get_db),
):
    actor_key = body.actor_key
    employee_id = body.employee_id
    create_full_name = body.create_full_name
    department = body.create_department
    retro_days = body.retro_days

    # 1) Identity var mı?
    rec = db.query(EmployeeIdentity).filter(EmployeeIdentity.actor_key == actor_key).first()
    if not rec:
        raise HTTPException(status_code=404, detail="identity not found")

    # 2) Actor bilgileri → telegram alanları
    kind, val = _parse_actor_key(actor_key)
    tg_uid = val if kind == "uid" else None
    tg_uname = actor_key.split(":", 1)[1] if kind == "uname" else None  # "@nick"

    # 3) Hedef employee (var olan ya da yeni)
    if employee_id:  # mevcut bir kayda bağla
        emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="employee not found")
        # Telegram/department boşsa doldur
        updated = False
        if tg_uid and (not getattr(emp, "telegram_user_id", None)):
            emp.telegram_user_id = tg_uid; updated = True
        if tg_uname and (not getattr(emp, "telegram_username", None)):
            emp.telegram_username = tg_uname.lstrip("@"); updated = True
        if department and getattr(emp, "department", None) in (None, ""):
            emp.department = department; updated = True
        if updated:
            db.add(emp)
    else:
        # RD-xxx üret
        emp_id = _next_rd_id(db)
        full_name = (create_full_name or rec.hint_name or f"Personel {emp_id}").strip() or f"Personel {emp_id}"
        emp = Employee(
            employee_id=emp_id,
            full_name=full_name,
            email=None,
            department=department,
            title=None,
            hired_at=None,
            status="active",
            telegram_user_id=tg_uid,
            telegram_username=(tg_uname.lstrip("@") if tg_uname else None),
            phone=None,
            salary_gross=None,
            notes=None,
        )
        db.add(emp)
        db.flush()  # employee_id hazır

    # 4) Identity'yi onayla
    rec.employee_id = emp.employee_id
    rec.status = "confirmed"
    db.add(rec)

    # 5) Geriye dönük eventlere employee_id yaz
    if kind and retro_days > 0:
        since = datetime.now(timezone.utc) - timedelta(days=retro_days)
        if kind == "uid":
            q = db.query(Event).filter(and_(Event.from_user_id == tg_uid, Event.ts >= since))
        else:
            q = db.query(Event).filter(and_(Event.from_username == tg_uname, Event.ts >= since))
        for e in q.all():
            if not e.employee_id:
                e.employee_id = emp.employee_id
                db.add(e)

    db.commit()
    return {"ok": True, "actor_key": actor_key, "employee_id": emp.employee_id, "retro_days": retro_days}

@router.api_route("/backfill-from-events", methods=["GET", "POST"], dependencies=[Depends(RolesAllowed("super_admin", "admin"))])
def backfill_from_events(
    since_days: int = 90,
    auto_create: bool = False,
    db: Session = Depends(get_db),
):
    """
    Geçmiş events'ten actor_key üretir:
      - identities.pending kayıtları ekler (yoksa)
      - mesai payload'ından 'person' alanını hint_name olarak alır
      - hint yoksa username'i ipucu yapar
      - auto_create=True → RD-xxx ile yeni employee oluşturup identity'yi confirmed yapar
    """
    # 1) zaman filtresi
    since_ts = None
    if since_days > 0:
        since_ts = datetime.now(timezone.utc) - timedelta(days=since_days)

    # 2) eventleri çek
    q = db.query(Event.from_user_id, Event.from_username, Event.source_channel, Event.payload_json, Event.ts)
    if since_ts:
        q = q.filter(Event.ts >= since_ts)
    q = q.order_by(Event.ts.desc())
    evs = q.all()

    # 3) var olan keys
    existing_keys = {r.actor_key for r in db.query(EmployeeIdentity.actor_key).all()}

    found: dict[str, tuple[str | None, str | None]] = {}

    for uid, uname, ch, payload, _ in evs:
        # actor_key
        key = None
        if uid:
            key = f"uid:{uid}"
        elif uname:
            key = f"uname:{uname}"
        if not key or key in existing_keys or key in found:
            continue

        # hint: mesai person adı > yoksa username
        hint_name = None
        if ch == "mesai":
            try:
                hint_name = (payload or {}).get("person") or None
            except Exception:
                hint_name = None
        if not hint_name and uname:
            hint_name = str(uname).lstrip("@")

        found[key] = (hint_name, ch)

    pending_inserted = 0
    auto_created = 0

    for key, (hint_name, _ch) in found.items():
        if not auto_create:
            db.add(EmployeeIdentity(actor_key=key, status="pending", hint_name=hint_name))
            pending_inserted += 1
        else:
            emp_id = _next_rd_id(db)
            full_name = (hint_name or f"Personel {emp_id}").strip()
            emp = Employee(
                employee_id=emp_id,
                full_name=full_name,
                email=None,
                department=None,
                title=None,
                hired_at=None,
                status="active",
            )
            db.add(emp)
            db.flush()
            db.add(EmployeeIdentity(actor_key=key, employee_id=emp.employee_id, status="confirmed", hint_name=hint_name))
            auto_created += 1

    db.commit()
    return {
        "ok": True,
        "since_days": since_days,
        "pending_inserted": pending_inserted,
        "auto_created_employees": auto_created,
        "scanned_events": len(evs),
        "new_actor_keys": len(found),
    }
