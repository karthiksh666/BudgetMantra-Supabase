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


# ── Savings Goals Summary (top-level route, no router prefix) ─────────────────

@router.get("/savings-goals-summary")
async def savings_goals_summary_toplevel(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    goals = supabase.table("savings_goals").select("*").eq("user_id", current_user["id"]).execute()
    goal_list = goals.data or []
    total_target    = sum(g.get("target_amount", 0) for g in goal_list)
    total_saved     = sum(g.get("current_amount", 0) for g in goal_list)
    total_remaining = max(0, total_target - total_saved)
    alerts = []
    for g in goal_list:
        try:
            from datetime import datetime as _dt
            target_date    = _dt.strptime(g["target_date"], "%Y-%m-%d")
            days_remaining = (target_date - _dt.now()).days
            months_remaining = max(1, days_remaining / 30)
            amount_needed  = (g.get("target_amount", 0) or 0) - (g.get("current_amount", 0) or 0)
            progress       = ((g.get("current_amount", 0) or 0) / (g.get("target_amount", 1) or 1)) * 100
            if days_remaining < 0:
                alerts.append({"goal_id": g["id"], "goal_name": g["name"], "type": "overdue", "severity": "high",
                                "message": f"'{g['name']}' target date has passed."})
            elif days_remaining < 30 and amount_needed > 0:
                alerts.append({"goal_id": g["id"], "goal_name": g["name"], "type": "urgent", "severity": "high",
                                "message": f"'{g['name']}' is due in {days_remaining} days. Need ₹{amount_needed:,.0f} more."})
            elif progress >= 100:
                alerts.append({"goal_id": g["id"], "goal_name": g["name"], "type": "completed", "severity": "low",
                                "message": f"'{g['name']}' is fully funded! 🎉"})
        except Exception:
            pass
    return {
        "goals": goal_list,
        "total_target": total_target,
        "total_saved": total_saved,
        "total_remaining": total_remaining,
        "overall_progress": round((total_saved / total_target * 100) if total_target > 0 else 0, 1),
        "alerts": alerts,
    }


# ── Net Worth ─────────────────────────────────────────────────────────────────

@router.get("/net-worth")
async def get_net_worth(current_user: dict = Depends(get_current_user)):
    from datetime import date as _date
    uid   = current_user["id"]
    today = _date.today()
    month_start = f"{today.year}-{today.month:02d}-01"
    month_end   = today.isoformat()
    supabase = get_supabase()

    # Assets
    invs  = supabase.table("investments").select("current_value").eq("user_id", uid).execute().data or []
    investments = sum(i.get("current_value") or 0 for i in invs)

    goals = supabase.table("savings_goals").select("current_amount").eq("user_id", uid).execute().data or []
    savings_goals_amt = sum(g.get("current_amount") or 0 for g in goals)

    gold = supabase.table("gold_items").select("weight_grams,buy_price_per_gram").eq("user_id", uid).execute().data or []
    gold_value = sum((g.get("weight_grams") or 0) * (g.get("buy_price_per_gram") or 0) for g in gold)

    silver = supabase.table("silver_items").select("weight_grams,buy_price_per_gram").eq("user_id", uid).execute().data or []
    silver_value = sum((s.get("weight_grams") or 0) * (s.get("buy_price_per_gram") or 0) for s in silver)

    income_rows = supabase.table("income_entries").select("amount").eq("user_id", uid).gte("date", month_start).lte("date", month_end).execute().data or []
    month_income = sum(r.get("amount") or 0 for r in income_rows)

    txn_rows = supabase.table("transactions").select("amount").eq("user_id", uid).eq("type", "expense").gte("date", month_start).lte("date", month_end).execute().data or []
    month_spent  = sum(r.get("amount") or 0 for r in txn_rows)
    cash_savings = month_income - month_spent

    # Liabilities
    emis = supabase.table("emis").select("principal,months_paid,tenure_months,emi_amount").eq("user_id", uid).eq("status", "active").execute().data or []
    emi_remaining = sum(
        max(0, (e.get("emi_amount") or 0) * max(0, (e.get("tenure_months") or 0) - (e.get("months_paid") or 0)))
        for e in emis
    )

    loans = supabase.table("hand_loans").select("amount,remaining").eq("user_id", uid).eq("type", "taken").eq("is_settled", False).execute().data or []
    hand_loans_owed = sum(l.get("remaining") or l.get("amount") or 0 for l in loans)

    total_assets      = investments + savings_goals_amt + gold_value + silver_value + cash_savings
    total_liabilities = emi_remaining + hand_loans_owed
    net_worth         = total_assets - total_liabilities

    # History (from net_worth_snapshots table if it exists, else empty)
    try:
        snaps = supabase.table("net_worth_snapshots").select("month,net_worth").eq("user_id", uid).order("month").execute().data or []
        history = [{"month": s["month"], "net_worth": s["net_worth"]} for s in snaps]
    except Exception:
        history = []

    return {
        "net_worth": round(net_worth, 2),
        "assets": {
            "investments":   round(investments, 2),
            "savings_goals": round(savings_goals_amt, 2),
            "gold_value":    round(gold_value, 2),
            "silver_value":  round(silver_value, 2),
            "cash_savings":  round(cash_savings, 2),
        },
        "liabilities": {
            "emi_remaining":   round(emi_remaining, 2),
            "hand_loans_owed": round(hand_loans_owed, 2),
        },
        "history": history,
    }


# ── Spending Breakdown ────────────────────────────────────────────────────────

@router.get("/spending-breakdown")
async def get_spending_breakdown(
    period: str = "month",
    current_user: dict = Depends(get_current_user)
):
    from datetime import date as _date, timedelta as _td
    uid   = current_user["id"]
    today = _date.today()
    if period == "week":
        start = (today - _td(days=today.weekday())).isoformat()
    elif period == "year":
        start = f"{today.year}-01-01"
    else:  # month
        start = f"{today.year}-{today.month:02d}-01"
    supabase = get_supabase()
    rows = supabase.table("transactions").select("amount,category").eq("user_id", uid).eq("type", "expense").gte("date", start).execute().data or []
    breakdown: dict = {}
    for r in rows:
        cat = r.get("category") or "other"
        breakdown[cat] = breakdown.get(cat, 0) + (r.get("amount") or 0)
    total = sum(breakdown.values())
    result = [
        {"category": k, "amount": round(v, 2), "percentage": round(v / total * 100, 1) if total else 0}
        for k, v in sorted(breakdown.items(), key=lambda x: -x[1])
    ]
    return {"period": period, "total": round(total, 2), "breakdown": result}


# ── Chanakya Suggestions ──────────────────────────────────────────────────────

@router.get("/chanakya/suggestions")
async def chanakya_suggestions(current_user: dict = Depends(get_current_user)):
    """Quick-action suggestions for Chanakya chat."""
    return [
        {"id": "1", "text": "How much did I spend this month?", "icon": "📊"},
        {"id": "2", "text": "Add salary income",                "icon": "💰"},
        {"id": "3", "text": "Show my EMI summary",              "icon": "🏦"},
        {"id": "4", "text": "How are my investments doing?",    "icon": "📈"},
        {"id": "5", "text": "What's my net worth?",             "icon": "💎"},
        {"id": "6", "text": "Show savings goals progress",      "icon": "🎯"},
    ]
