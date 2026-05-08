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


@router.post("/investments/refresh-prices")
async def refresh_investment_prices(current_user: dict = Depends(get_current_user)):
    return {"ok": True, "status": "refreshing", "message": "Prices will update in the background."}


@router.get("/investments/refresh-status")
async def get_refresh_status(current_user: dict = Depends(get_current_user)):
    return {"status": "idle", "last_refreshed": None}


@router.get("/investments/suggestions")
async def get_investment_suggestions(current_user: dict = Depends(get_current_user)):
    risk = current_user.get("risk_profile", "moderate")
    suggestions = {
        "conservative": [
            {"type": "FD", "name": "Fixed Deposit", "expected_return": "6-7%", "risk": "low", "reason": "Capital protection with guaranteed returns"},
            {"type": "PPF", "name": "Public Provident Fund", "expected_return": "7.1%", "risk": "zero", "reason": "Tax-free government-backed returns"},
        ],
        "moderate": [
            {"type": "MF", "name": "Large Cap Mutual Fund", "expected_return": "10-12%", "risk": "medium", "reason": "Balanced growth with professional management"},
            {"type": "MF", "name": "Index Fund (Nifty 50)", "expected_return": "11-13%", "risk": "medium", "reason": "Low cost, market returns"},
        ],
        "aggressive": [
            {"type": "MF", "name": "Small Cap Fund", "expected_return": "15-18%", "risk": "high", "reason": "High growth potential for long-term wealth"},
            {"type": "STOCKS", "name": "Direct Equity", "expected_return": "variable", "risk": "high", "reason": "Maximum control and potential returns"},
        ],
    }
    return {"risk_profile": risk, "suggestions": suggestions.get(risk, suggestions["moderate"])}
