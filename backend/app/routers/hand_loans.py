from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(prefix="/hand-loans", tags=["hand-loans"])

# Maps mobile values → DB constraint values
_TYPE_MAP = {"lent": "given", "borrowed": "taken"}


def _add_loan_aliases(loan: dict) -> dict:
    """Add mobile-expected field aliases to a DB row."""
    db_type = loan.get("type") or "given"
    loan["loan_type"]  = "lent" if db_type == "given" else "borrowed"
    loan["reason"]     = loan.get("description") or ""
    loan["status"]     = "settled" if loan.get("is_settled") else "active"
    loan["date"]       = (loan.get("created_at") or "")[:10]
    return loan


class HandLoanCreate(BaseModel):
    model_config = {"extra": "ignore"}

    # Mobile sends loan_type ("lent"/"borrowed"); web sends type ("given"/"taken")
    type: Optional[str] = None
    loan_type: Optional[str] = None

    person_name: str
    amount: float
    due_date: Optional[str] = None

    # Mobile sends "reason"; DB column is "description"
    description: str = ""
    reason: Optional[str] = None

    # Mobile may send a date string (stored as created_at)
    date: Optional[str] = None


class HandLoanUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    person_name: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    reason: Optional[str] = None
    is_settled: Optional[bool] = None


class RepaymentBody(BaseModel):
    amount: float


@router.get("")
async def list_loans(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("hand_loans").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return [_add_loan_aliases(l) for l in (res.data or [])]


@router.post("", status_code=201)
async def create_loan(body: HandLoanCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()

    # Resolve type: prefer explicit type, else map loan_type
    raw_type = body.type or ""
    if not raw_type and body.loan_type:
        raw_type = _TYPE_MAP.get(body.loan_type, body.loan_type)
    if raw_type not in ("given", "taken"):
        raw_type = _TYPE_MAP.get(raw_type, "given")

    description = body.description or body.reason or ""

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "type": raw_type,
        "person_name": body.person_name,
        "amount": body.amount,
        "due_date": body.due_date,
        "description": description,
        "remaining": body.amount,
        "is_settled": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = supabase.table("hand_loans").insert(doc).execute()
    return _add_loan_aliases(res.data[0])


@router.put("/{loan_id}")
async def update_loan(loan_id: str, body: HandLoanUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    updates = body.model_dump(exclude_none=True)
    # Merge reason → description
    if "reason" in updates and "description" not in updates:
        updates["description"] = updates.pop("reason")
    else:
        updates.pop("reason", None)
    res = supabase.table("hand_loans").update(updates).eq("id", loan_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Loan not found")
    return _add_loan_aliases(res.data[0])


@router.post("/{loan_id}/repay")
async def repay(loan_id: str, body: RepaymentBody, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    loan = supabase.table("hand_loans").select("*").eq("id", loan_id).eq("user_id", current_user["id"]).single().execute()
    if not loan.data:
        raise HTTPException(404, "Loan not found")
    new_remaining = max(0, (loan.data["remaining"] or 0) - body.amount)
    updates = {"remaining": new_remaining, "is_settled": new_remaining == 0}
    res = supabase.table("hand_loans").update(updates).eq("id", loan_id).execute()
    return _add_loan_aliases(res.data[0])


@router.delete("/{loan_id}")
async def delete_loan(loan_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("hand_loans").delete().eq("id", loan_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/summary")
async def loans_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    loans = supabase.table("hand_loans").select("*").eq("user_id", current_user["id"]).execute().data or []
    given  = [l for l in loans if l.get("type") == "given"  and not l.get("is_settled")]
    taken  = [l for l in loans if l.get("type") == "taken"  and not l.get("is_settled")]
    total_given = sum(l.get("remaining") or l.get("amount") or 0 for l in given)
    total_taken = sum(l.get("remaining") or l.get("amount") or 0 for l in taken)
    return {
        "total_given": round(total_given, 2),
        "total_taken": round(total_taken, 2),
        "net": round(total_given - total_taken, 2),
        "count_given": len(given),
        "count_taken": len(taken),
    }
