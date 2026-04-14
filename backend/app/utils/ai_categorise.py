"""
Auto-categorisation via Claude.

Receives only the transaction description (never the amount — privacy).
Returns a single category string that maps to Budget Mantra's category set.

Called from transactions.py on every POST when category is empty.
Falls back gracefully — never blocks the transaction save.
"""

import anthropic
from app.config import get_settings
import logging

logger = logging.getLogger(__name__)

# Canonical categories used in Budget Mantra
CATEGORIES = [
    "Food & Dining", "Groceries", "Transport", "Fuel",
    "Shopping", "Entertainment", "Health & Medical", "Utilities",
    "Rent & Housing", "Education", "Travel", "Savings & Investment",
    "EMI & Loan", "Insurance", "Personal Care", "Gifts & Donations",
    "Salary", "Freelance", "Business", "Dividend", "Other",
]

_SYSTEM = f"""You are a financial transaction categoriser for an Indian budgeting app.
Given a transaction description, return EXACTLY one category from this list:
{', '.join(CATEGORIES)}

Rules:
- Reply with only the category name — no punctuation, no explanation
- Use Indian context: "Zomato"→Food & Dining, "IRCTC"→Travel, "LIC"→Insurance
- If ambiguous, prefer the more specific category
- For salary credits, return: Salary"""


async def auto_categorise(description: str, txn_type: str) -> str | None:
    """
    Returns a category string or None if categorisation fails.
    Never raises — caller should handle None gracefully.
    """
    if not description or not description.strip():
        return None

    try:
        settings = get_settings()
        client   = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        prompt = f'Transaction: "{description.strip()}"\nType: {txn_type}'

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",   # Haiku — fast + cheap for classification
            max_tokens=20,
            system=_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )

        result = message.content[0].text.strip()

        # Validate — must be one of our known categories
        if result in CATEGORIES:
            return result

        # Fuzzy match — handle case differences
        result_lower = result.lower()
        for cat in CATEGORIES:
            if cat.lower() == result_lower:
                return cat

        logger.warning(f"AI returned unknown category '{result}' for '{description}'")
        return None

    except Exception as e:
        logger.warning(f"Auto-categorisation failed for '{description}': {e}")
        return None
