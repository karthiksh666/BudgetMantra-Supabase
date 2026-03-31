from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
import uuid
import httpx
from app.auth import get_current_user
from app.database import get_supabase
from app.config import get_settings

router = APIRouter(prefix="/trips", tags=["trips"])


class TripCreate(BaseModel):
    name: str
    destination: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: float = 0
    currency: str = "INR"
    notes: str = ""
    participants: List[str] = []


class TripUpdate(BaseModel):
    name: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: Optional[float] = None
    notes: Optional[str] = None
    participants: Optional[List[str]] = None
    itinerary: Optional[dict] = None


class TripExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str = "general"
    paid_by: str = ""
    split_between: List[str] = []
    date: Optional[str] = None
    notes: str = ""


class GeneratePreferences(BaseModel):
    budget: Optional[float] = None
    duration_days: Optional[int] = None
    travel_style: str = "balanced"
    interests: List[str] = []
    preferences: dict = {}


# ── Trips CRUD ────────────────────────────────────────────────────────────────

@router.get("")
async def list_trips(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("trips").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_trip(body: TripCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(),
        "total_spent": 0,
        "itinerary": {},
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("trips").insert(doc).execute()
    return res.data[0]


@router.get("/{trip_id}")
async def get_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    trip = supabase.table("trips").select("*").eq("id", trip_id).eq("user_id", current_user["id"]).single().execute()
    if not trip.data:
        raise HTTPException(404, "Trip not found")
    expenses = supabase.table("trip_expenses").select("*").eq("trip_id", trip_id).order("created_at").execute()
    return {**trip.data, "expenses": expenses.data or []}


@router.patch("/{trip_id}")
async def update_trip(trip_id: str, body: TripUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("trips").update(updates).eq("id", trip_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Trip not found")
    return res.data[0]


@router.delete("/{trip_id}")
async def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("trip_expenses").delete().eq("trip_id", trip_id).execute()
    supabase.table("trips").delete().eq("id", trip_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


# ── Trip Expenses ─────────────────────────────────────────────────────────────

@router.post("/{trip_id}/expenses", status_code=201)
async def add_trip_expense(trip_id: str, body: TripExpenseCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    trip = supabase.table("trips").select("id, total_spent").eq("id", trip_id).eq("user_id", current_user["id"]).single().execute()
    if not trip.data:
        raise HTTPException(404, "Trip not found")

    expense = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "user_id": current_user["id"],
        "date": body.date or date.today().isoformat(),
        **body.model_dump(exclude={"date"}),
        "created_at": datetime.utcnow().isoformat(),
    }
    supabase.table("trip_expenses").insert(expense).execute()

    new_total = (trip.data.get("total_spent") or 0) + body.amount
    supabase.table("trips").update({"total_spent": new_total}).eq("id", trip_id).execute()

    return expense


@router.delete("/{trip_id}/expenses/{expense_id}")
async def delete_trip_expense(trip_id: str, expense_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    exp = supabase.table("trip_expenses").select("amount").eq("id", expense_id).eq("trip_id", trip_id).single().execute()
    if not exp.data:
        raise HTTPException(404, "Expense not found")

    supabase.table("trip_expenses").delete().eq("id", expense_id).execute()

    trip = supabase.table("trips").select("total_spent").eq("id", trip_id).single().execute()
    if trip.data:
        new_total = max(0, (trip.data.get("total_spent") or 0) - exp.data["amount"])
        supabase.table("trips").update({"total_spent": new_total}).eq("id", trip_id).execute()

    return {"ok": True}


# ── Trip Balances (split calculator) ─────────────────────────────────────────

@router.get("/{trip_id}/balances")
async def get_trip_balances(trip_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    trip = supabase.table("trips").select("*").eq("id", trip_id).eq("user_id", current_user["id"]).single().execute()
    if not trip.data:
        raise HTTPException(404, "Trip not found")

    expenses = supabase.table("trip_expenses").select("*").eq("trip_id", trip_id).execute()
    expense_list = expenses.data or []

    participants = trip.data.get("participants") or []
    paid: dict = {p: 0.0 for p in participants}
    owed: dict = {p: 0.0 for p in participants}

    for exp in expense_list:
        payer = exp.get("paid_by", "")
        amount = exp.get("amount", 0)
        split = exp.get("split_between") or participants
        if payer in paid:
            paid[payer] += amount
        if split:
            share = amount / len(split)
            for p in split:
                if p in owed:
                    owed[p] += share

    balances = {p: round(paid.get(p, 0) - owed.get(p, 0), 2) for p in participants}

    settlements = []
    debtors  = [(p, -b) for p, b in balances.items() if b < -0.01]
    creditors = [(p, b)  for p, b in balances.items() if b > 0.01]
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        debtor, debt   = debtors[i]
        creditor, credit = creditors[j]
        amount = min(debt, credit)
        settlements.append({"from": debtor, "to": creditor, "amount": round(amount, 2)})
        debtors[i]   = (debtor,   debt   - amount)
        creditors[j] = (creditor, credit - amount)
        if debtors[i][1] < 0.01:   i += 1
        if creditors[j][1] < 0.01: j += 1

    return {"balances": balances, "settlements": settlements, "total_spent": trip.data.get("total_spent", 0)}


# ── AI Itinerary Generator ────────────────────────────────────────────────────

@router.post("/{trip_id}/generate")
async def generate_itinerary(trip_id: str, body: GeneratePreferences, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    trip = supabase.table("trips").select("*").eq("id", trip_id).eq("user_id", current_user["id"]).single().execute()
    if not trip.data:
        raise HTTPException(404, "Trip not found")

    settings = get_settings()
    t = trip.data
    prefs = body.model_dump()

    prompt = f"""You are a travel planning expert. Generate a detailed day-by-day itinerary for this trip.

Trip: {t['name']}
Destination: {t['destination']}
Dates: {t.get('start_date', 'TBD')} to {t.get('end_date', 'TBD')}
Budget: ₹{t.get('budget', prefs.get('budget', 0)):,.0f}
Travel style: {prefs.get('travel_style', 'balanced')}
Interests: {', '.join(prefs.get('interests', [])) or 'general sightseeing'}

Return a JSON object with this structure:
{{
  "days": [
    {{
      "day": 1,
      "date": "YYYY-MM-DD",
      "title": "Day title",
      "activities": [
        {{"time": "09:00", "activity": "...", "location": "...", "estimated_cost": 500, "notes": "..."}}
      ],
      "accommodation": {{"name": "...", "estimated_cost": 2000}},
      "meals": {{"breakfast": "...", "lunch": "...", "dinner": "..."}},
      "estimated_daily_cost": 5000
    }}
  ],
  "total_estimated_cost": 25000,
  "tips": ["tip1", "tip2"],
  "packing_list": ["item1", "item2"]
}}

Return ONLY valid JSON."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-haiku-4-5-20251001", "max_tokens": 4096, "messages": [{"role": "user", "content": prompt}]},
            )
            raw = resp.json()["content"][0]["text"].strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            import json
            itinerary = json.loads(raw)
    except Exception as e:
        itinerary = {"error": str(e), "days": [], "tips": ["Could not generate itinerary. Please try again."], "packing_list": []}

    supabase.table("trips").update({"itinerary": itinerary}).eq("id", trip_id).execute()
    return {"itinerary": itinerary}
