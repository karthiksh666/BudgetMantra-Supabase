"""
Chanakya AI chat — same logic as the MongoDB version but reads/writes to
Supabase `chat_messages` table instead of MongoDB `chat_messages` collection.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import anthropic
from app.auth import get_current_user
from app.database import get_supabase
from app.config import get_settings

router = APIRouter(prefix="/chat", tags=["chat"])
settings = get_settings()


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


SYSTEM_PROMPT = """You are Chanakya, a wise and witty personal finance AI for Budget Mantra — an Indian finance app.

You help users with:
- Tracking income and expenses
- Managing EMIs and loans
- Setting and achieving savings goals
- Understanding investments (stocks, MF, gold, FD)
- Budget planning and analysis
- Financial advice tailored to Indian context (INR, GST, tax slabs)

Personality: Warm, encouraging, occasionally uses Indian financial wisdom. Never preachy.
Language: English with occasional Hindi/regional words where natural.
Numbers: Always in INR (₹), use Indian number system (lakhs, crores).

When users ask to add data (expense, income, EMI, goal, investment), extract the details and respond
with a JSON action block at the END of your message in this format:
```json
{"action": "add_expense", "data": {"amount": 500, "category": "Food", "description": "Lunch", "date": "today"}}
```

Available actions: add_expense, add_income, add_emi, add_goal, contribute_goal, add_investment
"""


@router.get("/history")
async def get_history(limit: int = 50, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("chat_messages")\
        .select("*")\
        .eq("user_id", current_user["id"])\
        .order("created_at", desc=False)\
        .limit(limit)\
        .execute()
    return res.data or []


@router.post("")
async def chat(body: ChatRequest, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    user_id = current_user["id"]

    # Load recent history for context (last 20 messages)
    history_res = supabase.table("chat_messages")\
        .select("role,content")\
        .eq("user_id", user_id)\
        .order("created_at", desc=True)\
        .limit(20)\
        .execute()

    history = list(reversed(history_res.data or []))
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": body.message})

    # Call Anthropic
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
    except Exception as e:
        raise HTTPException(500, f"AI error: {str(e)}")

    reply = response.content[0].text

    # Persist user message + assistant reply
    now = datetime.utcnow().isoformat()
    supabase.table("chat_messages").insert([
        {"id": str(uuid.uuid4()), "user_id": user_id, "role": "user",
         "content": body.message, "created_at": now},
        {"id": str(uuid.uuid4()), "user_id": user_id, "role": "assistant",
         "content": reply, "created_at": now},
    ]).execute()

    return {"reply": reply}


@router.delete("/history")
async def clear_history(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("chat_messages").delete().eq("user_id", current_user["id"]).execute()
    return {"ok": True}
