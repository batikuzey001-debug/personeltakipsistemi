from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from app.db.session import SessionLocal
from app.core.config import settings
from app.models.models import User

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str | None = None, db: Session = Depends(get_db)) -> User:
    # Neden: V1'de token header yerine Railway/GW üzerinden 'Authorization: Bearer' bekliyoruz.
    from fastapi import Request
    def _extract(req: Request) -> str | None:
        auth = req.headers.get("authorization") or req.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "): return auth.split(" ", 1)[1]
        return token
    import contextvars
    request_var: contextvars.ContextVar | None = None
    try:
        from fastapi import Request
    except:
        pass
    # Fast: re-parse from global dependency
    import inspect
    stack = inspect.stack()
    req = next((f.frame.f_locals.get("request") for f in stack if "request" in f.frame.f_locals), None)
    raw = _extract(req) if req else token
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = jwt.decode(raw, settings.JWT_SECRET, algorithms=[settings.JWT_ALGO])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User inactive or not found")
    return user

def RolesAllowed(*roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dep
