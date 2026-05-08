from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["watchlist"])


class WatchlistBody(BaseModel):
    symbol: str
    company_name: str = ""
    target_price: float
    stop_loss: Optional[float] = None
    book_profit: Optional[float] = None
    notes: str = ""


@router.post("/watchlist", status_code=201)
async def add_to_watchlist(body: WatchlistBody, current_user: dict = Depends(get_current_user)):
    if not body.symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    if body.target_price <= 0:
        raise HTTPException(status_code=400, detail="target_price must be > 0")
    supabase = get_admin_db()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "symbol": body.symbol.upper().strip(),
        "company_name": body.company_name,
        "target_price": body.target_price,
        "stop_loss": body.stop_loss,
        "book_profit": body.book_profit,
        "current_price": None,
        "notes": body.notes,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    res = supabase.table("stock_watchlist").insert(doc).execute()
    return res.data[0] if res.data else doc


@router.get("/watchlist")
async def get_watchlist(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("stock_watchlist").select("*").eq("user_id", current_user["id"]).order("added_at", desc=True).execute()
    return res.data or []


@router.delete("/watchlist/{item_id}")
async def delete_watchlist_item(item_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("stock_watchlist").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
