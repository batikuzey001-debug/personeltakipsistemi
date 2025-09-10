from pydantic import BaseModel, EmailStr
from typing import Literal

Role = Literal["super_admin", "admin", "manager", "employee"]

class UserCreateIn(BaseModel):
    email: EmailStr
    password: str
    role: Role = "admin"
    team_scope_id: int | None = None
    is_active: bool = True

class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: Role
    team_scope_id: int | None
    is_active: bool

    class Config:
        from_attributes = True
