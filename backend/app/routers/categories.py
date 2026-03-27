from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(tags=["categories"])


class CategoryCreate(BaseModel):
    name: str
    budget_limit: float = 0
    color: str = "#f97316"
    icon: str = "📦"


@router.get("/categories")
async def list_categories(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("budget_categories").select("*").eq("user_id", current_user["id"]).order("name").execute()
    return res.data or []


@router.post("/categories", status_code=201)
async def create_category(body: CategoryCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("budget_categories").insert(doc).execute()
    return res.data[0]


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("budget_categories").delete().eq("id", category_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/budget-summary")
async def budget_summary(month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Returns spending per category vs budget limit for the given month."""
    from datetime import date
    supabase = get_supabase()
    user_id = current_user["id"]
    if not month:
        month = date.today().strftime("%Y-%m")

    year, m = month.split("-")
    start = f"{month}-01"
    end_m = int(m) % 12 + 1
    end_y = int(year) + (1 if end_m == 1 else 0)
    end = f"{end_y}-{end_m:02d}-01"

    txns = supabase.table("transactions").select("category,amount").eq("user_id", user_id).eq("type", "expense").gte("date", start).lt("date", end).execute()
    cats = supabase.table("budget_categories").select("*").eq("user_id", user_id).execute()

    spending: dict[str, float] = {}
    for t in (txns.data or []):
        spending[t["category"]] = spending.get(t["category"], 0) + float(t["amount"])

    result = []
    for cat in (cats.data or []):
        spent = spending.get(cat["name"], 0)
        result.append({**cat, "spent": spent, "remaining": max(0, float(cat["budget_limit"]) - spent)})

    return result


@router.get("/budget-alerts")
async def budget_alerts(current_user: dict = Depends(get_current_user)):
    """Returns categories where spending >= 80% of limit."""
    from datetime import date
    month = date.today().strftime("%Y-%m")
    summary = await budget_summary(month=month, current_user=current_user)
    alerts = []
    for cat in summary:
        limit = float(cat["budget_limit"] or 0)
        if limit <= 0:
            continue
        pct = (cat["spent"] / limit) * 100
        if pct >= 80:
            alerts.append({**cat, "pct_used": round(pct, 1)})
    return alerts
