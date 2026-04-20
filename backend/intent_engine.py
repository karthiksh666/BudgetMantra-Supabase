"""
BudgetMantra Intent Engine — World Class Edition
Layer 1: Instant regex/keyword parsing (<50ms, no API)
Layer 2: Claude (only for ambiguous inputs)

Handles: single entry, bulk entry, queries, edits, goals, income
Supports: Indian English, Hinglish, k/L amounts, 200+ merchants
"""

import re
from datetime import datetime, timedelta
from typing import Optional
import pytz

IST = pytz.timezone("Asia/Kolkata")

# ---------------------------------------------------------------------------
# AMOUNT PARSER
# ---------------------------------------------------------------------------

def parse_amount(text: str) -> Optional[float]:
    """
    Parses Indian-style amounts from text.
    Examples: 500, 5k, 5K, 2.5k, 1L, 1lac, 1lakh, 1.2L, 50 rupees, ₹500
    """
    text = text.replace(",", "").replace("₹", "").strip()
    patterns = [
        (r'(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)', 1e7),
        (r'(\d+(?:\.\d+)?)\s*(?:l|lac|lacs|lakh|lakhs)', 1e5),
        (r'(\d+(?:\.\d+)?)\s*(?:k|K)', 1e3),
        (r'(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?|inr)?', 1),
    ]
    for pattern, multiplier in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return round(float(m.group(1)) * multiplier, 2)
    return None


# ---------------------------------------------------------------------------
# DATE PARSER
# ---------------------------------------------------------------------------

def parse_date(text: str) -> str:
    """Returns ISO date string. Defaults to today."""
    now = datetime.now(IST)
    text_lower = text.lower()

    if any(w in text_lower for w in ['yesterday', 'kal', 'kal ka', 'kal ki']):
        return (now - timedelta(days=1)).strftime('%Y-%m-%d')

    if 'day before' in text_lower:
        return (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # "2 days ago", "3 din pehle"
    m = re.search(r'(\d+)\s*(?:days?|din)\s*(?:ago|pehle|pahle)', text_lower)
    if m:
        return (now - timedelta(days=int(m.group(1)))).strftime('%Y-%m-%d')

    # "2 weeks ago"
    m = re.search(r'(\d+)\s*weeks?\s*ago', text_lower)
    if m:
        return (now - timedelta(weeks=int(m.group(1)))).strftime('%Y-%m-%d')

    week_days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    for i, day in enumerate(week_days):
        if day in text_lower:
            days_ago = (now.weekday() - i) % 7
            if days_ago == 0:
                days_ago = 7
            return (now - timedelta(days=days_ago)).strftime('%Y-%m-%d')

    # "on 15th", "15 march", "march 15"
    date_patterns = [
        r'on\s+(\d{1,2})(?:st|nd|rd|th)?',
        r'(\d{1,2})(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)',
        r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})',
    ]
    for pat in date_patterns:
        m = re.search(pat, text_lower)
        if m:
            day = int(m.group(1))
            try:
                return now.replace(day=day).strftime('%Y-%m-%d')
            except Exception:
                pass

    if 'last week' in text_lower or 'last month' in text_lower:
        return (now - timedelta(days=7)).strftime('%Y-%m-%d')

    return now.strftime('%Y-%m-%d')


# ---------------------------------------------------------------------------
# MERCHANT → CATEGORY MAP (200+ merchants)
# ---------------------------------------------------------------------------

MERCHANT_MAP: dict[str, str] = {
    # Food & Dining
    "swiggy": "Food & Dining",
    "zomato": "Food & Dining",
    "blinkit": "Groceries",
    "zepto": "Groceries",
    "dunzo": "Groceries",
    "mcdonald": "Food & Dining",
    "mcdonalds": "Food & Dining",
    "kfc": "Food & Dining",
    "dominos": "Food & Dining",
    "domino": "Food & Dining",
    "pizza hut": "Food & Dining",
    "burger king": "Food & Dining",
    "subway": "Food & Dining",
    "starbucks": "Food & Dining",
    "cafe coffee day": "Food & Dining",
    "ccd": "Food & Dining",
    "chai point": "Food & Dining",
    "chai": "Food & Dining",
    "tea": "Food & Dining",
    "coffee": "Food & Dining",
    "lunch": "Food & Dining",
    "dinner": "Food & Dining",
    "breakfast": "Food & Dining",
    "restaurant": "Food & Dining",
    "hotel": "Food & Dining",
    "dhaba": "Food & Dining",
    "biryani": "Food & Dining",
    "pizza": "Food & Dining",
    "burger": "Food & Dining",
    "thali": "Food & Dining",
    "idli": "Food & Dining",
    "dosa": "Food & Dining",
    "khana": "Food & Dining",
    "khaya": "Food & Dining",
    "food": "Food & Dining",
    "eating": "Food & Dining",
    "ate": "Food & Dining",
    "snacks": "Food & Dining",

    # Groceries
    "bigbasket": "Groceries",
    "big basket": "Groceries",
    "jiomart": "Groceries",
    "jio mart": "Groceries",
    "dmart": "Groceries",
    "d-mart": "Groceries",
    "reliance fresh": "Groceries",
    "more supermarket": "Groceries",
    "more market": "Groceries",
    "nature basket": "Groceries",
    "grofers": "Groceries",
    "grocery": "Groceries",
    "groceries": "Groceries",
    "vegetables": "Groceries",
    "sabzi": "Groceries",
    "fruits": "Groceries",
    "milk": "Groceries",
    "ration": "Groceries",
    "kirana": "Groceries",

    # Transport
    "uber": "Transport",
    "ola": "Transport",
    "rapido": "Transport",
    "namma yatri": "Transport",
    "yulu": "Transport",
    "bounce": "Transport",
    "metro": "Transport",
    "bus": "Transport",
    "auto": "Transport",
    "taxi": "Transport",
    "cab": "Transport",
    "petrol": "Transport",
    "diesel": "Transport",
    "fuel": "Transport",
    "parking": "Transport",
    "toll": "Transport",
    "fastag": "Transport",
    "irctc": "Transport",
    "train": "Transport",
    "flight": "Transport",
    "indigo": "Transport",
    "spicejet": "Transport",
    "air india": "Transport",
    "vistara": "Transport",
    "redbus": "Transport",
    "travel": "Travel",
    "trip": "Travel",

    # Entertainment
    "netflix": "Entertainment",
    "hotstar": "Entertainment",
    "disney": "Entertainment",
    "prime video": "Entertainment",
    "amazon prime": "Entertainment",
    "sony liv": "Entertainment",
    "zee5": "Entertainment",
    "spotify": "Entertainment",
    "gaana": "Entertainment",
    "wynk": "Entertainment",
    "youtube premium": "Entertainment",
    "movie": "Entertainment",
    "cinema": "Entertainment",
    "pvr": "Entertainment",
    "inox": "Entertainment",
    "bookmyshow": "Entertainment",
    "concert": "Entertainment",
    "gaming": "Entertainment",
    "game": "Entertainment",
    "playstation": "Entertainment",
    "xbox": "Entertainment",
    "steam": "Entertainment",

    # Shopping
    "amazon": "Shopping",
    "flipkart": "Shopping",
    "myntra": "Shopping",
    "ajio": "Shopping",
    "nykaa": "Shopping",
    "meesho": "Shopping",
    "snapdeal": "Shopping",
    "tatacliq": "Shopping",
    "shopping": "Shopping",
    "clothes": "Shopping",
    "shoes": "Shopping",
    "dress": "Shopping",
    "shirt": "Shopping",
    "jeans": "Shopping",
    "saree": "Shopping",
    "kurta": "Shopping",

    # Health & Medical
    "apollo": "Health & Medical",
    "medplus": "Health & Medical",
    "1mg": "Health & Medical",
    "pharmeasy": "Health & Medical",
    "netmeds": "Health & Medical",
    "practo": "Health & Medical",
    "doctor": "Health & Medical",
    "hospital": "Health & Medical",
    "clinic": "Health & Medical",
    "medicine": "Health & Medical",
    "medicines": "Health & Medical",
    "pharmacy": "Health & Medical",
    "medical": "Health & Medical",
    "gym": "Health & Medical",
    "cult fit": "Health & Medical",
    "cultfit": "Health & Medical",
    "health": "Health & Medical",
    "dentist": "Health & Medical",
    "dental": "Health & Medical",
    "test": "Health & Medical",

    # Bills & Utilities
    "bescom": "Bills & Utilities",
    "electricity": "Bills & Utilities",
    "light bill": "Bills & Utilities",
    "water bill": "Bills & Utilities",
    "gas": "Bills & Utilities",
    "lpg": "Bills & Utilities",
    "indane": "Bills & Utilities",
    "hp gas": "Bills & Utilities",
    "bharat gas": "Bills & Utilities",
    "jio": "Bills & Utilities",
    "airtel": "Bills & Utilities",
    "vi": "Bills & Utilities",
    "vodafone": "Bills & Utilities",
    "bsnl": "Bills & Utilities",
    "recharge": "Bills & Utilities",
    "broadband": "Bills & Utilities",
    "wifi": "Bills & Utilities",
    "internet": "Bills & Utilities",
    "postpaid": "Bills & Utilities",
    "bill": "Bills & Utilities",
    "utility": "Bills & Utilities",

    # Personal Care
    "salon": "Personal Care",
    "haircut": "Personal Care",
    "parlour": "Personal Care",
    "parlor": "Personal Care",
    "spa": "Personal Care",
    "manicure": "Personal Care",
    "pedicure": "Personal Care",
    "waxing": "Personal Care",

    # Education
    "udemy": "Education",
    "coursera": "Education",
    "unacademy": "Education",
    "byju": "Education",
    "byjus": "Education",
    "vedantu": "Education",
    "tuition": "Education",
    "school fees": "Education",
    "college fees": "Education",
    "fees": "Education",
    "books": "Education",
    "stationery": "Education",
    "course": "Education",
    "class": "Education",

    # Rent / Housing
    "rent": "Rent / Housing",
    "maintenance": "Rent / Housing",
    "society": "Rent / Housing",
    "maid": "Rent / Housing",
    "cook": "Rent / Housing",
    "house": "Rent / Housing",
    "pg": "Rent / Housing",
    "hostel": "Rent / Housing",

    # Subscriptions (mapped to Entertainment or Bills & Utilities)
    "apple music": "Entertainment",
    "apple tv": "Entertainment",
    "apple one": "Entertainment",
    "apple arcade": "Entertainment",
    "app store": "Entertainment",
    "apple": "Entertainment",          # catch-all for Apple subscription charges
    "icloud": "Bills & Utilities",
    "apple storage": "Bills & Utilities",
    "google one": "Bills & Utilities",
    "google play": "Entertainment",
    "google storage": "Bills & Utilities",
    "youtube premium": "Entertainment",
    "youtube music": "Entertainment",
    "microsoft 365": "Bills & Utilities",
    "microsoft office": "Bills & Utilities",
    "office 365": "Bills & Utilities",
    "adobe": "Bills & Utilities",
    "creative cloud": "Bills & Utilities",
    "photoshop": "Bills & Utilities",
    "notion": "Bills & Utilities",
    "slack": "Bills & Utilities",
    "zoom": "Bills & Utilities",
    "chatgpt": "Bills & Utilities",
    "openai": "Bills & Utilities",
    "dropbox": "Bills & Utilities",
    "canva": "Bills & Utilities",
    "figma": "Bills & Utilities",
    "github": "Bills & Utilities",
    "subscription": "Bills & Utilities",
    "prime": "Entertainment",
    "hotstar premium": "Entertainment",
    "jiocinema": "Entertainment",
    "mxplayer": "Entertainment",
    "voot": "Entertainment",
    "lionsgate": "Entertainment",
    "curiositystream": "Entertainment",
    "crunchyroll": "Entertainment",
    "twitch": "Entertainment",
    "audible": "Entertainment",
    "kindle unlimited": "Entertainment",
}


# ---------------------------------------------------------------------------
# INTENT DETECTION
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# TRIGGER PATTERNS — exhaustive coverage for all 4 features
# ---------------------------------------------------------------------------

EXPENSE_TRIGGERS = [
    # English action words
    r'\b(spent|spend|paid|pay|bought|buy|ordered|order|booked|book|purchased|purchase)\b',
    r'\b(ate|eating|had|drank|drinking|watched|watching|visited|went to|going to)\b',
    r'\b(charged|debited|deducted|cut from|withdrawn|swiped)\b',
    r'\b(expense|expenses|cost|costs|fee|fees|charge|charges)\b',
    # Hinglish
    r'\b(bill|kharch|kharchha|kharcha|lagaya|liya|diya|kharida)\b',
    r'\b(khaaya|piya|dekha|gaya|aaya tha)\b',
    # Common merchants as verbs
    r'\b(ubered|olaed|swiggy kiya|zomato kiya)\b',
    # Transport (often no verb)
    r'\b(auto|metro|cab|taxi|rapido|rickshaw|bike)\b',
    # Direct amount + item patterns (e.g. "500 chai", "chai 200")
    r'^\s*₹?\d[\d,k.Llac]*\s+\w',
    r'^\s*\w+\s+₹?\d[\d,k.Llac]*\s*$',
]

INCOME_TRIGGERS = [
    # Salary & payroll
    r'\b(salary|salry|sal|ctc|inhand|in.?hand|take.?home|paycheck|paystub)\b',
    r'\b(got salary|received salary|salary credited|salary aaya)\b',
    # General income
    r'\b(income|revenue|earnings?|inflow|cash in)\b',
    r'\b(received|got|credited|credit|got paid|earned|earning)\b',
    # Freelance & business
    r'\b(freelance|consulting|client payment|project payment|invoice paid)\b',
    r'\b(business income|shop income|sales income|profit)\b',
    # Passive income
    r'\b(dividend|interest received|rental income|rent received|royalty)\b',
    r'\b(cashback|refund|reimbursement|claim received|insurance claim)\b',
    r'\b(bonus|incentive|commission|gratuity|arrears|hike)\b',
    # Investments
    r'\b(mutual fund.{0,10}redeem|fd.{0,10}matur|stock.{0,10}sold|sold shares)\b',
    # Hinglish
    r'\b(paisa aaya|paisa mila|credit hua|amount credited|paise mile)\b',
    r'\b(mil gaya|aa gaya|salary aayi|bonus mila)\b',
]

GOAL_TRIGGERS = [
    # Create goal
    r'\b(saving for|save for|saving up for|want to buy|planning to buy|target for)\b',
    r'\b(want to save|need to save|trying to save)\b',
    r'\b(create goal|add goal|new goal|set goal|set a target)\b',
    r'\b(dream of|aspire to|aiming for|working towards)\b',
    # Goal with amount
    r'\b(need .{1,25} by|buy .{1,25} in|afford .{1,25} in)\b',
    r'\b(save .{1,10} for|put aside .{1,10} for)\b',
    # Common goal items
    r'\b(iphone|laptop|bike|car|house|home|apartment|flat|vacation|wedding|education fund|emergency fund)\b',
    # Hinglish
    r'\b(goal banana|target banana|bachat karna|khareedna hai)\b',
]

EMI_TRIGGERS = [
    # EMI actions
    r'\b(emi|loan|debt|mortgage|home loan|car loan|personal loan|education loan)\b',
    r'\b(add emi|new emi|new loan|took loan|took a loan|loan liya)\b',
    r'\b(emi due|loan due|emi paid|loan paid|paid emi|emi payment)\b',
    r'\b(prepay|prepayment|part payment|foreclose|foreclosure)\b',
    r'\b(tenure|interest rate|outstanding|principal|remaining loan)\b',
    # Queries about EMI
    r'\b(how much emi|total emi|emi load|loan burden|debt free)\b',
    r'\b(when will.{0,15}loan.{0,10}over|when.{0,10}debt free|when.{0,10}loan finish)\b',
]

PLANNING_QUESTION_TRIGGERS = [
    # Future-looking / affordability questions — always queries, never logs.
    r'\b(when can i|when will i|when could i|when should i|can i ever|will i ever)\b',
    r'\b(can i afford|should i buy|can i buy|can we buy|do i have enough|am i able to)\b',
    r'\b(is it okay to|is it fine to|is it wise to|is it smart to|how long (?:until|till|before) i can)\b',
]

QUERY_TRIGGERS = [
    r'\b(how much|kitna|kitne|balance|left|remaining|bacha|bachega)\b',
    r'\b(show|tell me|what is|whats|what did|what have|how am i|am i on track)\b',
    r'\b(this month|last month|today|this week|last week|this year)\b',
    r'\b(spending|spent on|expenses?|where did|where is my)\b',
    r'\b(can i afford|should i buy|is it okay to|is it fine to|will i)\b',
    r'\b(when can i|when will i|when could i|when should i|can i ever|will i ever)\b',
    r'\b(can i buy|can we buy|do i have enough|am i able to|how long (?:until|till|before) i can)\b',
    r'\b(analyse|analyze|breakdown|summary|report|overview|snapshot)\b',
    r'\b(savings rate|expense ratio|emi ratio|health score|score)\b',
    r'\b(my goals?|goal progress|how far|target)\b',
    r'\b(top spending|most spent|biggest expense|category)\b',
    # Hinglish queries
    r'\b(kaisa chal raha|sab theek|paisa kahan gaya|kaha gaya)\b',
]

DELETE_TRIGGERS = [
    r'\b(delete|remove|undo|revert|take back|cancel that|scratch that)\b',
    r'\b(delete last|remove last|undo last|delete that|remove that)\b',
    r'\b(wrong entry|wrong expense|galat tha|wapas lo|hatao|undo karo|delete karo)\b',
    r'\b(that entry|last entry|that expense|last expense|last one i added)\b',
]

EDIT_TRIGGERS = [
    r'\b(change that|edit that|fix that|update that|modify that|correct that)\b',
    r'\b(change amount|fix amount|wrong amount|update amount)\b',
    r'\b(change category|wrong category|move to|reclassify)\b',
    r'\b(change karo|theek karo|badlo)\b',
]

# ── Feature-specific triggers (all go to Claude for rich handling) ────────────

RECURRING_TRIGGERS = [
    r'\b(recurring|recurring expense|subscription|auto.?debit|auto.?pay|standing instruction)\b',
    r'\b(add subscription|new subscription|cancel subscription|stop recurring)\b',
    r'\b(recurring karo|har mahine|monthly kato)\b',
]

INVESTMENT_TRIGGERS = [
    r'\b(invest|investment|mutual fund|mf|sip|lump.?sum|stock|shares|equity)\b',
    r'\b(nifty|sensex|zerodha|groww|kuvera|coin by zerodha|paytm money)\b',
    r'\b(bought shares|sold shares|portfolio|demat|trading account)\b',
    r'\b(ppf|epf|nps|elss|tax saving|80c|80cc)\b',
    r'\b(fd|fixed deposit|rd|recurring deposit|liquid fund)\b',
    r'\b(returns|yield|cagr|xirr|nav|units|folio)\b',
    r'\b(invest kiya|sip start|sip add|sip lagaya)\b',
]

GOLD_SILVER_TRIGGERS = [
    r'\b(gold|sona|gold coin|gold bond|sovereign gold|sgb|gold etf)\b',
    r'\b(silver|chandi|silver coin|silver bar)\b',
    r'\b(bought gold|sold gold|gold rate|gold price|gold grams?)\b',
    r'\b(digital gold|mmtc|safegold|augmont)\b',
]

LOAN_TRIGGERS = [
    r'\b(lend|lent|borrow|borrowed|gave loan|took loan from friend|hand loan)\b',
    r'\b(give money|gave money|borrowed from|lent to|gave to friend)\b',
    r'\b(collect|recover|collect money|loan returned|money returned)\b',
    r'\b(udhaar|udhar|udhaar diya|udhaar liya|paise?\s+udhaar|wapas kiya|wapas milega|wapas dena)\b',
    r'\b(iou|owe|owes me|i owe)\b',
]

GIFT_TRIGGERS = [
    r'\b(gift|gifted|present|gave gift|received gift|birthday gift|wedding gift)\b',
    r'\b(shaadi gift|bday gift|anniversary gift|festival gift)\b',
    r'\b(gave as gift|received as gift|gift kiya|gift mila)\b',
]

TRIP_TRIGGERS = [
    r'\b(trip|travel expense|vacation expense|holiday expense|tour)\b',
    r'\b(add trip|new trip|create trip|trip to|travelling to|going on a trip|plan(?:ning)? a trip)\b',
    r'\b(trip budget|travel budget|trip cost|trip expense)\b',
]

FIRE_TRIGGERS = [
    r'\b(fire|financial independence|retire early|retirement corpus|fi number)\b',
    r'\b(retire at|retire by|financial freedom|coast fire|lean fire|fat fire)\b',
    r'\b(corpus|retirement fund|retirement goal|when can i retire)\b',
]

PIGGYBANK_TRIGGERS = [
    r'\b(piggy bank|savings jar|money box|save change|spare change)\b',
    r'\b(round.?up|save the change|micro saving|small saving)\b',
]

CREDIT_CARD_TRIGGERS = [
    r'\b(credit card|cc bill|card bill|card due|card payment|card outstanding)\b',
    r'\b(hdfc card|sbi card|icici card|axis card|amex|hsbc card|kotak card)\b',
    r'\b(credit limit|card limit|utilization|card statement|card cycle)\b',
    r'\b(pay card|paid card|card paid|minimum due|total due|statement balance)\b',
]

UPI_TRIGGERS = [
    # Only trigger on import/sync intent — NOT on "paid via UPI/phonepe" (those are expenses)
    r'\b(import transactions?|import upi|import bank|sync bank|sync transactions?)\b',
    r'\b(bank statement|sms import|parse sms|bulk import|upload statement)\b',
    r'\b(link(?:ed)? (?:account|bank)|connect bank|import from bank|from my bank)\b',
    r'\b(upi import|upi sync|auto import|auto sync transactions?)\b',
]


def detect_intent(text: str) -> str:
    """Returns: expense | income | emi | goal | query | delete | edit |
                investment | gold | loan | gift | trip | fire | credit_card |
                recurring | upi | unknown"""
    t = text.lower()
    # Delete must be checked before income/expense so "delete last food entry" → delete
    for pat in DELETE_TRIGGERS:
        if re.search(pat, t):
            return 'delete'
    for pat in EDIT_TRIGGERS:
        if re.search(pat, t):
            return 'edit'
    # Planning / affordability questions must win before feature triggers,
    # otherwise "can i buy a home?" gets misrouted to GOAL via the "home" keyword.
    for pat in PLANNING_QUESTION_TRIGGERS:
        if re.search(pat, t):
            return 'query'
    for pat in INCOME_TRIGGERS:
        if re.search(pat, t):
            return 'income'
    for pat in EMI_TRIGGERS:
        if re.search(pat, t):
            return 'emi'
    for pat in GOAL_TRIGGERS:
        if re.search(pat, t):
            return 'goal'
    # Feature-specific — check before generic expense/query
    for pat in INVESTMENT_TRIGGERS:
        if re.search(pat, t):
            return 'investment'
    for pat in GOLD_SILVER_TRIGGERS:
        if re.search(pat, t):
            return 'gold'
    for pat in LOAN_TRIGGERS:
        if re.search(pat, t):
            return 'loan'
    for pat in GIFT_TRIGGERS:
        if re.search(pat, t):
            return 'gift'
    for pat in TRIP_TRIGGERS:
        if re.search(pat, t):
            return 'trip'
    for pat in FIRE_TRIGGERS:
        if re.search(pat, t):
            return 'fire'
    for pat in CREDIT_CARD_TRIGGERS:
        if re.search(pat, t):
            return 'credit_card'
    for pat in RECURRING_TRIGGERS:
        if re.search(pat, t):
            return 'recurring'
    for pat in UPI_TRIGGERS:
        if re.search(pat, t):
            return 'upi'
    for pat in PIGGYBANK_TRIGGERS:
        if re.search(pat, t):
            return 'piggybank'
    for pat in QUERY_TRIGGERS:
        if re.search(pat, t):
            return 'query'
    for pat in EXPENSE_TRIGGERS:
        if re.search(pat, t):
            return 'expense'
    # Don't parse pure date expressions as expenses (e.g. "jun 10 2026", "march 15", "next friday")
    _M = r'(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
    _DATE_ONLY = re.compile(
        r'^' + _M + r'[\s\-/]\d{1,2}(?:(?:st|nd|rd|th))?(?:[\s\-/]\d{2,4})?$'   # "may 10th", "june 10 2026"
        r'|^(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)$'
        r'|^\d{1,2}[\s\-/]' + _M + r'(?:[\s\-/]\d{2,4})?$'                        # "15 mar", "15/june/2026"
        r'|^\d{1,2}(?:st|nd|rd|th)\s+' + _M + r'(?:\s+\d{2,4})?$'                 # "10th april 2026"
        r'|^' + _M + r'(?:\s+\d{4})?$',                                             # "may", "may 2026"
        re.IGNORECASE
    )
    if _DATE_ONLY.match(t.strip()):
        return 'unknown'
    # If there's a number and a word, lean towards expense
    if re.search(r'\d', t) and len(t.split()) >= 2:
        return 'expense'
    return 'unknown'


# ---------------------------------------------------------------------------
# CATEGORY INFERENCE
# ---------------------------------------------------------------------------

def infer_category(text: str, available_categories: list[str]) -> str:
    """Infer category from merchant name or keywords."""
    text_lower = text.lower()

    # Check merchant map
    for merchant, category in MERCHANT_MAP.items():
        if merchant in text_lower:
            # Match to available categories
            for avail in available_categories:
                if avail.lower() == category.lower():
                    return avail
                # fuzzy: "Food & Dining" matches "food"
                if any(word in avail.lower() for word in category.lower().split()):
                    return avail

    # Fallback: keyword match against available category names
    for avail in available_categories:
        avail_words = avail.lower().replace('&', '').replace('/', ' ').split()
        for word in avail_words:
            if len(word) > 3 and word in text_lower:
                return avail

    return available_categories[0] if available_categories else "Miscellaneous"


# ---------------------------------------------------------------------------
# DESCRIPTION EXTRACTOR
# ---------------------------------------------------------------------------

def extract_description(text: str) -> str:
    """Pull a clean description from the raw text."""
    # Remove amount patterns
    clean = re.sub(r'₹?\d+(?:\.\d+)?\s*(?:k|K|L|lac|lakh|lakhs|cr|crore|crores|rupees?|rs\.?)?', '', text)
    # Remove trigger words + filler/conversational words
    trigger_words = r'\b(spent|spend|paid|pay|bought|buy|ordered|for|on|at|in|from|got|received|salary|income|bonus|'
    trigger_words += r'yesterday|today|kal|last week|this morning|and|also|then|after|before|'
    trigger_words += r'no|yes|i|i\'m|i\'ve|want|wanted|to|add|added|log|logged|please|can|just|my|a|an|the|'
    trigger_words += r'nahi|haan|ek|do|teen|mera|mere|meri|karo|karna|chahiye|hai|tha|thi)\b'
    clean = re.sub(trigger_words, '', clean, flags=re.IGNORECASE)
    # Remove date patterns
    clean = re.sub(r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\b\d{1,2}(?:st|nd|rd|th)?\b', '', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean if len(clean) > 1 else text.strip()


# ---------------------------------------------------------------------------
# SINGLE ENTRY PARSER
# ---------------------------------------------------------------------------

RECURRING_PATTERNS = re.compile(
    r'\b(every month|monthly|har mahine|mahine mahine|per month|each month|monthly kato|recurring|'
    r'every week|weekly|har hafte|per week|each week|'
    r'every year|yearly|annually|har saal|'
    r'standing instruction|auto.?debit|auto.?pay|subscription)\b',
    re.IGNORECASE
)

_ONETIME_PAT = re.compile(
    r'\b(make it one.?time|make one.?time|convert.{0,30}one.?time|to one.?time|'
    r'stop recurring|remove recurring|cancel recurring|'
    r'one time karo|recurring band karo|recurring hatao|ek baar ka karo|'
    r'no longer recurring|not recurring anymore|deactivate recurring|'
    r'recurring stop|recurring cancel|recurring remove)\b',
    re.IGNORECASE
)

FREQUENCY_MAP = {
    'weekly': ['every week', 'weekly', 'har hafte', 'per week', 'each week'],
    'yearly': ['every year', 'yearly', 'annually', 'har saal'],
}

def detect_recurring(text: str) -> tuple[bool, str]:
    """Returns (is_recurring, frequency) — frequency is 'monthly'|'weekly'|'yearly'."""
    if not RECURRING_PATTERNS.search(text):
        return False, 'monthly'
    text_lower = text.lower()
    for freq, keywords in FREQUENCY_MAP.items():
        if any(k in text_lower for k in keywords):
            return True, freq
    return True, 'monthly'


# ---------------------------------------------------------------------------
# INCOME SOURCE TYPE INFERENCE
# ---------------------------------------------------------------------------

INCOME_SOURCE_MAP = [
    ('salary',    ['salary', 'salry', 'sal', 'ctc', 'paycheck', 'payroll', 'in-hand', 'inhand', 'take home', 'paystub', 'stipend', 'wage']),
    ('freelance', ['freelance', 'consulting', 'consultant', 'client payment', 'project payment', 'invoice', 'gig', 'contract']),
    ('rental',    ['rent received', 'rental income', 'rental', 'tenant', 'house rent', 'property income']),
    ('business',  ['business income', 'business profit', 'shop income', 'sales income', 'revenue', 'profit', 'shop']),
    ('dividend',  ['dividend', 'interest', 'fd interest', 'maturity', 'returns', 'cashback', 'refund', 'reimbursement', 'bonus', 'incentive', 'commission']),
]

def infer_income_source_type(text: str) -> str:
    """Infer income source_type from text keywords."""
    text_lower = text.lower()
    for source_type, keywords in INCOME_SOURCE_MAP:
        if any(k in text_lower for k in keywords):
            return source_type
    return 'other'


def parse_single_entry(text: str, available_categories: list[str]) -> dict:
    """
    Parse one line of user input into a structured entry.
    Returns dict with: intent, amount, description, category, date, confidence, raw
    """
    text = text.strip()
    if not text:
        return {}

    intent = detect_intent(text)
    amount = parse_amount(text)
    date = parse_date(text)
    description = extract_description(text)
    category = infer_category(text, available_categories) if intent == 'expense' else None
    is_recurring, frequency = detect_recurring(text)
    source_type = infer_income_source_type(text) if intent == 'income' else None

    # Confidence scoring
    confidence = 0.5
    if amount:
        confidence += 0.3
    if intent != 'unknown':
        confidence += 0.2
    if category:
        confidence += 0.1

    return {
        "intent": intent,
        "amount": amount,
        "description": description or text,
        "category": category,
        "date": date,
        "is_recurring": is_recurring,
        "frequency": frequency,
        "source_type": source_type,
        "confidence": min(confidence, 1.0),
        "raw": text,
    }


# ---------------------------------------------------------------------------
# BULK ENTRY SPLITTER — the key to handling "entire day dump"
# ---------------------------------------------------------------------------

BULK_SEPARATORS = re.compile(
    r'\n+'                          # newlines (most common for bulk)
    r'|(?<!\d),(?!\d{3})'          # comma (not inside numbers like 1,200)
    r'|\band\s+(?=(?:spent|paid|bought|₹|\d))'  # "and spent..."
    r'|\bpaid\s+(?=₹|\d)'          # "paid 200..."
    r'|\bspent\s+(?=₹|\d)'         # "spent 300..."
    r'|\bbought\s+(?=\w)'           # "bought coffee..."
    r'|\bthen\b'                    # "then..."
    r'|\balso\b'                    # "also..."
    r'|\bafter that\b'              # "after that..."
    r'|\+',                         # "+"
    re.IGNORECASE
)

def split_bulk(text: str) -> list[str]:
    """Split a bulk message into individual entry strings."""
    parts = BULK_SEPARATORS.split(text)
    cleaned = []
    for part in parts:
        part = part.strip()
        # Must have at least a number or a known merchant to be valid
        has_amount = bool(re.search(r'\d', part))
        has_merchant = any(m in part.lower() for m in MERCHANT_MAP)
        if part and (has_amount or has_merchant):
            cleaned.append(part)
    return cleaned if cleaned else [text]


# ---------------------------------------------------------------------------
# MAIN ENTRY POINT
# ---------------------------------------------------------------------------

def parse_message(text: str, available_expense_categories: list[str]) -> dict:
    """
    Main function called by the chatbot endpoint.

    Returns:
    {
        "type": "bulk" | "single" | "query" | "edit" | "unknown",
        "entries": [...],          # list of parsed entries (expense/income/goal)
        "query_intent": str,       # if type == "query"
        "needs_claude": bool,      # True if Layer 1 couldn't handle it
        "confidence": float,       # overall confidence
    }
    """
    text = text.strip()
    if not text:
        return {"type": "unknown", "entries": [], "needs_claude": True, "confidence": 0}

    # Check for pure query (no amounts, just questions)
    intent_check = detect_intent(text)

    # Delete: handled directly in server.py, not by Claude
    if intent_check == 'delete':
        return {
            "type": "delete",
            "entries": [],
            "query_intent": text,
            "needs_claude": False,
            "confidence": 0.95,
        }

    # Convert recurring → one-time
    if _ONETIME_PAT.search(text):
        return {
            "type": "convert_to_onetime",
            "entries": [],
            "query_intent": text,
            "needs_claude": False,
            "confidence": 0.92,
        }

    # These always go to Claude — they need rich context-aware handling
    CLAUDE_INTENTS = ('query', 'edit', 'emi', 'goal', 'investment', 'gold', 'loan',
                      'gift', 'trip', 'fire', 'credit_card', 'recurring', 'upi', 'piggybank')
    if intent_check in CLAUDE_INTENTS:
        # Special case: if it's 'recurring' but has a specific amount → treat as expense with recurring flag
        if intent_check == 'recurring' and parse_amount(text) is not None:
            pass  # fall through to Layer 1 parsing below
        else:
            return {
                "type": intent_check,
                "entries": [],
                "query_intent": text,
                "needs_claude": True,
                "confidence": 0.9,
            }

    # Try to split into multiple entries
    parts = split_bulk(text)

    entries = []
    for part in parts:
        entry = parse_single_entry(part, available_expense_categories)
        if entry and entry.get("amount") and entry.get("intent") in ("expense", "income", "goal"):
            entries.append(entry)

    if not entries:
        # Single ambiguous entry — send to Claude
        single = parse_single_entry(text, available_expense_categories)
        if single.get("intent") != "unknown":
            return {
                "type": "single",
                "entries": [single],
                "needs_claude": single["confidence"] < 0.75,
                "confidence": single["confidence"],
            }
        return {
            "type": "unknown",
            "entries": [],
            "needs_claude": True,
            "confidence": 0.3,
        }

    overall_confidence = sum(e["confidence"] for e in entries) / len(entries)
    result_type = "bulk" if len(entries) > 1 else "single"

    return {
        "type": result_type,
        "entries": entries,
        "needs_claude": overall_confidence < 0.75,
        "confidence": overall_confidence,
    }


# ---------------------------------------------------------------------------
# CHANAKYA RESPONSE FORMATTER
# ---------------------------------------------------------------------------

CATEGORY_EMOJI = {
    "Food & Dining": "🍽️",
    "Groceries": "🛒",
    "Transport": "🚗",
    "Entertainment": "🎬",
    "Shopping": "🛍️",
    "Health & Medical": "🏥",
    "Bills & Utilities": "⚡",
    "Personal Care": "💆",
    "Education": "📚",
    "Travel": "✈️",
    "Rent / Housing": "🏠",
    "Miscellaneous": "📌",
}

def generate_ca_insight(user_context: dict, logged_entries: list[dict] = None) -> str:
    """
    Generate a calm, friendly contextual insight based on the user's financial picture.
    No API call — pure rules-based. Returns one short line Chanakya appends to every response.
    """
    from datetime import datetime
    import pytz

    ist = pytz.timezone("Asia/Kolkata")
    now = datetime.now(ist)
    day = now.day
    days_in_month = 30
    days_left = days_in_month - day

    monthly_income  = user_context.get("monthly_income", 0)
    free_cash       = user_context.get("free_cash", 0)
    total_spent     = user_context.get("total_spent", 0)
    total_emi       = user_context.get("total_emi", 0)
    savings_rate    = user_context.get("savings_rate", 0)
    emi_ratio       = user_context.get("emi_ratio", 0)
    cat_spent       = user_context.get("category_spent", {})
    cat_budget      = user_context.get("category_budget", {})
    goals           = user_context.get("goals", [])
    emi_due_soon    = user_context.get("emi_due_soon", [])

    insights = []

    # When we know which categories were just logged, only surface insights
    # for those — avoid confusing the user with unrelated category alerts.
    logged_cats = set()
    if logged_entries:
        logged_cats = {e.get("category", "") for e in logged_entries if e.get("category")}

    def _check_cats(cats_to_check):
        """Return over-budget / approaching-limit insights for a given set of categories."""
        found = []
        for cat, spent in cat_spent.items():
            if cats_to_check and cat not in cats_to_check:
                continue
            budget = cat_budget.get(cat, 0)
            if budget > 0 and spent > budget:
                over = spent - budget
                found.append(f"FYI — {cat} is ₹{over:,.0f} over your plan this month.")
            elif budget > 0 and 0.8 <= spent / budget < 1.0:
                remaining = budget - spent
                found.append(f"{cat} has ₹{remaining:,.0f} left for the month.")
        return found

    # 1 & 2. Show category alerts only for what was just logged; fall back to
    # all categories only if nothing noteworthy in the logged ones.
    if logged_cats:
        insights.extend(_check_cats(logged_cats))
    if not insights:
        insights.extend(_check_cats(set()))  # all categories fallback

    # 3. Burn rate — show the math, let user decide
    if total_spent > 0 and monthly_income > 0 and day > 0:
        daily_burn = total_spent / day
        projected = daily_burn * days_in_month
        if projected > monthly_income * 0.95:
            insights.append(f"At this pace, March comes to ₹{projected:,.0f} total spend.")

    # 4. Low free cash — just the number
    if monthly_income > 0 and 0 < free_cash < monthly_income * 0.1:
        insights.append(f"₹{free_cash:,.0f} left, {days_left} days to go.")

    # 5. EMI burden — informational
    if emi_ratio > 50:
        insights.append(f"EMIs are taking {emi_ratio:.0f}% of income this month.")
    elif emi_ratio > 40:
        insights.append(f"EMI load is at {emi_ratio:.0f}% of income — RBI safe limit is 50%.")

    # 6. Savings rate — celebrate wins, flag gaps without lecturing
    if monthly_income > 0 and total_spent > 0:
        if savings_rate >= 20:
            insights.append(f"Saving {savings_rate:.0f}% of income this month — solid.")
        elif savings_rate < 5 and total_spent > 0:
            insights.append(f"Savings at {savings_rate:.0f}% this month — just a heads up.")

    # 7. Goal — show progress, let it speak for itself
    if goals:
        urgent = sorted(goals, key=lambda g: g.get("days_left", 999))
        g = urgent[0]
        if g.get("days_left", 0) <= 30:
            insights.append(f"'{g['name']}' — {g['progress']}% done, {g['days_left']} days left.")

    # 8. EMI due soon — reminder, not alarm
    if emi_due_soon:
        e = emi_due_soon[0]
        insights.append(f"{e['name']} EMI (₹{e['amount']:,.0f}) coming up in {e['days']} days.")

    # 9. Mid-month snapshot
    if 13 <= day <= 17 and monthly_income > 0:
        mid_target = monthly_income * 0.45
        if total_spent > mid_target:
            insights.append(f"Mid-month: ₹{total_spent:,.0f} spent so far.")

    # 10. Month-end strong close
    if days_left <= 5 and monthly_income > 0 and free_cash > monthly_income * 0.15:
        insights.append(f"₹{free_cash:,.0f} still intact with {days_left} days left — good month.")

    # Return highest priority insight (first match) or nothing
    return insights[0] if insights else ""


def format_bulk_response(entries: list[dict], user_context: dict) -> str:
    """Format Chanakya's reply for bulk entries with clear itemised summary."""
    expense_entries = [e for e in entries if e["intent"] == "expense"]
    income_entries  = [e for e in entries if e["intent"] == "income"]

    lines = []

    if len(entries) > 1:
        lines.append(f"Got it! Logged {len(entries)} entries:\n")

    for e in expense_entries:
        emoji = CATEGORY_EMOJI.get(e.get("category", ""), "📌")
        amt = f"₹{e['amount']:,.0f}"
        desc = e.get("description", "").title() or e["raw"].title()
        cat = e.get("category", "")
        _r = " 🔄" if e.get("is_recurring") else ""
        lines.append(f"{emoji} *{amt}* — {desc} [{cat}]{_r}")

    for e in income_entries:
        amt = f"₹{e['amount']:,.0f}"
        desc = e.get("description", "").title() or e["raw"].title()
        lines.append(f"💰 *{amt}* income — {desc}")

    # Summary footer
    total_expense = sum(e["amount"] for e in expense_entries if e.get("amount"))
    total_income  = sum(e["amount"] for e in income_entries if e.get("amount"))

    if len(entries) > 1:
        lines.append("")
        if total_expense > 0:
            lines.append(f"Total spent: *₹{total_expense:,.0f}*")
        if total_income > 0:
            lines.append(f"Total income: *₹{total_income:,.0f}*")

        # Context from user's financial state
        monthly_left = user_context.get("free_cash", 0)
        if monthly_left > 0:
            lines.append(f"Balance left this month: *₹{monthly_left:,.0f}*")

    # CA insight — always appended
    insight = generate_ca_insight(user_context, entries)
    if insight:
        lines.append(f"\n{insight}")

    return "\n".join(lines)


def format_single_response(entry: dict, user_context: dict) -> str:
    """Format Chanakya's reply for a single logged entry."""
    if entry["intent"] == "income":
        amt = f"₹{entry['amount']:,.0f}"
        insight = generate_ca_insight(user_context)
        insight_line = f"\n{insight}" if insight else ""
        return f"💰 *{amt}* income logged.{insight_line}"

    emoji = CATEGORY_EMOJI.get(entry.get("category", ""), "📌")
    amt = f"₹{entry['amount']:,.0f}"
    desc = entry.get("description", "").title() or entry["raw"].title()
    cat = entry.get("category", "")

    _recur_tag = f" 🔄 *{entry.get('frequency', 'monthly')} recurring*" if entry.get("is_recurring") else ""
    line1 = f"{emoji} *{amt}* on {desc} logged under *{cat}*{_recur_tag}"

    # Quick context
    cat_spent = user_context.get("category_spent", {}).get(cat, 0)
    cat_budget = user_context.get("category_budget", {}).get(cat, 0)
    monthly_left = user_context.get("free_cash", 0)

    if cat_budget > 0:
        remaining = cat_budget - cat_spent
        pct = round(cat_spent / cat_budget * 100)
        status = "⚠️ Over budget!" if cat_spent > cat_budget else f"{pct}% of budget used"
        line2 = f"{cat}: ₹{cat_spent:,.0f} spent of ₹{cat_budget:,.0f} ({status})"
    else:
        line2 = f"Balance left this month: ₹{monthly_left:,.0f}"

    insight = generate_ca_insight(user_context, [entry])
    insight_line = f"\n{insight}" if insight else ""

    return f"{line1}\n{line2}{insight_line}"


# ---------------------------------------------------------------------------
# CONFIRMATION FORMATTER — shown BEFORE logging (user must say yes)
# ---------------------------------------------------------------------------

def format_confirmation_request(entries: list[dict]) -> str:
    """
    When confidence is medium (0.6–0.85), show what the system understood
    and ask user to confirm before logging. User replies 'yes'/'no'/'correct it'.
    """
    if not entries:
        return "I didn't catch that clearly. Could you rephrase?"

    if len(entries) == 1:
        e = entries[0]
        emoji = CATEGORY_EMOJI.get(e.get("category", ""), "📌")
        amt = f"₹{e['amount']:,.0f}" if e.get("amount") else "?"
        desc = e.get("description", e.get("raw", "")).title()
        cat = e.get("category", "?")
        intent = e.get("intent", "expense")

        if intent == "income":
            return f"Logging *{amt}* as income — *yes* to confirm."
        _recur_note = f" 🔄 *(will repeat {e.get('frequency', 'monthly')})*" if e.get("is_recurring") else ""
        return (
            f"{emoji} *{amt}* on {desc} → *{cat}*{_recur_note}\n"
            f"*yes* to log, or tell me what to change."
        )

    # Bulk confirmation
    lines = [f"{len(entries)} entries — looks right?\n"]
    for i, e in enumerate(entries, 1):
        emoji = CATEGORY_EMOJI.get(e.get("category", ""), "📌")
        amt = f"₹{e['amount']:,.0f}" if e.get("amount") else "?"
        desc = e.get("description", e.get("raw", "")).title()
        cat = e.get("category", "?")
        _r = " 🔄" if e.get("is_recurring") else ""
        lines.append(f"{i}. {emoji} *{amt}* — {desc} [{cat}]{_r}")

    lines.append("\n*yes* to log all, or tell me what to fix.")
    return "\n".join(lines)
