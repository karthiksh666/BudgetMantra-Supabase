"""
Budget Mantra — Background job scheduler.

Jobs:
  - emi_reminders    : daily 09:00 IST  — notify users of EMIs due within 3 days
  - goal_alerts      : daily 09:15 IST  — goals near deadline (7 days) or near target (90%)
  - weekly_digest    : Monday 09:30 IST — last-7-days spending summary
  - monthly_summary  : 1st 09:00 IST   — previous-month income vs expenses

All jobs write a row to the `notifications` table AND send an Expo push if the user
has registered a push token in profiles.push_token.
"""
import logging
import uuid
from datetime import datetime, date, timedelta

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.database import get_admin_db
from app.utils.push import send_push_batch

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

# ── Helpers ───────────────────────────────────────────────────────────────────


def _fmt_inr(amount: float) -> str:
    """Format float as ₹1,23,456."""
    try:
        s = f"{abs(int(amount)):,}"
        # Convert to Indian grouping (last 3 digits, then 2 each)
        parts = s.split(",")
        if len(parts) > 1:
            inr = parts[0]
            for p in parts[1:]:
                inr += "," + p
        else:
            inr = s
        return f"₹{inr}"
    except Exception:
        return f"₹{amount:.0f}"


def _create_notification(supabase, user_id: str, title: str, message: str, notif_type: str):
    """Insert a notification row. Silently ignores errors."""
    try:
        supabase.table("notifications").insert({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": title,
            "message": message,
            "type": notif_type,
            "read": False,
            "created_at": datetime.now(IST).isoformat(),
        }).execute()
    except Exception as exc:
        logger.warning("Failed to create notification for %s: %s", user_id, exc)


def _get_users_with_pref(supabase, pref_key: str) -> list[dict]:
    """
    Returns list of {user_id, push_token} for users who have `pref_key` enabled.
    Joins notification_prefs with profiles to get push_token.
    """
    try:
        prefs = supabase.table("notification_prefs").select("user_id").eq(pref_key, True).execute()
        if not prefs.data:
            return []
        user_ids = [r["user_id"] for r in prefs.data]

        # Get push tokens for these users
        profiles = supabase.table("profiles").select("id, push_token").in_("id", user_ids).execute()
        token_map = {p["id"]: p.get("push_token") for p in (profiles.data or [])}

        return [{"user_id": uid, "push_token": token_map.get(uid)} for uid in user_ids]
    except Exception as exc:
        logger.error("_get_users_with_pref failed for %s: %s", pref_key, exc)
        return []


# ── Job 1: EMI Reminders ──────────────────────────────────────────────────────


def run_emi_reminders():
    """Notify users of active EMIs due within the next 3 days."""
    logger.info("[scheduler] run_emi_reminders start")
    supabase = get_admin_db()
    today = date.today()
    window_end = today + timedelta(days=3)

    users = _get_users_with_pref(supabase, "emi_reminders")
    push_messages = []

    for u in users:
        user_id = u["user_id"]
        try:
            res = supabase.table("emis").select("name, loan_name, emi_amount, monthly_payment, next_due_date").eq("user_id", user_id).eq("status", "active").execute()
            emis = res.data or []
        except Exception:
            continue

        for emi in emis:
            due_str = emi.get("next_due_date")
            if not due_str:
                continue
            try:
                due = date.fromisoformat(due_str[:10])
            except ValueError:
                continue
            if not (today <= due <= window_end):
                continue

            name = emi.get("name") or emi.get("loan_name") or "EMI"
            amount = emi.get("emi_amount") or emi.get("monthly_payment") or 0
            days_left = (due - today).days

            if days_left == 0:
                title = f"EMI Due Today — {name}"
                message = f"Your {name} EMI of {_fmt_inr(amount)} is due today. Ensure sufficient balance."
            else:
                title = f"EMI Due in {days_left} Day{'s' if days_left > 1 else ''} — {name}"
                message = f"Your {name} EMI of {_fmt_inr(amount)} is due on {due.strftime('%d %b')}."

            _create_notification(supabase, user_id, title, message, "emi_reminder")

            if u.get("push_token"):
                push_messages.append({"to": u["push_token"], "title": title, "body": message,
                                       "data": {"type": "emi_reminder", "user_id": user_id}})

    if push_messages:
        send_push_batch(push_messages)
    logger.info("[scheduler] run_emi_reminders done — %d pushes queued", len(push_messages))


# ── Job 2: Goal Alerts ────────────────────────────────────────────────────────


def run_goal_alerts():
    """Alert users when a goal is due in 7 days OR has reached 90% of target."""
    logger.info("[scheduler] run_goal_alerts start")
    supabase = get_admin_db()
    today = date.today()
    week_out = today + timedelta(days=7)

    users = _get_users_with_pref(supabase, "goal_alerts")
    push_messages = []

    for u in users:
        user_id = u["user_id"]
        try:
            res = supabase.table("savings_goals").select("name, target_amount, current_amount, target_date, status").eq("user_id", user_id).neq("status", "completed").execute()
            goals = res.data or []
        except Exception:
            continue

        for goal in goals:
            name = goal.get("name", "Goal")
            target = float(goal.get("target_amount") or 0)
            current = float(goal.get("current_amount") or 0)
            target_date_str = goal.get("target_date")

            # Near-target alert (90%+)
            if target > 0 and current / target >= 0.9 and current < target:
                remaining = target - current
                pct = int(current / target * 100)
                title = f"Almost There! {name} at {pct}%"
                message = f"You're {pct}% of the way to your {name} goal. Just {_fmt_inr(remaining)} more to go!"
                _create_notification(supabase, user_id, title, message, "goal_alert")
                if u.get("push_token"):
                    push_messages.append({"to": u["push_token"], "title": title, "body": message,
                                           "data": {"type": "goal_alert", "user_id": user_id}})

            # Deadline alert (7 days)
            if target_date_str:
                try:
                    target_date = date.fromisoformat(target_date_str[:10])
                except ValueError:
                    continue
                if today < target_date <= week_out and current < target:
                    days_left = (target_date - today).days
                    remaining = target - current
                    title = f"Goal Deadline in {days_left} Day{'s' if days_left > 1 else ''} — {name}"
                    message = f"Your {name} goal deadline is {target_date.strftime('%d %b')}. You need {_fmt_inr(remaining)} more to hit your target."
                    _create_notification(supabase, user_id, title, message, "goal_alert")
                    if u.get("push_token"):
                        push_messages.append({"to": u["push_token"], "title": title, "body": message,
                                               "data": {"type": "goal_alert", "user_id": user_id}})

    if push_messages:
        send_push_batch(push_messages)
    logger.info("[scheduler] run_goal_alerts done — %d pushes queued", len(push_messages))


# ── Job 3: Weekly Digest ──────────────────────────────────────────────────────


def run_weekly_digest():
    """Every Monday: send last-7-days spending summary."""
    logger.info("[scheduler] run_weekly_digest start")
    supabase = get_admin_db()
    today = date.today()
    week_ago = (today - timedelta(days=7)).isoformat()
    today_str = today.isoformat()

    users = _get_users_with_pref(supabase, "weekly_digest")
    push_messages = []

    for u in users:
        user_id = u["user_id"]
        try:
            res = supabase.table("transactions").select("amount, type, category").eq("user_id", user_id).gte("date", week_ago).lte("date", today_str).execute()
            txns = res.data or []
        except Exception:
            continue

        if not txns:
            continue

        total_income   = sum(float(t["amount"]) for t in txns if t.get("type") == "income")
        total_expenses = sum(float(t["amount"]) for t in txns if t.get("type") in ("expense", None))

        # Top spending category
        cat_totals: dict[str, float] = {}
        for t in txns:
            if t.get("type") in ("expense", None) and t.get("category"):
                cat_totals[t["category"]] = cat_totals.get(t["category"], 0) + float(t["amount"])
        top_cat = max(cat_totals, key=cat_totals.get) if cat_totals else None

        title = "Your Weekly Digest 📊"
        lines = [
            f"Week ending {today.strftime('%d %b')}:",
            f"💰 Income: {_fmt_inr(total_income)}",
            f"💸 Spent: {_fmt_inr(total_expenses)}",
        ]
        if top_cat:
            lines.append(f"🏆 Top category: {top_cat} ({_fmt_inr(cat_totals[top_cat])})")
        message = "  ".join(lines)

        _create_notification(supabase, user_id, title, message, "weekly_digest")
        if u.get("push_token"):
            push_messages.append({"to": u["push_token"], "title": title, "body": message,
                                   "data": {"type": "weekly_digest", "user_id": user_id}})

    if push_messages:
        send_push_batch(push_messages)
    logger.info("[scheduler] run_weekly_digest done — %d pushes queued", len(push_messages))


# ── Job 4: Monthly Summary ────────────────────────────────────────────────────


def run_monthly_summary():
    """On the 1st: send previous-month income vs expenses summary."""
    logger.info("[scheduler] run_monthly_summary start")
    supabase = get_admin_db()
    today = date.today()
    # Previous month range
    first_of_this = today.replace(day=1)
    last_of_prev  = first_of_this - timedelta(days=1)
    first_of_prev = last_of_prev.replace(day=1)
    month_name    = first_of_prev.strftime("%B")

    users = _get_users_with_pref(supabase, "monthly_summary")
    push_messages = []

    for u in users:
        user_id = u["user_id"]
        try:
            res = supabase.table("transactions").select("amount, type, category").eq("user_id", user_id).gte("date", first_of_prev.isoformat()).lte("date", last_of_prev.isoformat()).execute()
            txns = res.data or []
        except Exception:
            continue

        if not txns:
            continue

        total_income   = sum(float(t["amount"]) for t in txns if t.get("type") == "income")
        total_expenses = sum(float(t["amount"]) for t in txns if t.get("type") in ("expense", None))
        savings        = total_income - total_expenses

        # Top 3 expense categories
        cat_totals: dict[str, float] = {}
        for t in txns:
            if t.get("type") in ("expense", None) and t.get("category"):
                cat_totals[t["category"]] = cat_totals.get(t["category"], 0) + float(t["amount"])
        top3 = sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)[:3]

        title = f"{month_name} Summary 📅"
        lines = [
            f"Income: {_fmt_inr(total_income)}",
            f"Expenses: {_fmt_inr(total_expenses)}",
            f"Saved: {_fmt_inr(savings)}",
        ]
        if top3:
            cats = ", ".join(f"{c} ({_fmt_inr(a)})" for c, a in top3)
            lines.append(f"Top spend: {cats}")
        message = " | ".join(lines)

        _create_notification(supabase, user_id, title, message, "monthly_summary")
        if u.get("push_token"):
            push_messages.append({"to": u["push_token"], "title": title, "body": message,
                                   "data": {"type": "monthly_summary", "user_id": user_id}})

    if push_messages:
        send_push_batch(push_messages)
    logger.info("[scheduler] run_monthly_summary done — %d pushes queued", len(push_messages))


# ── Scheduler setup ───────────────────────────────────────────────────────────


def create_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone=IST)

    # EMI reminders — daily at 09:00 IST
    scheduler.add_job(run_emi_reminders, CronTrigger(hour=9, minute=0, timezone=IST),
                      id="emi_reminders", replace_existing=True, misfire_grace_time=3600)

    # Goal alerts — daily at 09:15 IST
    scheduler.add_job(run_goal_alerts, CronTrigger(hour=9, minute=15, timezone=IST),
                      id="goal_alerts", replace_existing=True, misfire_grace_time=3600)

    # Weekly digest — every Monday at 09:30 IST
    scheduler.add_job(run_weekly_digest, CronTrigger(day_of_week="mon", hour=9, minute=30, timezone=IST),
                      id="weekly_digest", replace_existing=True, misfire_grace_time=3600)

    # Monthly summary — 1st of every month at 09:00 IST
    scheduler.add_job(run_monthly_summary, CronTrigger(day=1, hour=9, minute=0, timezone=IST),
                      id="monthly_summary", replace_existing=True, misfire_grace_time=3600)

    return scheduler
