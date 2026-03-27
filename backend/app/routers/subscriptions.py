from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


class SubscriptionCreate(BaseModel):
    name: str
    amount: float
    billing_cycle: str = "monthly"
    next_due: Optional[str] = None
    category: str = "entertainment"


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    billing_cycle: Optional[str] = None
    next_due: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


def _next_due(billing_cycle: str, from_date: date) -> date:
    cycles = {"weekly": relativedelta(weeks=1), "monthly": relativedelta(months=1),
               "quarterly": relativedelta(months=3), "yearly": relativedelta(years=1)}
    return from_date + cycles.get(billing_cycle, relativedelta(months=1))


@router.get("")
async def list_subscriptions(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("subscriptions").select("*").eq("user_id", current_user["id"]).order("created_at").execute()
    return res.data or []


@router.post("", status_code=201)
async def create_subscription(body: SubscriptionCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    next_due = body.next_due or _next_due(body.billing_cycle, date.today()).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(exclude={"next_due"}),
        "next_due": next_due,
        "is_active": True,
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("subscriptions").insert(doc).execute()
    return res.data[0]


@router.put("/{sub_id}")
async def update_subscription(sub_id: str, body: SubscriptionUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("subscriptions").update(updates).eq("id", sub_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Subscription not found")
    return res.data[0]


@router.post("/{sub_id}/renew")
async def renew(sub_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    sub = supabase.table("subscriptions").select("*").eq("id", sub_id).eq("user_id", current_user["id"]).single().execute()
    if not sub.data:
        raise HTTPException(404, "Subscription not found")
    next_due = _next_due(sub.data["billing_cycle"], date.today()).isoformat()
    res = supabase.table("subscriptions").update({"next_due": next_due}).eq("id", sub_id).execute()
    return res.data[0]


@router.delete("/{sub_id}")
async def delete_subscription(sub_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("subscriptions").delete().eq("id", sub_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}
