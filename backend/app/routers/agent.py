from fastapi import APIRouter, Depends
from datetime import datetime, timezone, date as _date
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["agent"])


@router.get("/agent/daily-brief")
async def get_daily_brief(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    uid = current_user["id"]

    today = _date.today()
    month_start = today.replace(day=1).isoformat()
    month_str = today.strftime("%Y-%m")

    # ── Fetch all live data ──────────────────────────────────────────────────

    try:
        tx_res = supabase.table("transactions").select("amount,type").eq("user_id", uid).gte("date", month_start).execute()
        transactions = tx_res.data or []
    except Exception:
        transactions = []

    try:
        goals_res = supabase.table("savings_goals").select("name,target_amount,current_amount,deadline").eq("user_id", uid).neq("status", "completed").execute()
        goals = goals_res.data or []
    except Exception:
        goals = []

    try:
        emis_res = supabase.table("emis").select("name,emi_amount,due_date_day").eq("user_id", uid).eq("status", "active").execute()
        emis = emis_res.data or []
    except Exception:
        emis = []

    try:
        budgets_res = supabase.table("budget_categories").select("name,limit,budget,spent_amount").eq("user_id", uid).eq("month", month_str).execute()
        budgets = budgets_res.data or []
    except Exception:
        budgets = []

    try:
        income_res = supabase.table("income_entries").select("amount").eq("user_id", uid).gte("date", month_start).execute()
        income_entries = income_res.data or []
    except Exception:
        income_entries = []

    # ── Aggregate ────────────────────────────────────────────────────────────

    total_spent = sum(
        float(t.get("amount", 0))
        for t in transactions
        if t.get("type") in ("expense", "debit")
    )
    total_income = sum(float(e.get("amount", 0)) for e in income_entries)

    # ── Build insights ───────────────────────────────────────────────────────

    insights = []
    score = 100

    # Overspending / spending ratio
    if total_income > 0:
        ratio = total_spent / total_income
        if ratio > 0.90:
            insights.append({
                "type": "alert",
                "icon": "⚠️",
                "title": "Overspending this month",
                "body": f"You've spent {ratio * 100:.0f}% of your income this month.",
                "action": "Review your expenses",
            })
            score -= 20
        elif ratio > 0.70:
            insights.append({
                "type": "warning",
                "icon": "📊",
                "title": "Spending at 70%+ of income",
                "body": f"You've used {ratio * 100:.0f}% of your monthly income.",
                "action": "Check your budget categories",
            })
            score -= 10
        elif ratio < 0.50:
            insights.append({
                "type": "win",
                "icon": "🎉",
                "title": "You're saving well this month!",
                "body": f"Only {ratio * 100:.0f}% of income spent — keep it up!",
                "action": None,
            })
            score += 10

    # Budget category overruns
    for cat in budgets:
        limit = float(cat.get("limit") or cat.get("budget") or 0)
        spent = float(cat.get("spent_amount") or 0)
        name = cat.get("name", "Category")
        if limit > 0 and spent > limit:
            insights.append({
                "type": "alert",
                "icon": "🔴",
                "title": f"{name} over budget",
                "body": f"Spent ₹{spent:,.0f} against a ₹{limit:,.0f} limit.",
                "action": f"Reduce {name} spending",
            })
            score -= 5

    # Goal deadline nudges (within 90 days)
    for goal in goals:
        name = goal.get("name", "Goal")
        target = float(goal.get("target_amount") or 0)
        current = float(goal.get("current_amount") or 0)
        deadline_str = goal.get("deadline")
        if deadline_str and current < target:
            try:
                deadline = _date.fromisoformat(str(deadline_str)[:10])
                days_left = (deadline - today).days
                if 0 <= days_left <= 90:
                    insights.append({
                        "type": "nudge",
                        "icon": "🎯",
                        "title": f"Goal deadline approaching: {name}",
                        "body": f"{days_left} days left. Still need ₹{(target - current):,.0f} more.",
                        "action": f"Contribute to {name}",
                    })
                    score -= 5
            except (ValueError, TypeError):
                pass

    # EMI due-soon reminders (due_date_day within 3 days)
    today_day = today.day
    for emi in emis:
        name = emi.get("name", "EMI")
        due_day = emi.get("due_date_day")
        if due_day is not None:
            try:
                due_day = int(due_day)
                # days until due this month (handle wrap-around to next month)
                days_until = due_day - today_day
                if days_until < 0:
                    # already passed this month — calculate for next month
                    import calendar
                    days_in_month = calendar.monthrange(today.year, today.month)[1]
                    days_until = (days_in_month - today_day) + due_day
                if 0 <= days_until <= 3:
                    insights.append({
                        "type": "reminder",
                        "icon": "🔔",
                        "title": f"EMI due soon: {name}",
                        "body": f"Due on the {due_day}th — {days_until} day(s) away.",
                        "action": f"Pay {name} EMI",
                    })
            except (ValueError, TypeError):
                pass

    # Fallback positive insight
    if not insights:
        insights.append({
            "type": "win",
            "icon": "✅",
            "title": "Finances look healthy!",
            "body": "No issues detected this month. Great job!",
            "action": None,
        })

    # ── Health score ─────────────────────────────────────────────────────────

    score = max(0, min(100, score))

    if score >= 85:
        status = "excellent"
    elif score >= 65:
        status = "good"
    elif score >= 40:
        status = "needs_attention"
    else:
        status = "critical"

    return {
        "score": score,
        "status": status,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "month": month_str,
        "snapshot": {
            "income_this_month": total_income,
            "spent_this_month": total_spent,
            "active_emis": len(emis),
            "active_goals": len(goals),
        },
        "insights": insights,
    }
