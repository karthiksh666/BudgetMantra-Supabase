"""Financial health score — current month + 6-month history trend."""
from fastapi import APIRouter, Depends
from datetime import date, timedelta
from calendar import monthrange
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/financial-score", tags=["financial-score"])


def _month_range(year: int, month: int):
    """Return (start_date_str, end_date_str) for a given year/month."""
    _, last_day = monthrange(year, month)
    start = f"{year}-{month:02d}-01"
    end   = f"{year}-{month:02d}-{last_day}"
    return start, end


def _calc_score(txns, emis, goals, monthly_income: float):
    """Pure calculation — returns (score, grade, breakdown, income, expenses, savings)."""
    income   = sum(float(t["amount"]) for t in txns if t["type"] == "income")
    expenses = sum(float(t["amount"]) for t in txns if t["type"] == "expense")
    emi_total = sum(float(e["emi_amount"]) for e in emis)
    m_income = monthly_income or income or 1

    # Savings rate (30 pts)
    savings = income - expenses - emi_total
    savings_rate = (savings / m_income * 100) if m_income else 0
    savings_pts = min(30, max(0, int(savings_rate * 1.5)))

    # EMI burden (20 pts)
    emi_ratio = (emi_total / m_income * 100) if m_income else 0
    emi_pts = 20 if emi_ratio < 20 else 15 if emi_ratio < 30 else 10 if emi_ratio < 40 else 0

    # Goal progress (20 pts)
    if goals:
        valid = [g for g in goals if float(g.get("target_amount", 0)) > 0]
        avg_pct = sum(float(g["current_amount"]) / float(g["target_amount"]) * 100 for g in valid) / len(valid) if valid else 0
        goal_pts = min(20, int(avg_pct / 5))
    else:
        avg_pct = 0
        goal_pts = 0

    # Spending discipline (30 pts)
    ratio = (expenses / m_income * 100) if m_income else 100
    discipline_pts = 30 if ratio < 50 else 22 if ratio < 70 else 15 if ratio < 90 else 5

    score = min(100, savings_pts + emi_pts + goal_pts + discipline_pts)
    grade = "A+" if score >= 90 else "A" if score >= 80 else "B" if score >= 70 else "C" if score >= 60 else "D"

    breakdown = {
        "savings_rate":        {"score": savings_pts,    "max": 30, "value": f"{savings_rate:.1f}%"},
        "emi_burden":          {"score": emi_pts,         "max": 20, "value": f"{emi_ratio:.1f}%"},
        "goal_progress":       {"score": goal_pts,        "max": 20, "value": f"{avg_pct:.1f}%"},
        "spending_discipline": {"score": discipline_pts,  "max": 30, "value": f"{ratio:.1f}%"},
    }
    return score, grade, breakdown, income, expenses, savings


@router.get("")
async def financial_score(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    uid = current_user["id"]
    today = date.today()
    start, end = _month_range(today.year, today.month)

    txns    = supabase.table("transactions").select("type,amount").eq("user_id", uid).gte("date", start).lte("date", end).execute()
    emis    = supabase.table("emis").select("emi_amount").eq("user_id", uid).eq("status", "active").execute()
    goals   = supabase.table("savings_goals").select("target_amount,current_amount").eq("user_id", uid).execute()
    profile = supabase.table("profiles").select("monthly_income").eq("id", uid).single().execute()

    monthly_income = float((profile.data or {}).get("monthly_income") or 0)
    score, grade, breakdown, income, expenses, savings = _calc_score(
        txns.data or [], emis.data or [], goals.data or [], monthly_income
    )

    return {
        "score": score, "grade": grade, "breakdown": breakdown,
        "income": income, "expenses": expenses, "savings": savings,
    }


@router.get("/history")
async def financial_score_history(
    months: int = 6,
    current_user: dict = Depends(get_current_user),
):
    """Return financial score for the last N months (default 6) for trend charts."""
    supabase = get_admin_db()
    uid = current_user["id"]

    profile = supabase.table("profiles").select("monthly_income").eq("id", uid).single().execute()
    monthly_income = float((profile.data or {}).get("monthly_income") or 0)

    emis  = supabase.table("emis").select("emi_amount").eq("user_id", uid).eq("status", "active").execute()
    goals = supabase.table("savings_goals").select("target_amount,current_amount").eq("user_id", uid).execute()

    history = []
    today = date.today()

    for i in range(months - 1, -1, -1):
        # Walk back i months from current month
        target = date(today.year, today.month, 1) - timedelta(days=i * 28)
        # Normalize to first of month
        y, m = target.year, target.month
        start, end = _month_range(y, m)

        txns = supabase.table("transactions").select("type,amount").eq("user_id", uid).gte("date", start).lte("date", end).execute()
        score, grade, _, income, expenses, savings = _calc_score(
            txns.data or [], emis.data or [], goals.data or [], monthly_income
        )

        history.append({
            "month":    f"{y}-{m:02d}",
            "label":    date(y, m, 1).strftime("%b %Y"),
            "score":    score,
            "grade":    grade,
            "income":   income,
            "expenses": expenses,
            "savings":  savings,
        })

    return history
