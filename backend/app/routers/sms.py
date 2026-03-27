"""
SMS / UPI transaction parser — same logic as server.py but as a standalone router.
Uses Claude to extract structured transaction data from raw SMS text.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import anthropic
from app.auth import get_current_user
from app.config import get_settings

router = APIRouter(prefix="/sms", tags=["sms"])
settings = get_settings()

PARSE_PROMPT = """Extract transaction details from this Indian bank/UPI SMS message.
Return ONLY valid JSON with these fields:
{
  "type": "income" or "expense",
  "amount": number,
  "description": "merchant or description",
  "category": "one of: Food, Transport, Shopping, Entertainment, Bills, Health, Education, Travel, Investment, Salary, Other",
  "payment_mode": "UPI" or "Card" or "NEFT" or "IMPS" or "Cash",
  "date": "YYYY-MM-DD or null if not found"
}
If this is not a transaction SMS, return {"error": "not a transaction"}.
SMS: """


class SMSParseRequest(BaseModel):
    sms: str


class BulkSMSRequest(BaseModel):
    messages: list[str]


@router.post("/parse")
async def parse_sms(body: SMSParseRequest, current_user: dict = Depends(get_current_user)):
    import json
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": PARSE_PROMPT + body.sms}],
        )
        text = response.content[0].text.strip()
        # Extract JSON from response
        start = text.find("{")
        end = text.rfind("}") + 1
        return json.loads(text[start:end])
    except Exception as e:
        raise HTTPException(500, f"Parse error: {str(e)}")


@router.post("/parse-bulk")
async def parse_bulk(body: BulkSMSRequest, current_user: dict = Depends(get_current_user)):
    import json
    import asyncio
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    results = []
    for sms in body.messages[:50]:   # limit to 50 per call
        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                messages=[{"role": "user", "content": PARSE_PROMPT + sms}],
            )
            text = response.content[0].text.strip()
            start = text.find("{")
            end = text.rfind("}") + 1
            parsed = json.loads(text[start:end])
            if "error" not in parsed:
                results.append({**parsed, "raw_sms": sms})
        except Exception:
            pass

    return {"parsed": results, "total": len(results)}
