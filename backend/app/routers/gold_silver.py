import asyncio
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["gold-silver"])


class GoldItemCreate(BaseModel):
    item_name: str
    weight_grams: float
    purity: str = "24K"
    buy_price_per_gram: float = 0
    buy_date: Optional[str] = None
    notes: str = ""


class SilverItemCreate(BaseModel):
    item_name: str
    weight_grams: float
    purity: str = "999"
    buy_price_per_gram: float = 0
    buy_date: Optional[str] = None
    notes: str = ""


async def _fetch_metal_price(metal: str) -> dict:
    """Fetch live gold/silver price from public API."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"https://www.goldapi.io/api/{metal}/INR",
                                 headers={"x-access-token": "goldapi-demo"})
            if r.status_code == 200:
                data = r.json()
                price_per_gram = data.get("price_gram_24k") or data.get("price", 0) / 31.1035
                return {"price_per_gram": round(price_per_gram, 2), "price_per_gram_inr": round(price_per_gram, 2)}
    except Exception:
        pass
    return {"price_per_gram": None, "price_per_gram_inr": None, "error": "unavailable"}


# ── Gold ──────────────────────────────────────────────────────

@router.get("/gold/price")
async def gold_price():
    return await _fetch_metal_price("XAU")


@router.get("/gold")
async def list_gold(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("gold_items").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/gold", status_code=201)
async def add_gold(body: GoldItemCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("gold_items").insert(doc).execute()
    return res.data[0]


@router.delete("/gold/{item_id}")
async def delete_gold(item_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("gold_items").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


# ── Silver ────────────────────────────────────────────────────

@router.get("/silver/price")
async def silver_price():
    return await _fetch_metal_price("XAG")


@router.get("/silver")
async def list_silver(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("silver_items").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/silver", status_code=201)
async def add_silver(body: SilverItemCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = supabase.table("silver_items").insert(doc).execute()
    return res.data[0]


@router.delete("/silver/{item_id}")
async def delete_silver(item_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    supabase.table("silver_items").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}


# ── Buy-Goal metal prices ─────────────────────────────────────────────────────

@router.get("/buy-goal/metal-prices")
async def buy_goal_metal_prices(_: dict = Depends(get_current_user)):
    """Live gold + silver prices for the Buy Goals calculator in TripsScreen."""
    gold, silver = await asyncio.gather(_fetch_metal_price("XAU"), _fetch_metal_price("XAG"))
    gold_per_gram   = gold.get("price") or 9500
    silver_per_gram = silver.get("price") or 100
    return {
        "gold": {
            "per_gram": round(gold_per_gram),
            "per_10g":  round(gold_per_gram * 10),
            "per_100g": round(gold_per_gram * 100),
            "source":   gold.get("source", "estimated"),
        },
        "silver": {
            "per_gram":  round(silver_per_gram),
            "per_100g":  round(silver_per_gram * 100),
            "per_kg":    round(silver_per_gram * 1000),
            "source":    silver.get("source", "estimated"),
        },
    }


@router.get("/gold/summary")
async def gold_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    items = supabase.table("gold_items").select("*").eq("user_id", current_user["id"]).execute().data or []
    total_weight   = sum(i.get("weight_grams") or 0 for i in items)
    total_invested = sum((i.get("weight_grams") or 0) * (i.get("buy_price_per_gram") or 0) for i in items)
    return {"count": len(items), "total_weight_grams": round(total_weight, 2), "total_invested": round(total_invested, 2), "items": items}


@router.get("/silver/summary")
async def silver_summary(current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    items = supabase.table("silver_items").select("*").eq("user_id", current_user["id"]).execute().data or []
    total_weight   = sum(i.get("weight_grams") or 0 for i in items)
    total_invested = sum((i.get("weight_grams") or 0) * (i.get("buy_price_per_gram") or 0) for i in items)
    return {"count": len(items), "total_weight_grams": round(total_weight, 2), "total_invested": round(total_invested, 2), "items": items}


@router.put("/gold/{item_id}")
async def update_gold(item_id: str, body: GoldItemCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("gold_items").update(body.model_dump()).eq("id", item_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Item not found")
    return res.data[0]


@router.put("/silver/{item_id}")
async def update_silver(item_id: str, body: SilverItemCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_admin_db()
    res = supabase.table("silver_items").update(body.model_dump()).eq("id", item_id).eq("user_id", current_user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Item not found")
    return res.data[0]
