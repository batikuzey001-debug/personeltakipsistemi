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

# --------------- endpoints ----------------
@router.get("/pending", dependencies=[Depends(RolesAllowed("super_admin", "admin"))])
def list_pending(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
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
    actor_key: str = Query(..., description="uid:123 veya uname:@nick"),
    employee_id: str | None = Query(None, description="Var olan employee_id; boşsa RD-xxx otomatik atanır"),
    create_full_name: str | None = Query(None, description="Yeni personel adı (boşsa hint_name)"),
    # UI'da 'Departman' gösteriyoruz; backend param adını geriye dönük uyumluluk için her ikisini de kabul edelim:
    create_department: str | None = Query(None, description="Departman (Call Center/Canlı/Finans/Bonus/Admin)"),
    create_team: str | None = Query(None, description="(deprecated) team → department"),
    retro_days: int = Query(14, ge=0, le=60, description="Geriye dönük gün sayısı (eventlere employee_id yaz)"),
    db: Session = Depends(get_db),
):
    # 1) Identity var mı?
    rec = db.query(EmployeeIdentity).filter(EmployeeIdentity.actor_key == actor_key).first()
    if not rec:
        raise HTTPException(status_code=404, detail="identity not found")

    # 2) Actor bilgileri → telegram alanları
    kind, val = _parse_actor_key(actor_key)
    tg_uid = val if kind == "uid" else None
    tg_uname = actor_key.split(":", 1)[1] if kind == "uname" else None

    # 3) Departman belirle (team ismini departmana eşle, create_department öncelikli)
    department = create_department or create_team  # create_team eskiden geliyordu

    # 4) Hedef employee (var olan ya da yeni)
    if employee_id:  # mevcut bir kayda bağla
        emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="employee not found")
        # Telegram alanları boşsa actor_key ile doldur
        updated = False
        if tg_uid and (not getattr(emp, "telegram_user_id", None)):
            emp.telegram_user_id = tg_uid; updated = True
        if tg_uname and (not getattr(emp, "telegram_username", None)):
            emp.telegram_username = tg_uname; updated = True
        if department and getattr(emp, "department", None) in (None, ""):
            emp.department = department; updated = True
        if updated:
            db.add(emp)
    else:
        # RD-xxx üret
        emp_id = _next_rd_id(db)
        full_name = (create_full_name or rec.hint_name or f"Personel {emp_id}").strip() or f"Personel {emp_id}"
        # oluştur
        emp = Employee(
            employee_id=emp_id,
            full_name=full_name,
            email=None,
            department=department,          # Takım yerine departman
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

    # 5) Identity'yi onayla
    rec.employee_id = emp.employee_id
    rec.status = "confirmed"
    db.add(rec)

    # 6) Geriye dönük eventlere employee_id yaz
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
