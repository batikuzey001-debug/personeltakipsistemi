from sqlalchemy.orm import Session
from app.models.identities import EmployeeIdentity

def actor_key(from_user_id: int | None, from_username: str | None) -> str:
    if from_user_id: return f"uid:{from_user_id}"
    if from_username: return f"uname:{from_username}"
    return "unknown"

def resolve_employee_id(db: Session, key: str) -> str | None:
    rec = db.query(EmployeeIdentity).filter(EmployeeIdentity.actor_key == key, EmployeeIdentity.status == "confirmed").first()
    return rec.employee_id if rec else None

def ensure_pending(db: Session, key: str, name_hint: str | None = None, team_hint: str | None = None):
    rec = db.query(EmployeeIdentity).filter(EmployeeIdentity.actor_key == key).first()
    if rec:
        # ipucu güncelle
        changed = False
        if name_hint and not rec.hint_name:
            rec.hint_name = name_hint; changed = True
        if team_hint and not rec.hint_team:
            rec.hint_team = team_hint; changed = True
        if changed: db.add(rec)
    else:
        db.add(EmployeeIdentity(actor_key=key, status="pending", hint_name=name_hint, hint_team=team_hint))
