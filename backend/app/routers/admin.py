import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from app.config import get_settings
from app.database import get_admin_db

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()
logger = logging.getLogger(__name__)


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
    """Unified feed across the `feedback` table (web forms) AND
    `support_tickets` (mobile SupportScreen). Both paths can hold bug reports
    — this endpoint merges them on the fly so the admin UI shows everything
    without a data migration. Support-ticket fields are normalised to the
    feedback shape so existing UI components render unchanged."""
    _check_secret(admin_secret)
    supabase = get_admin_db()

    # Pull both sources (bounded so an avalanche of tickets can't blow memory).
    fq = supabase.table("feedback").select("*")
    if category:
        fq = fq.eq("category", category)
    feedback_items = (fq.limit(2000).execute().data) or []

    ticket_items: list = []
    try:
        tq = supabase.table("support_tickets").select("*")
        if category:
            tq = tq.eq("category", category)
        ticket_items = (tq.limit(2000).execute().data) or []
    except Exception as e:
        logger.info(f"[admin_feedback] support_tickets table unavailable: {e}")
        ticket_items = []

    # Normalise support_tickets → feedback shape.
    # support_tickets fields: id, user_id, email, name, category, subject,
    # description, status, platform, app_version, created_at, updated_at
    for t in ticket_items:
        t.setdefault("user_email", t.pop("email", ""))
        t.setdefault("user_name",  t.pop("name",  ""))
        t.setdefault("bug_title",  t.pop("subject", ""))
        t.setdefault("severity",       "")
        t.setdefault("nps_score",      None)
        t.setdefault("overall_rating", 0)
        t.setdefault("feature_ratings", {})
        t.setdefault("steps_to_reproduce", "")
        t.setdefault("browser_info",
                     " ".join(filter(None, [t.get("platform"), t.get("app_version")])).strip())
        t.setdefault("page", "")
        t.setdefault("is_pro", False)
        t["_source"] = "support_ticket"

    for f in feedback_items:
        f["_source"] = "feedback"

    all_items = feedback_items + ticket_items
    all_items.sort(key=lambda x: x.get("created_at", "") or "", reverse=True)

    total = len(all_items)
    page  = all_items[skip:skip + limit]
    return {"items": page, "total": total}


@router.post("/delete-user")
async def admin_delete_user(body: dict):
    """Permanently disabled. Account deletion must go through the user's own
    'Delete Account' flow so it's authenticated + audit-logged. This admin
    shortcut was too easy to misuse and carried no dry-run or undo. Returns
    a clear 410 so stale admin UIs don't silently succeed."""
    _check_secret(body.get("admin_secret", ""))
    raise HTTPException(
        status_code=410,
        detail=(
            "Admin user-delete is disabled. Users must delete their own "
            "accounts via Profile → Delete Account so the action is "
            "authenticated and logged."
        ),
    )


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
