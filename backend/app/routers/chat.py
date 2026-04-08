"""
Chanakya AI chat — mirrors the MongoDB backend exactly.
Loads full financial context, calls Claude, parses JSON action blocks,
executes actions against Supabase, and returns clean text (no JSON shown to user).
"""
import json
import re
import uuid
import math
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import anthropic
from app.auth import get_current_user
from app.database import get_supabase
from app.config import get_settings

router = APIRouter(prefix="/chatbot", tags=["chat"])
settings = get_settings()


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


def _today_ist() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _strip_json_block(text: str) -> str:
    """Remove ```json ... ``` blocks from Claude's reply."""
    text = re.sub(r"```json\s*[\[\{].*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"```\s*[\[\{].*?```", "", text, flags=re.DOTALL)
    return text.strip()


def _parse_action_block(text: str):
    """Extract and parse the first JSON object/array from Claude's response."""
    match = re.search(r"```(?:json)?\s*([\[\{].*?)```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except Exception:
            pass
    # Try bare JSON (entire response is JSON)
    try:
        return json.loads(text.strip())
    except Exception:
        pass
    return None


def _calc_emi(principal: float, annual_rate: float, tenure_months: int) -> int:
    if not annual_rate:
        return math.ceil(principal / tenure_months)
    r = annual_rate / 12 / 100
    return math.ceil(principal * r * (1 + r) ** tenure_months / ((1 + r) ** tenure_months - 1))


@router.get("/history")
async def get_history(
    limit: int = 50,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    q = (
        supabase.table("chat_messages")
        .select("*")
        .eq("user_id", current_user["id"])
        .order("created_at", desc=False)
        .limit(limit)
    )
    if before:
        # Get the created_at of the `before` message, then fetch older ones
        ref = supabase.table("chat_messages").select("created_at").eq("id", before).single().execute()
        if ref.data:
            q = (
                supabase.table("chat_messages")
                .select("*")
                .eq("user_id", current_user["id"])
                .lt("created_at", ref.data["created_at"])
                .order("created_at", desc=False)
                .limit(limit)
            )
    res = q.execute()
    return res.data or []


@router.get("/search")
async def search_history(q: str = "", current_user: dict = Depends(get_current_user)):
    if not q.strip():
        return []
    supabase = get_supabase()
    # Supabase ilike for case-insensitive search
    res = (
        supabase.table("chat_messages")
        .select("*")
        .eq("user_id", current_user["id"])
        .ilike("content", f"%{q}%")
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )
    return res.data or []


@router.delete("/history")
async def clear_history(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("chat_messages").delete().eq("user_id", current_user["id"]).execute()
    return {"ok": True}


@router.post("")
async def chat(body: ChatRequest, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    user_id = current_user["id"]
    user_name = current_user.get("name") or "there"
    first_name = user_name.split()[0] if user_name.strip() else "there"
    today = _today_ist()

    # ── Load financial context ────────────────────────────────────────────────
    def _q(table, **kwargs):
        q = supabase.table(table).select("*").eq("user_id", user_id)
        for k, v in kwargs.items():
            q = q.eq(k, v)
        return q.execute().data or []

    emis         = _q("emis", status="active")
    goals        = _q("savings_goals")
    investments  = _q("investments")
    hand_loans   = _q("hand_loans", is_settled=False)
    trips        = _q("trips")
    recurring    = _q("recurring_expenses") if _table_exists("recurring_expenses") else []
    credit_cards = _q("credit_cards") if _table_exists("credit_cards") else []

    # Transactions this month
    month_start = today[:7] + "-01"
    txns_res = (
        supabase.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .gte("date", month_start)
        .order("date", desc=True)
        .limit(80)
        .execute()
    )
    recent_txns = txns_res.data or []

    # Budget categories
    cats_res = supabase.table("budget_categories").select("*").eq("user_id", user_id).execute()
    budget_cats = cats_res.data or []

    # Monthly income from profile
    monthly_income = float(current_user.get("monthly_income") or 0)

    # Compute totals
    total_emi     = sum(float(e.get("emi_amount", 0)) for e in emis)
    total_spent   = sum(float(t.get("amount", 0)) for t in recent_txns if t.get("type") == "expense")
    free_cash     = monthly_income - total_spent - total_emi
    savings_rate  = round(free_cash / monthly_income * 100, 1) if monthly_income > 0 else 0
    emi_ratio     = round(total_emi / monthly_income * 100, 1) if monthly_income > 0 else 0

    # Build context strings
    emi_lines = [
        f"  • {e['name']}: ₹{float(e['emi_amount']):,.0f}/mo | {e['interest_rate']}% APR | "
        f"{e['tenure_months'] - e.get('months_paid', 0)} months left (id:{e['id']})"
        for e in emis[:8]
    ]
    goal_lines = [
        f"  • {g['name']}: ₹{float(g.get('current_amount',0)):,.0f}/₹{float(g['target_amount']):,.0f} "
        f"(id:{g['id']})"
        for g in goals[:5]
    ]
    txn_summary: dict = {}
    for t in recent_txns:
        cat = t.get("category", "Other")
        txn_summary[cat] = txn_summary.get(cat, 0) + float(t.get("amount", 0))
    txn_lines = [f"  • {c}: ₹{a:,.0f}" for c, a in sorted(txn_summary.items(), key=lambda x: -x[1])[:6]]

    recent_txns_ctx = "\n".join([
        f"- {t['date']} ₹{float(t.get('amount',0)):,.0f} {t.get('description','')} [{t.get('type','expense')}] ({t.get('category','')})"
        for t in recent_txns[:40]
    ]) or "None"

    financial_context = f"""
=== {user_name}'s Financial Snapshot — {datetime.utcnow().strftime('%B %Y')} ===

INCOME & CASH FLOW:
  • Monthly Income:    ₹{monthly_income:,.0f}
  • Spent This Month:  ₹{total_spent:,.0f}
  • EMI Outflow:       ₹{total_emi:,.0f}
  • Free Cash:         ₹{free_cash:,.0f}

KEY RATIOS:
  • Savings Rate:   {savings_rate}% (target ≥ 20%)
  • EMI-to-Income:  {emi_ratio}% (RBI safe limit ≤ 50%)

ACTIVE EMIs:
{chr(10).join(emi_lines) if emi_lines else '  No active EMIs'}

SAVINGS GOALS:
{chr(10).join(goal_lines) if goal_lines else '  No active goals'}

TOP SPENDING THIS MONTH:
{chr(10).join(txn_lines) if txn_lines else '  No transactions this month'}

THIS MONTH'S TRANSACTIONS (READ-ONLY — do NOT re-log these):
{recent_txns_ctx}
"""

    emi_ctx   = ", ".join(f"{e['name']} (id:{e['id']}, ₹{float(e['emi_amount']):,.0f}/mo)" for e in emis[:8]) or "None"
    goals_ctx = "\n".join(f"- {g['name']} (id:{g['id']}, saved: ₹{float(g.get('current_amount',0)):.0f} of ₹{float(g['target_amount']):.0f})" for g in goals) or "None"
    trips_ctx = "\n".join(f"- {t.get('name','Trip')} (id:{t['id']}, dest:{t.get('destination','')})" for t in trips) or "None"

    system_message = f"""You are Chanakya — a calm, warm, and knowledgeable friend who genuinely cares about {user_name}'s financial wellbeing.

PERSONALITY:
- Talk like a close friend who knows money well — not an expert lecturing
- Use {first_name}'s name naturally, not every message
- Be specific — always use their real numbers, never generic advice
- Keep it short and human — 2-3 sentences usually enough
- Never preachy, never alarming
- Use ₹ for amounts. Use lakhs/crores for large numbers

SCOPE RESTRICTION (STRICT): You are ONLY a personal finance assistant for Budget Mantra. If the user asks about ANYTHING unrelated to personal finance, budgeting, expenses, goals, EMIs, investments, loans, trips, or Budget Mantra features — respond with exactly: "I'm Chanakya, your personal finance assistant 🙏 I can only help with budgeting, expenses, goals, EMIs, investments, and trip planning. For everything else, please use a general assistant!"

ACTION HANDLING (CRITICAL):
When user clearly states a financial action, respond ONLY with the matching JSON — no other text.
When user wants to do something but hasn't provided all details, ask ONE focused question at a time.

MODE A — DIRECT: All info present → respond ONLY with JSON, no text.
MODE B — GUIDED: Missing details → ask one question, accumulate answers, output JSON when complete.

CRITICAL — NEVER RE-LOG: The transactions list below is READ-ONLY. NEVER re-log anything already there.

1. EXPENSE:
   Triggers: "spent X on Y", "paid X", "bought Y for X"
   JSON: {{"action":"add_transaction","amount":<number>,"description":"<desc>","category":"<category>","date":"{today}","type":"expense"}}

2. INCOME:
   Triggers: "salary 89000", "got freelance 5000", "received bonus"
   ANTI-triggers: if "spent/paid/bought" appear → use add_transaction instead
   JSON: {{"action":"add_transaction","amount":<number>,"description":"<source>","category":"Income","date":"{today}","type":"income"}}

3. ADD EMI:
   Triggers: "add home loan 50L 8.5% 20 years", "car loan 8L 9% 60 months"
   JSON: {{"action":"add_emi","name":"<loan name>","category":"<home|car|personal|education|other>","principal":<number>,"interest_rate":<number>,"tenure_months":<number>,"emi_amount":<PMT-calculated>,"start_date":"<YYYY-MM-DD>"}}
   Calculate emi_amount: P*r*(1+r)^n / ((1+r)^n-1) where r=rate/12/100.

4. EMI PAYMENT:
   Triggers: "paid home loan emi", "emi paid this month"
   JSON: {{"action":"emi_payment","emi_id":"<id from active EMIs>","emi_name":"<name>","amount":<emi_amount>,"paid_date":"{today}"}}

5. ADD GOAL:
   Triggers: "saving for iPhone 80000", "goal trip 50000 by December"
   JSON: {{"action":"add_goal","name":"<goal name>","target_amount":<number>,"target_date":"<YYYY-MM-DD>","category":"<general|travel|home|vehicle|education|emergency>"}}

6. CONTRIBUTE TO GOAL:
   Triggers: "added 5000 to vacation goal", "put 10000 in iPhone fund"
   JSON: {{"action":"contribute_goal","goal_id":"<id>","goal_name":"<name>","amount":<number>}}

7. ADD INVESTMENT:
   Triggers: "bought stocks 50000", "invested 20000 in mutual funds", "added gold"
   JSON: {{"action":"add_investment","type":"<stocks|mutual_funds|gold|ppf|nps|fd|rd|real_estate>","name":"<name>","invested_amount":<number>,"current_value":<number>,"buy_date":"{today}","notes":""}}

8. HAND LOAN:
   Triggers: "lent 5000 to Rahul", "borrowed 10000 from friend"
   JSON: {{"action":"add_hand_loan","type":"<given|taken>","person_name":"<name>","amount":<number>,"due_date":"<YYYY-MM-DD or null>","description":"<optional>"}}

Active EMIs (use id for emi_payment): {emi_ctx}
Active savings goals (use id for contribute_goal):
{goals_ctx}
Active trips: {trips_ctx}

{financial_context}"""

    # ── Load chat history ──────────────────────────────────────────────────────
    history_res = (
        supabase.table("chat_messages")
        .select("role,content")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    history = list(reversed(history_res.data or []))
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": body.message})

    # ── Call Claude ────────────────────────────────────────────────────────────
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        result = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system_message,
            messages=messages,
        )
    except Exception as e:
        raise HTTPException(500, f"AI error: {str(e)}")

    raw_reply = result.content[0].text.strip()

    # ── Parse and execute action ───────────────────────────────────────────────
    action_data = _parse_action_block(raw_reply)
    reply = _strip_json_block(raw_reply)

    if action_data:
        # Support compound actions (array)
        actions = action_data if isinstance(action_data, list) else [action_data]
        action_replies = []

        for action in actions[:5]:
            act = action.get("action", "")
            ar = _execute_action(act, action, user_id, today, emis, goals, supabase)
            if ar:
                action_replies.append(ar)

        if action_replies:
            reply = "\n".join(action_replies)

    # If reply is empty after stripping, use a fallback
    if not reply:
        reply = "Done! ✅"

    # ── Save to chat history ───────────────────────────────────────────────────
    now = _now_iso()
    user_msg_id = str(uuid.uuid4())
    asst_msg_id = str(uuid.uuid4())
    supabase.table("chat_messages").insert([
        {"id": user_msg_id, "user_id": user_id, "role": "user",
         "content": body.message, "created_at": now},
        {"id": asst_msg_id, "user_id": user_id, "role": "assistant",
         "content": reply, "created_at": now},
    ]).execute()

    return {
        "response": reply,
        "reply": reply,
        "user_msg_id": user_msg_id,
        "asst_msg_id": asst_msg_id,
        "status": "success",
    }


def _table_exists(name: str) -> bool:
    """Gracefully check if a table is accessible."""
    try:
        get_supabase().table(name).select("id").limit(1).execute()
        return True
    except Exception:
        return False


def _execute_action(act: str, action: dict, user_id: str, today: str,
                    emis: list, goals: list, supabase) -> str:
    """Execute a single parsed action against Supabase. Returns a reply string."""
    try:
        if act == "add_transaction":
            amount = float(action.get("amount", 0))
            if amount <= 0:
                return ""
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "amount": amount,
                "type": action.get("type", "expense"),
                "category": action.get("category", "Other"),
                "description": action.get("description", ""),
                "date": action.get("date", today),
                "payment_mode": "UPI",
                "source": "chanakya",
                "created_at": _now_iso(),
            }
            supabase.table("transactions").insert(doc).execute()
            t = doc["type"]
            if t == "income":
                return f"✅ ₹{amount:,.0f} income recorded as *{doc['description']}*."
            return f"✅ ₹{amount:,.0f} logged for *{doc['description']}* ({doc['category']})."

        elif act == "add_emi":
            principal     = float(action.get("principal", 0))
            interest_rate = float(action.get("interest_rate", 0))
            tenure        = int(action.get("tenure_months", 0))
            emi_amount    = float(action.get("emi_amount", 0))
            name          = action.get("name", "Loan")
            if principal <= 0 or tenure <= 0:
                return "I need the loan amount and tenure to add the EMI. Can you share those?"
            if not emi_amount:
                emi_amount = _calc_emi(principal, interest_rate, tenure)
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "name": name,
                "principal": principal,
                "interest_rate": interest_rate,
                "tenure_months": tenure,
                "emi_amount": emi_amount,
                "start_date": action.get("start_date", today),
                "bank": action.get("bank", ""),
                "category": action.get("category", "personal"),
                "months_paid": 0,
                "status": "active",
                "created_at": _now_iso(),
            }
            supabase.table("emis").insert(doc).execute()
            total_interest = round(emi_amount * tenure - principal)
            return (
                f"✅ *{name}* added — ₹{emi_amount:,.0f}/month for {tenure} months at {interest_rate}% p.a.\n"
                f"You'll pay ₹{total_interest:,.0f} in interest over the loan."
            )

        elif act == "emi_payment":
            emi_id   = action.get("emi_id", "")
            emi_name = action.get("emi_name", "")
            pay_amt  = float(action.get("amount", 0))
            paid_date = action.get("paid_date", today)
            # Match EMI
            emi = next((e for e in emis if e["id"] == emi_id), None)
            if not emi and emi_name:
                emi = next((e for e in emis if emi_name.lower() in e.get("name", "").lower()), None)
            if not emi:
                return f"I couldn't find a matching active EMI. Which loan did you pay?"
            pay_amt = pay_amt or float(emi.get("emi_amount", 0))
            new_paid = emi.get("months_paid", 0) + 1
            supabase.table("emis").update({"months_paid": new_paid}).eq("id", emi["id"]).execute()
            supabase.table("emi_payments").insert({
                "id": str(uuid.uuid4()),
                "emi_id": emi["id"],
                "user_id": user_id,
                "amount": pay_amt,
                "paid_date": paid_date,
                "created_at": _now_iso(),
            }).execute()
            months_left = emi["tenure_months"] - new_paid
            return f"✅ ₹{pay_amt:,.0f} recorded for *{emi['name']}*. {months_left} months left."

        elif act == "add_goal":
            target = float(action.get("target_amount", 0))
            name   = action.get("name", "Goal")
            if target <= 0:
                return "I need a target amount to create the goal. How much are you saving for?"
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "name": name,
                "target_amount": target,
                "current_amount": 0,
                "target_date": action.get("target_date"),
                "category": action.get("category", "general"),
                "created_at": _now_iso(),
            }
            supabase.table("savings_goals").insert(doc).execute()
            return f"✅ Goal *{name}* created — target ₹{target:,.0f} by {action.get('target_date', 'your deadline')}."

        elif act == "contribute_goal":
            goal_id   = action.get("goal_id", "")
            goal_name = action.get("goal_name", "")
            amount    = float(action.get("amount", 0))
            goal = next((g for g in goals if g["id"] == goal_id), None)
            if not goal and goal_name:
                goal = next((g for g in goals if goal_name.lower() in g.get("name", "").lower()), None)
            if not goal:
                return f"I couldn't find a matching goal. Which goal did you contribute to?"
            new_saved = float(goal.get("current_amount", 0)) + amount
            supabase.table("savings_goals").update({"current_amount": round(new_saved, 2)}).eq("id", goal["id"]).execute()
            supabase.table("goal_contributions").insert({
                "id": str(uuid.uuid4()),
                "goal_id": goal["id"],
                "user_id": user_id,
                "amount": amount,
                "date": today,
                "created_at": _now_iso(),
            }).execute()
            reply = f"✅ Added ₹{amount:,.0f} to *{goal['name']}* — now ₹{new_saved:,.0f} saved."
            if new_saved >= float(goal.get("target_amount", 1)):
                reply += " 🎉 Goal completed!"
            return reply

        elif act == "add_investment":
            invested = float(action.get("invested_amount", 0))
            name     = action.get("name", "Investment")
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": action.get("type", "other"),
                "name": name,
                "invested_amount": invested,
                "current_value": float(action.get("current_value", invested)),
                "buy_date": action.get("buy_date", today),
                "notes": action.get("notes", ""),
                "created_at": _now_iso(),
            }
            supabase.table("investments").insert(doc).execute()
            return f"✅ Investment *{name}* added — ₹{invested:,.0f} invested."

        elif act == "add_hand_loan":
            amount = float(action.get("amount", 0))
            person = action.get("person_name", "")
            loan_type = action.get("type", "given")  # given | taken
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": loan_type,
                "person_name": person,
                "amount": amount,
                "remaining": amount,
                "due_date": action.get("due_date"),
                "description": action.get("description", action.get("reason", "")),
                "is_settled": False,
                "created_at": _now_iso(),
            }
            supabase.table("hand_loans").insert(doc).execute()
            direction = "lent to" if loan_type == "given" else "borrowed from"
            return f"✅ Hand loan recorded — ₹{amount:,.0f} {direction} *{person}*."

    except Exception as e:
        return f"⚠️ Couldn't save that entry: {str(e)}"

    return ""
