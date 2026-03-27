from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionCreate(BaseModel):
    amount: float
    type: str                        # "income" | "expense"
    category: str
    description: str
    date: str                        # ISO date string
    payment_mode: str = "UPI"
    tags: list[str] = []
    is_recurring: bool = False
    recurring_id: Optional[str] = None
    source: str = "manual"           # "manual" | "sms" | "upi_import"


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    payment_mode: Optional[str] = None
    tags: Optional[list[str]] = None


@router.get("")
async def list_transactions(
    month: Optional[str] = None,      # "2025-03"
    type: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 500,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    q = supabase.table("transactions").select("*").eq("user_id", current_user["id"])

    if month:
        start = f"{month}-01"
        year, m = month.split("-")
        end_month = int(m) % 12 + 1
        end_year = int(year) + (1 if end_month == 1 else 0)
        end = f"{end_year}-{end_month:02d}-01"
        q = q.gte("date", start).lt("date", end)

    if type:
        q = q.eq("type", type)
    if category:
        q = q.eq("category", category)

    res = q.order("date", desc=True).limit(limit).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_transaction(body: TransactionCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("transactions").insert(doc).execute()
    return res.data[0]


@router.put("/{transaction_id}")
async def update_transaction(
    transaction_id: str,
    body: TransactionUpdate,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("transactions")\
        .update(updates)\
        .eq("id", transaction_id)\
        .eq("user_id", current_user["id"])\
        .execute()
    if not res.data:
        raise HTTPException(404, "Transaction not found")
    return res.data[0]


@router.delete("/{transaction_id}")
async def delete_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("transactions")\
        .delete()\
        .eq("id", transaction_id)\
        .eq("user_id", current_user["id"])\
        .execute()
    return {"ok": True}
