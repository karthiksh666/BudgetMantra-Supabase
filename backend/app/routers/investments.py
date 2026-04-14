from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/investments", tags=["investments"])


class InvestmentCreate(BaseModel):
    model_config = {"extra": "ignore"}

    type: str           # stocks | mutual_funds | gold | silver | fd | crypto | real_estate | other
    name: str
    units: float = 0
    buy_price: float = 0
    current_price: float = 0
    invested_amount: float
    current_value: float = 0
    buy_date: Optional[str] = None   # mobile may omit; defaults to today
    ticker: str = ""
    notes: str = ""


class InvestmentUpdate(BaseModel):
    current_price: Optional[float] = None
    current_value: Optional[float] = None
    units: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
async def list_investments(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("investments").select("*").eq("user_id", current_user["id"]).order("buy_date", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_investment(body: InvestmentCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    data = body.model_dump()
    data["buy_date"] = data.get("buy_date") or datetime.now(timezone.utc).date().isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = supabase.table("investments").insert(doc).execute()
    return res.data[0]


@router.put("/{investment_id}")
async def update_investment(investment_id: str, body: InvestmentUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("investments").update(updates).eq("id", investment_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Investment not found")
    return res.data[0]


@router.delete("/{investment_id}")
async def delete_investment(investment_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("investments").delete().eq("id", investment_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/summary")
async def investments_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    invs = supabase.table("investments").select("*").eq("user_id", current_user["id"]).execute().data or []
    total_invested    = sum(i.get("invested_amount") or 0 for i in invs)
    total_current     = sum(i.get("current_value") or i.get("invested_amount") or 0 for i in invs)
    total_gain        = total_current - total_invested
    total_gain_pct    = round((total_gain / total_invested * 100) if total_invested else 0, 2)
    by_type: dict = {}
    for inv in invs:
        t = inv.get("type") or "other"
        by_type[t] = by_type.get(t, 0) + (inv.get("current_value") or inv.get("invested_amount") or 0)
    return {
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current, 2),
        "total_gain": round(total_gain, 2),
        "total_gain_pct": total_gain_pct,
        "by_type": by_type,
        "count": len(invs),
    }
