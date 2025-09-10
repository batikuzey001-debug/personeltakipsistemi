from pydantic import BaseModel, EmailStr
from datetime import date

class TeamOut(BaseModel):
    id: int
    name: str
    parent_id: int | None

    class Config:
        from_attributes = True

class EmployeeOut(BaseModel):
    employee_id: str
    full_name: str
    email: EmailStr | None
    team_id: int | None
    title: str | None
    hired_at: date | None
    status: str

    class Config:
        from_attributes = True
