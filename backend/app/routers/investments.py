from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/investments", tags=["investments"])


class InvestmentCreate(BaseModel):
    type: str           # stocks | mutual_funds | gold | silver | fd | crypto | real_estate | other
    name: str
    units: float = 0
    buy_price: float = 0
    current_price: float = 0
    invested_amount: float
    current_value: float = 0
    buy_date: str
    ticker: str = ""
    notes: str = ""


class InvestmentUpdate(BaseModel):
    current_price: Optional[float] = None
    current_value: Optional[float] = None
    units: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
async def list_investments(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("investments").select("*").eq("user_id", current_user["id"]).order("buy_date", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_investment(body: InvestmentCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("investments").insert(doc).execute()
    return res.data[0]


@router.put("/{investment_id}")
async def update_investment(investment_id: str, body: InvestmentUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("investments").update(updates).eq("id", investment_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Investment not found")
    return res.data[0]


@router.delete("/{investment_id}")
async def delete_investment(investment_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("investments").delete().eq("id", investment_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
