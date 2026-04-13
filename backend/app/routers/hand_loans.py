from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from app.auth import get_current_user
from app.database import get_supabase

router = APIRouter(prefix="/hand-loans", tags=["hand-loans"])


class HandLoanCreate(BaseModel):
    type: str                    # "given" | "taken"
    person_name: str
    amount: float
    due_date: Optional[str] = None
    description: str = ""


class HandLoanUpdate(BaseModel):
    person_name: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    is_settled: Optional[bool] = None


class RepaymentBody(BaseModel):
    amount: float


@router.get("")
async def list_loans(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("hand_loans").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.post("", status_code=201)
async def create_loan(body: HandLoanCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(),
        "remaining": body.amount,
        "is_settled": False,
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("hand_loans").insert(doc).execute()
    return res.data[0]


@router.put("/{loan_id}")
async def update_loan(loan_id: str, body: HandLoanUpdate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    res = supabase.table("hand_loans").update(updates).eq("id", loan_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Loan not found")
    return res.data[0]


@router.post("/{loan_id}/repay")
async def repay(loan_id: str, body: RepaymentBody, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    loan = supabase.table("hand_loans").select("*").eq("id", loan_id).eq("user_id", current_user["id"]).single().execute()
    if not loan.data:
        raise HTTPException(404, "Loan not found")
    new_remaining = max(0, (loan.data["remaining"] or 0) - body.amount)
    updates = {"remaining": new_remaining, "is_settled": new_remaining == 0}
    res = supabase.table("hand_loans").update(updates).eq("id", loan_id).execute()
    return res.data[0]


@router.delete("/{loan_id}")
async def delete_loan(loan_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("hand_loans").delete().eq("id", loan_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.get("/summary")
async def loans_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
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
