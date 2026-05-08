from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db
from app.utils.ai_categorise import auto_categorise

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionCreate(BaseModel):
    model_config = {"extra": "ignore"}

    amount: float
    type: str                           # "income" | "expense"
    description: str
    date: str                           # ISO date string
    # Mobile sends category_id (UUID ref); some clients send category (name text)
    category_id: Optional[str] = None
    category: Optional[str] = None      # category name — resolved from category_id if absent
    payment_mode: str = "UPI"
    tags: list[str] = []
    is_recurring: bool = False
    recurring_id: Optional[str] = None
    source: str = "manual"


class TransactionUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    amount: Optional[float] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    payment_mode: Optional[str] = None
    tags: Optional[list[str]] = None


def _add_category_name(txns: list[dict]) -> list[dict]:
    """Ensure every transaction has a category_name field for mobile display."""
    for t in txns:
        if "category_name" not in t:
            t["category_name"] = t.get("category") or "Uncategorised"
    return txns


@router.get("")
async def list_transactions(
    # Mobile sends separate month (int) + year (int)
    month: Optional[int] = None,
    year: Optional[int] = None,
    # Some callers send combined "YYYY-MM" string
    month_str: Optional[str] = None,
    type: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 500,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_admin_db()
    q = supabase.table("transactions").select("*").eq("user_id", current_user["id"])

    # Resolve month range from whichever format was sent
    if month and year:
        end_month = month % 12 + 1
        end_year = year + (1 if end_month == 1 else 0)
        start = f"{year}-{month:02d}-01"
        end   = f"{end_year}-{end_month:02d}-01"
        q = q.gte("date", start).lt("date", end)
    elif month_str and "-" in month_str:
        yr, m = month_str.split("-")
        end_m = int(m) % 12 + 1
        end_y = int(yr) + (1 if end_m == 1 else 0)
        start = f"{month_str}-01"
        end   = f"{end_y}-{end_m:02d}-01"
        q = q.gte("date", start).lt("date", end)

    if type:
        q = q.eq("type", type)
    if category:
        q = q.eq("category", category)

    res = q.order("date", desc=True).limit(limit).execute()
    return _add_category_name(res.data or [])


@router.post("", status_code=201)
async def create_transaction(body: TransactionCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()

    # 1. Resolve category: explicit > category_id lookup > AI auto-categorise
    category_name = body.category or ""
    if not category_name and body.category_id:
        cat_res = supabase.table("budget_categories")\
            .select("name")\
            .eq("id", body.category_id)\
            .eq("user_id", current_user["id"])\
            .maybe_single()\
            .execute()
        if cat_res.data:
            category_name = cat_res.data["name"]

    # 2. AI fallback — only description is sent to Claude (never the amount)
    if not category_name and body.description:
        ai_category = await auto_categorise(body.description, body.type)
        if ai_category:
            category_name = ai_category

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "amount": body.amount,
        "type": body.type,
        "description": body.description,
        "date": body.date,
        "category": category_name,
        "payment_mode": body.payment_mode,
        "tags": body.tags,
        "is_recurring": body.is_recurring,
        "source": body.source,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.recurring_id:
        doc["recurring_id"] = body.recurring_id

    res = supabase.table("transactions").insert(doc).execute()
    txn = res.data[0]
    txn["category_name"] = txn.get("category") or "Uncategorised"
    return txn


@router.put("/{transaction_id}")
async def update_transaction(
    transaction_id: str,
    body: TransactionUpdate,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_admin_db()
    updates = body.model_dump(exclude_none=True)

    # Resolve category_id → category name if needed
    if "category_id" in updates and "category" not in updates:
        cat_res = supabase.table("budget_categories")\
            .select("name")\
            .eq("id", updates.pop("category_id"))\
            .eq("user_id", current_user["id"])\
            .maybe_single()\
            .execute()
        if cat_res.data:
            updates["category"] = cat_res.data["name"]
    else:
        updates.pop("category_id", None)

    if not updates:
        raise HTTPException(400, "Nothing to update")

    res = supabase.table("transactions")\
        .update(updates)\
        .eq("id", transaction_id)\
        .eq("user_id", current_user["id"])\
        .execute()
    if not res.data:
        raise HTTPException(404, "Transaction not found")
    txn = res.data[0]
    txn["category_name"] = txn.get("category") or "Uncategorised"
    return txn


@router.delete("/{transaction_id}")
async def delete_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("transactions")\
        .delete()\
        .eq("id", transaction_id)\
        .eq("user_id", current_user["id"])\
        .execute()
    return {"ok": True}


@router.get("/transactions/today-summary")
async def get_today_summary(current_user: dict = Depends(get_current_user)):
    """Return today's expense and income totals."""
    from datetime import datetime, timezone
    supabase = get_admin_db()
    today = datetime.now(timezone.utc).date().isoformat()
    res = supabase.table("transactions").select("amount,type").eq("user_id", current_user["id"]).eq("date", today).execute()
    txns = res.data or []
    expense = sum(t["amount"] for t in txns if t.get("type") == "expense")
    income = sum(t["amount"] for t in txns if t.get("type") == "income")
    income_res = supabase.table("income_entries").select("amount").eq("user_id", current_user["id"]).eq("date", today).execute()
    income += sum(i["amount"] for i in (income_res.data or []))
    return {"date": today, "total_expense": round(expense, 2), "total_income": round(income, 2), "net": round(income - expense, 2), "count": len(txns)}


@router.post("/transactions/bulk")
async def bulk_import_transactions(body: dict, current_user: dict = Depends(get_current_user)):
    """Bulk insert transactions. Body: {transactions: [{description, amount, date, type, category}]}"""
    import uuid
    from datetime import datetime, timezone
    supabase = get_admin_db()
    txns = body.get("transactions", [])
    if not txns:
        return {"imported": 0, "duplicates": 0}
    uid = current_user["id"]
    imported = 0
    duplicates = 0
    for t in txns:
        # Check duplicate by (user_id, date, amount, description)
        existing = supabase.table("transactions").select("id").eq("user_id", uid).eq("date", t.get("date","")).eq("amount", t.get("amount", 0)).eq("description", t.get("description","")).execute()
        if existing.data:
            duplicates += 1
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "description": t.get("description", ""),
            "amount": float(t.get("amount", 0)),
            "date": t.get("date", ""),
            "type": t.get("type", "expense"),
            "category": t.get("category", "Uncategorised"),
            "source": "bulk_import",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("transactions").insert(doc).execute()
        imported += 1
    return {"imported": imported, "duplicates": duplicates}


@router.post("/income-entries/bulk")
async def bulk_import_income(body: dict, current_user: dict = Depends(get_current_user)):
    """Bulk insert income entries."""
    import uuid
    from datetime import datetime, timezone
    supabase = get_admin_db()
    entries = body.get("entries", body.get("transactions", []))
    uid = current_user["id"]
    imported = 0
    for e in entries:
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "source": e.get("source", e.get("description", "")),
            "amount": float(e.get("amount", 0)),
            "date": e.get("date", ""),
            "type": e.get("type", "salary"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("income_entries").insert(doc).execute()
        imported += 1
    return {"imported": imported}
