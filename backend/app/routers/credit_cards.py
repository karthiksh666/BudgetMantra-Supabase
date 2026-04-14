from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/credit-cards", tags=["credit-cards"])


class CreditCardInput(BaseModel):
    bank: str
    last_four: Optional[str] = None
    credit_limit: float = 0
    billing_date: Optional[int] = None
    due_date: Optional[int] = None
    current_balance: float = 0


class CardExpenseInput(BaseModel):
    card_id: str
    description: str
    amount: float
    category: str = "general"
    date: Optional[str] = None


@router.get("")
async def list_cards(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("credit_cards").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.get("/summary")
async def cards_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    cards = supabase.table("credit_cards").select("*").eq("user_id", current_user["id"]).execute().data or []
    total_limit   = sum(c.get("credit_limit", 0) for c in cards)
    total_balance = sum(c.get("current_balance", 0) for c in cards)
    return {
        "total_cards": len(cards),
        "total_limit": total_limit,
        "total_balance": total_balance,
        "available_credit": total_limit - total_balance,
        "utilization_pct": round((total_balance / total_limit * 100) if total_limit else 0, 1),
    }


@router.post("")
async def create_card(body: CreditCardInput, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"user_id": current_user["id"], **body.model_dump()}
    res = supabase.table("credit_cards").insert(doc).execute()
    return res.data[0]


@router.delete("/{card_id}")
async def delete_card(card_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("credit_card_expenses").delete().eq("card_id", card_id).execute()
    supabase.table("credit_cards").delete().eq("id", card_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/{card_id}/expenses")
async def card_expenses(card_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("credit_card_expenses").select("*").eq("card_id", card_id).eq("user_id", current_user["id"]).order("date", desc=True).execute()
    return res.data or []


@router.post("/{card_id}/expenses")
async def add_card_expense(card_id: str, body: CardExpenseInput, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {
        "card_id": card_id,
        "user_id": current_user["id"],
        "description": body.description,
        "amount": body.amount,
        "category": body.category,
        "date": body.date or str(date.today()),
    }
    res = supabase.table("credit_card_expenses").insert(doc).execute()
    # Update card balance
    card = supabase.table("credit_cards").select("current_balance").eq("id", card_id).single().execute()
    if card.data:
        new_balance = (card.data.get("current_balance") or 0) + body.amount
        supabase.table("credit_cards").update({"current_balance": new_balance}).eq("id", card_id).execute()
    return res.data[0]
