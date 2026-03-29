from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/recurring-expenses", tags=["recurring-expenses"])


class RecurringExpenseInput(BaseModel):
    name: str
    amount: float
    frequency: str = "monthly"
    day_of_month: Optional[int] = None
    start_date: Optional[str] = None
    emoji: str = "💸"
    description: Optional[str] = ""
    is_active: bool = True


@router.get("")
async def list_recurring(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("recurring_expenses").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.post("")
async def create_recurring(body: RecurringExpenseInput, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "user_id": current_user["id"],
        **body.model_dump(),
    }
    res = supabase.table("recurring_expenses").insert(doc).execute()
    return res.data[0]


@router.put("/{item_id}")
async def update_recurring(item_id: str, body: RecurringExpenseInput, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("recurring_expenses").update(body.model_dump()).eq("id", item_id).eq("user_id", current_user["id"]).execute()
    return res.data[0] if res.data else {}


@router.delete("/{item_id}")
async def delete_recurring(item_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("recurring_expenses").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
