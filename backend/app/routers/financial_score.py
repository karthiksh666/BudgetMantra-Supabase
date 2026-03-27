"""Financial health score — pure calculation, no DB writes."""
from fastapi import APIRouter, Depends
from datetime import date
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/financial-score", tags=["financial-score"])


@router.get("")
async def financial_score(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    uid = current_user["id"]
    month = date.today().strftime("%Y-%m")
    year, m = month.split("-")
    start = f"{month}-01"
    end_m = int(m) % 12 + 1
    end_y = int(year) + (1 if end_m == 1 else 0)
    end = f"{end_y}-{end_m:02d}-01"

    # Fetch data
    txns = supabase.table("transactions").select("type,amount").eq("user_id", uid).gte("date", start).lt("date", end).execute()
    emis = supabase.table("emis").select("emi_amount").eq("user_id", uid).eq("status", "active").execute()
    goals = supabase.table("savings_goals").select("target_amount,current_amount").eq("user_id", uid).execute()
    profile = supabase.table("profiles").select("monthly_income").eq("id", uid).single().execute()

    income = sum(float(t["amount"]) for t in (txns.data or []) if t["type"] == "income")
    expenses = sum(float(t["amount"]) for t in (txns.data or []) if t["type"] == "expense")
    emi_total = sum(float(e["emi_amount"]) for e in (emis.data or []))
    monthly_income = float((profile.data or {}).get("monthly_income") or income or 1)

    score = 100
    breakdown = {}

    # Savings rate (30 pts)
    savings = income - expenses - emi_total
    savings_rate = (savings / monthly_income * 100) if monthly_income else 0
    savings_pts = min(30, max(0, int(savings_rate * 1.5)))
    score = savings_pts
    breakdown["savings_rate"] = {"score": savings_pts, "max": 30, "value": f"{savings_rate:.1f}%"}

    # EMI burden (20 pts)
    emi_ratio = (emi_total / monthly_income * 100) if monthly_income else 0
    emi_pts = 20 if emi_ratio < 20 else 15 if emi_ratio < 30 else 10 if emi_ratio < 40 else 0
    score += emi_pts
    breakdown["emi_burden"] = {"score": emi_pts, "max": 20, "value": f"{emi_ratio:.1f}%"}

    # Goal progress (20 pts)
    if goals.data:
        avg_pct = sum((float(g["current_amount"]) / float(g["target_amount"]) * 100) for g in goals.data if float(g["target_amount"]) > 0) / len(goals.data)
        goal_pts = min(20, int(avg_pct / 5))
    else:
        goal_pts = 0
        avg_pct = 0
    score += goal_pts
    breakdown["goal_progress"] = {"score": goal_pts, "max": 20, "value": f"{avg_pct:.1f}%"}

    # Spending discipline (30 pts)
    ratio = (expenses / monthly_income * 100) if monthly_income else 100
    discipline_pts = 30 if ratio < 50 else 22 if ratio < 70 else 15 if ratio < 90 else 5
    score += discipline_pts
    breakdown["spending_discipline"] = {"score": discipline_pts, "max": 30, "value": f"{ratio:.1f}%"}

    grade = "A+" if score >= 90 else "A" if score >= 80 else "B" if score >= 70 else "C" if score >= 60 else "D"
    return {"score": min(100, score), "grade": grade, "breakdown": breakdown,
            "income": income, "expenses": expenses, "savings": savings}
