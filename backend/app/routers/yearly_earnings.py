from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["yearly-earnings"])


class EarningSegment(BaseModel):
    role: str = ""
    ctc_annual: float = 0
    from_month: int
    to_month: int


class YearlyEarningBody(BaseModel):
    year: int
    ctc_annual: float = 0
    months: int = 12
    notes: str = ""
    segments: Optional[List[EarningSegment]] = None


def _validate_year(year: int):
    if year < 1980 or year > 2060:
        raise HTTPException(status_code=400, detail="year must be between 1980 and 2060")


def _validate_segments(segments):
    if not segments:
        return None
    cleaned = []
    for s in segments:
        d = s.model_dump() if hasattr(s, "model_dump") else dict(s)
        fm, tm = int(d.get("from_month") or 0), int(d.get("to_month") or 0)
        if fm < 1 or fm > 12 or tm < 1 or tm > 12 or tm < fm:
            raise HTTPException(status_code=400, detail="Each segment needs from_month <= to_month, both in 1-12.")
        if float(d.get("ctc_annual", 0)) < 0:
            raise HTTPException(status_code=400, detail="Segment CTC cannot be negative.")
        cleaned.append({
            "role": str(d.get("role") or ""),
            "ctc_annual": float(d.get("ctc_annual") or 0),
            "from_month": fm,
            "to_month": tm,
        })
    cleaned.sort(key=lambda x: x["from_month"])
    for i in range(1, len(cleaned)):
        if cleaned[i]["from_month"] <= cleaned[i - 1]["to_month"]:
            raise HTTPException(status_code=400, detail="Segments cannot overlap.")
    return cleaned


@router.get("/yearly-earnings")
async def list_yearly_earnings(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("yearly_earnings").select("*").eq("user_id", current_user["id"]).order("year").execute()
    return res.data or []


@router.post("/yearly-earnings", status_code=201)
async def upsert_yearly_earning(body: YearlyEarningBody, current_user: dict = Depends(get_current_user)):
    _validate_year(body.year)
    if body.ctc_annual < 0:
        raise HTTPException(status_code=400, detail="ctc_annual cannot be negative")
    months = max(0, min(12, int(body.months or 12)))
    segments = _validate_segments(body.segments)
    supabase = get_admin_db()
    uid = current_user["id"]
    now = datetime.now(timezone.utc).isoformat()
    existing = supabase.table("yearly_earnings").select("*").eq("user_id", uid).eq("year", body.year).execute()
    update_set = {
        "ctc_annual": body.ctc_annual,
        "months": months,
        "notes": body.notes,
        "segments": segments,
        "updated_at": now,
    }
    if existing.data:
        res = supabase.table("yearly_earnings").update(update_set).eq("user_id", uid).eq("year", body.year).execute()
        return res.data[0] if res.data else {**existing.data[0], **update_set}
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "year": body.year,
        "ctc_annual": body.ctc_annual,
        "months": months,
        "notes": body.notes,
        "segments": segments,
        "created_at": now,
        "updated_at": now,
    }
    res = supabase.table("yearly_earnings").insert(doc).execute()
    return res.data[0] if res.data else doc


@router.patch("/yearly-earnings/{year}")
async def update_yearly_earning(year: int, body: dict, current_user: dict = Depends(get_current_user)):
    _validate_year(year)
    supabase = get_admin_db()
    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "ctc_annual" in body:
        v = float(body["ctc_annual"])
        if v < 0:
            raise HTTPException(status_code=400, detail="ctc_annual must be non-negative")
        updates["ctc_annual"] = v
    if "months" in body:
        m = int(body["months"])
        if m < 0 or m > 12:
            raise HTTPException(status_code=400, detail="months must be 0-12")
        updates["months"] = m
    if "notes" in body:
        updates["notes"] = str(body.get("notes") or "")
    if "segments" in body:
        raw = body.get("segments")
        updates["segments"] = _validate_segments(raw) if raw else None
    res = supabase.table("yearly_earnings").update(updates).eq("user_id", current_user["id"]).eq("year", year).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Record not found")
    return res.data[0]


@router.delete("/yearly-earnings/{year}", status_code=204)
async def delete_yearly_earning(year: int, current_user: dict = Depends(get_current_user)):
    _validate_year(year)
    supabase = get_admin_db()
    supabase.table("yearly_earnings").delete().eq("user_id", current_user["id"]).eq("year", year).execute()


@router.get("/yearly-earnings/summary")
async def yearly_earnings_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("yearly_earnings").select("year,ctc_annual").eq("user_id", current_user["id"]).order("year").execute()
    records = res.data or []
    if not records:
        return {}
    ctcs = [r["ctc_annual"] for r in records if r.get("ctc_annual", 0) > 0]
    if not ctcs:
        return {"total_years": len(records)}
    latest = records[-1]
    earliest = records[0]
    growth = 0.0
    if len(records) > 1 and earliest["ctc_annual"] > 0:
        growth = (latest["ctc_annual"] - earliest["ctc_annual"]) / earliest["ctc_annual"] * 100
    return {
        "total_years": len(records),
        "average_ctc": round(sum(ctcs) / len(ctcs), 2),
        "peak_ctc": max(ctcs),
        "peak_year": max(records, key=lambda r: r.get("ctc_annual", 0))["year"],
        "latest_ctc": latest["ctc_annual"],
        "latest_year": latest["year"],
        "growth_rate_pct": round(growth, 1),
    }
