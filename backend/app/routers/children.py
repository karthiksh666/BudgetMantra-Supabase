from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/children", tags=["children"])


class ChildCreate(BaseModel):
    name: str
    birth_date: Optional[str] = None
    school: str = ""
    notes: str = ""


class ChildExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str = "education"
    date: Optional[str] = None


@router.get("")
async def list_children(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("children").select("*, child_expenses(*)").eq("user_id", current_user["id"]).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_child(body: ChildCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.utcnow().isoformat()}
    res = supabase.table("children").insert(doc).execute()
    return res.data[0]


@router.delete("/{child_id}", status_code=204)
async def delete_child(child_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("children").delete().eq("id", child_id).eq("user_id", current_user["id"]).execute()


@router.post("/{child_id}/expenses", status_code=201)
async def add_expense(child_id: str, body: ChildExpenseCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {"id": str(uuid.uuid4()), "child_id": child_id, "user_id": current_user["id"],
           **body.model_dump(), "date": body.date or date.today().isoformat(),
           "created_at": datetime.utcnow().isoformat()}
    res = supabase.table("child_expenses").insert(doc).execute()
    return res.data[0]


@router.delete("/{child_id}/expenses/{expense_id}", status_code=204)
async def delete_expense(child_id: str, expense_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("child_expenses").delete().eq("id", expense_id).eq("user_id", current_user["id"]).execute()
