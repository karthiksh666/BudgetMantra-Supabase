from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from app.config import get_settings
from app.database import get_admin_db

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


def _check_secret(admin_secret: str):
    if not settings.admin_secret or admin_secret != settings.admin_secret:
        raise HTTPException(403, "Invalid admin secret")


@router.get("/stats")
async def admin_stats(admin_secret: str = Query("")):
    _check_secret(admin_secret)
    supabase = get_admin_db()
    total_users = supabase.table("profiles").select("id", count="exact").execute().count or 0
    pro_users   = supabase.table("profiles").select("id", count="exact").eq("is_pro", True).execute().count or 0
    total_txns  = supabase.table("transactions").select("id", count="exact").execute().count or 0
    total_feedback = supabase.table("feedback").select("id", count="exact").execute().count or 0

    # NPS average
    nps_res = supabase.table("feedback").select("nps_score").execute()
    scores = [r["nps_score"] for r in (nps_res.data or []) if r.get("nps_score") is not None]
    avg_nps = round(sum(scores) / len(scores), 1) if scores else None

    return {
        "total_users": total_users,
        "pro_users": pro_users,
        "pro_pct": round((pro_users / total_users * 100), 1) if total_users else 0,
        "total_transactions": total_txns,
        "total_feedback": total_feedback,
        "avg_nps": avg_nps,
    }


@router.get("/users")
async def admin_users(admin_secret: str = Query(""), skip: int = 0, limit: int = 100):
    _check_secret(admin_secret)
    supabase = get_admin_db()
    res = supabase.table("profiles").select("*").order("created_at", desc=True).range(skip, skip + limit - 1).execute()
    total = supabase.table("profiles").select("id", count="exact").execute().count or 0
    return {"items": res.data or [], "total": total}


@router.get("/feedback")
async def admin_feedback(admin_secret: str = Query(""), category: str = "", skip: int = 0, limit: int = 50):
    _check_secret(admin_secret)
    supabase = get_admin_db()
    q = supabase.table("feedback").select("*").order("created_at", desc=True)
    if category:
        q = q.eq("category", category)
    res = q.range(skip, skip + limit - 1).execute()
    total = supabase.table("feedback").select("id", count="exact").execute().count or 0
    return {"items": res.data or [], "total": total}


@router.post("/delete-user")
async def admin_delete_user(body: dict):
    _check_secret(body.get("admin_secret", ""))
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(400, "Email required")
    supabase = get_admin_db()
    user = supabase.table("profiles").select("id").eq("email", email).execute()
    if not user.data:
        raise HTTPException(404, "User not found")
    user_id = user.data[0]["id"]
    # Delete from Supabase Auth (cascades to profiles + all tables via FK)
    supabase.auth.admin.delete_user(user_id)
    return {"ok": True, "deleted": email}


@router.post("/make-admin")
async def make_admin(body: dict):
    _check_secret(body.get("admin_secret", ""))
    email = body.get("email", "").strip().lower()
    supabase = get_admin_db()
    res = supabase.table("profiles").update({"is_admin": True}).eq("email", email).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    return {"ok": True}


@router.get("/api-health")
async def api_health(admin_secret: str = Query("")):
    """Ping Anthropic API to verify the key is valid."""
    _check_secret(admin_secret)
    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=10,
            messages=[{"role": "user", "content": "ping"}],
        )
        return {
            "anthropic": "ok",
            "model": resp.model,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {
            "anthropic": "error",
            "detail": str(e),
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }


@router.get("/api-usage")
async def api_usage(admin_secret: str = Query("")):
    """Return API usage stats. Placeholder until ai_usage table exists."""
    _check_secret(admin_secret)
    supabase = get_admin_db()
    total_users = supabase.table("profiles").select("id", count="exact").execute().count or 0
    pro_users = supabase.table("profiles").select("id", count="exact").eq("is_pro", True).execute().count or 0

    return {
        "total_users": total_users,
        "pro_users": pro_users,
        "ai_requests_today": None,
        "ai_requests_month": None,
        "ai_tokens_month": None,
        "note": "Detailed AI usage tracking not yet implemented. Add an ai_usage table to enable.",
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
