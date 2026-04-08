# -*- coding: utf-8 -*-
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Form, Body, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, Response
import aiohttp
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import io
import pandas as pd
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import asyncio
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import re
import html as _html
from anthropic import AsyncAnthropic
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from bson import ObjectId
from cachetools import TTLCache
import hashlib
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

# ============================================
# IN-MEMORY CACHE CONFIGURATION
# ============================================
# TTLCache(maxsize, ttl_in_seconds)
# - maxsize: Maximum number of items to store
# - ttl: Time-to-live in seconds before auto-expiration

# Cache for budget summaries (5 min TTL, max 1000 users)
budget_summary_cache = TTLCache(maxsize=1000, ttl=300)

# Cache for financial scores (5 min TTL)
financial_score_cache = TTLCache(maxsize=1000, ttl=300)

# Cache for EMI recommendations (10 min TTL)
emi_recommendations_cache = TTLCache(maxsize=1000, ttl=600)

# Cache for savings goals summary (5 min TTL)
savings_summary_cache = TTLCache(maxsize=1000, ttl=300)

# Cache for categories list (2 min TTL)
categories_cache = TTLCache(maxsize=1000, ttl=120)

# ── PDF parse job store (in-memory, TTL not needed — jobs are short-lived) ──
_pdf_parse_jobs: dict = {}  # job_id -> {"status": "processing"|"done"|"error", "result": list, "error": str}

# ── UPI import job store ──────────────────────────────────────────────────────
_import_jobs: dict = {}  # job_id -> {"status": "processing"|"done"|"error", "imported": int, "duplicates": int, "errors": list, "error": str}

def get_cache_key(user_id: str, prefix: str = "") -> str:
    """Generate a cache key for a user"""
    return f"{prefix}:{user_id}"

def invalidate_user_cache(user_id: str):
    """Invalidate all caches for a user when they make changes"""
    keys_to_delete = []
    for cache in [budget_summary_cache, financial_score_cache, emi_recommendations_cache, savings_summary_cache, categories_cache]:
        for key in list(cache.keys()):
            if user_id in key:
                keys_to_delete.append((cache, key))
    for cache, key in keys_to_delete:
        cache.pop(key, None)

logger = logging.getLogger(__name__)

# ── Plan limits ────────────────────────────────────────────────────────────────
FREE_LIMITS = {
    "categories": 5,
    "emis": 3,
    "savings_goals": 1,
    "ai_messages": 20,
}

async def check_limit(user: dict, resource: str, current_count: int):
    """Raise 402 if free-tier user exceeds limit. Pro users always pass."""
    if user.get("is_pro"):
        return
    limit = FREE_LIMITS.get(resource)
    if limit is not None and current_count >= limit:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "limit_reached",
                "resource": resource,
                "limit": limit,
                "current": current_count,
                "message": f"Free plan limit reached ({limit} {resource}). Upgrade to Pro for unlimited access.",
            }
        )

def require_pro(user: dict, feature: str = "this feature"):
    """Raise 402 if user is not Pro. Used for Pro-only features."""
    if not user.get("is_pro"):
        raise HTTPException(
            status_code=402,
            detail={
                "code": "limit_reached",
                "resource": feature,
                "limit": 0,
                "current": 1,
                "message": f"Upgrade to Pro to unlock {feature}.",
            }
        )
logger.info("In-memory caching enabled: budget_summary(5m), financial_score(5m), emi_recs(10m), savings(5m), categories(2m)")

# Chatbot model for request
class ChatbotRequest(BaseModel):
    message: str = Field(..., max_length=500)
    conversation_history: Optional[List[dict]] = []
    pending_entries: Optional[List[dict]] = []
    pending_delete: Optional[dict] = None   # {transaction_id, description, amount, date, category_id, category_name}
    pending_edit: Optional[dict] = None     # {transaction_id, field, old_value, new_value}
    reply_to: Optional[str] = None          # _id of message being replied to
    attachment: Optional[dict] = None       # {type, data, name, mime}
    is_voice: Optional[bool] = False        # True when message originated from voice input

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

SECRET_KEY   = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ADMIN_SECRET = os.environ.get('ADMIN_SECRET', '')
if SECRET_KEY == 'your-secret-key-change-in-production':
    logger.warning("JWT_SECRET_KEY is using the default insecure value — set the env var in production!")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day — security default; biometric re-auth on mobile handles UX

mongo_url = os.environ['MONGO_URL']
# tlsAllowInvalidCertificates is False in prod if MONGO_URL contains mongodb+srv (Atlas always has valid certs)
_tls_skip = os.environ.get('MONGO_TLS_ALLOW_INVALID', 'false').lower() == 'true'
client = AsyncIOMotorClient(
    mongo_url,
    tlsAllowInvalidCertificates=_tls_skip,
    serverSelectionTimeoutMS=8000,   # fail fast if Atlas is unreachable
    connectTimeoutMS=10000,          # 10s to establish connection
    socketTimeoutMS=30000,           # 30s for individual operations
)
db = client[os.environ['DB_NAME']]

def get_real_ip(request: Request) -> str:
    """Get real client IP, honouring X-Forwarded-For from Railway/Vercel proxies."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"

limiter = Limiter(key_func=get_real_ip)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)

api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ── Circle Chat Connection Manager ───────────────────────────────────────────
class _CircleConnectionManager:
    def __init__(self):
        # circle_id -> list of (websocket, user_id, user_name)
        self.rooms: dict[str, list] = {}

    async def connect(self, circle_id: str, ws: WebSocket, user_id: str, user_name: str):
        await ws.accept()
        if circle_id not in self.rooms:
            self.rooms[circle_id] = []
        self.rooms[circle_id].append((ws, user_id, user_name))

    def disconnect(self, circle_id: str, ws: WebSocket):
        if circle_id in self.rooms:
            self.rooms[circle_id] = [(w, u, n) for w, u, n in self.rooms[circle_id] if w is not ws]

    async def broadcast(self, circle_id: str, message: dict):
        dead = []
        for ws, uid, uname in self.rooms.get(circle_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        # prune dead connections
        if dead:
            self.rooms[circle_id] = [(w, u, n) for w, u, n in self.rooms.get(circle_id, []) if w not in dead]

    def online_members(self, circle_id: str) -> list[str]:
        return [uname for _, _, uname in self.rooms.get(circle_id, [])]

_circle_manager = _CircleConnectionManager()

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    password_hash: str
    family_group_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserRegister(BaseModel):
    email: EmailStr
    name: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class FamilyGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_by: str
    members: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FamilyGroupCreate(BaseModel):
    name: str

class InviteToFamily(BaseModel):
    email: EmailStr

class BudgetCategory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    family_group_id: Optional[str] = None
    name: str
    type: str
    allocated_amount: float
    spent_amount: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BudgetCategoryCreate(BaseModel):
    name: str
    type: str
    allocated_amount: float

class EMI(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    family_group_id: Optional[str] = None
    loan_name: str
    principal_amount: float
    interest_rate: float
    monthly_payment: float
    start_date: str
    tenure_months: int
    emi_debit_day: Optional[int] = None  # day of month EMI is debited (1-31)
    remaining_balance: float
    paid_months: int = 0
    status: str = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EMIPayment(BaseModel):
    amount: float
    payment_date: str

class EMICreate(BaseModel):
    loan_name: str
    principal_amount: float
    interest_rate: float
    monthly_payment: float
    start_date: str
    tenure_months: int
    emi_debit_day: Optional[int] = None

class EMIUpdate(BaseModel):
    loan_name: Optional[str] = None
    principal_amount: Optional[float] = None
    interest_rate: Optional[float] = None
    monthly_payment: Optional[float] = None
    start_date: Optional[str] = None
    tenure_months: Optional[int] = None
    emi_debit_day: Optional[int] = None
    status: Optional[str] = None  # allow reactivating closed EMIs

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    family_group_id: Optional[str] = None
    category_id: str
    category_name: str
    amount: float
    description: str
    type: str
    date: str
    source: str = "manual"  # manual, sms, voice
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TransactionCreate(BaseModel):
    category_id: str
    amount: float
    description: str
    date: str
    source: Optional[str] = "manual"

class SMSParse(BaseModel):
    sms_text: str

class WhenToBuy(BaseModel):
    item_name: str
    target_amount: float

# Savings Goals Models
class SavingsGoal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    family_group_id: Optional[str] = None
    name: str
    target_amount: float
    current_amount: float = 0.0
    target_date: str  # YYYY-MM-DD format
    category: str = "general"  # general, electronics, travel, home, vehicle, education, emergency, other
    priority: str = "medium"  # low, medium, high
    notes: Optional[str] = None
    status: str = "active"  # active, completed, paused
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SavingsGoalCreate(BaseModel):
    name: str
    target_amount: float
    target_date: str
    category: str = "general"
    priority: str = "medium"
    notes: Optional[str] = None

class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    target_date: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class SavingsContribution(BaseModel):
    amount: float
    notes: Optional[str] = None

# ── Investment Models ─────────────────────────────────────────────────────────
class Investment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    family_group_id: Optional[str] = None
    type: str   # stocks | mutual_funds | gold | ppf | nps | fd | rd | real_estate | health_insurance | term_insurance
    name: str
    invested_amount: float
    current_value: float
    monthly_sip: Optional[float] = None     # MF/RD monthly contribution
    symbol: Optional[str] = None            # NSE symbol for stocks (e.g. "RELIANCE.NS")
    shares_held: Optional[float] = None     # number of shares held (stocks)
    scheme_code: Optional[str] = None       # mfapi.in scheme code for MFs
    units_held: Optional[float] = None      # estimated units held (MFs)
    goal_amount: Optional[float] = None
    savings_goal_id: Optional[str] = None   # links this FD/RD to a savings goal for auto-tracking
    start_date: Optional[str] = None
    maturity_date: Optional[str] = None
    notes: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InvestmentCreate(BaseModel):
    type: str
    name: str
    invested_amount: float
    current_value: float
    monthly_sip: Optional[float] = None
    symbol: Optional[str] = None        # NSE ticker for stocks
    shares_held: Optional[float] = None # shares held (stocks)
    scheme_code: Optional[str] = None   # mfapi scheme code for MFs
    units_held: Optional[float] = None  # estimated units (MFs)
    goal_amount: Optional[float] = None
    savings_goal_id: Optional[str] = None
    start_date: Optional[str] = None
    maturity_date: Optional[str] = None
    notes: Optional[str] = ""

class InvestmentUpdate(BaseModel):
    current_value: Optional[float] = None
    invested_amount: Optional[float] = None
    monthly_sip: Optional[float] = None
    shares_held: Optional[float] = None
    units_held: Optional[float] = None
    goal_amount: Optional[float] = None
    savings_goal_id: Optional[str] = None
    notes: Optional[str] = None

# ── Gold Models ───────────────────────────────────────────────────────────────
class GoldItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    name: str
    type: str                        # physical | sgb | gold_etf | digital
    karat: int = 24                  # 24 | 22 | 18 — purity of the item
    weight_grams: float = 0          # for physical / digital gold
    quantity: float = 0              # for SGB / ETF units
    purchase_price_per_gram: float = 0
    purchase_price_per_unit: float = 0
    purchase_date: str = ""
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GoldItemCreate(BaseModel):
    name: str
    type: str
    karat: int = 24
    weight_grams: float = 0
    quantity: float = 0
    purchase_price_per_gram: float = 0
    purchase_price_per_unit: float = 0
    purchase_date: str = ""
    notes: str = ""

# ── Hand Loan Models ──────────────────────────────────────────────────────────
class HandLoan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    type: str  # "given" (I lent money) | "taken" (I borrowed money)
    person_name: str
    person_phone: str = ""
    person_email: str = ""
    amount: float
    date: str  # ISO date string YYYY-MM-DD
    due_date: str = ""  # optional
    reason: str = ""    # what the loan was for
    notes: str = ""
    status: str = "pending"  # pending | partial | settled
    settled_amount: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NotificationPrefs(BaseModel):
    whatsapp_enabled: bool = True
    email_enabled: bool = False
    notify_via_chat: bool = True     # deliver notifications inside Chanakya chat
    notify_emi: bool = True
    notify_subscriptions: bool = True
    notify_birthdays: bool = True
    notify_budget_summary: bool = True
    notify_savings_goals: bool = True
    notify_hand_loans: bool = True
    notify_salary: bool = True
    notify_when_to_buy: bool = True
    reminder_days_before: int = 3   # how many days before to send reminder

class HandLoanCreate(BaseModel):
    type: str
    person_name: str
    person_phone: str = ""
    person_email: str = ""
    amount: float
    date: str
    due_date: str = ""
    reason: str = ""
    notes: str = ""

class HandLoanUpdate(BaseModel):
    person_name: Optional[str] = None
    person_phone: Optional[str] = None
    person_email: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None
    due_date: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    settled_amount: Optional[float] = None

# ── Trip Planner Models ───────────────────────────────────────────────────────
class TripPlanRequest(BaseModel):
    destination: str
    start_date: str          # YYYY-MM-DD
    end_date: str            # YYYY-MM-DD
    travelers: int = 1
    style: str = "mid"       # budget | mid | luxury
    interests: Optional[str] = ""   # e.g. "food, history, adventure"

class Trip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    destination: str
    start_date: str
    end_date: str
    travelers: int = 1
    style: str = "mid"
    interests: str = ""
    estimated_cost_inr: float = 0
    cost_breakdown: dict = {}
    itinerary: list = []
    booking_tips: list = []
    affordability: dict = {}
    status: str = "planned"   # planned | booked | completed | cancelled
    savings_goal_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ── Trip Planner v2 Models (unified: itinerary + budget + group splits) ───────
class TripCreate(BaseModel):
    name: str
    destination: str = ""
    start_date: str = ""
    end_date: str = ""
    budget: Optional[float] = None
    members: list[str] = []          # member names (not user IDs — could be non-users)
    savings_goal_id: Optional[str] = None   # link to an existing savings goal
    preferences: str = ""            # vibe/style from wizard (e.g. "Beach, Food, Adventure")

class TripExpenseCreate(BaseModel):
    description: str
    amount: float
    paid_by: str
    category: str = "other"          # food, transport, stay, activity, other
    date: str = ""
    split_among: list[str] = []      # subset of members; empty = split all

class TripItineraryDay(BaseModel):
    day: int
    date: str = ""
    activities: list[dict] = []      # [{time, activity, location, estimated_cost}]
    notes: str = ""

# ── Group Expense Models ──────────────────────────────────────────────────────
class ExpenseGroup(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    name: str
    description: str = ""
    members: List[str] = []   # simple list of names
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseGroupCreate(BaseModel):
    name: str
    members: List[str]        # just names
    description: str = ""

class GroupExpense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    user_id: str = ""
    description: str
    amount: float
    paid_by: str              # member name
    split_among: List[str] = []  # member names who share the expense
    date: str
    category: str = "General"
    notes: str = ""
    split_type: str = "equal"   # "equal" | "exact"
    splits: Optional[dict] = None  # {member: exact_amount} for split_type="exact"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GroupExpenseCreate(BaseModel):
    description: str
    amount: float
    paid_by: str
    split_among: List[str] = []  # empty = split among all members
    date: Optional[str] = None
    category: str = "General"
    notes: str = ""
    split_type: str = "equal"
    splits: Optional[dict] = None

class GroupSettlement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    user_id: str = ""
    paid_by: str
    paid_to: str
    amount: float
    note: str = ""
    date: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GroupSettlementCreate(BaseModel):
    paid_by: str
    paid_to: str
    amount: float
    note: str = ""
    date: Optional[str] = None

# ── Circle Models ─────────────────────────────────────────────────────────────
class CircleCreate(BaseModel):
    name: str = "Our Circle"

class CircleExpenseCreate(BaseModel):
    description: str
    amount: float
    paid_by: str          # display name of who paid
    split_among: List[str] = []   # display names; empty = split among all
    date: Optional[str] = None
    category: str = "General"

# ── Financial Calendar Models ─────────────────────────────────────────────────
class CalendarEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    title: str
    date: str                 # YYYY-MM-DD
    end_date: Optional[str] = None   # for multi-day events like trips
    type: str = "custom"      # trip | emi | salary | goal | bonus | custom
    color: str = "blue"
    amount: Optional[float] = None
    notes: str = ""
    ref_id: Optional[str] = None     # linked trip/emi/goal id
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CalendarEventCreate(BaseModel):
    title: str
    date: str
    end_date: Optional[str] = None
    type: str = "custom"
    color: str = "blue"
    amount: Optional[float] = None
    notes: str = ""
    ref_id: Optional[str] = None

class PeopleEventCreate(BaseModel):
    person_name: str
    event_type: str = "birthday"   # birthday | anniversary | farewell | festival | other
    month: int                      # 1-12
    day: int                        # 1-31
    notes: str = ""
    gift_budget: float = 0
    emoji: str = ""                 # optional emoji e.g. 🎂

class PeopleEvent(PeopleEventCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ── Paycheck / Lifetime Earnings Models ───────────────────────────────────────
class PaycheckRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    month: str                # YYYY-MM
    employer: str = ""
    ctc_annual: float = 0     # annual CTC
    gross_monthly: float = 0  # gross monthly (CTC/12)
    basic: float = 0
    hra: float = 0
    tds: float = 0            # tax deducted
    pf_employee: float = 0    # PF employee contribution
    pf_employer: float = 0    # PF employer contribution
    professional_tax: float = 0
    other_deductions: float = 0
    net_take_home: float = 0  # actual credited amount
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PaycheckCreate(BaseModel):
    month: str
    employer: str = ""
    ctc_annual: float = 0
    gross_monthly: float = 0
    basic: float = 0
    hra: float = 0
    tds: float = 0
    pf_employee: float = 0
    pf_employer: float = 0
    professional_tax: float = 0
    other_deductions: float = 0
    net_take_home: float = 0
    notes: str = ""

# ── Silver Models ────────────────────────────────────────────────────────────
class SilverItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    name: str
    type: str                        # physical | silver_etf | digital
    purity: int = 999                # 999 | 925 | 800
    weight_grams: float = 0
    quantity: float = 0              # for ETF units
    purchase_price_per_gram: float = 0
    purchase_price_per_unit: float = 0
    purchase_date: str = ""
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SilverItemCreate(BaseModel):
    name: str
    type: str
    purity: int = 999
    weight_grams: float = 0
    quantity: float = 0
    purchase_price_per_gram: float = 0
    purchase_price_per_unit: float = 0
    purchase_date: str = ""
    notes: str = ""

# ── Credit Card Models ────────────────────────────────────────────────────────
class CreditCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    bank_name: str
    card_name: str
    credit_limit: float
    outstanding_balance: float = 0.0
    statement_day: int = 1       # day of month the statement generates (1-31)
    due_day: int = 20            # day of month payment is due (1-31)
    minimum_due_pct: float = 5.0 # minimum due as % of outstanding
    is_active: bool = True
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CreditCardCreate(BaseModel):
    bank_name: str
    card_name: str
    credit_limit: float
    outstanding_balance: float = 0.0
    statement_day: int = 1
    due_day: int = 20
    minimum_due_pct: float = 5.0
    notes: str = ""

class CreditCardUpdate(BaseModel):
    bank_name: Optional[str] = None
    card_name: Optional[str] = None
    credit_limit: Optional[float] = None
    outstanding_balance: Optional[float] = None
    statement_day: Optional[int] = None
    due_day: Optional[int] = None
    minimum_due_pct: Optional[float] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class CreditCardExpense(BaseModel):
    amount: float
    description: str
    category: str = "Shopping"
    date: str  # YYYY-MM-DD

# Helper Functions
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_token(token)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def parse_sms_transaction(sms_text: str):
    """Parse SMS to extract transaction details"""
    sms_lower = sms_text.lower()
    
    # Extract amount (₹ or Rs or INR)
    amount_patterns = [
        r'(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{2})?)',
        r'([0-9,]+(?:\.[0-9]{2})?)\s*(?:rs\.?|inr|₹)',
        r'debited.*?([0-9,]+(?:\.[0-9]{2})?)',
        r'credited.*?([0-9,]+(?:\.[0-9]{2})?)',
    ]
    
    amount = None
    for pattern in amount_patterns:
        match = re.search(pattern, sms_text, re.IGNORECASE)
        if match:
            amount = float(match.group(1).replace(',', ''))
            break
    
    # Determine transaction type
    is_debit = any(word in sms_lower for word in ['debited', 'debit', 'spent', 'paid', 'purchase', 'withdrawn'])
    txn_type = 'expense' if is_debit else 'income'
    
    # Extract merchant/description
    merchant_patterns = [
        r'at\s+([A-Z][A-Za-z\s]+)',
        r'to\s+([A-Z][A-Za-z\s]+)',
        r'from\s+([A-Z][A-Za-z\s]+)',
    ]
    
    description = "Transaction"
    for pattern in merchant_patterns:
        match = re.search(pattern, sms_text)
        if match:
            description = match.group(1).strip()
            break
    
    # Auto-categorize based on keywords
    category_keywords = {
        'groceries': ['supermarket', 'mart', 'grocery', 'vegetables', 'fruits'],
        'food': ['restaurant', 'cafe', 'zomato', 'swiggy', 'food', 'pizza', 'burger'],
        'transport': ['uber', 'ola', 'fuel', 'petrol', 'diesel', 'metro', 'bus'],
        'utilities': ['electricity', 'water', 'gas', 'recharge', 'bill'],
        'shopping': ['amazon', 'flipkart', 'myntra', 'shopping', 'mall'],
        'entertainment': ['netflix', 'prime', 'movie', 'cinema', 'hotstar'],
    }
    
    suggested_category = 'other'
    for category, keywords in category_keywords.items():
        if any(keyword in sms_lower for keyword in keywords):
            suggested_category = category
            break
    
    return {
        'amount': amount,
        'type': txn_type,
        'description': description,
        'suggested_category': suggested_category,
        'date': datetime.now(timezone.utc).strftime('%Y-%m-%d')
    }

def calculate_financial_score(summary: dict, user_age: int = 30):
    """
    Financial health score (0–100) modelled on RBI FOIR guidelines,
    CIBIL methodology, and Indian personal-finance benchmarks.

    Weights (research-backed):
      EMI burden (FOIR)   – 35 pts  (RBI mandates FOIR ≤ 50%)
      Expense ratio       – 25 pts  (ideal < 40% of income)
      Savings rate        – 25 pts  (minimum 20% recommended)
      Survivability check – 15 pts  (total outflow vs income)
    """
    recommendations = []

    total_income   = summary.get('total_income', 0)
    total_expenses = summary.get('total_expenses', 0)
    total_spent    = summary.get('total_spent', 0)
    total_emi      = summary.get('total_emi', 0)

    # ── No income data ────────────────────────────────────────────────────────
    if total_income == 0:
        if total_emi > 0:
            return {
                'score': 35, 'status': 'amber',
                'message': 'Add income categories for a complete health score',
                'expense_ratio': 0, 'emi_ratio': 0, 'savings_ratio': 0,
                'foir': 0,
                'recommendations': [
                    f'You have ₹{total_emi:,.0f}/mo in EMI commitments.',
                    'Add your income in Budget Manager to calculate your full health score.',
                ]
            }
        return {
            'score': 0, 'status': 'red',
            'message': 'No financial data yet',
            'expense_ratio': 0, 'emi_ratio': 0, 'savings_ratio': 0,
            'foir': 0,
            'recommendations': ['Add your income and expenses in Budget Manager to get started.']
        }

    # ── Core ratios ───────────────────────────────────────────────────────────
    # Only use actual recorded spending — never penalise for budget allocations
    # A new user who set up limits but hasn't spent yet should not be penalised
    effective_expenses = total_spent  # 0 if no transactions recorded yet

    emi_ratio      = (total_emi / total_income) * 100
    expense_ratio  = (effective_expenses / total_income) * 100 if effective_expenses > 0 else 0
    foir           = emi_ratio + expense_ratio
    net_cash       = total_income - total_emi - effective_expenses
    savings_ratio  = (net_cash / total_income) * 100

    score = 100

    # ── CRITICAL: Survivability (15 pts) ─────────────────────────────────────
    if total_emi >= total_income:
        # EMIs alone wipe out the entire salary — person cannot survive
        return {
            'score': 5, 'status': 'red',
            'message': 'CRITICAL — EMIs exceed your monthly income!',
            'expense_ratio': round(expense_ratio, 1),
            'emi_ratio': round(emi_ratio, 1),
            'savings_ratio': 0,
            'foir': round(foir, 1),
            'recommendations': [
                f'EMIs (₹{total_emi:,.0f}) exceed income (₹{total_income:,.0f}) — immediate action needed.',
                'Contact your lender to restructure or extend tenure to reduce monthly EMI.',
                'Consolidate multiple loans into one lower-rate loan (balance transfer).',
                'Speak to a financial advisor urgently.',
            ],
            'amounts': {
                'total_emi': round(total_emi),
                'monthly_expenses': round(effective_expenses),
                'monthly_income': round(total_income),
                'net_savings': 0,
            },
        }

    if foir >= 100:
        # EMIs + expenses exceed income — deficit every month
        score -= 15
        recommendations.append(
            f'Monthly outflow (₹{total_emi + effective_expenses:,.0f}) exceeds income — you are running a deficit every month.'
        )
    elif foir > 85:
        score -= 12
        recommendations.append('Total outflow is dangerously close to your income. Cut discretionary expenses immediately.')
    elif foir > 70:
        score -= 6

    # ── EMI Burden / FOIR — 35 pts (RBI threshold: FOIR ≤ 50%) ──────────────
    if emi_ratio > 65:
        score -= 35
        recommendations.append(
            f'EMI burden is {emi_ratio:.0f}% of income — far above the safe RBI limit of 50%. '
            'Consider loan restructuring or prepaying high-interest loans first.'
        )
    elif emi_ratio > 50:
        score -= 28
        recommendations.append(
            f'EMI burden is {emi_ratio:.0f}% — above the RBI-recommended 50% cap. '
            'Prioritise prepaying the highest-interest loan to free up cash flow.'
        )
    elif emi_ratio > 40:
        score -= 18
        recommendations.append(
            f'EMI burden is {emi_ratio:.0f}% (caution zone: 40–50%). '
            'Avoid taking on any new loans until this reduces.'
        )
    elif emi_ratio > 30:
        score -= 8
        recommendations.append(
            f'EMI burden is {emi_ratio:.0f}%. You can comfortably service these loans. '
            'Consider small prepayments to close loans faster.'
        )
    # ≤ 30%: healthy — no deduction

    # ── Expense Ratio — 25 pts ────────────────────────────────────────────────
    if expense_ratio > 70:
        score -= 25
        recommendations.append(
            f'Expenses are {expense_ratio:.0f}% of income — critically high. '
            'Identify and cut non-essential subscriptions, dining, and shopping first.'
        )
    elif expense_ratio > 60:
        score -= 18
        recommendations.append(
            f'Expenses are {expense_ratio:.0f}% of income. Apply the 50/30/20 rule: '
            '50% needs, 30% wants, 20% savings.'
        )
    elif expense_ratio > 50:
        score -= 10
        recommendations.append(
            f'Expenses are {expense_ratio:.0f}% of income. Try to bring this below 50%.'
        )
    elif expense_ratio > 40:
        score -= 4
    # ≤ 40%: excellent — no deduction

    # ── Savings Rate — 25 pts (benchmark: ≥ 20%) ─────────────────────────────
    if savings_ratio < 0:
        score -= 25
        recommendations.append(
            f'You are spending ₹{abs(net_cash):,.0f} more than you earn each month. '
            'This is unsustainable — reduce expenses or EMIs immediately.'
        )
    elif savings_ratio < 5:
        score -= 20
        recommendations.append(
            f'Savings rate is only {savings_ratio:.0f}% — extremely low. '
            'Even a small emergency will destabilise your finances. Target 20%.'
        )
    elif savings_ratio < 10:
        score -= 14
        recommendations.append(
            f'Savings rate is {savings_ratio:.0f}%. Aim for at least 20% (₹{total_income * 0.20:,.0f}/mo). '
            'Start a recurring deposit to automate savings.'
        )
    elif savings_ratio < 20:
        score -= 7
        recommendations.append(
            f'Savings rate is {savings_ratio:.0f}%. Good progress — push to 20%+ for financial security.'
        )
    else:
        recommendations.append(
            f'Savings rate is {savings_ratio:.0f}% — excellent! '
            'Consider investing the surplus in SIPs or PPF for wealth building.'
        )

    # ── Final score & status ──────────────────────────────────────────────────
    score = max(0, min(100, score))

    # If no actual spending recorded yet, cap score at a neutral level and nudge to track
    if effective_expenses == 0 and total_emi > 0:
        score   = max(score, 70)  # At least "Good" if income+EMI look healthy
        status  = 'amber'
        message = 'Looking good! Start tracking expenses for a full score'
    elif score >= 75:
        status  = 'green'
        message = 'Excellent financial health — keep it up!'
    elif score >= 50:
        status  = 'amber'
        message = 'Good, with room for improvement'
    elif score >= 25:
        status  = 'red'
        message = 'Needs immediate attention'
    else:
        status  = 'red'
        message = 'Critical — take action now'

    return {
        'score': score,
        'status': status,
        'message': message,
        'expense_ratio': round(expense_ratio, 1),
        'emi_ratio': round(emi_ratio, 1),
        'savings_ratio': round(max(savings_ratio, 0), 1),
        'foir': round(foir, 1),
        'recommendations': recommendations[:4],   # cap at 4 tips
        # Actual rupee amounts for meaningful display
        'amounts': {
            'total_emi': round(total_emi),
            'monthly_expenses': round(effective_expenses),
            'monthly_income': round(total_income),
            'net_savings': round(max(net_cash, 0)),
        },
    }

async def _seed_default_categories(user_id: str):
    """Create default expense categories for a brand-new user.
    Income is tracked separately via income_entries — not as budget categories.
    """
    defaults = [
        {"name": "Rent / Housing",     "type": "expense",  "allocated_amount": 0},
        {"name": "Food & Dining",      "type": "expense",  "allocated_amount": 0},
        {"name": "Groceries",          "type": "expense",  "allocated_amount": 0},
        {"name": "Transport",          "type": "expense",  "allocated_amount": 0},
        {"name": "Bills & Utilities",  "type": "expense",  "allocated_amount": 0},
        {"name": "Shopping",           "type": "expense",  "allocated_amount": 0},
        {"name": "Entertainment",      "type": "expense",  "allocated_amount": 0},
        {"name": "Health & Medical",   "type": "expense",  "allocated_amount": 0},
        {"name": "Personal Care",      "type": "expense",  "allocated_amount": 0},
        {"name": "Education",          "type": "expense",  "allocated_amount": 0},
        {"name": "Travel",             "type": "expense",  "allocated_amount": 0},
        {"name": "Miscellaneous",      "type": "expense",  "allocated_amount": 0},
        {"name": "UPI Transfers",      "type": "expense",  "allocated_amount": 0},
    ]
    now_iso = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "family_group_id": None,
            "name": d["name"],
            "type": d["type"],
            "allocated_amount": d["allocated_amount"],
            "spent_amount": 0.0,
            "created_at": now_iso,
        }
        for d in defaults
    ]
    await db.budget_categories.insert_many(docs)


# Auth Routes
@api_router.post("/auth/register")
@limiter.limit("10/minute")
async def register(request: Request, input: UserRegister):
    client_ip = get_real_ip(request)
    logger.info(f"[REGISTER] attempt from ip={client_ip} email={input.email}")
    try:
        existing_user = await db.users.find_one({"email": input.email})
        if existing_user:
            raise HTTPException(status_code=400, detail="This email is already registered. Please log in or use Forgot Password to reset your password.")

        password_hash = bcrypt.hashpw(input.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user = User(email=input.email, name=input.name, password_hash=password_hash)

        doc = user.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.users.insert_one(doc)

        # Seed default budget categories — wrapped so a DB hiccup never kills registration
        try:
            await _seed_default_categories(user.id)
        except Exception as seed_err:
            logger.warning(f"[REGISTER] category seed failed (non-fatal) email={input.email} err={seed_err}")

        # Generate OTP and send verification email
        import random as _random
        otp_code = f"{_random.randint(100000, 999999)}"
        otp_hash = bcrypt.hashpw(otp_code.encode(), bcrypt.gensalt()).decode()
        _otp_expiry = (datetime.now(timezone.utc) + __import__("datetime").timedelta(minutes=10)).isoformat()
        await db.otp_verifications.replace_one(
            {"email": input.email},
            {"email": input.email, "otp_hash": otp_hash, "expires_at": _otp_expiry, "user_id": user.id},
            upsert=True,
        )
        try:
            asyncio.create_task(_send_otp_email(user.email, user.name, otp_code))
        except Exception:
            pass

        logger.info(f"[REGISTER] OTP sent email={input.email}")
        # Return pending — frontend will show OTP entry screen
        return {"pending": True, "email": user.email, "name": user.name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REGISTER] unexpected error email={input.email} error={type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")

@api_router.post("/auth/phone-otp/request")
@limiter.limit("10/minute")
async def phone_otp_request(request: Request, body: dict):
    """Step 1 of phone OTP login. Sends OTP to the email linked to this phone number."""
    phone = (body.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required.")
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user or user.get("email", "").endswith("@phone.budgetmantra.local"):
        # No account or placeholder email — needs registration
        return {"needs_registration": True, "phone": phone}
    # Existing user with real email → send OTP
    import random as _random
    otp_code = f"{_random.randint(100000, 999999)}"
    otp_hash = bcrypt.hashpw(otp_code.encode(), bcrypt.gensalt()).decode()
    expiry = (datetime.now(timezone.utc) + __import__("datetime").timedelta(minutes=10)).isoformat()
    await db.otp_verifications.replace_one(
        {"email": user["email"]},
        {"email": user["email"], "otp_hash": otp_hash, "expires_at": expiry, "user_id": user["id"]},
        upsert=True,
    )
    asyncio.create_task(_send_otp_email(user["email"], user.get("name", ""), otp_code))
    # Return masked email so frontend can show "code sent to r***@gmail.com"
    em = user["email"]
    masked = em[0] + "***" + em[em.index("@"):]
    return {"pending": True, "email": user["email"], "masked_email": masked}


@api_router.post("/auth/phone-otp/register")
@limiter.limit("10/minute")
async def phone_otp_register(request: Request, body: dict):
    """Register a new user via phone. Collects email + name, sends email OTP."""
    phone = (body.get("phone") or "").strip()
    email = (body.get("email") or "").strip().lower()
    name  = (body.get("name") or "").strip()
    if not phone or not email or not name:
        raise HTTPException(status_code=400, detail="Phone, email and name are required.")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="This email is already registered. Please log in.")
    password_hash = bcrypt.hashpw(b"__phone_user__", bcrypt.gensalt()).decode()
    user = User(email=email, name=name, password_hash=password_hash)
    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["auth_provider"] = "phone"
    doc["phone"] = phone
    await db.users.insert_one(doc)
    try:
        await _seed_default_categories(user.id)
    except Exception:
        pass
    import random as _random
    otp_code = f"{_random.randint(100000, 999999)}"
    otp_hash = bcrypt.hashpw(otp_code.encode(), bcrypt.gensalt()).decode()
    expiry = (datetime.now(timezone.utc) + __import__("datetime").timedelta(minutes=10)).isoformat()
    await db.otp_verifications.replace_one(
        {"email": email},
        {"email": email, "otp_hash": otp_hash, "expires_at": expiry, "user_id": user.id},
        upsert=True,
    )
    asyncio.create_task(_send_otp_email(email, name, otp_code))
    return {"pending": True, "email": email, "name": name}


@api_router.post("/auth/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(request: Request, body: dict):
    """Verify 6-digit OTP sent to email during registration."""
    email = (body.get("email") or "").strip().lower()
    otp   = (body.get("otp") or "").strip()
    if not email or not otp:
        raise HTTPException(status_code=400, detail="Email and OTP are required.")
    rec = await db.otp_verifications.find_one({"email": email})
    if not rec:
        raise HTTPException(status_code=400, detail="OTP not found. Please register again.")
    # Check expiry
    from datetime import datetime as _dt, timezone as _tz
    expires_at = _dt.fromisoformat(rec["expires_at"])
    if _dt.now(_tz.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if not bcrypt.checkpw(otp.encode(), rec["otp_hash"].encode()):
        raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")
    # OTP valid — mark user as verified and issue token
    user_id = rec["user_id"]
    await db.users.update_one({"id": user_id}, {"$set": {"email_verified": True}})
    await db.otp_verifications.delete_one({"email": email})
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    # Fire onboarding email now that they're verified
    try:
        async def _send_and_mark():
            ok = await _send_onboarding_email(user["email"], user["name"])
            if ok:
                await db.users.update_one({"id": user["id"]}, {"$set": {"welcome_email_sent": True}})
        asyncio.create_task(_send_and_mark())
    except Exception:
        pass
    access_token = create_access_token({"user_id": user["id"], "email": user["email"]})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user["id"], "email": user["email"], "name": user["name"]},
    )


@api_router.post("/auth/resend-otp")
@limiter.limit("5/minute")
async def resend_otp(request: Request, body: dict):
    """Resend OTP to the registered email."""
    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found for this email.")
    import random as _random
    otp_code = f"{_random.randint(100000, 999999)}"
    otp_hash = bcrypt.hashpw(otp_code.encode(), bcrypt.gensalt()).decode()
    _otp_expiry = (datetime.now(timezone.utc) + __import__("datetime").timedelta(minutes=10)).isoformat()
    await db.otp_verifications.replace_one(
        {"email": email},
        {"email": email, "otp_hash": otp_hash, "expires_at": _otp_expiry, "user_id": user["id"]},
        upsert=True,
    )
    try:
        asyncio.create_task(_send_otp_email(email, user["name"], otp_code))
    except Exception:
        pass
    return {"ok": True}


@api_router.post("/auth/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, input: UserLogin):
    try:
        user = await db.users.find_one({"email": input.email}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        password_hash = user.get('password_hash')
        if not password_hash:
            raise HTTPException(status_code=401, detail="This account uses Google sign-in. Please use the 'Sign in with Google' button.")

        if not bcrypt.checkpw(input.password.encode('utf-8'), password_hash.encode('utf-8')):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        access_token = create_access_token({"user_id": user['id'], "email": user['email']})
        return Token(
            access_token=access_token,
            token_type="bearer",
            user={"id": user['id'], "email": user['email'], "name": user['name'], "family_group_id": user.get('family_group_id')}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[LOGIN] error email={input.email} {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Login failed. Please try again in a moment.")


@api_router.post("/auth/login-otp/verify")
@limiter.limit("10/minute")
async def verify_login_otp(request: Request, body: dict):
    """Verify the second-factor OTP sent after password check and issue JWT."""
    email = (body.get("email") or "").strip().lower()
    otp   = (body.get("otp") or "").strip()
    if not email or not otp:
        raise HTTPException(status_code=400, detail="Email and OTP are required.")
    rec = await db.login_otp_verifications.find_one({"email": email})
    if not rec:
        raise HTTPException(status_code=400, detail="OTP not found. Please log in again.")
    from datetime import datetime as _dt, timezone as _tz
    if _dt.now(_tz.utc) > _dt.fromisoformat(rec["expires_at"]):
        raise HTTPException(status_code=400, detail="OTP has expired. Please log in again.")
    if not bcrypt.checkpw(otp.encode(), rec["otp_hash"].encode()):
        raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")
    await db.login_otp_verifications.delete_one({"email": email})
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    access_token = create_access_token({"user_id": user["id"], "email": user["email"]})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user["id"], "email": user["email"], "name": user["name"], "family_group_id": user.get("family_group_id")},
    )

@api_router.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, input: ForgotPasswordRequest):
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not user:
        return {"message": "If that email is registered, a reset link has been sent."}

    reset_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.password_reset_tokens.replace_one(
        {"email": user["email"]},
        {"token": reset_token, "user_id": user["id"], "email": user["email"],
         "expires_at": expires_at.isoformat(), "used": False},
        upsert=True,
    )
    asyncio.create_task(_send_password_reset_email(user["email"], user.get("name", ""), reset_token))
    return {"message": "If that email is registered, a reset link has been sent."}


@api_router.post("/auth/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, input: ResetPasswordRequest):
    record = await db.password_reset_tokens.find_one({"token": input.token, "used": False})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    expires_at = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset token has expired")

    new_hash = bcrypt.hashpw(input.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    await db.users.update_one({"id": record["user_id"]}, {"$set": {"password_hash": new_hash}})
    await db.password_reset_tokens.update_one({"token": input.token}, {"$set": {"used": True}})

    return {"message": "Password reset successfully"}


@api_router.post("/auth/change-password")
async def change_password(body: dict, current_user: dict = Depends(get_current_user)):
    current_pw = body.get("current_password", "")
    new_pw = body.get("new_password", "")
    if not current_user.get("password_hash"):
        raise HTTPException(status_code=400, detail="Cannot change password for Google-authenticated accounts")
    if not bcrypt.checkpw(current_pw.encode(), current_user["password_hash"].encode()):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    new_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"password_hash": new_hash}})
    return {"message": "Password changed successfully"}


@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    onboarding_complete = current_user.get('onboarding_complete', False)
    # Auto-complete onboarding for any existing user who already has data OR
    # whose account is older than 24h (they've seen the app before — don't re-show onboarding)
    if not onboarding_complete:
        uid = current_user['id']
        has_data = False
        for coll in ['transactions', 'income', 'emis', 'goals', 'investments', 'hand_loans', 'budget_categories']:
            n = await db[coll].count_documents({"user_id": uid}, hint="_id_")
            if n > 0:
                has_data = True
                break
        if not has_data and current_user.get('created_at'):
            try:
                from datetime import timedelta as _td
                _created = datetime.fromisoformat(current_user['created_at'].replace('Z', '+00:00'))
                if datetime.now(timezone.utc) - _created > _td(hours=24):
                    has_data = True
            except Exception:
                pass
        if has_data:
            onboarding_complete = True
            await db.users.update_one({"id": uid}, {"$set": {"onboarding_complete": True}})
    return {
        "id": current_user['id'],
        "email": current_user['email'],
        "name": current_user['name'],
        "phone": current_user.get('phone', ''),
        "family_group_id": current_user.get('family_group_id'),
        "streak": current_user.get('streak', 0),
        "last_activity_date": current_user.get('last_activity_date', ''),
        "is_pro": current_user.get('is_pro', False),
        "profile_locked": current_user.get('profile_locked', False),
        "pdf_password": current_user.get('pdf_password', ''),
        "avatar_url": current_user.get('avatar_url', ''),
        "dob": current_user.get('dob', ''),
        "onboarding_complete": onboarding_complete,
    }


@api_router.post("/auth/onboarding-complete")
async def complete_onboarding(body: dict, current_user: dict = Depends(get_current_user)):
    """Mark onboarding done and optionally seed first income entry."""
    user_id = str(current_user["id"])
    monthly_income = body.get("monthly_income")
    updates: dict = {"onboarding_complete": True}
    await db.users.update_one({"id": user_id}, {"$set": updates})
    # Seed first income entry if provided
    if monthly_income and float(monthly_income) > 0:
        income_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "source": "Primary Income",
            "amount": float(monthly_income),
            "frequency": "monthly",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "notes": "Added during onboarding",
        }
        await db.income_entries.insert_one(income_doc)
        invalidate_user_cache(user_id)
    return {"ok": True}

@api_router.put("/auth/profile")
async def update_profile(body: dict, current_user: dict = Depends(get_current_user)):
    if current_user.get("profile_locked"):
        raise HTTPException(status_code=423, detail="Profile is locked. Unlock it first to make changes.")
    _ALLOWED = {'name', 'phone', 'dob', 'avatar_url', 'email'}
    updates = {}
    if 'name' in body and body.get('name', '').strip():
        updates['name'] = body['name'].strip()
    if 'email' in body and body.get('email', '').strip():
        import re as _re
        new_email = body['email'].strip().lower()
        if not _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', new_email):
            raise HTTPException(status_code=400, detail="Invalid email address")
        existing = await db.users.find_one({"email": new_email, "id": {"$ne": current_user['id']}})
        if existing:
            raise HTTPException(status_code=409, detail="Email is already in use by another account")
        updates['email'] = new_email
    for field in _ALLOWED - {'name', 'email'}:
        if field in body:
            val = body[field]
            # Never overwrite an existing value with an empty string
            if isinstance(val, str) and not val.strip():
                continue
            if field == 'phone' and isinstance(val, str):
                # Normalise to 10-digit Indian number so WhatsApp lookup always matches
                p = str(val).strip().replace(" ", "").replace("-", "")
                if p.startswith("+91") and len(p) == 13:
                    p = p[3:]
                elif p.startswith("91") and len(p) == 12:
                    p = p[2:]
                if p:  # only save if non-empty after normalisation
                    updates[field] = p
            else:
                updates[field] = str(val).strip() if isinstance(val, str) else val
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"id": current_user['id']}, {"$set": updates})
    updated = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    return {k: updated.get(k) for k in ['id', 'email', 'name', 'phone', 'streak', 'is_pro',
        'dob', 'gender', 'city', 'state', 'pincode', 'occupation', 'annual_income',
        'pan_number', 'emergency_contact_name', 'emergency_contact_phone', 'avatar_url']}

@api_router.post("/auth/toggle-profile-lock")
async def toggle_profile_lock(current_user: dict = Depends(get_current_user)):
    """Toggle profile editing lock."""
    new_val = not current_user.get("profile_locked", False)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"profile_locked": new_val}})
    return {"profile_locked": new_val}

@api_router.post("/auth/generate-pdf-password")
async def generate_pdf_password(current_user: dict = Depends(get_current_user)):
    """Generate (or regenerate) a random PDF export PIN for this user."""
    import random, string
    pin = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"pdf_password": pin}})
    return {"pdf_password": pin}

@api_router.post("/auth/toggle-pro")
async def toggle_pro(current_user: dict = Depends(get_current_user)):
    """Dev/test endpoint — flips is_pro on the current user."""
    new_val = not current_user.get("is_pro", False)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"is_pro": new_val}})
    updated = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return {
        "id": updated["id"], "email": updated["email"], "name": updated["name"],
        "phone": updated.get("phone", ""), "streak": updated.get("streak", 0),
        "is_pro": updated.get("is_pro", False),
        "last_activity_date": updated.get("last_activity_date", ""),
    }


@api_router.delete("/auth/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    """Permanently delete all user data and the account itself."""
    uid = current_user["id"]
    fgid = current_user.get("family_group_id")
    # Remove the user from any family group first
    if fgid:
        await db.family_groups.update_one({"id": fgid}, {"$pull": {"members": uid}})
    # Delete all user-owned data collections
    for col in [
        "transactions", "budget_categories", "emis", "savings_goals",
        "investments", "gold_items", "silver_items", "hand_loans",
        "credit_cards", "trips", "group_expenses", "recurring_expenses",
        "subscriptions", "luxury_items", "children", "gifts",
        "financial_calendar_events", "when_to_buy_items",
        "paychecks", "income_entries", "nominees", "feedback",
        "notifications", "notification_preferences",
    ]:
        try:
            await db[col].delete_many({"user_id": uid})
        except Exception:
            pass
    await db.users.delete_one({"id": uid})
    return {"message": "Account permanently deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# Admin — one-off user wipe (protected by ADMIN_SECRET env var)
# ─────────────────────────────────────────────────────────────────────────────

class AdminDeleteRequest(BaseModel):
    email: str
    admin_secret: str

@api_router.post("/admin/delete-user")
async def admin_delete_user(body: AdminDeleteRequest):
    """Permanently wipe all data for a user by email. Requires ADMIN_SECRET."""
    if not ADMIN_SECRET or body.admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    user = await db.users.find_one({"email": body.email.strip().lower()})
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found with email {body.email}")
    uid = str(user["id"]) if "id" in user else str(user["_id"])
    # Remove from any family group
    fgid = user.get("family_group_id")
    if fgid:
        await db.family_groups.update_one({"id": fgid}, {"$pull": {"members": uid}})
    # Wipe all collections
    deleted_counts = {}
    for col in [
        "transactions", "budget_categories", "emis", "savings_goals",
        "investments", "gold_items", "silver_items", "hand_loans",
        "credit_cards", "trips", "group_expenses", "recurring_expenses",
        "subscriptions", "luxury_items", "children", "gifts",
        "financial_calendar_events", "when_to_buy_items",
        "paychecks", "income_entries", "nominees", "feedback",
        "notifications", "notification_preferences", "otp_verifications",
        "password_reset_tokens",
    ]:
        try:
            r = await db[col].delete_many({"user_id": uid})
            if r.deleted_count:
                deleted_counts[col] = r.deleted_count
        except Exception:
            pass
    await db.users.delete_one({"_id": user["_id"]})
    return {
        "message": f"User {body.email} permanently deleted",
        "collections_wiped": deleted_counts,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Admin — send welcome/branding email to all users who haven't received it
# ─────────────────────────────────────────────────────────────────────────────

class AdminWelcomeEmailRequest(BaseModel):
    admin_secret: str
    dry_run: bool = False   # if True, returns list without sending

@api_router.post("/admin/send-welcome-emails")
async def admin_send_welcome_emails(body: AdminWelcomeEmailRequest):
    """Send the branded welcome email to every user who hasn't received it yet."""
    if not ADMIN_SECRET or body.admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")

    # Find all users missing the flag (existing users never got it)
    cursor = db.users.find({"welcome_email_sent": {"$ne": True}})
    users  = await cursor.to_list(10000)

    if body.dry_run:
        return {
            "dry_run": True,
            "pending_count": len(users),
            "emails": [u.get("email") for u in users],
        }

    sent, failed = 0, 0
    for u in users:
        email = u.get("email", "")
        name  = u.get("name", "there")
        if not email:
            failed += 1
            continue
        try:
            ok = await _send_onboarding_email(email, name)
            if ok:
                await db.users.update_one(
                    {"_id": u["_id"]},
                    {"$set": {"welcome_email_sent": True}}
                )
                sent += 1
            else:
                failed += 1
        except Exception as exc:
            logger.error(f"[admin-welcome-email] {email}: {exc}")
            failed += 1
        await asyncio.sleep(0.3)   # gentle rate-limit

    return {"sent": sent, "failed": failed, "total": len(users)}


# ─────────────────────────────────────────────────────────────────────────────
# Admin — send any email type to a specific user
# ─────────────────────────────────────────────────────────────────────────────

class AdminSendEmailRequest(BaseModel):
    admin_secret: str
    email: str                          # recipient email address
    email_type: str                     # welcome | emi_reminder | goal_milestone | budget_alert | weekly_digest
    # optional params per type
    name: str = "there"
    emi_name: str = ""
    amount: float = 0.0
    due_days: int = 3
    goal_name: str = ""
    pct: float = 0.0
    saved: float = 0.0
    target: float = 0.0
    category: str = ""
    budget: float = 0.0
    spent: float = 0.0
    income: float = 0.0
    top_cat: str = ""
    top_cat_amt: float = 0.0
    txn_count: int = 0


@api_router.post("/admin/send-email-to-user")
async def admin_send_email_to_user(body: AdminSendEmailRequest):
    """Send any email type to a specific address. Useful for testing and manual triggers."""
    if not ADMIN_SECRET or body.admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")

    email_type = body.email_type.lower().strip()
    ok = False

    if email_type == "welcome":
        ok = await _email_welcome(body.email, body.name)
    elif email_type == "emi_reminder":
        ok = await _email_emi_reminder(body.email, body.name, body.emi_name, body.amount, body.due_days)
    elif email_type == "goal_milestone":
        ok = await _email_goal_milestone(body.email, body.name, body.goal_name, body.pct, body.saved, body.target)
    elif email_type == "budget_alert":
        ok = await _email_budget_alert(body.email, body.name, body.category, body.spent, body.budget, body.pct)
    elif email_type == "weekly_digest":
        ok = await _email_weekly_digest(body.email, body.name, body.spent, body.income, body.top_cat, body.top_cat_amt, body.txn_count)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown email_type '{email_type}'. Valid: welcome, emi_reminder, goal_milestone, budget_alert, weekly_digest")

    return {"sent": ok, "email": body.email, "email_type": email_type}


# ─────────────────────────────────────────────────────────────────────────────
# Nominees  (verified via WhatsApp OTP)
# ─────────────────────────────────────────────────────────────────────────────
import random
import string

def _gen_otp(n=6):
    return ''.join(random.choices(string.digits, k=n))

@api_router.get("/nominees")
async def list_nominees(current_user: dict = Depends(get_current_user)):
    docs = await db.nominees.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(20)
    # Mask sensitive info for display
    for d in docs:
        d.pop("otp", None)
        d.pop("otp_expires", None)
    return docs

@api_router.post("/nominees", status_code=201)
async def add_nominee(body: dict, current_user: dict = Depends(get_current_user)):
    name = body.get("name", "").strip()
    phone = body.get("phone", "").strip()
    relationship = body.get("relationship", "").strip()
    if not name or not phone:
        raise HTTPException(status_code=400, detail="name and phone are required")
    existing = await db.nominees.find_one({"user_id": current_user["id"], "phone": phone})
    if existing:
        raise HTTPException(status_code=400, detail="A nominee with this phone already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": name,
        "phone": phone,
        "relationship": relationship,
        "verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.nominees.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.post("/nominees/{nominee_id}/send-otp")
async def send_nominee_otp(nominee_id: str, current_user: dict = Depends(get_current_user)):
    """Generate OTP and embed it in a TwiML-compatible response (nominee must initiate via WhatsApp)."""
    nominee = await db.nominees.find_one({"id": nominee_id, "user_id": current_user["id"]})
    if not nominee:
        raise HTTPException(status_code=404, detail="Nominee not found")
    otp = _gen_otp()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    await db.nominees.update_one({"id": nominee_id}, {"$set": {"otp": otp, "otp_expires": expires}})
    # Return OTP to the owner — they can share it OR it is auto-sent if Twilio is configured
    owner_name = current_user.get("name", "User")
    return {"otp_sent": True, "otp": otp, "message": f"Share this 6-digit OTP with {nominee['name']} to verify them via WhatsApp."}

@api_router.post("/nominees/{nominee_id}/verify-otp")
async def verify_nominee_otp(nominee_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    otp_input = body.get("otp", "").strip()
    nominee = await db.nominees.find_one({"id": nominee_id, "user_id": current_user["id"]})
    if not nominee:
        raise HTTPException(status_code=404, detail="Nominee not found")
    if not nominee.get("otp"):
        raise HTTPException(status_code=400, detail="No OTP sent yet. Send OTP first.")
    expires = datetime.fromisoformat(nominee["otp_expires"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")
    if nominee["otp"] != otp_input:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    await db.nominees.update_one({"id": nominee_id}, {"$set": {"verified": True}, "$unset": {"otp": "", "otp_expires": ""}})
    return {"verified": True}

@api_router.delete("/nominees/{nominee_id}", status_code=204)
async def delete_nominee(nominee_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.nominees.delete_one({"id": nominee_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nominee not found")
    invalidate_user_cache(current_user["id"])

# Nominee login — nominee enters owner's email + their own phone, gets OTP via WhatsApp
@api_router.post("/auth/nominee-login/request")
async def nominee_login_request(body: dict):
    """Step 1: Nominee enters owner email + their phone. OTP is generated."""
    owner_email = body.get("owner_email", "").strip().lower()
    nominee_phone = body.get("phone", "").strip()
    if not owner_email or not nominee_phone:
        raise HTTPException(status_code=400, detail="owner_email and phone are required")
    owner = await db.users.find_one({"email": owner_email}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="No account found with that email")
    nominee = await db.nominees.find_one({"user_id": owner["id"], "phone": nominee_phone, "verified": True})
    if not nominee:
        raise HTTPException(status_code=403, detail="You are not an authorised nominee for this account")
    otp = _gen_otp()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    await db.nominees.update_one({"id": nominee["id"]}, {"$set": {"login_otp": otp, "login_otp_expires": expires}})
    # In production, send via WhatsApp/Twilio. For now, return OTP (demo mode)
    return {"message": f"OTP generated for {nominee['name']}. In production this is sent via WhatsApp.", "otp": otp}

@api_router.post("/auth/nominee-login/verify")
async def nominee_login_verify(body: dict):
    """Step 2: Nominee submits OTP. Returns a limited read-only JWT."""
    owner_email = body.get("owner_email", "").strip().lower()
    nominee_phone = body.get("phone", "").strip()
    otp_input = body.get("otp", "").strip()
    owner = await db.users.find_one({"email": owner_email}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Account not found")
    nominee = await db.nominees.find_one({"user_id": owner["id"], "phone": nominee_phone, "verified": True})
    if not nominee:
        raise HTTPException(status_code=403, detail="Not an authorised nominee")
    if not nominee.get("login_otp"):
        raise HTTPException(status_code=400, detail="No OTP requested")
    expires = datetime.fromisoformat(nominee["login_otp_expires"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="OTP expired")
    if nominee["login_otp"] != otp_input:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    await db.nominees.update_one({"id": nominee["id"]}, {"$unset": {"login_otp": "", "login_otp_expires": ""}})
    # Issue a read-only token scoped to owner's user_id
    token_data = {"user_id": owner["id"], "nominee_id": nominee["id"], "nominee_name": nominee["name"], "read_only": True}
    access_token = create_access_token(token_data)
    return {"access_token": access_token, "token_type": "bearer", "nominee_name": nominee["name"], "owner_name": owner.get("name")}


async def update_streak(user_id: str):
    """Call after any user data-write action to maintain activity streak."""
    ist = pytz.timezone("Asia/Kolkata")
    today = datetime.now(ist).strftime('%Y-%m-%d')
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "streak": 1, "last_activity_date": 1})
    last = user.get('last_activity_date', '')
    streak = user.get('streak', 0)
    if last == today:
        return  # already counted today
    yesterday = (datetime.now(ist) - timedelta(days=1)).strftime('%Y-%m-%d')
    new_streak = streak + 1 if last == yesterday else 1
    await db.users.update_one({"id": user_id}, {"$set": {"streak": new_streak, "last_activity_date": today}})

@api_router.post("/auth/phone", response_model=Token)
@limiter.limit("10/minute")
async def phone_login(request: Request, body: dict):
    try:
        firebase_project_id = os.environ.get("FIREBASE_PROJECT_ID", "budgetmantra-a522a")
        idinfo = google_id_token.verify_firebase_token(
            body.get("id_token"),
            google_requests.Request(),
            audience=firebase_project_id
        )
        phone = idinfo.get("phone_number")
        if not phone:
            raise HTTPException(status_code=400, detail="No phone number found in token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")

    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        placeholder_email = f"{phone.replace('+', '')}@phone.budgetmantra.local"
        new_user = User(email=placeholder_email, name=phone, password_hash="__phone__")
        doc = new_user.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["auth_provider"] = "phone"
        doc["phone"] = phone
        await db.users.insert_one(doc)
        user = doc

    access_token = create_access_token({"user_id": user["id"], "email": user["email"]})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user["id"], "email": user["email"], "name": user.get("name", phone)}
    )

@api_router.post("/auth/google", response_model=Token)
@limiter.limit("10/minute")
async def google_login(request: Request, body: dict):
    try:
        google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
        idinfo = google_id_token.verify_oauth2_token(
            body.get("credential"),
            google_requests.Request(),
            google_client_id
        )
        email = idinfo["email"]
        name  = idinfo.get("name", email.split("@")[0])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        new_user = User(email=email, name=name, password_hash="__google__")
        doc = new_user.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["auth_provider"] = "google"
        await db.users.insert_one(doc)
        user = doc
        # Seed default categories for new Google-auth users too
        try:
            await _seed_default_categories(new_user.id)
        except Exception as seed_err:
            logger.warning(f"[GOOGLE-AUTH] category seed failed (non-fatal) email={email} err={seed_err}")

    access_token = create_access_token({"user_id": user["id"], "email": user["email"]})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user["id"], "email": user["email"], "name": user["name"]}
    )

@api_router.post("/auth/share-token")
async def generate_share_token(body: dict = {}, current_user: dict = Depends(get_current_user)):
    token = str(uuid.uuid4())
    sections = body.get("sections", ["budget", "emis"])
    await db.users.update_one({"id": current_user['id']}, {"$set": {"share_token": token, "share_sections": sections}})
    return {"token": token}

@api_router.get("/shared/{token}")
async def get_shared_dashboard(token: str):
    user = await db.users.find_one({"share_token": token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Invalid or expired share link")
    sections = user.get("share_sections", ["budget", "emis"])
    uid = user["id"]
    family_filter = {"family_group_id": user.get("family_group_id")} if user.get("family_group_id") else {"user_id": uid}

    result = {"name": user["name"].split()[0], "sections": sections}

    if "budget" in sections:
        cats = await db.budget_categories.find(family_filter, {"_id": 0}).to_list(1000)
        result.update({
            "total_income":   sum(c["allocated_amount"] for c in cats if c["type"] == "income"),
            "total_expenses": sum(c["allocated_amount"] for c in cats if c["type"] == "expense"),
            "total_spent":    sum(c.get("spent_amount", 0) for c in cats if c["type"] == "expense"),
            "categories":     [{"name": c["name"], "allocated": c["allocated_amount"], "spent": c.get("spent_amount", 0)} for c in cats if c["type"] == "expense"],
        })

    if "emis" in sections:
        emis = await db.emis.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(1000)
        result.update({
            "total_emi": sum(e["monthly_payment"] for e in emis),
            "emis": [{"name": e["loan_name"], "amount": e["monthly_payment"], "remaining_months": e.get("remaining_months", 0)} for e in emis],
        })

    if "investments" in sections:
        invs = await db.investments.find(family_filter, {"_id": 0}).to_list(1000)
        result.update({
            "total_invested":      sum(i.get("invested_amount", 0) for i in invs),
            "total_current_value": sum(i.get("current_value", 0) for i in invs),
            "investments": [{"name": i["name"], "type": i.get("type",""), "invested": i.get("invested_amount",0), "current": i.get("current_value",0)} for i in invs[:8]],
        })

    if "savings_goals" in sections:
        goals = await db.savings_goals.find(family_filter, {"_id": 0}).to_list(100)
        result["savings_goals"] = [{"name": g["name"], "target": g["target_amount"], "saved": g.get("current_amount", 0), "target_date": g.get("target_date", "")} for g in goals]

    return result

# Family Groups
@api_router.post("/family/create")
async def create_family_group(input: FamilyGroupCreate, current_user: dict = Depends(get_current_user)):
    group = FamilyGroup(name=input.name, created_by=current_user['id'], members=[current_user['id']])
    doc = group.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.family_groups.insert_one(doc)
    
    await db.users.update_one({"id": current_user['id']}, {"$set": {"family_group_id": group.id}})
    
    return {"message": "Family group created", "group_id": group.id}

@api_router.post("/family/invite")
async def invite_to_family(input: InviteToFamily, current_user: dict = Depends(get_current_user)):
    if not current_user.get('family_group_id'):
        raise HTTPException(status_code=400, detail="You must create a family group first")
    
    invited_user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not invited_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if invited_user.get('family_group_id'):
        raise HTTPException(status_code=400, detail="User already in a family group")
    
    await db.users.update_one({"id": invited_user['id']}, {"$set": {"family_group_id": current_user['family_group_id']}})
    await db.family_groups.update_one({"id": current_user['family_group_id']}, {"$push": {"members": invited_user['id']}})
    
    return {"message": f"{invited_user['name']} added to family group"}

@api_router.get("/family/members")
async def get_family_members(current_user: dict = Depends(get_current_user)):
    if not current_user.get('family_group_id'):
        return {"members": []}
    
    members = await db.users.find({"family_group_id": current_user['family_group_id']}, {"_id": 0, "password_hash": 0}).to_list(100)
    return {"members": members}

# SMS Parsing
@api_router.post("/sms/parse")
async def parse_sms(input: SMSParse, current_user: dict = Depends(get_current_user)):
    parsed = parse_sms_transaction(input.sms_text)
    return parsed


# ── UPI SMS Bulk Parser ────────────────────────────────────────────────────────

# VPA prefix → clean merchant name
_VPA_MERCHANT_MAP = {
    "zomato": "Zomato", "swiggy": "Swiggy", "amazon": "Amazon",
    "flipkart": "Flipkart", "myntra": "Myntra", "meesho": "Meesho",
    "ajio": "AJIO", "nykaa": "Nykaa", "blinkit": "Blinkit",
    "bigbasket": "BigBasket", "bb": "BigBasket", "grofers": "Grofers",
    "jiomart": "JioMart", "dmart": "D-Mart",
    "uber": "Uber", "ola": "Ola", "rapido": "Rapido",
    "irctc": "IRCTC", "redbus": "RedBus", "makemytrip": "MakeMyTrip",
    "goibibo": "Goibibo", "yatra": "Yatra",
    "netflix": "Netflix", "hotstar": "Hotstar", "primevideo": "Prime Video",
    "spotify": "Spotify", "youtube": "YouTube Premium",
    "jio": "Jio", "airtel": "Airtel", "vodafone": "Vodafone",
    "bsnl": "BSNL", "tata": "Tata", "bescom": "BESCOM",
    "adani": "Adani Electricity", "torrent": "Torrent Power",
    "lic": "LIC", "pli": "PLI",
    "paytm": "Paytm", "phonepe": "PhonePe", "gpay": "Google Pay",
    "cred": "CRED", "simpl": "Simpl", "slice": "Slice",
    "razorpay": "Razorpay", "billdesk": "BillDesk",
    "indigo": "IndiGo", "airindia": "Air India", "spicejet": "SpiceJet",
    "ola.electric": "Ola Electric", "tesla": "Tesla",
    "swiggyinstamart": "Swiggy Instamart",
    "zepto": "Zepto", "dunzo": "Dunzo",
    "bookmyshow": "BookMyShow", "pvr": "PVR", "inox": "INOX",
}

_CATEGORY_VPA_MAP = {
    "food":          {"zomato","swiggy","dominos","kfc","mcdonalds","subway","pizzahut",
                      "dunzo","swiggyinstamart","blinkit","zepto"},
    "groceries":     {"bigbasket","bb","grofers","jiomart","dmart","reliance",
                      "more.retail","spencers","nature"},
    "shopping":      {"amazon","flipkart","myntra","meesho","ajio","nykaa",
                      "snapdeal","tatacliq","jiomart","shopclues"},
    "transport":     {"uber","ola","rapido","meru","irctc","redbus",
                      "makemytrip","goibibo","yatra","indigo","airindia","spicejet",
                      "ola.electric","metro","bmtc","ksrtc"},
    "entertainment": {"netflix","hotstar","primevideo","spotify","youtube",
                      "bookmyshow","pvr","inox","zee5","sonyliv",
                      "apple","appstore","googleplay","microsoftstore"},
    "utilities":     {"jio","airtel","vodafone","bsnl","bescom","adani",
                      "torrent","mahadiscom","tatapower","aapdl","cesc"},
    "insurance":     {"lic","pli","policybazaar","star.health","religare"},
    "finance":       {"cred","simpl","slice","razorpay","billdesk"},
}

_UPI_APP_DETECT = [
    (r'gpay|google pay', "GPay"),
    (r'phonepe|phone pe', "PhonePe"),
    (r'paytm', "Paytm"),
    (r'bhim', "BHIM"),
    (r'cred', "CRED"),
    (r'amazonpay|amazon pay', "Amazon Pay"),
    (r'jiomoney|jio pay', "Jio Pay"),
    (r'airtel pay|airtelpay', "Airtel Pay"),
    (r'navi', "Navi"),
    (r'slice', "Slice"),
]


def _detect_upi_app(text_lower: str) -> str | None:
    for pattern, name in _UPI_APP_DETECT:
        if re.search(pattern, text_lower):
            return name
    return None


def _extract_vpa(text: str) -> str | None:
    """Extract UPI VPA like merchant@bank from SMS text."""
    m = re.search(r'([a-zA-Z0-9._\-]+@[a-zA-Z0-9.\-]+)', text)
    return m.group(1) if m else None


def _vpa_to_merchant(vpa: str) -> str:
    """Convert VPA like 'zomato@icici' to 'Zomato'."""
    prefix = vpa.split("@")[0].lower().replace(".", "").replace("-", "")
    # Try direct lookup first
    for key, val in _VPA_MERCHANT_MAP.items():
        if prefix.startswith(key.replace(".", "").replace("-", "")):
            return val
    # Fallback: capitalise the prefix
    return prefix.capitalize()


def _vpa_to_category(vpa: str) -> str:
    prefix = vpa.split("@")[0].lower()
    for cat, vpas in _CATEGORY_VPA_MAP.items():
        for v in vpas:
            if prefix.startswith(v):
                return cat
    return "other"


def parse_upi_sms(sms: str) -> dict | None:
    """
    Parse a single UPI/bank transaction SMS.
    Returns None if it doesn't look like a UPI transaction.
    """
    s = sms.strip()
    if not s:
        return None
    sl = s.lower()

    # Must contain UPI-related terms or classic debit keywords
    upi_signals = ["upi", "gpay", "phonepe", "paytm", "bhim", "neft", "imps",
                   "debited", "credited", "debit", "credit", "transfer"]
    if not any(sig in sl for sig in upi_signals):
        return None

    # ── Amount ────────────────────────────────────────────────────────────────
    amount = None
    for pat in [
        r'(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)',
        r'([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|₹)',
        r'(?:debited|credited)\s+(?:with\s+)?(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)',
    ]:
        m = re.search(pat, s, re.IGNORECASE)
        if m:
            try:
                v = float(m.group(1).replace(",", ""))
                if v > 0:
                    amount = v
                    break
            except ValueError:
                pass
    if not amount:
        return None

    # ── Transaction type ──────────────────────────────────────────────────────
    debit_words  = ["debited", "debit", "paid", "sent", "withdrawn", "spent", "deducted"]
    credit_words = ["credited", "credit", "received", "added", "refund", "cashback"]
    txn_type = "expense"
    if any(w in sl for w in credit_words) and not any(w in sl for w in debit_words):
        txn_type = "income"

    # ── VPA & merchant ────────────────────────────────────────────────────────
    vpa = _extract_vpa(s)
    # Filter out user's own VPA-style patterns (a/c numbers formatted as x@y)
    if vpa and re.match(r'^[xX0-9@]+$', vpa):
        vpa = None

    merchant = None
    if vpa:
        merchant = _vpa_to_merchant(vpa)

    # Fallback: "at MERCHANT", "to MERCHANT"
    if not merchant:
        m = re.search(r'\b(?:at|to)\s+([A-Z][A-Za-z0-9 &\-\.]+?)(?:\s+on|\s+for|\s*\.|\s*,|$)', s)
        if m:
            merchant = m.group(1).strip()

    if not merchant:
        merchant = "Unknown"

    # ── UPI Ref number ────────────────────────────────────────────────────────
    upi_ref = None
    m = re.search(r'(?:upi\s*ref(?:\.?\s*no\.?)?|ref(?:erence)?\s*(?:no\.?|number)?|txn\s*id)[:\s]*([0-9]{10,})', s, re.IGNORECASE)
    if m:
        upi_ref = m.group(1)

    # ── Date ──────────────────────────────────────────────────────────────────
    txn_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    date_patterns = [
        (r'(\d{2})[/-](\d{2})[/-](\d{4})',   "%d/%m/%Y"),  # DD/MM/YYYY
        (r'(\d{4})[/-](\d{2})[/-](\d{2})',   "%Y/%m/%d"),  # YYYY-MM-DD
        (r'(\d{2})[/-](\d{2})[/-](\d{2})',   "%d/%m/%y"),  # DD/MM/YY
        (r'(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})', None), # DD-Mon-YYYY
        (r'(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2})',  None), # DD-Mon-YY
    ]
    for pat, fmt in date_patterns:
        m = re.search(pat, s)
        if m:
            try:
                if fmt:
                    joined = "/".join(m.groups())
                    fmt2   = fmt.replace("/", "/")
                    txn_date = datetime.strptime(joined, fmt2).strftime('%Y-%m-%d')
                else:
                    raw = m.group(0).replace("-", " ").replace("/", " ")
                    for f in ("%d %b %Y", "%d %b %y"):
                        try:
                            txn_date = datetime.strptime(raw, f).strftime('%Y-%m-%d')
                            break
                        except ValueError:
                            pass
                break
            except ValueError:
                pass

    # ── Category ──────────────────────────────────────────────────────────────
    suggested_category = "other"
    if vpa:
        suggested_category = _vpa_to_category(vpa)
    if suggested_category == "other":
        # keyword fallback on full SMS
        kw_map = {
            "food":          ["zomato", "swiggy", "restaurant", "cafe", "pizza", "burger", "food"],
            "groceries":     ["bigbasket", "grofers", "grocery", "supermarket", "vegetables"],
            "transport":     ["uber", "ola", "rapido", "petrol", "diesel", "metro", "irctc"],
            "shopping":      ["amazon", "flipkart", "myntra", "mall", "shopping"],
            "entertainment": ["netflix", "hotstar", "movie", "cinema", "spotify"],
            "utilities":     ["electricity", "water", "gas", "recharge", "broadband", "wifi"],
        }
        for cat, kws in kw_map.items():
            if any(k in sl for k in kws):
                suggested_category = cat
                break

    upi_app = _detect_upi_app(sl)

    return {
        "amount":              amount,
        "type":                txn_type,
        "merchant":            merchant,
        "vpa":                 vpa,
        "upi_ref":             upi_ref,
        "upi_app":             upi_app,
        "date":                txn_date,
        "suggested_category":  suggested_category,
        "raw_sms":             s[:200],  # truncated for display
    }


def split_sms_messages(raw: str) -> list[str]:
    """Split a pasted block into individual SMS messages."""
    # Try double-newline split first (most common paste format)
    parts = re.split(r'\n{2,}', raw.strip())
    if len(parts) > 1:
        return [p.strip() for p in parts if p.strip()]
    # Single-newline: each line is one SMS
    return [line.strip() for line in raw.splitlines() if line.strip()]


@api_router.post("/upi/parse-bulk")
async def upi_parse_bulk(body: dict, current_user: dict = Depends(get_current_user)):
    """
    Parse a bulk paste of UPI/bank transaction SMS messages.
    Returns list of parsed transactions with suggested categories.
    """
    raw_text = body.get("text", "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="No SMS text provided")

    messages = split_sms_messages(raw_text)
    if len(messages) > 500:
        raise HTTPException(status_code=400, detail="Too many messages — max 500 per batch")

    results = []
    skipped = 0
    for i, sms in enumerate(messages):
        parsed = parse_upi_sms(sms)
        if parsed:
            parsed["id"] = f"upi_{i}_{uuid.uuid4().hex[:6]}"
            results.append(parsed)
        else:
            skipped += 1

    return {
        "transactions": results,
        "total":        len(messages),
        "parsed":       len(results),
        "skipped":      skipped,
    }


async def _do_upi_import_async(job_id: str, uid: str, items: list) -> None:
    """Background task: bulk-insert UPI transactions and update job status."""
    imported = 0
    duplicates = 0
    errors = []
    try:
        # ── 1. Collect existing UPI refs from DB to skip true duplicates ──────
        all_input_refs = [item.get("upi_ref") for item in items if item.get("upi_ref")]
        existing_refs: set[str] = set()
        CHUNK = 500
        for i in range(0, len(all_input_refs), CHUNK):
            batch_refs = all_input_refs[i:i + CHUNK]
            cursor = db.transactions.find(
                {"user_id": uid, "upi_ref": {"$in": batch_refs}},
                {"upi_ref": 1, "_id": 0},
            )
            async for doc in cursor:
                existing_refs.add(doc["upi_ref"])

        # ── 2. Build docs, skipping only true UPI-ref duplicates ─────────────
        now_str = datetime.now(timezone.utc).isoformat()
        today   = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        docs_to_insert: list[dict] = []
        category_spend: dict[str, float] = {}   # category_id → total amount

        for item in items:
            try:
                upi_ref = item.get("upi_ref")
                # Only skip if the exact UPI ref already exists — same person paid
                # multiple times with DIFFERENT refs is NOT a duplicate
                if upi_ref and upi_ref in existing_refs:
                    duplicates += 1
                    continue

                amount = float(item.get("amount", 0))
                cat_id = item.get("category_id")
                txn_type = item.get("type", "expense")

                doc = {
                    "id":          str(uuid.uuid4()),
                    "user_id":     uid,
                    "amount":      amount,
                    "type":        txn_type,
                    "description": item.get("merchant") or item.get("description") or "UPI Transaction",
                    "category_id": cat_id,
                    "date":        item.get("date") or today,
                    "source":      "upi_sms",
                    "upi_ref":     upi_ref,
                    "upi_app":     item.get("upi_app"),
                    "vpa":         item.get("vpa"),
                    "created_at":  now_str,
                }
                docs_to_insert.append(doc)

                if txn_type == "expense" and cat_id:
                    category_spend[cat_id] = category_spend.get(cat_id, 0.0) + amount

                imported += 1
            except Exception as e:
                errors.append(str(e))

        # ── 3. Batch insert in chunks of 500 ─────────────────────────────────
        for i in range(0, len(docs_to_insert), CHUNK):
            batch = docs_to_insert[i:i + CHUNK]
            if batch:
                try:
                    await db.transactions.insert_many(batch, ordered=False)
                except Exception as e:
                    errors.append(f"batch insert error: {str(e)}")

        # ── 4. Update budget category spent amounts in one pass per category ──
        for cat_id, total_spent in category_spend.items():
            try:
                await db.budget_categories.update_one(
                    {"id": cat_id},
                    {"$inc": {"spent_amount": total_spent}},
                )
            except Exception as e:
                errors.append(f"category update error: {str(e)}")

        invalidate_user_cache(uid)
        await update_streak(uid)

        # Store a Chanakya notification so the user sees it when they open chat
        await db.notifications.insert_one({
            "id":         str(uuid.uuid4()),
            "user_id":    uid,
            "type":       "import_done",
            "message":    f"Your statement import is complete! {imported} transaction{'s' if imported != 1 else ''} added{', ' + str(duplicates) + ' duplicates skipped' if duplicates else ''}.",
            "imported":   imported,
            "duplicates": duplicates,
            "read":       False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        _import_jobs[job_id] = {
            "status": "done",
            "imported": imported,
            "duplicates": duplicates,
            "errors": errors[:10],
        }
    except Exception as e:
        logger.error(f"[import job {job_id}] {e}")
        _import_jobs[job_id] = {
            "status": "error",
            "error": str(e),
            "imported": imported,
            "duplicates": duplicates,
            "errors": errors[:10],
        }


@api_router.post("/upi/import")
async def upi_import_transactions(body: dict, current_user: dict = Depends(get_current_user)):
    """
    Kick off an async bulk-import job. Returns job_id immediately — poll
    GET /upi/import/status/{job_id} to track progress.
    """
    uid = current_user["id"]
    items = body.get("transactions", [])
    if not items:
        raise HTTPException(status_code=400, detail="No transactions provided")

    job_id = str(uuid.uuid4())
    _import_jobs[job_id] = {"status": "processing", "imported": 0, "duplicates": 0, "errors": []}
    asyncio.ensure_future(_do_upi_import_async(job_id, uid, items))
    return {"job_id": job_id, "status": "processing", "total": len(items)}


@api_router.get("/upi/import/status/{job_id}")
async def upi_import_status(job_id: str, current_user: dict = Depends(get_current_user)):
    """Poll import job status."""
    job = _import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── UPI PDF Parser ─────────────────────────────────────────────────────────────

try:
    import pdfplumber as _pdfplumber
    _PDF_AVAILABLE = True
except ImportError:
    _pdfplumber = None
    _PDF_AVAILABLE = False


def _infer_pdf_category(description: str) -> str:
    """
    Infer a suggested_category string from a parsed PDF transaction description.
    Uses the MERCHANT_MAP from intent_engine for 200+ merchant lookups,
    then falls back to subscription and general keyword detection.
    """
    try:
        from intent_engine import MERCHANT_MAP
        desc_lower = description.lower()

        # Subscription-first detection (common PDF charges like "APPLE.COM/BILL")
        _SUBSCRIPTION_PATTERNS = [
            ("apple media", "Entertainment"), ("apple.com", "Entertainment"),
            ("apple music", "Entertainment"), ("apple tv", "Entertainment"),
            ("apple one", "Entertainment"), ("icloud", "Bills & Utilities"),
            ("itunes", "Entertainment"), ("apl*", "Entertainment"),
            ("google one", "Bills & Utilities"), ("google play", "Entertainment"),
            ("google *", "Bills & Utilities"), ("youtube premium", "Entertainment"),
            ("youtube music", "Entertainment"),
            ("microsoft", "Bills & Utilities"), ("msft *", "Bills & Utilities"),
            ("adobe", "Bills & Utilities"),
            ("netflix", "Entertainment"), ("spotify", "Entertainment"),
            ("hotstar", "Entertainment"), ("prime video", "Entertainment"),
            ("zee5", "Entertainment"), ("sonylivsub", "Entertainment"),
            ("jiocinema", "Entertainment"), ("jiosaavn", "Entertainment"),
            ("notion", "Bills & Utilities"), ("slack", "Bills & Utilities"),
            ("zoom", "Bills & Utilities"), ("openai", "Bills & Utilities"),
            ("chatgpt", "Bills & Utilities"), ("dropbox", "Bills & Utilities"),
            ("canva", "Bills & Utilities"), ("github", "Bills & Utilities"),
            ("figma", "Bills & Utilities"), ("1password", "Bills & Utilities"),
            ("nordvpn", "Bills & Utilities"), ("linkedin", "Bills & Utilities"),
            ("duolingo", "Entertainment"), ("subscription", "Bills & Utilities"),
        ]
        for keyword, cat in _SUBSCRIPTION_PATTERNS:
            if keyword in desc_lower:
                return cat

        # Full MERCHANT_MAP lookup (longest match wins)
        best_match_len = 0
        best_cat = "other"
        for merchant, category in MERCHANT_MAP.items():
            if merchant in desc_lower and len(merchant) > best_match_len:
                best_match_len = len(merchant)
                best_cat = category
        return best_cat
    except Exception:
        return "other"


def _parse_pdf_text(text: str) -> list[dict]:
    """
    Parse raw text extracted from a UPI statement PDF.
    Looks for PhonePe / GPay / Paytm / generic bank statement patterns.
    Returns a list of transaction dicts.
    """
    results = []

    # Normalize currency symbols — some PDF parsers output $ where the PDF has ₹
    text = text.replace('$', '₹')

    # Split into lines and process
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    # Patterns for amount with optional ₹/Rs prefix or suffix
    _AMOUNT_PAT = re.compile(
        r'(?:₹|Rs\.?|INR)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)'
        r'|\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)\b',
        re.IGNORECASE,
    )

    # Date patterns: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Mon YYYY
    _DATE_PATS = [
        (re.compile(r'\b(\d{2})[/-](\d{2})[/-](\d{4})\b'), "dmy4"),
        (re.compile(r'\b(\d{4})[/-](\d{2})[/-](\d{2})\b'), "ymd4"),
        (re.compile(r'\b(\d{2})[/-](\d{2})[/-](\d{2})\b'), "dmy2"),
        (re.compile(r'\b(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})\b'), "dmy_mon4"),
        (re.compile(r'\b(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2})\b'),  "dmy_mon2"),
    ]

    debit_kws  = ["paid to", "sent to", "debited", "debit", "paid", "withdrawn",
                  "payment to", "transfer to", "dr"]
    credit_kws = ["received from", "credited", "credit", "refund", "cashback",
                  "money received", "cr"]

    def _extract_date(s: str) -> str:
        for pat, fmt in _DATE_PATS:
            m = pat.search(s)
            if m:
                try:
                    g = m.groups()
                    if fmt == "dmy4":
                        return datetime.strptime(f"{g[0]}/{g[1]}/{g[2]}", "%d/%m/%Y").strftime("%Y-%m-%d")
                    elif fmt == "ymd4":
                        return datetime.strptime(f"{g[0]}/{g[1]}/{g[2]}", "%Y/%m/%d").strftime("%Y-%m-%d")
                    elif fmt == "dmy2":
                        return datetime.strptime(f"{g[0]}/{g[1]}/{g[2]}", "%d/%m/%y").strftime("%Y-%m-%d")
                    elif fmt in ("dmy_mon4", "dmy_mon2"):
                        raw = m.group(0).replace("-", " ").replace("/", " ")
                        for f in ("%d %b %Y", "%d %b %y"):
                            try:
                                return datetime.strptime(raw, f).strftime("%Y-%m-%d")
                            except ValueError:
                                pass
                except ValueError:
                    pass
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _extract_amount(s: str) -> float | None:
        for m in _AMOUNT_PAT.finditer(s):
            val_str = m.group(1) or m.group(2)
            if val_str:
                try:
                    v = float(val_str.replace(",", ""))
                    if v > 0:
                        return v
                except ValueError:
                    pass
        return None

    def _extract_upi_ref(s: str) -> str | None:
        m = re.search(
            r'(?:upi\s*ref(?:\.?\s*no\.?)?|ref(?:erence)?\s*(?:no\.?|number)?|txn\s*(?:id|no\.?)|transaction\s*id)[:\s#]*([0-9]{8,})',
            s, re.IGNORECASE,
        )
        return m.group(1) if m else None

    def _infer_type(s: str) -> str:
        sl = s.lower()
        has_credit = any(k in sl for k in credit_kws)
        has_debit  = any(k in sl for k in debit_kws)
        if has_credit and not has_debit:
            return "credit"
        return "debit"

    def _infer_description(s: str) -> str:
        sl = s.lower()
        # PhonePe / GPay explicit patterns
        for pat in [
            r'(?:paid to|payment to|sent to)\s+([^\n,;|]+?)(?:\s+on|\s+for|\s*\||\s*$)',
            r'(?:received from)\s+([^\n,;|]+?)(?:\s+on|\s*\||\s*$)',
        ]:
            m = re.search(pat, s, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        # Generic: grab text after "to" or "from" up to date/amount/pipe
        m = re.search(r'\b(?:to|from)\s+([A-Za-z0-9 &\-\.]{3,40?})', s, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        # Fall back to first meaningful token (non-numeric)
        tokens = [t for t in re.split(r'[\s|,;]+', s) if re.search(r'[A-Za-z]', t)]
        return tokens[0] if tokens else "UPI Transaction"

    seen_refs: set[str] = set()

    for i, line in enumerate(lines):
        amount = _extract_amount(line)
        if not amount:
            continue
        # Skip tiny noise values (< ₹1)
        if amount < 1:
            continue
        # Try to merge with neighbouring lines for context (±1 line window)
        context_lines = lines[max(0, i - 1): i + 2]
        context = " | ".join(context_lines)

        upi_ref   = _extract_upi_ref(context)
        # Deduplicate by UPI ref within this PDF
        if upi_ref and upi_ref in seen_refs:
            continue
        if upi_ref:
            seen_refs.add(upi_ref)

        _desc = _infer_description(context)
        results.append({
            "date":               _extract_date(context),
            "amount":             amount,
            "description":        _desc,
            "merchant":           _desc,
            "type":               _infer_type(context),
            "upi_ref":            upi_ref,
            "suggested_category": _infer_pdf_category(_desc),
        })

    return results


def _parse_pdf_tables(tables: list) -> list[dict]:
    """
    Parse pdfplumber table rows into transaction dicts.
    Handles PhonePe / GPay / bank statement table layouts:
    common column orders: Date | Description | Debit | Credit | Balance
                          Date | Narration | Ref | Debit | Credit | Balance
    """
    import re as _re2
    results = []
    _AMOUNT_RE = re.compile(r'([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)')

    def _clean(v):
        return (v or "").strip()

    def _to_float(s):
        s = _clean(s).replace(",", "").replace("₹", "").replace("Rs", "").strip()
        try:
            v = float(s)
            return v if v > 0 else None
        except Exception:
            return None

    def _to_date(s):
        s = _clean(s)
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y",
                    "%d %b %Y", "%d %b %y", "%b %d, %Y", "%d/%m/%Y %H:%M",
                    "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M:%S"):
            try:
                return datetime.strptime(s[:len(fmt)+2].strip(), fmt).strftime("%Y-%m-%d")
            except Exception:
                pass
        # Try extracting DD/MM/YYYY or DD-MM-YYYY substring
        m = _re2.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', s)
        if m:
            d, mo, y = m.groups()
            if len(y) == 2: y = "20" + y
            try:
                return datetime.strptime(f"{d}/{mo}/{y}", "%d/%m/%Y").strftime("%Y-%m-%d")
            except Exception:
                pass
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    debit_cols  = {"debit", "dr", "withdrawal", "paid", "amount (dr)", "debit amount", "amount debited", "withdraw"}
    credit_cols = {"credit", "cr", "deposit", "received", "amount (cr)", "credit amount", "amount credited"}
    date_cols   = {"date", "transaction date", "txn date", "value date", "posting date"}
    desc_cols   = {"description", "narration", "particulars", "transaction", "details",
                   "merchant", "remarks", "txn details", "transaction details"}

    for table in tables:
        if not table or len(table) < 2:
            continue
        header = [_clean(str(c)).lower() for c in (table[0] or [])]
        if not any(h for h in header):
            continue

        # Map column indices
        date_idx  = next((i for i, h in enumerate(header) if h in date_cols), None)
        desc_idx  = next((i for i, h in enumerate(header) if h in desc_cols), None)
        debit_idx = next((i for i, h in enumerate(header) if h in debit_cols), None)
        credit_idx= next((i for i, h in enumerate(header) if h in credit_cols), None)
        # Fallback: look for "amount" column
        amt_idx   = next((i for i, h in enumerate(header) if "amount" in h and debit_idx is None), None)

        if date_idx is None and debit_idx is None:
            continue  # doesn't look like a transaction table

        for row in table[1:]:
            if not row:
                continue
            cells = [_clean(str(c) if c is not None else "") for c in row]
            if len(cells) <= max(filter(lambda x: x is not None, [date_idx or 0, debit_idx or 0, credit_idx or 0, desc_idx or 0])):
                continue

            debit  = _to_float(cells[debit_idx])  if debit_idx  is not None and debit_idx  < len(cells) else None
            credit = _to_float(cells[credit_idx]) if credit_idx is not None and credit_idx < len(cells) else None
            amount_raw = _to_float(cells[amt_idx]) if amt_idx is not None and amt_idx < len(cells) else None

            amount = debit or credit or amount_raw
            if not amount or amount < 1:
                continue

            txn_type = "credit" if (credit and not debit) else "debit"
            date_str = _to_date(cells[date_idx]) if date_idx is not None and date_idx < len(cells) else datetime.now(timezone.utc).strftime("%Y-%m-%d")
            desc     = cells[desc_idx] if desc_idx is not None and desc_idx < len(cells) else " ".join(cells[:3])

            # UPI ref from any cell
            row_text = " ".join(cells)
            upi_ref_m = re.search(r'\b(\d{10,})\b', row_text)
            upi_ref   = upi_ref_m.group(1) if upi_ref_m else None

            _clean_desc = desc or "Transaction"
            results.append({
                "date":               date_str,
                "amount":             amount,
                "description":        _clean_desc,
                "merchant":           _clean_desc,
                "type":               txn_type,
                "upi_ref":            upi_ref,
                "suggested_category": _infer_pdf_category(_clean_desc),
            })

    return results


async def _run_pdf_parse_job(job_id: str, content: bytes, pdf_password: str) -> None:
    """Background task: parse PDF bytes and store result in _pdf_parse_jobs."""
    try:
        all_text_parts: list[str] = []
        all_tables: list = []
        try:
            with _pdfplumber.open(io.BytesIO(content), password=pdf_password) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        all_text_parts.append(text)
                    # Also extract structured tables
                    try:
                        tbls = page.extract_tables()
                        if tbls:
                            all_tables.extend(tbls)
                    except Exception:
                        pass
        except Exception as pdf_err:
            err_str = str(pdf_err).lower()
            is_pw_err = any(w in err_str for w in ["password", "encrypt", "incorrect", "crypt", "not decryptable"])
            # If no password was supplied and opening failed for any reason → ask for password
            if is_pw_err or not pdf_password.strip():
                _pdf_parse_jobs[job_id] = {"status": "error", "error": "password_required", "result": []}
                return
            _pdf_parse_jobs[job_id] = {"status": "done", "result": [], "error": None}
            return

        transactions: list[dict] = []

        # Strategy 1: parse tables first (better for tabular bank/UPI statements)
        if all_tables:
            transactions = _parse_pdf_tables(all_tables)

        # Strategy 2: fall back to text parsing if tables gave nothing
        if not transactions:
            full_text = "\n".join(all_text_parts)
            if full_text.strip():
                transactions = _parse_pdf_text(full_text)

        # Deduplicate by upi_ref
        seen: set[str] = set()
        deduped = []
        for txn in transactions:
            ref = txn.get("upi_ref")
            if ref:
                if ref in seen:
                    continue
                seen.add(ref)
            deduped.append(txn)

        for idx, txn in enumerate(deduped):
            txn["id"] = f"pdf_{idx}_{uuid.uuid4().hex[:6]}"

        _pdf_parse_jobs[job_id] = {"status": "done", "result": deduped, "error": None}
    except Exception as e:
        logger.error(f"[PDF parse job] {e}")
        _pdf_parse_jobs[job_id] = {"status": "done", "result": [], "error": None}


@api_router.post("/upi/parse-pdf")
async def parse_upi_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pdf_password: str = Form(""),
    current_user: dict = Depends(get_current_user),
):
    """
    Accept a PDF bank/UPI statement. Returns a job_id immediately.
    The actual parsing runs in the background. Poll GET /upi/parse-pdf/{job_id} for result.
    """
    if not _PDF_AVAILABLE:
        raise HTTPException(status_code=503, detail="PDF parsing is not available — pdfplumber is not installed.")

    if file.content_type and "pdf" not in file.content_type.lower():
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")

    # ── Detect encryption BEFORE starting background job ──
    # 1. Fast byte-level check
    _raw_encrypted = b'/Encrypt' in content or b'/encrypt' in content
    # 2. Fallback: try opening without password — pdfplumber may silently return empty pages
    if not _raw_encrypted and _PDF_AVAILABLE:
        try:
            import io as _io2
            with _pdfplumber.open(_io2.BytesIO(content)) as _chk:
                _first_text = _chk.pages[0].extract_text() if _chk.pages else "ok"
                if _first_text is None and len(_chk.pages) > 0:
                    _raw_encrypted = True
        except Exception as _chk_err:
            if any(w in str(_chk_err).lower() for w in ["password", "encrypt", "incorrect", "crypt"]):
                _raw_encrypted = True

    if _raw_encrypted and not pdf_password.strip():
        raise HTTPException(status_code=422, detail="password_required")

    job_id = str(uuid.uuid4())
    _pdf_parse_jobs[job_id] = {"status": "processing", "result": None, "error": None}
    background_tasks.add_task(_run_pdf_parse_job, job_id, content, pdf_password)
    return {"job_id": job_id, "status": "processing"}


async def _generate_trip_plan_async(
    trip_id: str, user_id: str, preferences: str,
    trip_name: str, destination: str,
    origin_city: str = "", adults: int = 1,
):
    """Background job: fetch real flight data + generate rich context-aware itinerary."""
    try:
        trip = await db.trips.find_one({"id": trip_id})
        start_date = (trip or {}).get("start_date", "")
        end_date   = (trip or {}).get("end_date", "")
        budget     = (trip or {}).get("budget")

        # ── 1. Fetch live flight prices ──────────────────────────────────────
        flights = []
        if origin_city and start_date:
            flights = await _skyscanner_search_flights(
                origin_city, destination,
                depart_date=start_date,
                return_date=end_date or None,
                adults=adults,
            )

        # Build flight context block for the prompt
        flight_ctx = ""
        if flights:
            lines = []
            for f in flights[:4]:
                dur = f"{f['duration_mins'] // 60}h {f['duration_mins'] % 60}m"
                stop_label = "Direct" if f["stops"] == 0 else f"{f['stops']} stop(s)"
                dep_time = f['departure'][11:16] if len(f['departure']) >= 16 else ""
                arr_time = f['arrival'][11:16]   if len(f['arrival'])   >= 16 else ""
                lines.append(
                    f"  • {f['airline']}: \u20b9{f['price_inr']:,} — {stop_label}, {dur}"
                    + (f" ({dep_time}\u2192{arr_time})" if dep_time else "")
                )
            flight_ctx = (
                f"\nLIVE FLIGHT PRICES from {origin_city} \u2192 {destination} on {start_date}"
                + (f" (return {end_date})" if end_date else "")
                + " [source: Skyscanner]:\n"
                + "\n".join(lines)
                + "\n"
            )
        elif origin_city:
            flight_ctx = f"\n(Flight data unavailable — no RAPIDAPI_KEY configured. Estimate \u20b94,000–\u20b912,000 based on route.)\n"

        # ── 2. Duration calculation ──────────────────────────────────────────
        duration_str = ""
        num_days = 3
        if start_date and end_date:
            from datetime import date as _d
            try:
                d1, d2 = _d.fromisoformat(start_date), _d.fromisoformat(end_date)
                num_days = max(1, (d2 - d1).days + 1)
                duration_str = f"{num_days} days ({start_date} to {end_date})"
            except Exception:
                pass
        elif start_date:
            duration_str = f"starting {start_date}"

        # ── 3. Generate rich itinerary via Claude ────────────────────────────
        client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        budget_str = ("₹{:,}".format(int(budget))) if budget else "not specified"
        origin_line = ("- Flying from: " + origin_city + "\n") if origin_city else ""

        # Use compact activity schema for long trips to stay within token limits
        if num_days > 5:
            _itinerary_schema = (
                '[{"day":1,"date":"YYYY-MM-DD","title":"Short title","theme":"theme",'
                '"activities":[{"time":"09:00","name":"place name","cost_inr":500,"tip":"one practical tip"}],'
                '"daily_cost_estimate":4500,"notes":"key tip for the day"}]'
            )
        else:
            _itinerary_schema = (
                '[{"day":1,"date":"YYYY-MM-DD","title":"Short title","theme":"theme",'
                '"activities":[{"time":"09:00","name":"Exact place","duration":"2 hours","cost_inr":1100,'
                '"type":"sightseeing|food|transport|accommodation|shopping","description":"what to do",'
                '"tip":"practical tip","rating":4.7,"open_days":"All days / Tue-Sun (closed Mon)","book_ahead":true}],'
                '"daily_cost_estimate":4500,"notes":"key tip for the day"}]'
            )

        prompt = f"""You are an expert travel planner with deep local knowledge. Create a REALISTIC, DETAILED, day-by-day itinerary for this trip.

TRIP DETAILS:
- Destination: {destination}
- Duration: {duration_str or 'flexible'}
- Travelers: {adults} person(s)
- Budget: {budget_str}
- Preferences: {preferences or 'sightseeing, local food, authentic experiences'}
{origin_line}{flight_ctx}
STRICT REQUIREMENTS — violations will make the itinerary useless:

1. OPENING HOURS & CLOSURES: Only recommend places on days they are actually open.
   - Most museums/monuments: closed on specific days (note which). E.g. Taj Mahal open all days except Friday.
   - Note public/national holidays that could affect access during {start_date or 'the travel period'}.
   - Seasonal considerations: is this monsoon season? Peak tourist season? Festival period?

2. REALISTIC COSTS: Provide actual INR costs per activity, not vague ranges.
   - Entry fees (Indian vs. foreign national pricing where relevant)
   - Meal costs (budget/mid-range/splurge options)
   - Local transport (metro, auto, cab estimates)

3. PRACTICAL TIMING: Don't overload days. Include travel time between locations.

4. LOCAL INTELLIGENCE: Flag tourist traps, best photo times, booking requirements, dress codes, areas to avoid.

5. RATINGS: Only recommend places with 4.0+ ratings. Include source (Google/TripAdvisor).

Return ONLY a valid JSON array — no markdown, no explanation, no code fences:
{_itinerary_schema}

Generate exactly {num_days} days."""

        result = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
        )

        itinerary_text = result.content[0].text.strip()
        logger.info(f"[TripPlanAsync] stop_reason={result.stop_reason} len={len(itinerary_text)}")

        # Clean code fences / leading text / trailing content
        import json as _j, re as _jr
        _cf = _jr.search(r'```(?:json)?\s*(\[[\s\S]+?\])\s*```', itinerary_text)
        if _cf:
            itinerary_text = _cf.group(1)
        else:
            idx = itinerary_text.find("[")
            end = itinerary_text.rfind("]")
            if idx >= 0 and end >= idx:
                itinerary_text = itinerary_text[idx:end + 1]

        # Repair truncated JSON (stop_reason == max_tokens closes mid-array)
        if result.stop_reason == "max_tokens":
            itinerary_text = itinerary_text.rstrip(",\n ")
            open_arrays  = itinerary_text.count("[") - itinerary_text.count("]")
            open_objects = itinerary_text.count("{") - itinerary_text.count("}")
            itinerary_text += ("}" * max(open_objects, 0)) + ("]" * max(open_arrays, 0))
            logger.warning(f"[TripPlanAsync] Truncated — attempted repair: added {max(open_objects,0)} braces, {max(open_arrays,0)} brackets")

        itinerary = _j.loads(itinerary_text.strip())

        # Compute cost estimate
        day_cost_total = sum(d.get("daily_cost_estimate", 0) for d in itinerary if isinstance(d, dict))
        cheapest_flight_cost = min((f["price_inr"] for f in flights), default=0)
        total_estimate = day_cost_total + (cheapest_flight_cost * adults if cheapest_flight_cost else 0)

        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {
                "itinerary":              itinerary,
                "itinerary_status":       "ready",
                "itinerary_generated_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                "flight_options":         flights,
                "origin_city":            origin_city,
                "estimated_total_cost":   total_estimate,
            }},
        )
        invalidate_user_cache(user_id)

        flight_note = ""
        if flights:
            cheapest = flights[0]
            flight_note = (
                f" Cheapest flight from {origin_city}: \u20b9{cheapest['price_inr']:,} "
                f"({cheapest['airline']}, {'direct' if cheapest['stops'] == 0 else str(cheapest['stops']) + ' stop'})."
            )

        await _insert_system_chat(
            user_id,
            f"✨ Your **{trip_name}** itinerary is ready!{flight_note} "
            f"Each day includes real costs, opening hours & local tips. [Open in Planner →](/trips)",
            notification_type="trip_itinerary_ready",
        )

    except Exception as e:
        import traceback
        _tb = traceback.format_exc()
        logger.error(f"[TripPlanAsync] {type(e).__name__}: {e}\n{_tb}")
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {
                "itinerary_status": "failed",
                "itinerary_error":  f"{type(e).__name__}: {str(e)[:300]}",
            }},
        )
        invalidate_user_cache(user_id)
        await _insert_system_chat(
            user_id,
            f"I had trouble generating the itinerary for **{trip_name}**. "
            f"Head to the Planner and tap 'Generate with Chanakya' to try again.",
            notification_type="trip_itinerary_error",
        )


@api_router.get("/upi/parse-pdf/{job_id}")
async def get_pdf_parse_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Poll for PDF parse job result."""
    job = _pdf_parse_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    # Surface password_required as a 422 for the frontend to handle
    if job["status"] == "error" and job.get("error") == "password_required":
        raise HTTPException(status_code=422, detail="password_required")
    return job


# ── UPI Bulk Import (PDF-reviewed transactions) ────────────────────────────────

class BulkImportItem(BaseModel):
    date: str
    amount: float
    description: str
    category_id: Optional[str] = None


@api_router.post("/upi/bulk-import")
async def bulk_import_transactions(
    items: List[BulkImportItem],
    current_user: dict = Depends(get_current_user),
):
    """
    Bulk-import user-confirmed PDF transactions into the transactions collection.
    Creates expense records; returns count of imported items.
    """
    uid = current_user["id"]

    if not items:
        raise HTTPException(status_code=400, detail="No transactions provided")

    imported = 0
    errors: list[str] = []

    for item in items:
        try:
            doc = {
                "id":          str(uuid.uuid4()),
                "user_id":     uid,
                "amount":      item.amount,
                "type":        "expense",
                "description": item.description,
                "category_id": item.category_id,
                "date":        item.date,
                "source":      "upi_pdf",
                "created_at":  datetime.now(timezone.utc).isoformat(),
            }
            await db.transactions.insert_one(doc)
            if doc.get("category_id"):
                await db.budget_categories.update_one(
                    {"id": doc["category_id"]},
                    {"$inc": {"spent_amount": doc["amount"]}},
                )
            imported += 1
        except Exception as e:
            errors.append(str(e))

    invalidate_user_cache(uid)

    return {
        "imported": imported,
        "errors":   errors[:10],
    }


# Financial Score
@api_router.get("/financial-score")
async def get_financial_score(current_user: dict = Depends(get_current_user)):
    # Check cache first
    cache_key = get_cache_key(current_user['id'], "financial_score")
    if cache_key in financial_score_cache:
        logger.info(f"Cache HIT: financial_score for user {current_user['id'][:8]}...")
        return financial_score_cache[cache_key]
    
    logger.info(f"Cache MISS: financial_score for user {current_user['id'][:8]}...")
    uid  = current_user['id']
    fgid = current_user.get('family_group_id')
    family_filter = {"family_group_id": fgid} if fgid else {"user_id": uid}

    try:
        # ── New 3-layer scoring system ─────────────────────────────────────────────
        today = datetime.now(timezone.utc)
        current_month = today.strftime("%Y-%m")

        # Get current fiscal year start (Apr 1)
        fy_start_year = today.year if today.month >= 4 else today.year - 1
        fy_start = datetime(fy_start_year, 4, 1, tzinfo=timezone.utc)

        # ── Layer 1: Fundamentals (30 pts) ─────────────────────────────────────────
        fundamentals = 0

        # EMI ratio (15 pts) — use monthly_payment field and status=active
        emis = await db.emis.find({**family_filter, "status": "active"}, {"monthly_payment": 1}).to_list(100)
        total_emi = sum(e.get("monthly_payment", 0) for e in emis)

        # Monthly income: sum of income_entries from last 3 months, fallback to categories
        income_entries = await db.income_entries.find(
            {"user_id": uid, "date": {"$gte": (today - timedelta(days=90)).strftime("%Y-%m-%d")}},
            {"amount": 1}
        ).to_list(100)
        if income_entries:
            monthly_income = sum(e.get("amount", 0) for e in income_entries) / 3
        else:
            # Legacy fallback: use budget category income allocation
            cats_fallback = await _ensure_default_categories(uid, fgid)
            monthly_income = sum(c.get("allocated_amount", 0) for c in cats_fallback if c.get("type") == "income")

        if monthly_income > 0:
            emi_ratio = total_emi / monthly_income
            if emi_ratio <= 0.30:
                fundamentals += 15
            elif emi_ratio <= 0.40:
                fundamentals += 10
            elif emi_ratio <= 0.50:
                fundamentals += 5

        # Savings rate (15 pts)
        recent_txns = await db.transactions.find(
            {"user_id": uid, "type": "expense", "date": {"$gte": (today - timedelta(days=90)).strftime("%Y-%m-%d")}},
            {"amount": 1}
        ).to_list(500)
        total_expense_3m = sum(t.get("amount", 0) for t in recent_txns)
        monthly_expense_avg = total_expense_3m / 3
        if monthly_income > 0:
            savings_rate = (monthly_income - monthly_expense_avg - total_emi) / monthly_income
            if savings_rate >= 0.25:
                fundamentals += 15
            elif savings_rate >= 0.15:
                fundamentals += 10
            elif savings_rate >= 0.05:
                fundamentals += 5

        # ── Layer 2: Discipline (35 pts) ──────────────────────────────────────────
        discipline = 0
        months_checked = 0
        months_under_budget = 0

        for i in range(6):
            check_date = today - timedelta(days=30 * i)
            m_str = check_date.strftime("%Y-%m")
            cats = await _ensure_default_categories(uid, fgid)
            month_budget = sum(c.get("allocated_amount", 0) for c in cats if c.get("type") == "expense")
            if month_budget <= 0:
                continue
            month_spent_docs = await db.transactions.find(
                {"user_id": uid, "type": "expense", "date": {"$regex": f"^{m_str}"}},
                {"amount": 1}
            ).to_list(500)
            month_spent = sum(t.get("amount", 0) for t in month_spent_docs)
            if month_spent == 0:
                continue  # skip months with no actual spending data
            months_checked += 1
            if month_spent <= month_budget:
                months_under_budget += 1

        if months_checked > 0:
            discipline = round((months_under_budget / months_checked) * 35)

        # ── Layer 3: Momentum (35 pts) ────────────────────────────────────────────
        momentum = 0
        # Compare current month spend vs 3-month average
        curr_month_txns = await db.transactions.find(
            {"user_id": uid, "type": "expense", "date": {"$regex": f"^{current_month}"}},
            {"amount": 1}
        ).to_list(500)
        curr_month_spend = sum(t.get("amount", 0) for t in curr_month_txns)

        three_month_txns = await db.transactions.find(
            {"user_id": uid, "type": "expense", "date": {"$gte": (today - timedelta(days=90)).strftime("%Y-%m-%d")}},
            {"amount": 1}
        ).to_list(1000)
        three_month_avg = sum(t.get("amount", 0) for t in three_month_txns) / 3

        if three_month_avg > 0:
            ratio = curr_month_spend / three_month_avg
            if ratio <= 0.85:
                momentum = 35   # spending 15%+ less than avg → excellent
            elif ratio <= 0.95:
                momentum = 28   # slightly better
            elif ratio <= 1.05:
                momentum = 20   # on track
            elif ratio <= 1.15:
                momentum = 12   # slightly over
            else:
                momentum = 5    # over budget trend
        else:
            momentum = 20  # no history, neutral

        total_score = fundamentals + discipline + momentum

        # ── Monthly data — only months with real activity ──────────────────────────
        monthly_data = []
        for i in range(12):
            raw_month = 4 + i
            yr = fy_start_year + (raw_month - 1) // 12
            mo = ((raw_month - 1) % 12) + 1
            m_date = datetime(yr, mo, 1, tzinfo=timezone.utc)
            if m_date > today:
                break
            m_str = m_date.strftime("%Y-%m")
            m_txns = await db.transactions.find(
                {"user_id": uid, "type": "expense", "date": {"$regex": f"^{m_str}"}},
                {"amount": 1, "category_name": 1, "category": 1}
            ).to_list(500)
            m_expense = sum(t.get("amount", 0) for t in m_txns)
            m_income_entries = await db.income_entries.find(
                {"user_id": uid, "date": {"$regex": f"^{m_str}"}},
                {"amount": 1}
            ).to_list(100)
            m_income_total = sum(t.get("amount", 0) for t in m_income_entries)
            # Skip months with no real data — no fallback, no ghost bars
            if m_expense == 0 and m_income_total == 0:
                continue
            # Per-category breakdown for dashboard filter tabs
            m_cat_breakdown: dict = {}
            for t in m_txns:
                cat = t.get("category_name") or t.get("category") or "Other"
                m_cat_breakdown[cat] = m_cat_breakdown.get(cat, 0) + t.get("amount", 0)
            monthly_data.append({
                "month": m_str,
                "label": m_date.strftime("%b"),
                "expense": m_expense,
                "income": m_income_total,
                "categories": m_cat_breakdown,
            })

        net_savings_amt = max(0, monthly_income - monthly_expense_avg - total_emi)
        score_data = {
            "score": total_score,
            "breakdown": {
                "fundamentals": fundamentals,
                "discipline": discipline,
                "momentum": momentum,
            },
            "details": {
                "emi_ratio": round(total_emi / monthly_income * 100, 1) if monthly_income > 0 else 0,
                "savings_rate": round(max(0, (monthly_income - monthly_expense_avg - total_emi) / monthly_income * 100), 1) if monthly_income > 0 else 0,
                "months_under_budget": months_under_budget,
                "months_checked": months_checked,
                "current_vs_avg": round(curr_month_spend / three_month_avg * 100, 1) if three_month_avg > 0 else 100,
            },
            # Top-level ratios for legacy metric bars
            "emi_ratio": round(total_emi / monthly_income * 100, 1) if monthly_income > 0 else 0,
            "expense_ratio": round(monthly_expense_avg / monthly_income * 100, 1) if monthly_income > 0 else 0,
            "savings_ratio": round(net_savings_amt / monthly_income * 100, 1) if monthly_income > 0 else 0,
            # Actual rupee amounts for meaningful display
            "amounts": {
                "total_emi": round(total_emi),
                "monthly_expenses": round(monthly_expense_avg),
                "monthly_income": round(monthly_income),
                "net_savings": round(net_savings_amt),
            },
            "monthly_data": monthly_data,
            "fiscal_year": f"FY{str(fy_start_year)[2:]}-{str(fy_start_year + 1)[2:]}",
            "cached": True,
        }

    except Exception as e:
        logger.error(f"Error in 3-layer financial score: {e}")
        # Fallback to legacy scoring
        categories = await _ensure_default_categories(uid, fgid)
        emis_fallback = await db.emis.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(1000)
        total_income_fb = sum(cat['allocated_amount'] for cat in categories if cat['type'] == 'income')
        total_expenses_fb = sum(cat['allocated_amount'] for cat in categories if cat['type'] == 'expense')
        total_spent_fb = sum(cat.get('spent_amount', 0) for cat in categories if cat['type'] == 'expense')
        total_emi_fb = sum(emi['monthly_payment'] for emi in emis_fallback)
        summary = {
            'total_income': total_income_fb,
            'total_expenses': total_expenses_fb,
            'total_spent': total_spent_fb,
            'total_emi': total_emi_fb,
            'remaining_budget': total_income_fb - total_expenses_fb - total_emi_fb - total_spent_fb,
        }
        score_data = calculate_financial_score(summary)
        score_data['cached'] = True
        # Add fiscal year monthly data for chart
        try:
            today_fb = datetime.now(timezone.utc)
            fy_start_year_fb = today_fb.year if today_fb.month >= 4 else today_fb.year - 1
            monthly_data_fb = []
            for i in range(12):
                raw_month = 4 + i
                yr = fy_start_year_fb + (raw_month - 1) // 12
                mo = ((raw_month - 1) % 12) + 1
                m_date = datetime(yr, mo, 1, tzinfo=timezone.utc)
                if m_date > today_fb:
                    break
                m_str = m_date.strftime("%Y-%m")
                m_txns = await db.transactions.find(
                    {"user_id": uid, "type": "expense", "date": {"$regex": f"^{m_str}"}},
                    {"amount": 1}
                ).to_list(500)
                m_income = await db.income_entries.find(
                    {"user_id": uid, "date": {"$regex": f"^{m_str}"}},
                    {"amount": 1}
                ).to_list(100)
                monthly_data_fb.append({
                    "month": m_str,
                    "label": m_date.strftime("%b"),
                    "expense": sum(t.get("amount", 0) for t in m_txns),
                    "income": sum(t.get("amount", 0) for t in m_income),
                })
            score_data['monthly_data'] = monthly_data_fb
            score_data['fiscal_year'] = f"FY{str(fy_start_year_fb)[2:]}-{str(fy_start_year_fb + 1)[2:]}"
        except Exception:
            score_data['monthly_data'] = []

    # Store in cache
    financial_score_cache[cache_key] = score_data
    return {**score_data, 'cached': False}

# When to Buy
@api_router.post("/when-to-buy")
async def when_to_buy(input: WhenToBuy, current_user: dict = Depends(get_current_user)):
    uid  = current_user['id']
    fgid = current_user.get('family_group_id')
    family_filter = {"family_group_id": fgid} if fgid else {"user_id": uid}

    categories = await _ensure_default_categories(uid, fgid)
    emis = await db.emis.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(1000)

    total_income = sum(cat['allocated_amount'] for cat in categories if cat['type'] == 'income')
    total_expenses = sum(cat['allocated_amount'] for cat in categories if cat['type'] == 'expense')
    total_emi = sum(emi['monthly_payment'] for emi in emis)
    monthly_surplus = total_income - total_expenses - total_emi

    if monthly_surplus <= 0:
        shortfall = abs(monthly_surplus)
        return {
            'can_buy': False,
            'status': 'not_advisable',
            'months_to_save': 999,
            'monthly_surplus': monthly_surplus,
            'savings_needed': input.target_amount,
            'down_payment_suggested': input.target_amount * 0.2,
            'message': f'Monthly outflow exceeds income by ₹{shortfall:,.0f}. Cannot save for {input.item_name} right now.',
            'recommendation': 'Reduce your EMIs or discretionary expenses to free up monthly surplus before planning this purchase.'
        }
    
    months_to_save = int(input.target_amount / monthly_surplus) if monthly_surplus > 0 else 999
    
    # Calculate affordability
    if months_to_save <= 3:
        status = 'buy_now'
        message = f'Great! You can afford {input.item_name} in {months_to_save} months.'
        recommendation = 'Start saving now and you\'ll have it soon!'
    elif months_to_save <= 12:
        status = 'save_more'
        message = f'You can buy {input.item_name} in {months_to_save} months if you save consistently.'
        recommendation = 'Create a dedicated savings goal and track progress.'
    else:
        status = 'not_advisable'
        message = f'It will take {months_to_save} months to save for {input.item_name}.'
        recommendation = 'Consider increasing income, reducing expenses, or choosing a lower-priced option.'
    
    history_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "item_name": input.item_name,
        "target_amount": input.target_amount,
        "status": status,
        "months_to_save": months_to_save,
        "monthly_surplus": monthly_surplus,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.when_to_buy_history.insert_one(history_doc)
    history_doc.pop("_id", None)

    return {
        'can_buy': months_to_save <= 12,
        'status': status,
        'months_to_save': months_to_save,
        'monthly_surplus': monthly_surplus,
        'message': message,
        'recommendation': recommendation,
        'savings_needed': input.target_amount,
        'down_payment_suggested': input.target_amount * 0.2
    }

@api_router.get("/when-to-buy/history")
async def get_when_to_buy_history(current_user: dict = Depends(get_current_user)):
    items = await db.when_to_buy_history.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return items

# Budget Categories (with family support)
@api_router.post("/categories", response_model=BudgetCategory)
async def create_category(input: BudgetCategoryCreate, current_user: dict = Depends(get_current_user)):
    if input.type == 'expense':
        count = await db.budget_categories.count_documents({"user_id": current_user['id'], "type": "expense"})
        await check_limit(current_user, "categories", count)
    category = BudgetCategory(
        **input.model_dump(),
        user_id=current_user['id'],
        family_group_id=current_user.get('family_group_id')
    )
    doc = category.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.budget_categories.insert_one(doc)
    
    # Invalidate caches for this user
    invalidate_user_cache(current_user['id'])
    return category

@api_router.get("/categories", response_model=List[BudgetCategory])
async def get_categories(current_user: dict = Depends(get_current_user)):
    uid = current_user['id']
    fgid = current_user.get('family_group_id')

    # Fetch, deduplicate, and seed any missing defaults via helper
    categories = await _ensure_default_categories(uid, fgid)

    # Recalculate spent_amount from current month's actual transactions
    from datetime import date as _date
    _today = _date.today()
    month_prefix = f"{_today.year}-{_today.month:02d}"
    # Include family transactions so the spent bar reflects shared spending
    txn_filter = {"family_group_id": fgid} if fgid else {"user_id": uid}
    month_txns = await db.transactions.find(
        {**txn_filter, "type": "expense", "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "category_id": 1, "amount": 1}
    ).to_list(10000)
    spent_by_cat: dict = {}
    for t in month_txns:
        cid = t.get("category_id")
        if cid:
            spent_by_cat[cid] = spent_by_cat.get(cid, 0) + t.get("amount", 0)

    now_utc = datetime.now(timezone.utc)
    for cat in categories:
        ca = cat.get('created_at')
        if ca is None:
            cat['created_at'] = now_utc
        elif isinstance(ca, str):
            try:
                cat['created_at'] = datetime.fromisoformat(ca.replace('Z', '+00:00'))
            except ValueError:
                cat['created_at'] = now_utc
        if cat.get('type') == 'expense':
            cat['spent_amount'] = round(spent_by_cat.get(cat['id'], 0), 2)
    return categories

@api_router.get("/budget-alerts")
async def get_budget_alerts(current_user: dict = Depends(get_current_user)):
    """Return categories that have hit ≥80% of their budget this month."""
    uid  = current_user["id"]
    fgid = current_user.get("family_group_id")
    categories = await _ensure_default_categories(uid, fgid)

    from datetime import date as _date
    _today = _date.today()
    month_prefix = f"{_today.year}-{_today.month:02d}"
    txn_filter = {"family_group_id": fgid} if fgid else {"user_id": uid}
    month_txns = await db.transactions.find(
        {**txn_filter, "type": "expense", "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "category_id": 1, "amount": 1}
    ).to_list(10000)
    spent_by_cat: dict = {}
    for t in month_txns:
        cid = t.get("category_id")
        if cid:
            spent_by_cat[cid] = spent_by_cat.get(cid, 0) + t.get("amount", 0)

    alerts = []
    for cat in categories:
        if cat.get("type") != "expense":
            continue
        budget = cat.get("allocated_amount", 0)
        if budget <= 0:
            continue
        spent = round(spent_by_cat.get(cat["id"], 0), 2)
        pct   = round(spent / budget * 100, 1)
        if pct >= 80:
            alerts.append({
                "category_id":   cat["id"],
                "category_name": cat["name"],
                "budget":        budget,
                "spent":         spent,
                "pct":           pct,
                "status":        "exceeded" if pct >= 100 else "warning",
            })
    alerts.sort(key=lambda a: a["pct"], reverse=True)
    return alerts

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.budget_categories.delete_one({"id": category_id, "user_id": current_user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Invalidate caches for this user
    invalidate_user_cache(current_user['id'])
    return {"message": "Category deleted successfully"}

@api_router.get("/budget-summary")
async def get_budget_summary(
    current_user: dict = Depends(get_current_user),
    month: Optional[str] = None,   # YYYY-MM — if omitted, uses current month
):
    from datetime import date as _date
    today = _date.today()
    current_month_prefix = f"{today.year}-{today.month:02d}"

    # Normalise requested month
    if month and len(month) == 7:
        month_prefix = month
    else:
        month_prefix = current_month_prefix
    is_current_month = (month_prefix == current_month_prefix)

    # Cache only for current month
    cache_key = get_cache_key(current_user['id'], "budget_summary")
    if is_current_month and cache_key in budget_summary_cache:
        logger.info(f"Cache HIT: budget_summary for user {current_user['id'][:8]}...")
        return budget_summary_cache[cache_key]

    uid  = current_user['id']
    fgid = current_user.get('family_group_id')
    family_filter = {"family_group_id": fgid} if fgid else {"user_id": uid}

    categories = await _ensure_default_categories(uid, fgid)
    emis = await db.emis.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(1000)

    # ── Spending by category for the requested month ───────────────────────────
    month_txns = await db.transactions.find(
        {**family_filter, "type": "expense", "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "amount": 1, "category": 1, "category_name": 1}
    ).to_list(5000)
    total_spent = sum(t.get("amount", 0) for t in month_txns)

    # Group spending by category name
    # Chanakya stores "category_name"; manually-added transactions store "category"
    cat_spending: dict = {}
    for t in month_txns:
        name = t.get("category_name") or t.get("category") or "Other"
        cat_spending[name] = cat_spending.get(name, 0) + t.get("amount", 0)

    # Build categories list — budget_categories as base (allocated), actual spending on top
    cat_rows = []
    for cat in categories:
        if cat["type"] != "expense":
            continue
        spent_amt = cat_spending.get(cat["name"], 0)
        cat_rows.append({
            "name":      cat["name"],
            "allocated": cat.get("allocated_amount", 0),
            "spent":     round(spent_amt, 2),
        })
    # Add any categories from transactions that aren't in budget_categories
    known_names = {c["name"] for c in cat_rows}
    for name, amt in cat_spending.items():
        if name not in known_names:
            cat_rows.append({"name": name, "allocated": 0, "spent": round(amt, 2)})

    # ── Income ─────────────────────────────────────────────────────────────────
    income_entries = await db.income_entries.find(
        {"user_id": uid, "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "amount": 1, "source_type": 1}
    ).to_list(500)
    income_entries_total = sum(e.get("amount", 0) for e in income_entries)
    has_salary_entry = any(e.get("source_type") == "salary" for e in income_entries)

    paycheck_salary = 0.0
    if not has_salary_entry and is_current_month:
        latest_paycheck = await db.paychecks.find_one(
            {"user_id": uid},
            {"_id": 0, "net_pay": 1},
            sort=[("payment_date", -1)]
        )
        if latest_paycheck and latest_paycheck.get("net_pay"):
            paycheck_salary = float(latest_paycheck["net_pay"])
    total_income = income_entries_total + paycheck_salary

    # Fallback only for current month — past months show 0 if nothing logged
    if total_income == 0 and is_current_month:
        recent_entry = await db.income_entries.find_one(
            {"user_id": uid}, {"_id": 0, "amount": 1}, sort=[("date", -1)]
        )
        if recent_entry and recent_entry.get("amount"):
            total_income = float(recent_entry["amount"])
        else:
            total_income = sum(cat["allocated_amount"] for cat in categories if cat["type"] == "income")

    # ── Build result ───────────────────────────────────────────────────────────
    total_expenses = sum(cat["allocated_amount"] for cat in categories if cat["type"] == "expense")
    total_emi      = sum(emi["monthly_payment"] for emi in emis)
    remaining      = total_income - total_expenses - total_emi - total_spent

    result = {
        "income":           round(total_income, 2),   # alias used by dashboard
        "total_income":     round(total_income, 2),
        "total_expenses":   total_expenses,
        "total_spent":      round(total_spent, 2),
        "total_emi":        total_emi,
        "remaining_budget": round(remaining, 2),
        "active_emis":      len(emis),
        "categories":       cat_rows,
        "month":            month_prefix,
        "has_data":         total_spent > 0 or total_income > 0,
        "cached":           False,
    }

    if is_current_month:
        budget_summary_cache[cache_key] = {**result, "cached": True}
    return result

# EMI Routes (continuing with existing code...)
@api_router.post("/emis", response_model=EMI)
async def create_emi(input: EMICreate, current_user: dict = Depends(get_current_user)):
    count = await db.emis.count_documents({"user_id": current_user['id'], "status": "active"})
    await check_limit(current_user, "emis", count)
    # Round monthly_payment to nearest rupee to prevent float drift
    input_data = input.model_dump()
    if input_data.get('monthly_payment'):
        input_data['monthly_payment'] = round(float(input_data['monthly_payment']))
    emi = EMI(
        **input_data,
        user_id=current_user['id'],
        family_group_id=current_user.get('family_group_id'),
        remaining_balance=input.principal_amount
    )
    doc = emi.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.emis.insert_one(doc)
    
    # Invalidate caches for this user
    invalidate_user_cache(current_user['id'])
    return emi

@api_router.get("/emis")
async def get_emis(current_user: dict = Depends(get_current_user)):
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    emis = await db.emis.find(family_filter, {"_id": 0}).to_list(1000)
    result = []
    now_utc = datetime.now(timezone.utc)
    for emi in emis:
        ca = emi.get('created_at')
        if ca is None:
            emi['created_at'] = now_utc
        elif isinstance(ca, str):
            try:
                emi['created_at'] = datetime.fromisoformat(ca.replace('Z', '+00:00'))
            except ValueError:
                emi['created_at'] = now_utc
        # Ensure fields the frontend depends on always exist
        emi.setdefault('paid_months', 0)
        emi.setdefault('status', 'active')
        emi.setdefault('remaining_balance', emi.get('principal_amount', 0))
        emi.setdefault('emi_debit_day', None)

        # Compute next_due_date so mobile/web don't need client-side logic
        debit_day = emi.get('emi_debit_day')
        if debit_day and emi.get('status') == 'active':
            ist = pytz.timezone("Asia/Kolkata")
            today = now_utc.astimezone(ist)
            due = today.replace(day=debit_day, hour=0, minute=0, second=0, microsecond=0)
            if due.date() <= today.date():
                # Move to next month
                if due.month == 12:
                    due = due.replace(year=due.year + 1, month=1)
                else:
                    due = due.replace(month=due.month + 1)
            emi['next_due_date'] = due.strftime('%Y-%m-%d')
        else:
            emi['next_due_date'] = None

        result.append(emi)
    return result

@api_router.put("/emis/{emi_id}")
async def update_emi(emi_id: str, input: EMIUpdate, current_user: dict = Depends(get_current_user)):
    logger.info(f"PUT /emis/{emi_id} by user {current_user.get('id')} — payload: {input.model_dump()}")
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    emi_doc = await db.emis.find_one({"id": emi_id, **family_filter}, {"_id": 0})
    if not emi_doc:
        logger.warning(f"EMI {emi_id} not found for user {current_user.get('id')}")
        raise HTTPException(status_code=404, detail="EMI not found")
    updates = {k: v for k, v in input.model_dump().items() if v is not None}
    # When principal_amount changes and no payments have been made yet, keep remaining_balance in sync
    if 'principal_amount' in updates and emi_doc.get('paid_months', 0) == 0:
        updates['remaining_balance'] = round(float(updates['principal_amount']), 2)
    # Round monthly_payment to prevent float drift
    if 'monthly_payment' in updates:
        updates['monthly_payment'] = round(float(updates['monthly_payment']))
    logger.info(f"Applying updates: {updates}")
    if updates:
        await db.emis.update_one({"id": emi_id}, {"$set": updates})
    invalidate_user_cache(current_user['id'])
    return {"message": "EMI updated successfully"}

@api_router.post("/emis/{emi_id}/preclosure-calculate")
async def preclosure_calculate(emi_id: str, extra_payment: float, current_user: dict = Depends(get_current_user)):
    emi_doc = await db.emis.find_one({"id": emi_id}, {"_id": 0})
    if not emi_doc:
        raise HTTPException(status_code=404, detail="EMI not found")

    r = emi_doc['interest_rate'] / 12 / 100
    emi = emi_doc['monthly_payment']
    current_balance = emi_doc['remaining_balance']
    remaining_months = emi_doc['tenure_months'] - emi_doc['paid_months']

    # Current total interest remaining (without extra payment)
    def calc_total_interest(balance, monthly_rate, monthly_emi, months_left):
        total_paid = monthly_emi * months_left
        return round(total_paid - balance, 2)

    current_remaining_interest = calc_total_interest(current_balance, r, emi, remaining_months)

    # After extra payment
    new_balance = max(0, current_balance - extra_payment)

    # New tenure with same EMI
    if r == 0 or new_balance == 0:
        new_months = 0 if new_balance == 0 else int(new_balance / emi)
    else:
        import math
        new_months = math.ceil(-math.log(1 - (new_balance * r / emi)) / math.log(1 + r)) if new_balance * r / emi < 1 else 0

    new_remaining_interest = calc_total_interest(new_balance, r, emi, new_months)
    interest_saved = max(0, current_remaining_interest - new_remaining_interest)
    months_saved = remaining_months - new_months

    return {
        "current_balance": round(current_balance, 2),
        "new_balance": round(new_balance, 2),
        "current_remaining_months": remaining_months,
        "new_remaining_months": max(0, new_months),
        "months_saved": months_saved,
        "current_remaining_interest": current_remaining_interest,
        "new_remaining_interest": max(0, new_remaining_interest),
        "interest_saved": round(interest_saved, 2),
        "total_interest_paid": round((emi_doc['monthly_payment'] * emi_doc['tenure_months']) - emi_doc['principal_amount'], 2)
    }

@api_router.post("/emis/{emi_id}/foreclose")
async def foreclose_emi(emi_id: str, current_user: dict = Depends(get_current_user)):
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    emi_doc = await db.emis.find_one({"id": emi_id, **family_filter}, {"_id": 0})
    if not emi_doc:
        raise HTTPException(status_code=404, detail="EMI not found")
    remaining = round(emi_doc.get("remaining_balance", 0), 2)
    original_interest = max(0, round(emi_doc["monthly_payment"] * emi_doc["tenure_months"] - emi_doc["principal_amount"], 2))
    remaining_months = emi_doc["tenure_months"] - emi_doc["paid_months"]
    interest_saved = max(0, round(emi_doc["monthly_payment"] * remaining_months - remaining, 2)) if remaining_months > 0 else 0
    await db.emis.update_one(
        {"id": emi_id},
        {"$set": {
            "status": "closed",
            "paid_months": emi_doc["tenure_months"],
            "remaining_balance": 0.0,
            "foreclosed_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
        }}
    )
    invalidate_user_cache(current_user['id'])
    return {
        "message": "Loan foreclosed successfully",
        "amount_paid": remaining,
        "interest_saved": max(0, interest_saved),
        "original_interest": original_interest,
    }


@api_router.delete("/emis/{emi_id}")
async def delete_emi(emi_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.emis.delete_one({"id": emi_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="EMI not found")
    
    # Invalidate caches for this user
    invalidate_user_cache(current_user['id'])
    return {"message": "EMI deleted successfully"}

@api_router.post("/emis/{emi_id}/payment")
async def record_emi_payment(emi_id: str, input: EMIPayment, current_user: dict = Depends(get_current_user)):
    emi_doc = await db.emis.find_one({"id": emi_id}, {"_id": 0})
    if not emi_doc:
        raise HTTPException(status_code=404, detail="EMI not found")

    # Guard: don't allow payment beyond full tenure
    if emi_doc.get('paid_months', 0) >= emi_doc.get('tenure_months', 0):
        raise HTTPException(status_code=400, detail="All EMI payments already recorded for this loan")

    monthly_rate  = emi_doc['interest_rate'] / 12 / 100
    interest_paid = emi_doc['remaining_balance'] * monthly_rate
    # principal_paid must never be negative (prevents balance from increasing)
    principal_paid = max(0, input.amount - interest_paid)

    new_balance    = round(max(0, emi_doc['remaining_balance'] - principal_paid), 2)
    new_paid_months = emi_doc['paid_months'] + 1
    new_status     = "closed" if new_balance <= 1 else "active"   # ≤1 rupee → close (float tolerance)

    await db.emis.update_one(
        {"id": emi_id},
        {"$set": {
            "remaining_balance": new_balance,
            "paid_months":       new_paid_months,
            "status":            new_status,
        }}
    )
    invalidate_user_cache(current_user['id'])
    return {"message": "Payment recorded", "new_balance": new_balance, "status": new_status}

@api_router.get("/emis/recommendations")
async def get_emi_recommendations(current_user: dict = Depends(get_current_user)):
    # Check cache first
    cache_key = get_cache_key(current_user['id'], "emi_recommendations")
    if cache_key in emi_recommendations_cache:
        logger.info(f"Cache HIT: emi_recommendations for user {current_user['id'][:8]}...")
        return emi_recommendations_cache[cache_key]
    
    logger.info(f"Cache MISS: emi_recommendations for user {current_user['id'][:8]}...")
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    emis = await db.emis.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(1000)
    
    recommendations = []
    for emi in emis:
        remaining_months = emi['tenure_months'] - emi['paid_months']
        total_interest = (emi['monthly_payment'] * remaining_months) - emi['remaining_balance']
        
        recommendations.append({
            "emi_id": emi['id'],
            "loan_name": emi['loan_name'],
            "interest_rate": emi['interest_rate'],
            "remaining_balance": emi['remaining_balance'],
            "remaining_months": remaining_months,
            "monthly_payment": emi['monthly_payment'],
            "total_interest_remaining": total_interest,
            "savings_if_closed_now": total_interest,
            "priority_score": emi['interest_rate']
        })
    
    recommendations.sort(key=lambda x: x['priority_score'], reverse=True)
    
    # Store in cache
    emi_recommendations_cache[cache_key] = recommendations
    return recommendations

# Transactions (with voice/SMS support)
@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(input: TransactionCreate, current_user: dict = Depends(get_current_user)):
    # Reject future-dated transactions
    _today_str = datetime.now(pytz.timezone("Asia/Kolkata")).strftime("%Y-%m-%d")
    if input.date and input.date > _today_str:
        raise HTTPException(status_code=400, detail="Transaction date cannot be in the future")

    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    category = await db.budget_categories.find_one({**family_filter, "id": input.category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    transaction = Transaction(
        user_id=current_user['id'],
        family_group_id=current_user.get('family_group_id'),
        category_id=input.category_id,
        category_name=category['name'],
        amount=input.amount,
        description=input.description,
        type=category['type'],
        date=input.date,
        source=input.source
    )
    
    doc = transaction.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.transactions.insert_one(doc)
    
    if category['type'] == 'expense':
        await db.budget_categories.update_one(
            {"id": input.category_id},
            {"$inc": {"spent_amount": input.amount}}
        )
    invalidate_user_cache(current_user['id'])
    await update_streak(current_user['id'])
    return transaction

@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    txn = await db.transactions.find_one({"id": transaction_id, **family_filter}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    # If expense, reverse the spent_amount on the category
    if txn.get("type") == "expense" and txn.get("category_id"):
        await db.budget_categories.update_one(
            {"id": txn["category_id"]},
            {"$inc": {"spent_amount": -txn["amount"]}}
        )
    await db.transactions.delete_one({"id": transaction_id})
    invalidate_user_cache(current_user['id'])
    return {"message": "Transaction deleted"}

@api_router.get("/transactions", response_model=List[Transaction])
async def get_transactions(current_user: dict = Depends(get_current_user)):
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    raw = await db.transactions.find({**family_filter, "type": "expense"}, {"_id": 0}).sort("date", -1).to_list(1000)
    now = datetime.now(timezone.utc)

    # Build a UUID→name map for category resolution (fixes UUID category names in old data)
    _cat_docs = await db.budget_categories.find({"user_id": current_user['id']}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    _cat_id_to_name = {c["id"]: c["name"] for c in _cat_docs if c.get("id") and c.get("name")}

    _UUID_PATTERN = __import__("re").compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', __import__("re").I)

    result = []
    for txn in raw:
        try:
            # Resolve category_name: if missing or looks like a UUID, look it up
            cat_name = txn.get('category_name') or ''
            if not cat_name or _UUID_PATTERN.match(cat_name):
                cat_id = txn.get('category_id', cat_name)
                cat_name = _cat_id_to_name.get(cat_id, 'Other')
            txn['category_name'] = cat_name
            txn.setdefault('description', '')
            txn.setdefault('type', 'expense')
            txn.setdefault('source', 'manual')
            txn.setdefault('user_id', current_user['id'])
            ca = txn.get('created_at')
            if ca is None:
                txn['created_at'] = now
            elif isinstance(ca, str):
                try:
                    txn['created_at'] = datetime.fromisoformat(ca.replace('Z', '+00:00'))
                except ValueError:
                    txn['created_at'] = now
            # Validate via model — skip docs that are still unserializable
            result.append(Transaction(**txn))
        except Exception as e:
            logger.warning(f"Skipping malformed transaction doc: {e}")
    return result

# Savings Goals CRUD
@api_router.post("/savings-goals", response_model=SavingsGoal)
async def create_savings_goal(input: SavingsGoalCreate, current_user: dict = Depends(get_current_user)):
    """Create a new savings goal"""
    count = await db.savings_goals.count_documents({"user_id": current_user['id'], "status": "active"})
    await check_limit(current_user, "savings_goals", count)
    goal = SavingsGoal(
        **input.model_dump(),
        user_id=current_user['id'],
        family_group_id=current_user.get('family_group_id')
    )
    doc = goal.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.savings_goals.insert_one(doc)
    return goal

@api_router.get("/savings-goals", response_model=List[SavingsGoal])
async def get_savings_goals(current_user: dict = Depends(get_current_user)):
    """Get all savings goals for the user"""
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    raw = await db.savings_goals.find(family_filter, {"_id": 0}).to_list(100)
    now = datetime.now(timezone.utc)
    result = []
    for goal in raw:
        try:
            goal.setdefault('user_id', current_user['id'])
            goal.setdefault('name', 'Untitled Goal')
            goal.setdefault('target_amount', 0.0)
            goal.setdefault('target_date', str(now.date()))
            ca = goal.get('created_at')
            if ca is None:
                goal['created_at'] = now
            elif isinstance(ca, str):
                try:
                    goal['created_at'] = datetime.fromisoformat(ca.replace('Z', '+00:00'))
                except ValueError:
                    goal['created_at'] = now
            result.append(SavingsGoal(**goal))
        except Exception as e:
            logger.warning(f"Skipping malformed savings-goal doc: {e}")
    return result

@api_router.get("/savings-goals/{goal_id}")
async def get_savings_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific savings goal with progress details"""
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    goal = await db.savings_goals.find_one({**family_filter, "id": goal_id}, {"_id": 0})
    if not goal:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    
    # Calculate progress
    progress_percentage = (goal['current_amount'] / goal['target_amount'] * 100) if goal['target_amount'] > 0 else 0
    
    # Calculate days remaining
    target_date = datetime.strptime(goal['target_date'], '%Y-%m-%d')
    days_remaining = (target_date - datetime.now()).days
    
    # Calculate required monthly savings
    months_remaining = max(1, days_remaining / 30)
    amount_remaining = goal['target_amount'] - goal['current_amount']
    monthly_savings_needed = amount_remaining / months_remaining if months_remaining > 0 else amount_remaining
    
    return {
        **goal,
        'progress_percentage': round(progress_percentage, 1),
        'days_remaining': max(0, days_remaining),
        'amount_remaining': amount_remaining,
        'monthly_savings_needed': round(monthly_savings_needed, 0)
    }

@api_router.put("/savings-goals/{goal_id}")
async def update_savings_goal(goal_id: str, input: SavingsGoalUpdate, current_user: dict = Depends(get_current_user)):
    """Update a savings goal"""
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.savings_goals.update_one(
        {**family_filter, "id": goal_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    
    # Check if goal is completed
    updated_goal = await db.savings_goals.find_one({**family_filter, "id": goal_id}, {"_id": 0})
    if updated_goal and updated_goal['current_amount'] >= updated_goal['target_amount']:
        await db.savings_goals.update_one(
            {**family_filter, "id": goal_id},
            {"$set": {"status": "completed"}}
        )
    
    return {"message": "Savings goal updated successfully"}

@api_router.post("/savings-goals/{goal_id}/contribute")
async def add_contribution(goal_id: str, input: SavingsContribution, current_user: dict = Depends(get_current_user)):
    """Add a contribution to a savings goal"""
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    
    goal = await db.savings_goals.find_one({**family_filter, "id": goal_id}, {"_id": 0})
    if not goal:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    
    new_amount = goal['current_amount'] + input.amount
    new_status = "completed" if new_amount >= goal['target_amount'] else goal['status']
    
    await db.savings_goals.update_one(
        {**family_filter, "id": goal_id},
        {"$set": {"current_amount": new_amount, "status": new_status}}
    )
    
    # Invalidate caches for this user
    invalidate_user_cache(current_user['id'])
    
    return {
        "message": "Contribution added successfully",
        "new_amount": new_amount,
        "status": new_status,
        "goal_completed": new_amount >= goal['target_amount']
    }

@api_router.get("/savings-goals/{goal_id}/linked-investments")
async def get_linked_investments(goal_id: str, current_user: dict = Depends(get_current_user)):
    """Return all FD/RD investments linked to a savings goal."""
    linked = await db.investments.find(
        {"user_id": current_user["id"], "savings_goal_id": goal_id},
        {"_id": 0}
    ).to_list(100)
    return linked

@api_router.delete("/savings-goals/{goal_id}")
async def delete_savings_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a savings goal"""
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    result = await db.savings_goals.delete_one({**family_filter, "id": goal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    
    # Invalidate caches for this user
    invalidate_user_cache(current_user['id'])
    return {"message": "Savings goal deleted successfully"}

# ─────────────────────────────────────────────────────────────────────────────
# FIRE Goal — save and track a user's FIRE plan
# ─────────────────────────────────────────────────────────────────────────────

class FireGoalInput(BaseModel):
    fire_number: float
    fire_type: str = "regular"          # lean | regular | fat | custom
    withdrawal_rate: float = 4.0
    target_year: int
    current_savings: float
    monthly_expenses: float
    monthly_savings_needed: float
    monthly_income: float = 0
    current_age: int
    target_age: int
    coast_fire_number: float = 0
    barista_monthly_income: float = 0   # post-retirement part-time income
    notes: str = ""

@api_router.post("/fire-goal")
async def save_fire_goal(body: FireGoalInput, current_user: dict = Depends(get_current_user)):
    """Create or overwrite the user's FIRE goal (one per user)."""
    user_id = str(current_user["id"])
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user_id,
        "fire_number": body.fire_number,
        "fire_type": body.fire_type,
        "withdrawal_rate": body.withdrawal_rate,
        "target_year": body.target_year,
        "current_savings": body.current_savings,
        "monthly_expenses": body.monthly_expenses,
        "monthly_savings_needed": body.monthly_savings_needed,
        "monthly_income": body.monthly_income,
        "current_age": body.current_age,
        "target_age": body.target_age,
        "coast_fire_number": body.coast_fire_number,
        "barista_monthly_income": body.barista_monthly_income,
        "notes": body.notes,
        "updated_at": now,
    }
    existing = await db.fire_goals.find_one({"user_id": user_id})
    if existing:
        doc["created_at"] = existing.get("created_at", now)
        await db.fire_goals.replace_one({"user_id": user_id}, doc)
    else:
        doc["created_at"] = now
        await db.fire_goals.insert_one(doc)
    doc.pop("_id", None)
    invalidate_user_cache(user_id)
    return doc

@api_router.get("/fire-goal")
async def get_fire_goal(current_user: dict = Depends(get_current_user)):
    """Return the user's saved FIRE goal, or null if not set."""
    user_id = str(current_user["id"])
    doc = await db.fire_goals.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return None
    return doc

@api_router.delete("/fire-goal")
async def delete_fire_goal(current_user: dict = Depends(get_current_user)):
    """Delete the user's saved FIRE goal."""
    user_id = str(current_user["id"])
    await db.fire_goals.delete_one({"user_id": user_id})
    invalidate_user_cache(user_id)
    return {"ok": True}

@api_router.get("/savings-goals-summary")
async def get_savings_goals_summary(current_user: dict = Depends(get_current_user)):
    """Get summary of all savings goals with smart alerts"""
    # Check cache first
    cache_key = get_cache_key(current_user['id'], "savings_summary")
    if cache_key in savings_summary_cache:
        logger.info(f"Cache HIT: savings_summary for user {current_user['id'][:8]}...")
        return savings_summary_cache[cache_key]
    
    logger.info(f"Cache MISS: savings_summary for user {current_user['id'][:8]}...")
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}
    
    goals = await db.savings_goals.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(100)
    
    # Get financial data for smart recommendations
    _uid  = current_user['id']
    _fgid = current_user.get('family_group_id')
    categories = await _ensure_default_categories(_uid, _fgid)
    emis = await db.emis.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(100)

    total_income = sum(cat['allocated_amount'] for cat in categories if cat['type'] == 'income')
    total_expenses = sum(cat['allocated_amount'] for cat in categories if cat['type'] == 'expense')
    total_emi = sum(emi['monthly_payment'] for emi in emis)
    monthly_surplus = total_income - total_expenses - total_emi
    
    # Calculate totals
    total_target = sum(g['target_amount'] for g in goals)
    total_saved = sum(g['current_amount'] for g in goals)
    total_remaining = total_target - total_saved
    
    # Generate smart alerts
    alerts = []
    for goal in goals:
        target_date = datetime.strptime(goal['target_date'], '%Y-%m-%d')
        days_remaining = (target_date - datetime.now()).days
        months_remaining = max(1, days_remaining / 30)
        amount_needed = goal['target_amount'] - goal['current_amount']
        monthly_needed = amount_needed / months_remaining
        progress = (goal['current_amount'] / goal['target_amount'] * 100) if goal['target_amount'] > 0 else 0
        
        if days_remaining < 0:
            alerts.append({
                "goal_id": goal['id'],
                "goal_name": goal['name'],
                "type": "overdue",
                "severity": "high",
                "message": f"'{goal['name']}' target date has passed. Consider extending the deadline or increasing contributions."
            })
        elif days_remaining <= 30 and progress < 90:
            alerts.append({
                "goal_id": goal['id'],
                "goal_name": goal['name'],
                "type": "deadline_approaching",
                "severity": "high",
                "message": f"Only {days_remaining} days left for '{goal['name']}'. You need ₹{amount_needed:,.0f} more."
            })
        elif monthly_needed > monthly_surplus * 0.5 and monthly_surplus > 0:
            alerts.append({
                "goal_id": goal['id'],
                "goal_name": goal['name'],
                "type": "pace_warning",
                "severity": "medium",
                "message": f"'{goal['name']}' requires ₹{monthly_needed:,.0f}/month, which is {(monthly_needed/monthly_surplus*100):.0f}% of your surplus."
            })
        elif progress >= 75 and progress < 100:
            alerts.append({
                "goal_id": goal['id'],
                "goal_name": goal['name'],
                "type": "almost_there",
                "severity": "low",
                "message": f"Great progress! '{goal['name']}' is {progress:.0f}% complete. Just ₹{amount_needed:,.0f} more to go!"
            })
    
    result = {
        "total_goals": len(goals),
        "total_target": total_target,
        "total_saved": total_saved,
        "total_remaining": total_remaining,
        "overall_progress": round((total_saved / total_target * 100) if total_target > 0 else 0, 1),
        "monthly_surplus": monthly_surplus,
        "alerts": alerts,
        "goals": goals
    }
    
    # Store in cache
    savings_summary_cache[cache_key] = result
    return result

# Chanakya proactive suggestions
@api_router.get("/chanakya/suggestions")
async def get_chanakya_suggestions(current_user: dict = Depends(get_current_user)):
    """Return rule-based proactive nudges based on user's real financial data"""
    uid  = current_user['id']
    fgid = current_user.get('family_group_id')
    family_filter = {"family_group_id": fgid} if fgid else {"user_id": uid}
    ist  = pytz.timezone("Asia/Kolkata")
    now  = datetime.now(ist)
    month_str = now.strftime("%Y-%m")
    today_str = now.strftime("%Y-%m-%d")
    in_7_days = (now + timedelta(days=7)).strftime("%Y-%m-%d")

    nudges = []

    try:
        # ── 1. Over-budget categories ─────────────────────────────────────────
        cats = await _ensure_default_categories(uid, fgid)
        for c in cats:
            if c.get("type") != "expense" or not c.get("allocated_amount"):
                continue
            spent = c.get("spent_amount", 0)
            alloc = c["allocated_amount"]
            pct   = round(spent / alloc * 100) if alloc > 0 else 0
            if spent > alloc:
                nudges.append({
                    "type": "over_budget",
                    "severity": "alert",
                    "icon": "🚨",
                    "text": f"You've exceeded your {c['name']} budget by ₹{round(spent-alloc):,}",
                    "chat_query": f"I've overspent my {c['name']} budget by ₹{round(spent-alloc):,} this month. How can I course-correct?"
                })
            elif pct >= 80:
                nudges.append({
                    "type": "near_budget",
                    "severity": "warning",
                    "icon": "⚠️",
                    "text": f"{c['name']} budget is {pct}% used — only ₹{round(alloc-spent):,} left",
                    "chat_query": f"I've used {pct}% of my {c['name']} budget with ₹{round(alloc-spent):,} remaining. Any tips to stay within budget?"
                })

        # ── 2. EMIs due in 7 days ─────────────────────────────────────────────
        emis = await db.emis.find({**family_filter, "status": "active"}).to_list(50)
        for e in emis:
            due = e.get("next_due_date") or e.get("due_date")
            if due and today_str <= due <= in_7_days:
                days_left = (datetime.strptime(due, "%Y-%m-%d") - now.replace(tzinfo=None)).days
                nudges.append({
                    "type": "emi_due",
                    "severity": "warning",
                    "icon": "📅",
                    "text": f"{e['loan_name']} EMI of ₹{round(e['monthly_payment']):,} due in {max(0,days_left)} days",
                    "chat_query": f"My {e['loan_name']} EMI of ₹{round(e['monthly_payment']):,} is due in {max(0,days_left)} days. Any advice on managing this?"
                })

        # ── 3. Savings goals nearing deadline ────────────────────────────────
        goals = await db.savings_goals.find({**family_filter, "status": "active"}).to_list(20)
        for g in goals:
            try:
                target = g.get("target_amount", 0)
                current = g.get("current_amount", 0)
                if target <= 0:
                    continue
                pct = round(current / target * 100)
                days_left = (datetime.strptime(g["target_date"], "%Y-%m-%d") - now.replace(tzinfo=None)).days
                if 0 < days_left <= 30 and pct < 90:
                    nudges.append({
                        "type": "goal_deadline",
                        "severity": "warning",
                        "icon": "🎯",
                        "text": f"'{g['name']}' goal deadline in {days_left} days — {pct}% done",
                        "chat_query": f"My '{g['name']}' savings goal deadline is in {days_left} days and I'm only {pct}% there. How do I close the gap?"
                    })
                elif pct >= 90 and pct < 100:
                    nudges.append({
                        "type": "goal_almost",
                        "severity": "info",
                        "icon": "🏁",
                        "text": f"Almost there! '{g['name']}' is {pct}% complete",
                        "chat_query": f"I'm {pct}% done with my '{g['name']}' goal — only ₹{round(target-current):,} to go. How should I finish strong?"
                    })
            except Exception:
                continue

        # ── 4. Free cash / deficit ────────────────────────────────────────────
        income_entries = await db.income_entries.find(
            {"user_id": uid, "date": {"$gte": (now - timedelta(days=90)).strftime("%Y-%m-%d")}},
            {"amount": 1}
        ).to_list(100)
        monthly_income = sum(e.get("amount", 0) for e in income_entries) / 3 if income_entries else 0
        if not monthly_income:
            cats_fb = await _ensure_default_categories(uid, fgid)
            monthly_income = sum(c.get("allocated_amount", 0) for c in cats_fb if c.get("type") == "income")

        total_spent = sum(c.get("spent_amount", 0) for c in cats if c.get("type") == "expense")
        total_emi   = sum(e.get("monthly_payment", 0) for e in emis)
        free_cash   = monthly_income - total_spent - total_emi

        if monthly_income > 0 and free_cash > 2000:
            nudges.append({
                "type": "free_cash",
                "severity": "info",
                "icon": "💰",
                "text": f"You have ₹{round(free_cash):,} free this month — put it to work!",
                "chat_query": f"I have ₹{round(free_cash):,} free this month after expenses and EMIs. Where should I invest or save it?"
            })
        elif monthly_income > 0 and free_cash < 0:
            nudges.append({
                "type": "deficit",
                "severity": "alert",
                "icon": "🔴",
                "text": f"Spending exceeds income by ₹{round(abs(free_cash)):,} this month",
                "chat_query": f"I'm spending ₹{round(abs(free_cash)):,} more than I earn this month. Help me fix this urgently."
            })

        # ── 5. Overdue hand loans ─────────────────────────────────────────────
        loans = await db.hand_loans.find({**family_filter, "status": "active"}).to_list(20)
        overdue = [l for l in loans if l.get("due_date") and l["due_date"] < today_str and l.get("loan_type") == "lent"]
        if overdue:
            total_overdue = sum(l.get("amount", 0) for l in overdue)
            nudges.append({
                "type": "loan_overdue",
                "severity": "warning",
                "icon": "🤝",
                "text": f"{len(overdue)} hand loan(s) overdue — ₹{round(total_overdue):,} pending recovery",
                "chat_query": f"I have {len(overdue)} overdue hand loan(s) totaling ₹{round(total_overdue):,}. How should I approach recovering them?"
            })

    except Exception as e:
        logger.error(f"Chanakya suggestions error: {e}")

    # Sort: alerts first, then warnings, then info
    order = {"alert": 0, "warning": 1, "info": 2}
    nudges.sort(key=lambda x: order.get(x["severity"], 3))

    return {"suggestions": nudges[:5]}


# Chatbot - Chanakya AI Financial Advisor
# ── Chat message serialiser ────────────────────────────────────────────────────
def _ser_msg(m: dict) -> dict:
    m["id"] = str(m.pop("_id"))
    return m


# ── Expo push notification helper ─────────────────────────────────────────────
async def _send_expo_push(push_token: str, title: str, body_text: str) -> None:
    """Fire-and-forget: send Expo push notification."""
    try:
        async with aiohttp.ClientSession() as _sess:
            await _sess.post(
                "https://exp.host/--/api/v2/push/send",
                json={
                    "to":        push_token,
                    "title":     title,
                    "body":      body_text,
                    "sound":     "default",
                    "badge":     1,
                    "channelId": "budget-mantra",
                },
                headers={
                    "Content-Type":    "application/json",
                    "Accept":          "application/json",
                    "Accept-Encoding": "gzip, deflate",
                },
            )
    except Exception as _e:
        logger.error(f"[PushNotif] {_e}")


# ── Notification preference endpoints ─────────────────────────────────────────
@api_router.get("/notifications/prefs")
async def get_notification_prefs(current_user: dict = Depends(get_current_user)):
    doc   = await db.users.find_one({"id": current_user["id"]}, {"notification_prefs": 1})
    prefs = (doc or {}).get("notification_prefs", {})
    return {
        "notify_via_chat": prefs.get("notify_via_chat", True),
        "emi_reminders":   prefs.get("emi_reminders",   True),
        "budget_alerts":   prefs.get("budget_alerts",   True),
        "goal_nudges":     prefs.get("goal_nudges",     True),
        "weekly_summary":  prefs.get("weekly_summary",  False),
    }


@api_router.put("/notifications/prefs")
async def update_notification_prefs(
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    allowed = {"notify_via_chat", "emi_reminders", "budget_alerts", "goal_nudges", "weekly_summary"}
    update  = {f"notification_prefs.{k}": bool(v) for k, v in body.items() if k in allowed}
    if update:
        await db.users.update_one({"id": current_user["id"]}, {"$set": update})
    return {"ok": True}


@api_router.put("/notifications/push-token")
async def save_push_token(
    body: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    token = (body.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"expo_push_token": token}},
    )
    return {"ok": True}


@api_router.get("/notifications/unread")
async def get_unread_notifications(current_user: dict = Depends(get_current_user)):
    """Return unread import_done notifications and mark them as read."""
    uid = str(current_user["id"])
    docs = await db.notifications.find(
        {"user_id": uid, "type": "import_done", "read": False}
    ).sort("created_at", -1).to_list(20)
    if docs:
        ids = [d["_id"] for d in docs]
        await db.notifications.update_many(
            {"_id": {"$in": ids}},
            {"$set": {"read": True}},
        )
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


# ── Sensitive data guard (Indian financial compliance) ────────────────────────

import re as _re

_SENSITIVE_PATTERNS = [
    # Credit / debit card numbers (16 digits, with or without spaces/dashes)
    (r'\b(?:\d[ \-]?){15}\d\b',                          "card number"),
    # CVV / CVC
    (r'\b(?:cvv|cvc|security\s*code)[\s:=]+\d{3,4}\b',  "CVV"),
    # ATM PIN / UPI PIN / transaction PIN
    (r'\b(?:atm\s*pin|upi\s*pin|mpin|m-?pin|transaction\s*pin)[\s:=]+\d{4,6}\b', "PIN"),
    # OTP
    (r'\b(?:otp|one[\s\-]?time\s*(?:password|code))[\s:=]+\d{4,8}\b', "OTP"),
    # Net-banking / app password patterns
    (r'\b(?:password|passwd|net\s*banking\s*pass(?:word)?)[\s:=]+\S+', "password"),
    # Indian PAN card
    (r'\b[A-Z]{5}[0-9]{4}[A-Z]\b',                      "PAN number"),
    # Aadhaar (12 digits, optionally spaced as 4-4-4)
    (r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b',              "Aadhaar number"),
    # Bank account number (9–18 digit standalone number with label)
    (r'\b(?:account\s*(?:no|number|num)[\s:#]*)\d{9,18}\b', "bank account number"),
    # IFSC code
    (r'\b[A-Z]{4}0[A-Z0-9]{6}\b',                       "IFSC code"),
    # Net banking username
    (r'\b(?:user\s*(?:id|name)|customer\s*id|login\s*id)[\s:=]+\S+', "net banking username"),
    # Demat / DP account number
    (r'\b(?:demat\s*(?:account|no)?[\s:=]*|dp\s*id[\s:=]+)\d{8,16}\b', "demat account"),
    # Indian passport number
    (r'\b[A-Z][1-9][0-9]{7}\b',                          "passport number"),
    # Security question / secret answer
    (r'\b(?:secret\s*(?:key|answer)|security\s*question)[\s:=]+\S+', "security credential"),
    # Card expiry with CVV in same message (combined leak)
    (r'\b(?:expiry|exp|valid\s*thru?)[\s:=]+\d{1,2}[\s/\-]\d{2,4}\b', "card expiry"),
]

_SENSITIVE_RE = [(re.compile(pat, re.IGNORECASE), label) for pat, label in _SENSITIVE_PATTERNS]

_SAFETY_MESSAGE = (
    "🔒 I noticed your message may contain sensitive financial information "
    "(like a card number, PIN, password, Aadhaar, or PAN).\n\n"
    "For your safety, I've automatically removed it and won't process it further. "
    "Budget Mantra will **never** ask for passwords, card numbers, PINs, OTPs, "
    "Aadhaar, PAN, or net banking credentials.\n\n"
    "Please never share such details in chat — not here, not anywhere. "
    "If you need help with a financial task, just describe it in words (e.g. "
    "\u201cI want to log my credit card bill of \u20b94,500\u201d) and I\u2019ll take it from there \U0001f64f"
)

def _detect_sensitive_data(text: str) -> tuple[bool, str | None]:
    """Return (True, label) if sensitive data is found, else (False, None)."""
    for pattern, label in _SENSITIVE_RE:
        if pattern.search(text):
            return True, label
    return False, None


# ── System chat notification helper ───────────────────────────────────────────
async def _insert_system_chat(user_id: str, content: str, notification_type: str = "system") -> None:
    """
    Insert a proactive Chanakya message into the user's chat history.
    source='system' lets the frontend render it with a bell/notification style.
    Also sends an Expo push notification if the user has a registered token
    and has notify_via_chat enabled.
    Fire-and-forget: errors are logged, never raised to the caller.
    """
    try:
        await db.chat_messages.insert_one({
            "user_id":           user_id,
            "role":              "assistant",
            "source":            "system",
            "notification_type": notification_type,
            "content":           content,
            "timestamp":         datetime.now(timezone.utc),
            "pinned":            False,
            "deleted":           False,
            "reply_to":          None,
            "attachment":        None,
        })
        user_doc  = await db.users.find_one({"id": user_id}, {"expo_push_token": 1, "notification_prefs": 1})
        push_tok  = (user_doc or {}).get("expo_push_token", "")
        prefs     = (user_doc or {}).get("notification_prefs", {})
        if push_tok and prefs.get("notify_via_chat", True):
            asyncio.ensure_future(_send_expo_push(push_tok, "Chanakya 💰", content[:120]))
    except Exception as e:
        logger.error(f"[SystemChat] Failed for user {user_id}: {e}")

# ── GET  /chatbot/history ──────────────────────────────────────────────────────
@api_router.get("/chatbot/history")
async def get_chat_history(
    limit: int = 20,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns up to `limit` messages newest-first then reversed to chronological order.
    Pass `before=<mongo_id>` to page backwards (Discord-style lazy load on scroll up).
    Default page size 20 keeps initial load fast; clients load more as user scrolls up.
    """
    query: dict = {"user_id": current_user["id"], "deleted": {"$ne": True}}
    if before:
        try:
            query["_id"] = {"$lt": ObjectId(before)}
        except Exception:
            pass  # malformed cursor — ignore, return latest batch
    msgs = await db.chat_messages.find(query).sort([("timestamp", -1), ("_id", -1)]).limit(limit).to_list(limit)
    msgs.reverse()
    return [_ser_msg(m) for m in msgs]

# ── GET  /chatbot/pinned ───────────────────────────────────────────────────────
@api_router.get("/chatbot/pinned")
async def get_pinned_messages(current_user: dict = Depends(get_current_user)):
    msgs = await db.chat_messages.find(
        {"user_id": current_user["id"], "pinned": True, "deleted": {"$ne": True}}
    ).sort("timestamp", -1).to_list(50)
    return [_ser_msg(m) for m in msgs]

# ── GET  /chatbot/search ───────────────────────────────────────────────────────
@api_router.get("/chatbot/search")
async def search_chat(q: str, current_user: dict = Depends(get_current_user)):
    msgs = await db.chat_messages.find(
        {"user_id": current_user["id"], "deleted": {"$ne": True},
         "content": {"$regex": re.escape(q), "$options": "i"}}
    ).sort("timestamp", -1).limit(30).to_list(30)
    return [_ser_msg(m) for m in msgs]

# ── DELETE /chatbot/history ────────────────────────────────────────────────────
@api_router.delete("/chatbot/history")
async def clear_chat_history(current_user: dict = Depends(get_current_user)):
    await db.chat_messages.update_many(
        {"user_id": current_user["id"]},
        {"$set": {"deleted": True}},
    )
    return {"ok": True}

# ── DELETE /chatbot/message/{msg_id} ──────────────────────────────────────────
@api_router.delete("/chatbot/message/{msg_id}")
async def delete_message(msg_id: str, current_user: dict = Depends(get_current_user)):
    try:
        await db.chat_messages.update_one(
            {"_id": ObjectId(msg_id), "user_id": current_user["id"]},
            {"$set": {"deleted": True}},
        )
    except Exception:
        raise HTTPException(400, "Invalid message id")
    return {"ok": True}

# ── PUT  /chatbot/message/{msg_id}/pin ────────────────────────────────────────
@api_router.put("/chatbot/message/{msg_id}/pin")
async def toggle_pin(msg_id: str, current_user: dict = Depends(get_current_user)):
    try:
        msg = await db.chat_messages.find_one(
            {"_id": ObjectId(msg_id), "user_id": current_user["id"]}
        )
    except Exception:
        raise HTTPException(400, "Invalid message id")
    if not msg:
        raise HTTPException(404, "Message not found")
    new_pin = not msg.get("pinned", False)
    await db.chat_messages.update_one({"_id": ObjectId(msg_id)}, {"$set": {"pinned": new_pin}})
    return {"pinned": new_pin}

# ── POST /chatbot/upload ───────────────────────────────────────────────────────
@api_router.post("/chatbot/upload")
async def upload_attachment(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    MAX_BYTES = 5 * 1024 * 1024  # 5 MB
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(400, "File too large — max 5 MB")
    import base64 as _b64
    data    = _b64.b64encode(content).decode()
    mime    = file.content_type or "application/octet-stream"
    ftype   = "pdf" if "pdf" in mime else "image"
    return {"type": ftype, "data": data, "name": file.filename, "mime": mime}

@api_router.get("/chatbot/usage")
async def get_chatbot_usage(current_user: dict = Depends(get_current_user)):
    """Return today's Chanakya message usage for the current user"""
    ist = pytz.timezone("Asia/Kolkata")
    today_key = datetime.now(ist).strftime('%Y-%m-%d')
    is_pro = current_user.get('is_pro', False)
    daily_limit = 30 if is_pro else 10
    usage_doc = await db.ai_usage.find_one({"user_id": current_user['id'], "feature": "chatbot", "date": today_key})
    used = usage_doc.get("count", 0) if usage_doc else 0
    remaining = max(0, daily_limit - used)
    return {"used": used, "limit": daily_limit, "remaining": remaining, "is_pro": is_pro}

@api_router.post("/chatbot")
@limiter.limit("20/minute")
async def chatbot(request: Request, input: ChatbotRequest, current_user: dict = Depends(get_current_user)):
    """AI Financial Advisor chatbot — Layer 1 intent engine + Layer 2 Claude fallback"""
    import json as _json
    from intent_engine import parse_message, format_bulk_response, format_single_response, format_confirmation_request, infer_income_source_type
    try:
        # Daily usage check
        ist_tz = pytz.timezone("Asia/Kolkata")
        today_key = datetime.now(ist_tz).strftime('%Y-%m-%d')
        is_pro = current_user.get('is_pro', False)
        free_daily_limit = 10
        pro_daily_limit  = 30
        daily_limit = pro_daily_limit if is_pro else free_daily_limit

        usage_doc  = await db.ai_usage.find_one({"user_id": current_user['id'], "feature": "chatbot", "date": today_key})
        used_today = usage_doc.get("count", 0) if usage_doc else 0
        if used_today >= daily_limit:
            name = current_user.get('name', '').split()[0] or 'there'
            if is_pro:
                return {
                    "response": (
                        f"Hey {name}, you've hit today's {pro_daily_limit}-message limit — I'll reset at midnight IST. "
                        f"This keeps Chanakya fast and affordable for everyone 🙏"
                    ),
                    "status": "limit_reached",
                    "messages_left": 0,
                }
            else:
                return {
                    "response": (
                        f"Hey {name}, we've hit today's {free_daily_limit}-message limit on the free plan.\n\n"
                        f"Come back tomorrow, or go Pro for 30 messages/day 🚀"
                    ),
                    "status": "limit_reached",
                    "messages_left": 0,
                }
        # ── Sensitive data guard — check BEFORE message reaches the model ─────
        _is_sensitive, _sensitive_label = _detect_sensitive_data(input.message)
        if _is_sensitive:
            logger.warning(f"[CHAT-SAFETY] sensitive data ({_sensitive_label}) blocked for user={current_user['id']}")
            # Save the safety reply to chat history so user sees it in context
            await db.chat_history.insert_one({
                "user_id": current_user['id'],
                "role": "assistant",
                "content": _SAFETY_MESSAGE,
                "timestamp": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                "source": "system",
            })
            return {
                "response": _SAFETY_MESSAGE,
                "action": None,
                "data": None,
                "layer": 0,
                "status": "blocked_sensitive",
            }

        # Get user's full financial context
        _cb_uid  = current_user['id']
        _cb_fgid = current_user.get('family_group_id')
        family_filter = {"family_group_id": _cb_fgid} if _cb_fgid else {"user_id": _cb_uid}
        ist = pytz.timezone("Asia/Kolkata")
        now_ist = datetime.now(ist)
        month_start = now_ist.replace(day=1).strftime('%Y-%m-%d')

        categories = await _ensure_default_categories(_cb_uid, _cb_fgid)
        emis = await db.emis.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(100)
        savings_goals = await db.savings_goals.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(50)
        recent_txns = await db.transactions.find(
            {**family_filter, "date": {"$gte": month_start}}, {"_id": 0}
        ).sort("date", -1).to_list(100)

        total_income = sum(c['allocated_amount'] for c in categories if c['type'] == 'income')
        total_budget = sum(c['allocated_amount'] for c in categories if c['type'] == 'expense')
        total_spent = sum(c.get('spent_amount', 0) for c in categories if c['type'] == 'expense')
        total_emi = sum(e['monthly_payment'] for e in emis)
        free_cash = total_income - total_spent - total_emi
        savings_rate = round((free_cash / total_income * 100), 1) if total_income > 0 else 0
        emi_ratio = round((total_emi / total_income * 100), 1) if total_income > 0 else 0
        expense_ratio = round((total_spent / total_income * 100), 1) if total_income > 0 else 0

        # Per-category budget vs spent
        cat_lines = []
        for c in categories:
            if c['type'] == 'expense':
                spent = c.get('spent_amount', 0)
                alloc = c['allocated_amount']
                pct = round(spent/alloc*100) if alloc > 0 else 0
                status = "over budget ⚠️" if spent > alloc else f"{pct}% used"
                cat_lines.append(f"  • {c['name']}: ₹{spent:,.0f} spent of ₹{alloc:,.0f} budget ({status})")

        # EMI details with urgency
        emi_lines = []
        for e in emis[:8]:
            months_left = e.get('tenure_months', 0) - e.get('paid_months', 0)
            emi_lines.append(f"  • {e['loan_name']}: ₹{e['monthly_payment']:,.0f}/mo | {e['interest_rate']}% APR | ₹{e['remaining_balance']:,.0f} remaining | {months_left} months left")

        # Savings goals
        goal_lines = []
        for g in savings_goals[:5]:
            progress = round(g['current_amount'] / g['target_amount'] * 100) if g['target_amount'] > 0 else 0
            try:
                days_left = (datetime.strptime(g['target_date'], '%Y-%m-%d') - now_ist.replace(tzinfo=None)).days
            except Exception:
                days_left = 0
            goal_lines.append(f"  • {g['name']}: ₹{g['current_amount']:,.0f}/₹{g['target_amount']:,.0f} ({progress}% done, {max(0,days_left)} days left)")

        # Recent spending pattern
        txn_summary = {}
        for t in recent_txns:
            txn_summary[t.get('category_name','Other')] = txn_summary.get(t.get('category_name','Other'), 0) + t.get('amount', 0)
        txn_lines = [f"  • {cat}: ₹{amt:,.0f}" for cat, amt in sorted(txn_summary.items(), key=lambda x: -x[1])[:6]]

        financial_context = f"""
=== {current_user['name']}'s Financial Snapshot — {now_ist.strftime('%B %Y')} ===

INCOME & CASH FLOW:
  • Monthly Income:    ₹{total_income:,.0f}
  • Total Budget:      ₹{total_budget:,.0f}
  • Spent This Month:  ₹{total_spent:,.0f}
  • EMI Outflow:       ₹{total_emi:,.0f}
  • Free Cash:         ₹{free_cash:,.0f}

KEY RATIOS:
  • Savings Rate:   {savings_rate}% (target ≥ 20%)
  • EMI-to-Income:  {emi_ratio}% (RBI safe limit ≤ 50%)
  • Expense Ratio:  {expense_ratio}% (ideal < 40%)
  • FOIR:           {round(emi_ratio + expense_ratio, 1)}%

BUDGET vs ACTUAL (this month):
{chr(10).join(cat_lines) if cat_lines else "  No categories set up yet"}

ACTIVE EMIs:
{chr(10).join(emi_lines) if emi_lines else "  No active EMIs"}

SAVINGS GOALS:
{chr(10).join(goal_lines) if goal_lines else "  No active goals"}

TOP SPENDING THIS MONTH:
{chr(10).join(txn_lines) if txn_lines else "  No transactions recorded yet"}
"""

        # Circle context for Chanakya
        circle_context_block = ""
        try:
            user_circle = await db.circles.find_one({"member_ids": user_id})
            if not user_circle:
                user_circle = await db.circles.find_one({"members": {"$elemMatch": {"user_id": user_id}}})
            if user_circle:
                circle_members = [m.get("name", "") for m in user_circle.get("members", [])]
                circle_id = user_circle.get("id", "")
                # This month's circle expenses
                now_dt = datetime.utcnow()
                month_prefix = f"{now_dt.year}-{now_dt.month:02d}"
                circle_exps = await db.circle_expenses.find(
                    {"circle_id": circle_id, "date": {"$regex": f"^{month_prefix}"}},
                    {"_id": 0}
                ).to_list(50)
                circle_month_total = sum(e.get("amount", 0) for e in circle_exps)

                # Build who owes who from expenses
                balances = {}
                for m in circle_members:
                    balances[m] = 0.0
                for exp in circle_exps:
                    paid_by = exp.get("paid_by", "")
                    split = exp.get("split_among", circle_members)
                    if not split:
                        split = circle_members
                    per_person = exp.get("amount", 0) / len(split) if split else 0
                    if paid_by in balances:
                        balances[paid_by] += exp.get("amount", 0) - per_person
                    for m in split:
                        if m != paid_by and m in balances:
                            balances[m] -= per_person

                balance_lines = []
                for m, bal in balances.items():
                    if abs(bal) > 1:
                        balance_lines.append(f"  - {m}: {'owes ₹' + str(round(-bal)) if bal < 0 else 'is owed ₹' + str(round(bal))}")

                circle_context_block = f"""
FAMILY CIRCLE ({user_circle.get('name', 'Our Circle')}):
Members: {', '.join(circle_members)}
Circle ID: {circle_id}
This month's shared spending: ₹{round(circle_month_total)}
{chr(10).join(balance_lines) if balance_lines else 'Balances are even.'}
Recent expenses: {', '.join([e.get('description', '') + ' ₹' + str(e.get('amount', '')) for e in circle_exps[-5:]])}
"""
        except Exception:
            pass

        financial_context += circle_context_block

        # Group expenses context for Chanakya
        group_context_block = ""
        try:
            _uname = current_user.get("name", "")
            user_groups = await db.expense_groups.find({"members": _uname}).to_list(10)
            if user_groups:
                _glines = []
                for grp in user_groups[:5]:
                    _gexps = await db.group_expenses.find({"group_id": grp.get("id","")}, {"_id":0}).to_list(30)
                    _gtotal = sum(e.get("amount",0) for e in _gexps)
                    _paid = sum(e.get("amount",0) for e in _gexps if e.get("paid_by") == _uname)
                    _n = len(grp.get("members",[])) or 1
                    _net = _paid - _gtotal / _n
                    _bal = f"you are owed ₹{round(_net)}" if _net > 1 else (f"you owe ₹{round(-_net)}" if _net < -1 else "settled")
                    _glines.append(f"  - {grp['name']} ({_n} members, total ₹{round(_gtotal)}, {_bal})")
                group_context_block = "\nGROUP EXPENSES:\n" + "\n".join(_glines) + "\n"
        except Exception:
            pass
        financial_context += group_context_block

        # Active goals context for contribute_goal action
        active_goals = await db.savings_goals.find({"user_id": _cb_uid, "status": {"$ne": "completed"}}).to_list(20)
        goals_ctx = "\n".join([f"- {g['name']} (id: {g['id']}, saved: ₹{g.get('current_amount', 0):.0f} of ₹{g.get('target_amount', 0):.0f})" for g in active_goals])

        # Upcoming calendar events (next 30 days) for context
        _cal_from = now_ist.strftime("%Y-%m-%d")
        _cal_to_dt = now_ist.replace(day=1) if now_ist.month == 12 else now_ist
        import calendar as _cal_mod
        _days_ahead = (now_ist + __import__("datetime").timedelta(days=30)).strftime("%Y-%m-%d")
        upcoming_events = await db.calendar_events.find(
            {"user_id": _cb_uid, "date": {"$gte": _cal_from, "$lte": _days_ahead}},
            {"_id": 0}
        ).sort("date", 1).to_list(10)
        cal_ctx = "\n".join([f"- {e['date']}: {e['title']} ({e.get('type','custom')}){' ₹' + str(int(e['amount'])) if e.get('amount') else ''}" for e in upcoming_events]) or "None"

        # Credit cards for chat context
        _cb_cards = await db.credit_cards.find({"user_id": _cb_uid, "is_active": True}, {"_id": 0}).to_list(20)
        cards_ctx = "\n".join([f"- {c['bank_name']} {c['card_name']} (id:{c['id']}, limit:₹{c['credit_limit']:,.0f}, balance:₹{c['outstanding_balance']:,.0f}, due day:{c.get('due_day',20)})" for c in _cb_cards]) or "None"

        # Notification prefs for chat context
        _notif_doc = await db.users.find_one({"id": _cb_uid}, {"notification_prefs": 1})
        _notif_raw = (_notif_doc or {}).get("notification_prefs") or {}
        _np = NotificationPrefs(**_notif_raw)
        notif_ctx = f"email_enabled:{_np.email_enabled}, whatsapp_enabled:{_np.whatsapp_enabled}, notify_emi:{_np.notify_emi}, notify_subscriptions:{_np.notify_subscriptions}, notify_birthdays:{_np.notify_birthdays}, notify_budget_summary:{_np.notify_budget_summary}, notify_savings_goals:{_np.notify_savings_goals}, notify_hand_loans:{_np.notify_hand_loans}, notify_salary:{_np.notify_salary}, notify_when_to_buy:{_np.notify_when_to_buy}"

        # Active trips for chat context (add_trip_expense)
        _cb_trips = await db.trips.find({"user_id": _cb_uid, "status": {"$in": ["planned", "booked", "ongoing"]}}, {"_id": 0}).to_list(20)
        trips_ctx = "\n".join([f"- {t['name'] if t.get('name') else t.get('destination', 'Trip')} (id:{t['id']}, dest:{t.get('destination','')}, {t.get('start_date','')} to {t.get('end_date','')})" for t in _cb_trips]) or "None"

        # All transactions this month — used for AI context (subscriptions, analysis, delete reference)
        # recent_txns already fetched above (month_start, up to 100). Build readable list from it.
        _recent_txns_ctx = sorted(recent_txns, key=lambda t: t.get("date", ""), reverse=True)[:80]
        recent_txns_ctx = "\n".join([
            f"- {t['date']} ₹{t.get('amount',0):,.0f} {t.get('description','')} [{t.get('type','expense')}] ({t.get('category_name','')})"
            for t in _recent_txns_ctx
        ]) or "None"

        # Recurring expenses / subscriptions for context
        _cb_recurring = await db.recurring_expenses.find(
            {"user_id": _cb_uid, "is_active": True}, {"_id": 0}
        ).to_list(50)
        _rec_total_monthly = sum(
            (r.get("amount", 0) if r.get("frequency") == "monthly" else
             r.get("amount", 0) * 4.33 if r.get("frequency") == "weekly" else
             r.get("amount", 0) / 12) for r in _cb_recurring
        )
        recurring_ctx = "\n".join([
            f"- {r.get('emoji','🔄')} {r['name']} ₹{r['amount']:,.0f}/{r.get('frequency','monthly')} ({r.get('category_name','')}) due day:{r.get('day_of_month','—')}"
            for r in _cb_recurring
        ]) or "None"
        recurring_ctx += f"\nTotal monthly recurring cost: ₹{_rec_total_monthly:,.0f}" if _cb_recurring else ""

        system_message = f"""You are Chanakya — a calm, warm, and knowledgeable friend who genuinely cares about {current_user['name']}'s financial wellbeing.

PERSONALITY:
- Talk like a close friend who knows money well — not an expert lecturing, just someone who's got your back
- Use {current_user['name'].split()[0]}'s name naturally, not every message
- Be specific — always use their real numbers, never generic advice
- Keep it short and human — 1-2 sentences usually enough, 3 max
- Never preachy, never alarming, never overwhelming
- Use ₹ for amounts. Use lakhs/crores for large numbers
- Calm and reassuring even when finances look tough

WHAT YOU KNOW:
- How EMIs work and when to pay them down faster
- Where money tends to leak in a monthly budget
- How to build savings around a goal
- When to start investing vs paying off debt
- Tax-saving basics (80C, NPS, HRA) — only when asked

RULES:
- Always use their real data below — never give generic responses when you have actual numbers
- If income or budget isn't set up yet, gently guide them to add it first
- Never say you're human or reveal your underlying model
- For specific investment products only: add "Check with a registered advisor before investing"
- SCOPE RESTRICTION (STRICT): You are ONLY a personal finance assistant for Budget Mantra. If the user asks about ANYTHING unrelated to personal finance, budgeting, expenses, goals, EMIs, investments, loans, trips, or Budget Mantra features — respond with exactly this message and nothing else: "I'm Chanakya, your personal finance assistant \U0001f64f I can only help with budgeting, expenses, goals, EMIs, investments, and trip planning. For everything else, please use a general assistant!" Examples of off-topic: weather, news, sports, recipes, coding help, general knowledge, entertainment, jokes, relationships, health advice.
- NEVER ask for passwords, PINs, OTPs, card numbers, CVV, Aadhaar, PAN, IFSC, net banking credentials, or any authentication credential — ever, under any circumstance
- If a user appears to share such data (despite the server-side guard), immediately respond with a safety reminder and do NOT process the data

ACTION HANDLING (CRITICAL — read carefully):
You handle 10 types of user actions. Two interaction modes:

COMPOUND ACTIONS — when a single user message clearly implies multiple distinct actions:
Return a JSON ARRAY instead of a single object:
[
  {{"action": "add_emi", "loan_name": "Car Loan", ...}},
  {{"action": "emi_payment", "loan_id": "...", ...}}
]

COMPOUND EXAMPLES (study these patterns):
• "I took a car loan ₹5L at 9% 60 months and paid first EMI today"
  → [add_emi, add_transaction(loan EMI amount, category: EMI/Finance)]

• "Got salary 85k, paid rent 15000 and electricity 1200"
  → [add_income(85000, salary), add_transaction(15000, rent), add_transaction(1200, utilities)]

• "Joined gym for ₹2000/month, paid today"
  → [add_recurring_expense(gym, 2000/month), add_transaction(2000, health/fitness)]

• "I lent Rahul 5000 and bought coffee for 200"
  → [add_hand_loan(lent, Rahul, 5000), add_transaction(200, food)]

• "Invested 50k in mutual funds and set a goal to save 2L by December"
  → [add_investment(50000), add_goal(2L, December)]

RULES for compound actions:
- Only use array when user clearly states multiple separate financial events in one message
- For simple statements, still return a single JSON object (not array)
- Each action in the array is complete and self-contained
- Max 5 actions per array
- If one part is ambiguous, include what's clear and ask about the rest in your response text — but you can't mix JSON array with text (choose one)
- NEVER infer income from fragments like "I have", "I got", "have something" — income requires an EXPLICIT amount + income keyword (salary, received, earned, got, paisa aaya)
- If the message contains "expenditure", "expense", "spent", "paid", "bought", "kharch" — treat as EXPENSE ONLY even if other words look ambiguous; do not add a parallel income action
- Voice transcription often garbles words (e.g. "an expense" → "I expense", "one thousand" → "1 thousand"). When a message looks garbled, parse only the clearly-stated intent; prefer doing less rather than guessing extra actions

CRITICAL — NEVER RE-LOG FROM CONTEXT:
- Do NOT include add_transaction in any response unless the user's current message explicitly mentions spending money (e.g. "spent 500 on swiggy", "paid 1200 rent")
- The "Recent transactions" list shown below is READ-ONLY — for delete/reference matching only. NEVER re-log any transaction that already appears there
- Do NOT include add_transaction in a compound array just because a transaction was mentioned in prior conversation history

MODE A — DIRECT: All required info is present in the message → respond ONLY with the matching JSON, no other text.

MODE B — GUIDED: User wants to do something but hasn't provided all details (e.g. "I want to add a loan", "set up a goal", "log an investment") → ask ONE focused question at a time, building up the details across turns. Use conversation history above to accumulate answers. Once you have all required fields, output the JSON. Keep questions short, natural, friendly.

GUIDED Q&A rules:
- Ask only ONE question per message — never a list of questions
- Use their name naturally if it helps
- When you have all fields, output the JSON immediately
- Required fields per action: EMI→loan name, amount, interest rate, tenure; Goal→name, target amount, date; Investment→type, name, amount; HandLoan→direction (lent/borrowed), person name, amount; CalendarEvent→title, date

1. EXPENSE — user spent money:
   Triggers: "spent X on Y", "paid X for Y", "bought Y for X", "200 chai", "swiggy 500"
   JSON: {{"action":"add_transaction","amount":<number>,"description":"<short desc>","category_guess":"<from list below>","date":"<YYYY-MM-DD or today>","is_recurring":false,"frequency":"monthly"}}
   If recurring keywords present (every month, monthly, har mahine, weekly, yearly, subscription), set "is_recurring":true and "frequency" to "monthly"/"weekly"/"yearly".

2. INCOME — user received money:
   Triggers: "salary 89000", "got 5000 freelance", "received bonus 10000", "paisa aaya 89k"
   ANTI-triggers (do NOT use add_income): "expenditure", "expense", "spent", "paid", "bought", "kharch" — if any of these appear, use add_transaction instead
   JSON: {{"action":"add_income","amount":<number>,"description":"<source name>","source_type":"<salary|freelance|rental|business|dividend|other>","date":"<YYYY-MM-DD or today>"}}
   Source type mapping: salary/paycheck/ctc→salary, freelance/consulting/invoice→freelance, rent received→rental, business/shop→business, dividend/interest/bonus/refund→dividend, else→other.

3. ADD EMI — user wants to log a new loan/EMI:
   Triggers: "add home loan 50 lakh 8.5% 20 years", "new car loan 800000 at 9% 60 months", "took personal loan 2 lakh", "loan liya 5 lakh 12% 36 months"
   JSON: {{"action":"add_emi","loan_name":"<descriptive name e.g. Home Loan>","loan_type":"<home|car|personal|education|other>","principal_amount":<number>,"interest_rate":<number annual %>,"tenure_months":<number>,"monthly_payment":<PMT-calculated number>,"start_date":"<YYYY-MM current month>","emi_debit_day":<day 1-31 or 5 if unknown>}}
   Calculate monthly_payment using PMT: P*r*(1+r)^n / ((1+r)^n - 1) where r=rate/12/100, n=tenure_months. Round to nearest integer.
   Loan type mapping: home loan/housing→home, car/vehicle/bike→car, personal/salary loan→personal, education/student→education, else→other.

4. EMI PAYMENT — user paid an EMI this month:
   Triggers: "paid home loan emi", "emi paid", "car loan payment done", "home loan paid this month"
   Look at their active EMIs in the financial data to match the loan name.
   JSON: {{"action":"emi_payment","loan_id":"<id from their active EMI list>","loan_name":"<matched loan name>","amount":<monthly_payment from their data>,"payment_date":"<today YYYY-MM-DD>"}}

5. ADD GOAL — user wants to create a new savings goal:
   Triggers: "saving for iPhone 80000", "want to buy car in 6 months", "set goal trip 50000", "new goal vacation 30000"
   JSON: {{"action":"add_goal","name":"<goal name>","target_amount":<number>,"target_date":"<YYYY-MM-DD>","category":"<general|travel|home|vehicle|education|emergency|other>","priority":"<low|medium|high>"}}
   Category mapping: trip/vacation/travel→travel, house/home/flat→home, car/bike/vehicle→vehicle, education/course/degree→education, emergency/medical→emergency, else→general.

6. CONTRIBUTE TO GOAL — user wants to add money to an existing savings goal:
   Triggers: "added 5000 to vacation goal", "put 10000 in iPhone fund", "contributed to my trip goal"
   Look at their active savings goals below to match the goal name and use its id.
   JSON: {{"action":"contribute_goal","goal_id":"<id from active goals list>","goal_name":"<matched goal name>","amount":<number>}}

7. ADD INVESTMENT — user wants to log an investment:
   Triggers: "bought stocks worth 50000", "invested 20000 in mutual funds", "added gold worth 30000", "put 10000 in PPF"
   JSON: {{"action":"add_investment","type":"<stocks|mutual_funds|gold|ppf|nps|fd|rd|real_estate>","name":"<investment name>","invested_amount":<number>,"current_value":<number or same as invested_amount>,"start_date":"<YYYY-MM-DD or today>","notes":"<optional>"}}
   Type mapping: stock/share/equity→stocks, mutual fund/mf/sip→mutual_funds, gold/sovereign bond→gold, ppf→ppf, nps→nps, fd/fixed deposit→fd, rd/recurring deposit→rd, property/real estate/flat→real_estate.

8. HAND LOAN — user lent money to or borrowed money from someone:
   Triggers: "lent 5000 to Rahul", "gave 2000 to mom", "borrowed 10000 from friend", "took 5000 from Priya"
   JSON: {{"action":"add_hand_loan","loan_type":"<lent|borrowed>","person_name":"<name>","amount":<number>,"date":"<YYYY-MM-DD or today>","due_date":"<YYYY-MM-DD if mentioned>","reason":"<optional reason>"}}
   loan_type: gave/lent/loaned→lent; borrowed/took/received from→borrowed.

9. ADD CIRCLE EXPENSE — user wants to log a shared family/household expense in their circle:
   Triggers: "split dinner 1200 with partner", "add circle expense groceries 800", "paid rent 15000 for circle", "shared expense coffee 300", "family spent", "household expense", "home expense", "we spent"
   JSON: {{"action":"add_circle_expense","description":"<what>","amount":<number>,"paid_by":"<who paid>","date":"<YYYY-MM-DD>"}}

10. EMI ADVICE / QUERY — user asking about EMIs, pre-closure, interest savings, loan burden:
   Triggers: "should I pre-close home loan", "which loan to pay first", "how much interest will I save", "emi kitna hai", "when will loan be over"
   Respond in plain conversational text using their real EMI data. For pre-closure advice: calculate interest saved (remaining_balance * rate/100/12 * remaining_months / 2 ≈ rough estimate) and give a clear recommendation. Keep it to 3-4 lines max.

Available expense categories: {", ".join(c["name"] for c in categories if c["type"] == "expense")}
Active EMIs (use loan id for emi_payment): {", ".join(f"{e['loan_name']} (id:{e['id']}, ₹{e['monthly_payment']:,.0f}/mo)" for e in emis[:8]) if emis else "None"}
Active savings goals (use id for contribute_goal): {goals_ctx or "None"}
Upcoming calendar events (next 30 days): {cal_ctx}
Credit cards (use id for log_credit_card_expense): {cards_ctx}
Current notification settings: {notif_ctx}
Active trips (use id for add_trip_expense): {trips_ctx}
Recurring expenses & subscriptions (active): {recurring_ctx}
This month's transactions — READ-ONLY, for analysis, subscription detection, and delete/reference (do NOT re-log these): {recent_txns_ctx}

SUBSCRIPTION AWARENESS: Common subscription services and their RAW BANK/UPI transaction names to recognise:
- Apple: "APPLE MEDIA SERVICES", "APPLE.COM/BILL", "APPLE ONE", "ITUNES", "APL*", "APPLE MUSIC", "APPLE TV", "ICLOUD" — these are ALL Apple subscription charges, not one-time purchases
- Google: "GOOGLE *PLAY", "GOOGLE PLAY", "GOOGLE ONE", "GOOGLE STORAGE", "YOUTUBE PREMIUM", "GOOGLE *"
- Meta/WhatsApp: "META *", "WHATSAPP BUSINESS"
- Streaming: "NETFLIX", "HOTSTAR", "DISNEY+", "PRIMEVIDEO", "AMAZON PRIME", "ZEE5", "SONYLIVSUB", "JIOCINEMAPAID", "JIOSAAVN", "GAANA"
- Music: "SPOTIFY", "SPOTIFY AB", "APPLE MUSIC", "JIOSAAVN PRO", "YOUTUBE MUSIC"
- SaaS: "OPENAI *CHATGPT", "NOTION", "CANVA", "FIGMA", "SLACK", "GITHUB", "DROPBOX", "ADOBE", "MICROSOFT 365", "MSFT *", "1PASSWORD", "NORDVPN"
- Food: "SWIGGY ONE", "ZOMATO GOLD", "ZOMATOPRO"
- Health/Fitness: "HEALTHIFYME", "CULT.FIT", "HEADSPACE", "PHARMEASY"
- Education: "DUOLINGO", "LINKEDIN PREMIUM", "AUDIBLE", "KINDLE UNLIMITED"
- Gaming: "GAME PASS", "PLAYSTATION", "BGMI", "PUBG"
When a user asks about subscriptions OR uploads transactions: (1) check the recurring_expenses list above, AND (2) scan ALL recent transactions for the above merchant keywords — even partial matches like "APPLE" in "APPLE MEDIA SERVICES" count. If you find transactions that look like subscriptions but are NOT in the recurring_expenses list, proactively flag them and ask the user if they want to set them up as recurring expenses.

PROACTIVE RECURRING DETECTION: When a user uploads data (SMS/bank statement) or asks "what subscriptions do I have" / "check my transactions" — actively scan descriptions for subscription-like merchants. For any found that aren't already recurring, say: "I noticed [merchant] ₹X — this looks like a subscription. Want me to add it as a recurring expense?" Then if they say yes, use action add_recurring_expense.

11. ADD CALENDAR EVENT — user wants to mark a date/reminder on their financial calendar:
   Triggers: "remind me salary on 1st", "mark trip to Goa next month", "add event birthday March 15", "note EMI due 5th", "schedule meeting on 20th", "paycheck coming on 25th"
   JSON: {{"action":"add_calendar_event","title":"<event title>","date":"<YYYY-MM-DD>","type":"<custom|paycheck|trip|goal|emi|people>","amount":<number or null>,"notes":"<optional>"}}
   Type mapping: salary/paycheck/income received→paycheck, trip/travel/vacation→trip, goal milestone→goal, EMI/loan due→emi, birthday/anniversary→people, else→custom.
   Date: parse natural language — "1st" = 1st of current/next month, "next Friday" = calculate from today ({now_ist.strftime("%Y-%m-%d")}), "March 15" = {now_ist.year}-03-15.

12. NOTIFICATION SETTINGS — user wants to turn on/off email notifications or specific alert types:
   Triggers: "turn on email notifications", "disable EMI reminders", "enable budget summary", "turn off birthday alerts", "mute salary notifications", "stop hand loan alerts"
   Current settings are shown above. Only include keys the user is changing — leave others unchanged.
   JSON: {{"action":"set_notification_prefs","email_enabled":<true|false>,"notify_emi":<true|false>,"notify_subscriptions":<true|false>,"notify_birthdays":<true|false>,"notify_budget_summary":<true|false>,"notify_savings_goals":<true|false>,"notify_hand_loans":<true|false>,"notify_salary":<true|false>,"notify_when_to_buy":<true|false>}}
   Only include the keys being changed in the JSON — omit unchanged ones.

13. ADD GOLD — user bought/holds physical gold, SGB, or Gold ETF:
   Triggers: "bought 10g gold at 6800/g", "have 50g 22k gold jewellery", "invested in SGB 5 units at 5800", "added gold ETF 20 units"
   JSON: {{"action":"add_gold","name":"<descriptive name>","type":"<physical|sgb|gold_etf|digital>","karat":<24|22|18>,"weight_grams":<grams if physical/digital>,"quantity":<units if sgb/etf>,"purchase_price_per_gram":<price if physical>,"purchase_price_per_unit":<price if sgb/etf>,"purchase_date":"<YYYY-MM-DD or today>","notes":"<optional>"}}
   type mapping: jewellery/coin/bar/biscuit→physical, sovereign gold bond/SGB→sgb, gold etf/goldbees→gold_etf, digital gold/paytm gold→digital.

14. ADD SILVER — user bought/holds physical silver or Silver ETF:
   Triggers: "bought 100g silver at 90/g", "have silver coins 200g", "silver ETF 50 units"
   JSON: {{"action":"add_silver","name":"<descriptive name>","type":"<physical|silver_etf|digital>","purity":<999|925|800>,"weight_grams":<grams if physical>,"quantity":<units if etf>,"purchase_price_per_gram":<price if physical>,"purchase_price_per_unit":<price if etf>,"purchase_date":"<YYYY-MM-DD or today>","notes":"<optional>"}}

15. LOG CREDIT CARD EXPENSE — user spent on a credit card:
   Triggers: "paid 2000 for dinner on HDFC card", "Amazon 1500 on credit card", "used SBI card for 5000 shopping"
   Look at credit cards above to match the card. If only one card, use that.
   JSON: {{"action":"log_credit_card_expense","card_id":"<id from credit cards list>","card_name":"<matched card name>","amount":<number>,"description":"<what>","category":"<Shopping|Food|Travel|Bills|Entertainment|Health|Other>","date":"<YYYY-MM-DD>"}}

16. ADD RECURRING EXPENSE — user wants to set up an auto-recurring bill/subscription:
   Triggers: "set up Netflix 649 monthly", "add electricity bill 1200 every month", "recurring rent 15000 on 1st", "subscribe gym 2000 monthly", "yes add it as recurring", "yes make it recurring", "yes set it up", "add Apple as recurring", "make that recurring"
   Also triggered when user confirms a proactive suggestion (e.g. you suggested "APPLE MEDIA SERVICES looks like a subscription, want to add it?" and user says "yes").
   Requires: name, amount, which category, frequency, which day. If converting from a transaction, use that transaction's amount and infer frequency as monthly. Ask only for missing info.
   JSON: {{"action":"add_recurring_expense","name":"<expense name>","amount":<number>,"category_name":"<from expense categories>","frequency":"<monthly|weekly|yearly>","day_of_month":<1-28>,"start_date":"<YYYY-MM-DD>","emoji":"<relevant emoji>"}}

17. LOG GIFT — user gave or received a gift:
   Triggers: "gave Priya a gift worth 500", "received saree from mom for birthday 1200", "gifted Rahul 1000 for wedding", "got flowers worth 300 from friend"
   JSON: {{"action":"add_gift","person_name":"<name>","direction":"<given|received>","occasion":"<Birthday|Wedding|Anniversary|Festival|Other>","gift_description":"<what>","amount":<number>,"date":"<YYYY-MM-DD or today>"}}
   direction: gave/gifted/sent→given; received/got→received.

19. CREATE CIRCLE — user wants to create a family circle to track shared household expenses:
   Triggers: "create a circle", "start a group for expenses", "new circle for roommates", "make a circle called Home", "create family circle", "track family expenses"
   JSON: {{"action":"create_circle","name":"<circle name, default 'Our Circle'>"}}

20. JOIN CIRCLE — user wants to join an existing circle with an invite code:
   Triggers: "join circle ABC123", "I have an invite code XYZ", "add me to circle with code ABC"
   JSON: {{"action":"join_circle","invite_code":"<6-char code>"}}

18. UPDATE PROFILE — user wants to change their name, phone, email, or date of birth:
   Triggers: "change my name to Rohan", "update my phone to 9876543210", "my email is me@gmail.com", "my birthday is 1995-08-15", "set DOB 15 Aug 1995"
   JSON: {{"action":"update_profile","name":"<new name if changing>","phone":"<10-digit if changing>","email":"<email if changing>","dob":"<YYYY-MM-DD if changing>"}}
   Only include keys the user wants to change.

21. IMPORT SMS TRANSACTIONS — user pastes raw bank/UPI SMS messages and wants to import them:
   Triggers: user pastes SMS text, "import from SMS", "parse these messages", "add transactions from SMS"
   Extract the raw SMS text from the user's message.
   JSON: {{"action":"import_sms_transactions","data":{{"text":"<the raw SMS text the user pasted>"}}}}

22. ADD TRIP — user wants to create a new trip / travel plan:
   Triggers: "plan a trip to Goa", "create trip Mumbai next month", "add trip Shimla in April", "new trip for family vacation"
   JSON: {{"action":"add_trip","data":{{"name":"<trip name>","destination":"<destination>","start_date":"<YYYY-MM-DD>","end_date":"<YYYY-MM-DD>","budget":<optional number>}}}}

23. ADD TRIP EXPENSE — user wants to log an expense for an existing trip:
   Triggers: "add hotel 5000 to Goa trip", "log expense 1200 food in Mumbai trip", "add ₹800 auto expense to Shimla trip", "Priya paid 3000 for dinner on Goa trip"
   Look at active trips above to match the trip by name. Use the trip's id.
   JSON: {{"action":"add_trip_expense","data":{{"trip_name":"<partial trip name>","description":"<what was spent on>","amount":<number>,"paid_by":"<who paid, default user's name>","date":"<YYYY-MM-DD or today>"}}}}

24. DELETE TRANSACTION — user wants to undo, remove, or delete a specific transaction:
   Triggers: "delete that expense", "remove the coffee transaction", "undo the 500 swiggy entry", "delete transaction", "remove last transaction"
   Look at recent transactions above to match by description and/or amount.
   JSON: {{"action":"delete_transaction","data":{{"description":"<description to match>","amount":<optional number>,"date":"<YYYY-MM-DD optional>"}}}}

25. ADD CATEGORY — user wants to create a new budget category:
   Triggers: "add a category for pets", "create new income category side hustle", "add expense category gaming", "new category called hobbies"
   JSON: {{"action":"add_category","data":{{"name":"<category name>","type":"<expense|income>","icon":"<relevant emoji>"}}}}

26. PLAN TRIP (GUIDED) — user wants to plan a trip or major purchase with Chanakya's help:
   Triggers: "plan a trip to Goa", "help me plan vacation", "I want to go to Manali", "planning a trip", "want to travel"

   This is a GUIDED flow — ask ONE focused question at a time. Check conversation history above to see what you've already collected. NEVER ask for info already given.

   Required fields (collect in this order if not yet known):
   1. Destination — if not given yet, ask: "Where are you thinking of going? 🌍"
   2. Dates — if not given yet, ask: "When are you planning to go? (rough dates or month is fine)"
   3. People + Budget — combine into one question: "How many people are going, and what's your total budget?"
   4. Preferences — ask: "Any preferences? (beach vs hills, budget stay vs hotel, adventure vs relaxed)"

   IMPORTANT GUIDED Q&A RULES:
   - Always check conversation history first — do NOT re-ask something already answered
   - If user gives a date when you asked for destination, acknowledge it ("Got it, June 10!") and then ask for destination
   - If user gives destination when you asked for dates, acknowledge it and ask for dates
   - Accept partial/rough answers — "around June" is fine for dates, "2-3 people" is fine for count
   - If budget is not given, use null and generate itinerary anyway
   - Summarise what you know before asking the last question: "So — Goa, June 10-15, 3 people, ₹30,000 budget. Any preferences for the trip?"

   REQUIRED info before firing: destination + at least one date/month + origin city (where they're flying FROM — ask if not mentioned)
   Once you have all three → output ONLY the JSON below, nothing else — no preamble, no explanation:
   {{"action":"plan_trip","data":{{"name":"<trip name e.g. Goa Trip>","destination":"<destination>","start_date":"<YYYY-MM-DD or best guess>","end_date":"<YYYY-MM-DD or best guess>","budget":<number or null>,"members":<count or 1>,"preferences":"<preferences string or empty>","origin_city":"<city they are flying from, e.g. Bangalore>"}}}}

BARE QUICK-ACTION COMMANDS — when user sends ONLY one of these with no details, start guided Q&A immediately (ask the first question, don't just acknowledge):
- "Add Expense" / "Add expense" → ask: "What did you spend on, and how much?"
- "Add Income" / "Add income" → ask: "How much did you receive, and what was it for?"
- "Add EMI" / "Add emi" → ask: "What's the loan for? (e.g. home loan, car loan)"
- "Add Goal" / "Add goal" → ask: "What are you saving for? And how much do you need?"

GUIDED Q&A GLOBAL RULES (apply to all guided flows — EMI, Goal, Investment, Trip):
- Use conversation history to track what's been collected — NEVER ask for the same info twice
- Ask max 1 question per reply
- Acknowledge what the user just said before asking the next question
- If user gives multiple pieces of info at once, collect them all and ask only for what's still missing
- Keep questions short and conversational — no bullet lists, no forms
- CRITICAL: When firing a JSON action, output ONLY the raw JSON object — no text before it, no text after it, no markdown code fences. Pure JSON only.

If you cannot determine the action or the message is a question/advice request, respond normally in plain conversational text. Keep responses short — 2-3 lines max unless asked for detail.

{financial_context}"""

        # ── LAYER 1: Intent Engine (instant, no API call) ──────────────────────
        expense_cat_names = [c["name"] for c in categories if c["type"] == "expense"]
        intent_result = parse_message(input.message, expense_cat_names)

        # EMI due-soon check (within 7 days)
        emi_due_soon = []
        for e in emis:
            due_day = e.get("due_date_day", 5)
            days_until = (due_day - now_ist.day) % 30
            if days_until <= 7:
                emi_due_soon.append({"name": e["loan_name"], "amount": e["monthly_payment"], "days": days_until})

        # Goal context for insight engine
        goal_ctx = []
        for g in savings_goals:
            try:
                days_left = (datetime.strptime(g['target_date'], '%Y-%m-%d') - now_ist.replace(tzinfo=None)).days
            except Exception:
                days_left = 999
            progress = round(g['current_amount'] / g['target_amount'] * 100) if g['target_amount'] > 0 else 0
            goal_ctx.append({"name": g["name"], "progress": progress, "days_left": max(0, days_left)})

        user_ctx = {
            "free_cash":       free_cash,
            "monthly_income":  total_income,
            "total_spent":     total_spent,
            "total_emi":       total_emi,
            "savings_rate":    savings_rate,
            "emi_ratio":       emi_ratio,
            "category_spent":  {c["name"]: c.get("spent_amount", 0) for c in categories if c["type"] == "expense"},
            "category_budget": {c["name"]: c.get("allocated_amount", 0) for c in categories if c["type"] == "expense"},
            "goals":           goal_ctx,
            "emi_due_soon":    emi_due_soon,
        }

        async def _log_entries(entries: list) -> list:
            """Insert parsed entries into DB. Returns list of logged entries."""
            logged = []
            ist_now = datetime.now(pytz.timezone("Asia/Kolkata"))
            _today_iso = ist_now.strftime("%Y-%m-%d")
            for e in entries:
                # Clamp future dates to today
                if e.get("date") and e["date"] > _today_iso:
                    e["date"] = _today_iso
                if e.get("intent") == "expense" and e.get("amount"):
                    # Match category object
                    matched = next(
                        (c for c in categories if c["type"] == "expense" and c["name"] == e.get("category")),
                        next((c for c in categories if c["type"] == "expense"), None)
                    )
                    if matched:
                        txn = {
                            "id": str(__import__("uuid").uuid4()),
                            "user_id": _cb_uid,
                            "family_group_id": current_user.get("family_group_id"),
                            "category_id": matched["id"],
                            "category_name": matched["name"],
                            "amount": e["amount"],
                            "description": e.get("description", e["raw"]),
                            "type": "expense",
                            "date": e.get("date", ist_now.strftime("%Y-%m-%d")),
                            "source": "chanakya",
                        }
                        await db.transactions.insert_one(txn)
                        await db.budget_categories.update_one(
                            {"id": matched["id"]},
                            {"$inc": {"spent_amount": e["amount"]}}
                        )
                        # If recurring, also create a recurring_expenses entry
                        if e.get("is_recurring"):
                            _freq = e.get("frequency", "monthly")
                            _date_str = e.get("date", ist_now.strftime("%Y-%m-%d"))
                            try:
                                _day = int(_date_str.split("-")[2])
                            except Exception:
                                _day = ist_now.day
                            _rec_doc = {
                                "id": str(__import__("uuid").uuid4()),
                                "user_id": _cb_uid,
                                "family_group_id": current_user.get("family_group_id"),
                                "name": e.get("description", e["raw"]),
                                "amount": e["amount"],
                                "category_id": matched["id"],
                                "category_name": matched["name"],
                                "description": e.get("description", e["raw"]),
                                "frequency": _freq,
                                "day_of_month": _day,
                                "start_date": _date_str,
                                "end_date": "",
                                "emoji": "🔄",
                                "is_active": True,
                                "last_created_date": _date_str,
                                "created_at": ist_now.isoformat(),
                                "source": "chanakya",
                            }
                            await db.recurring_expenses.insert_one(_rec_doc)
                            # Notify user about the recurring setup
                            from calendar import month_abbr as _mabbr
                            _next_lbl = f"every month on the {_day}" if _freq == "monthly" else f"every {_freq}"
                            asyncio.ensure_future(_insert_system_chat(
                                _cb_uid,
                                f"🔄 Got it! I've set up **{e.get('description', e['raw'])}** as a recurring {_freq} expense of ₹{e['amount']:,.0f} ({_next_lbl}). I'll auto-log it each cycle and remind you 3 days before.",
                                notification_type="recurring_setup"
                            ))
                        # Update user_ctx for accurate footer
                        user_ctx["category_spent"][matched["name"]] = \
                            user_ctx["category_spent"].get(matched["name"], 0) + e["amount"]
                        user_ctx["free_cash"] = user_ctx["free_cash"] - e["amount"]
                        e["category"] = matched["name"]
                        logged.append(e)

                elif e.get("intent") == "income" and e.get("amount"):
                    # Log as income entry
                    income_doc = {
                        "id": str(__import__("uuid").uuid4()),
                        "user_id": _cb_uid,
                        "family_group_id": current_user.get("family_group_id"),
                        "source": e.get("description", "Income"),
                        "amount": e["amount"],
                        "date": e.get("date", ist_now.strftime("%Y-%m-%d")),
                        "source_type": e.get("source_type", "other"),
                        "created_at": ist_now.isoformat(),
                    }
                    await db.income_entries.insert_one(income_doc)
                    user_ctx["free_cash"] = user_ctx["free_cash"] + e["amount"]
                    logged.append(e)

            return logged

        # ── Persist one conversation turn (user msg + assistant reply) ──────
        import asyncio as _asyncio
        async def _save_turn(asst_text: str, *, pending_entries_out=None):
            """Non-blocking: save user + assistant messages to chat_messages."""
            try:
                _now = datetime.now(pytz.timezone("Asia/Kolkata"))
                u_doc = {
                    "user_id":    current_user['id'],
                    "role":       "user",
                    "content":    input.message,
                    "timestamp":  _now,
                    "pinned":     False,
                    "deleted":    False,
                    "reply_to":   input.reply_to,
                    "attachment": input.attachment,
                }
                a_doc = {
                    "user_id":    current_user['id'],
                    "role":       "assistant",
                    "content":    asst_text,
                    "timestamp":  _now,
                    "pinned":     False,
                    "deleted":    False,
                    "reply_to":   None,
                    "attachment": None,
                    "pending_entries": pending_entries_out,
                }
                await _asyncio.gather(
                    db.chat_messages.insert_one(u_doc),
                    db.chat_messages.insert_one(a_doc),
                    return_exceptions=True,
                )
            except Exception as _e:
                logger.error(f"[SaveTurn] {_e}")

        # Check if user is confirming/cancelling
        CONFIRM_WORDS = {"yes", "y", "yep", "yeah", "correct", "right", "ok", "okay",
                         "haan", "ha", "done", "go ahead", "log it", "confirm", "add it",
                         "yes delete", "delete it", "yes, delete", "confirm delete"}
        CANCEL_WORDS  = {"no", "nope", "cancel", "stop", "nahi", "mat", "don't", "dont",
                         "fix it", "wrong", "change it", "let me fix"}
        msg_lower     = input.message.strip().lower()
        is_confirmation = msg_lower in CONFIRM_WORDS or msg_lower.startswith("yes") or msg_lower.startswith("haan")
        is_cancellation = msg_lower in CANCEL_WORDS

        # ── Handle pending DELETE confirmation (double-sure) ──────────────────
        if input.pending_delete and is_confirmation:
            pd = input.pending_delete
            try:
                txn = await db.transactions.find_one({"_id": ObjectId(pd["transaction_id"])})
                if txn:
                    if txn.get("category_id"):
                        await db.budget_categories.update_one(
                            {"id": txn["category_id"]},
                            {"$inc": {"spent_amount": -txn.get("amount", 0)}}
                        )
                    await db.transactions.delete_one({"_id": ObjectId(pd["transaction_id"])})
                    name = current_user.get('name', '').split()[0]
                    response_text = f"Done — *{pd.get('description', 'entry')}* (₹{pd.get('amount', 0):,.0f}) has been removed from your records, {name}."
                else:
                    response_text = "Couldn't find that entry — it may have already been deleted."
            except Exception:
                response_text = "Something went wrong while deleting. Try again."
            await _save_turn(response_text)
            return {"response": response_text, "status": "deleted", "layer": 1}

        if input.pending_delete and is_cancellation:
            _rt = "No worries — keeping it as is."
            await _save_turn(_rt)
            return {"response": _rt, "status": "success", "layer": 1}

        # ── Handle pending EDIT confirmation ──────────────────────────────────
        if input.pending_edit and is_confirmation:
            pe = input.pending_edit
            try:
                update_fields = {}
                if pe.get("new_amount"):      update_fields["amount"]       = float(pe["new_amount"])
                if pe.get("new_category"):    update_fields["category_name"] = pe["new_category"]
                if pe.get("new_description"): update_fields["description"]  = pe["new_description"]
                if update_fields:
                    await db.transactions.update_one(
                        {"_id": ObjectId(pe["transaction_id"])},
                        {"$set": update_fields}
                    )
                    if pe.get("new_amount") and pe.get("old_amount") and pe.get("category_id"):
                        diff = float(pe["new_amount"]) - float(pe["old_amount"])
                        await db.budget_categories.update_one(
                            {"id": pe["category_id"]}, {"$inc": {"spent_amount": diff}}
                        )
                    response_text = f"Updated! *{pe.get('description', 'entry')}* has been corrected."
                else:
                    response_text = "Nothing to change — what did you want to update?"
            except Exception:
                response_text = "Couldn't update that entry. Try again."
            await _save_turn(response_text)
            return {"response": response_text, "status": "updated", "layer": 1}

        # ── Handle pending LOG confirmation (entries waiting for confirm) ──────
        pending_entries_list = input.pending_entries or []
        if pending_entries_list and is_confirmation:
            logged = await _log_entries(pending_entries_list)
            if logged:
                if len(logged) > 1:
                    response_text = format_bulk_response(logged, user_ctx)
                else:
                    response_text = format_single_response(logged[0], user_ctx)
                await _save_turn(response_text)
                return {"response": response_text, "status": "success", "layer": 1, "pending_entries": None}

        if pending_entries_list and is_cancellation:
            _rt = "Sure — tell me what to change and I'll fix it."
            await _save_turn(_rt)
            return {"response": _rt, "status": "success", "layer": 1}

        # ── DELETE INTENT — find transaction, ask for confirmation ────────────
        if intent_result.get("type") == "delete":
            from intent_engine import extract_description as _extract_desc
            _undo_phrases = {"wrong entry", "wrong expense", "undo", "undo that",
                             "undo last", "that was wrong", "delete last", "remove last",
                             "scratch that", "cancel that", "revert that"}
            _is_undo = input.message.strip().lower() in _undo_phrases

            # For generic undo phrases, always grab the most recently INSERTED entry
            # (sort by _id only — avoids future-dated entries appearing wrong)
            if _is_undo:
                recent = await db.transactions.find(
                    {**family_filter}
                ).sort([("_id", -1)]).limit(5).to_list(5)
                match = recent[0] if recent else None
            else:
                # Specific delete — try keyword match against last 10 by insertion order
                keywords = _extract_desc(input.message).lower().split()
                recent = await db.transactions.find(
                    {**family_filter}
                ).sort([("_id", -1)]).limit(10).to_list(10)
                match = None
                if keywords:
                    for txn in recent:
                        desc = (txn.get("description", "") + " " + txn.get("category_name", "")).lower()
                        if any(kw in desc for kw in keywords if len(kw) > 2):
                            match = txn
                            break
                if not match and recent:
                    match = recent[0]

            if match:
                fmt_amt  = f"₹{match.get('amount', 0):,.0f}"
                fmt_date = match.get("date", "")
                fmt_desc = match.get("description", match.get("category_name", "entry"))
                _pd_payload = {
                    "transaction_id": str(match["_id"]),
                    "description":    fmt_desc,
                    "amount":         match.get("amount", 0),
                    "date":           fmt_date,
                    "category_id":    match.get("category_id"),
                    "category_name":  match.get("category_name"),
                }
                _rt = (
                    f"I found: *{fmt_desc}* — {fmt_amt} on {fmt_date}.\n\n"
                    f"⚠️ Are you sure you want to *delete this*? This can't be undone."
                )
                await _save_turn(_rt)
                return {"response": _rt, "status": "success", "layer": 1, "pending_delete": _pd_payload}
            else:
                _rt = "I couldn't find any recent transactions to delete. What exactly did you want to remove?"
                await _save_turn(_rt)
                return {"response": _rt, "status": "success", "layer": 1}

        # ── EDIT INTENT — find transaction, ask what to change ────────────────
        if intent_result.get("type") == "edit":
            from intent_engine import parse_amount as _pa
            recent = await db.transactions.find(
                {**family_filter}
            ).sort([("date", -1), ("_id", -1)]).limit(5).to_list(5)
            if recent:
                last = recent[0]
                new_amt = _pa(input.message)
                fmt_desc = last.get("description", last.get("category_name", "entry"))
                if new_amt and new_amt != last.get("amount"):
                    _pe_payload = {
                        "transaction_id": str(last["_id"]),
                        "description":   fmt_desc,
                        "old_amount":    last.get("amount", 0),
                        "new_amount":    new_amt,
                        "category_id":   last.get("category_id"),
                    }
                    _rt = (
                        f"Got it — change *{fmt_desc}* from ₹{last.get('amount',0):,.0f} to ₹{new_amt:,.0f}?\n"
                        f"Reply *yes* to confirm."
                    )
                    await _save_turn(_rt)
                    return {"response": _rt, "status": "success", "layer": 1, "pending_edit": _pe_payload}
                else:
                    _rt = f"Sure — last entry was *{fmt_desc}* (₹{last.get('amount',0):,.0f} on {last.get('date','')}). What do you want to change — the amount, category, or description?"
                    await _save_turn(_rt)
                    return {"response": _rt, "status": "success", "layer": 1}
            _rt = "I don't see any recent entries to edit. What were you trying to change?"
            await _save_turn(_rt)
            return {"response": _rt, "status": "success", "layer": 1}

        # ── CONVERT-TO-ONETIME INTENT ────────────────────────────────────────────
        if intent_result.get("type") == "convert_to_onetime":
            from intent_engine import extract_description as _extract_desc2
            _kws = _extract_desc2(input.message).lower().split()
            _recs = await db.recurring_expenses.find(
                {"user_id": _cb_uid, "is_active": True}, {"_id": 0}
            ).to_list(200)
            _match_rec = None
            if _kws:
                for _r in _recs:
                    _rname = (_r.get("name", "") + " " + _r.get("description", "")).lower()
                    if any(k in _rname for k in _kws if len(k) > 2):
                        _match_rec = _r
                        break
            if _match_rec:
                await db.recurring_expenses.update_one(
                    {"id": _match_rec["id"]},
                    {"$set": {"is_active": False}}
                )
                _rt = (
                    f"✅ Done! *{_match_rec.get('name')}* (₹{_match_rec.get('amount', 0):,.0f}/{_match_rec.get('frequency', 'monthly')}) "
                    f"is no longer recurring. It won't auto-log next cycle. "
                    f"I've kept all past entries as-is."
                )
            elif _recs:
                # List active recurring so user can pick
                _names = ", ".join(r.get("name", "") for r in _recs[:5])
                _rt = f"Which recurring expense did you mean? Your active ones: {_names}. Say the name and I'll make it one-time."
            else:
                _rt = "You don't have any active recurring expenses set up yet."
            await _save_turn(_rt)
            return {"response": _rt, "status": "success", "layer": 1}

        # If message starts with a negation word but still has entries, it's
        # ambiguous (e.g. "no I want to add 500 medicine") — force confirmation.
        _negation_start = re.match(r'^(no|nope|nahi|mat|na)\b', input.message.strip(), re.IGNORECASE)
        if _negation_start and intent_result["entries"] and not input.pending_entries:
            intent_result["confidence"] = min(intent_result["confidence"], 0.7)

        # Voice input — always confirm before logging regardless of confidence
        if input.is_voice and intent_result["entries"] and not input.pending_entries:
            intent_result["confidence"] = min(intent_result["confidence"], 0.84)

        # If Chanakya's last message was a question (guided Q&A in progress),
        # skip Layer 1 and let Claude handle the answer — e.g. user replied
        # "jun 10 2026" to "where are you heading?" and Layer 1 would wrongly
        # parse the date number as an amount.
        _last_asst_msg = await db.chat_messages.find_one(
            {"user_id": _cb_uid, "role": "assistant", "deleted": {"$ne": True}},
            sort=[("timestamp", -1)]
        )
        _in_guided_qa = bool(
            _last_asst_msg and "?" in _last_asst_msg.get("content", "")
        )
        if _in_guided_qa:
            intent_result["entries"] = []
            intent_result["needs_claude"] = True

        # ── Duplicate detection — check before logging ────────────────────────
        # For single expense/income entries, check if an identical entry was logged
        # in the last 24h. If yes, force confirmation and surface the existing entry
        # so the user can decide.
        if intent_result["entries"] and not input.pending_entries:
            _dup_window = ist_now - __import__("datetime").timedelta(hours=24)
            for _entry in intent_result["entries"]:
                _e_amount = _entry.get("amount")
                _e_desc   = (_entry.get("description") or "").lower().strip()
                if not _e_amount or not _e_desc:
                    continue
                _dup_candidates = await db.transactions.find({
                    "user_id": _cb_uid,
                    "amount": _e_amount,
                    "created_at": {"$gte": _dup_window.isoformat()},
                }).to_list(5)
                for _dc in _dup_candidates:
                    _dc_desc = (_dc.get("description") or "").lower().strip()
                    # Simple similarity: first 4 chars match or exact match
                    if _dc_desc and (_dc_desc[:4] == _e_desc[:4] or _dc_desc == _e_desc):
                        _dup_date = _dc.get("date", "today")
                        _dup_confirmation_text = (
                            f"\u26a0\ufe0f Heads up — I can see you already logged "
                            f"**{_dc.get('description', _e_desc)}** for **\u20b9{_e_amount:,.0f}** on {_dup_date}.\n\n"
                            f"Do you want to log it again? (maybe it\u2019s a different purchase)\n\n"
                            f"Reply **yes** to log it, or **no** to skip."
                        )
                        await _save_turn(_dup_confirmation_text, pending_entries_out=intent_result["entries"])
                        return {
                            "response": _dup_confirmation_text,
                            "status": "success",
                            "layer": 1,
                            "pending_entries": intent_result["entries"],
                        }

        # High-confidence Layer 1 — log directly (>0.85 confidence)
        if intent_result["entries"] and intent_result["confidence"] >= 0.85:
            logged = await _log_entries(intent_result["entries"])
            if logged:
                if intent_result["type"] == "bulk":
                    response_text = format_bulk_response(logged, user_ctx)
                else:
                    response_text = format_single_response(logged[0], user_ctx)

                await db.ai_usage.update_one(
                    {"user_id": current_user['id'], "feature": "chatbot", "date": today_key},
                    {"$inc": {"count": 1}}, upsert=True
                )
                updated_doc = await db.ai_usage.find_one({"user_id": current_user['id'], "feature": "chatbot", "date": today_key})
                used_now = updated_doc.get("count", 1) if updated_doc else 1
                messages_left = None if is_pro else max(0, daily_limit - used_now)
                await _save_turn(response_text)
                return {"response": response_text, "status": "success", "messages_left": messages_left, "layer": 1}

        # Medium-confidence Layer 1 (0.6–0.85) — confirm before logging
        if intent_result["entries"] and 0.6 <= intent_result["confidence"] < 0.85 and not intent_result["needs_claude"]:
            confirmation_text = format_confirmation_request(intent_result["entries"])
            await db.ai_usage.update_one(
                {"user_id": current_user['id'], "feature": "chatbot", "date": today_key},
                {"$inc": {"count": 1}}, upsert=True
            )
            updated_doc = await db.ai_usage.find_one({"user_id": current_user['id'], "feature": "chatbot", "date": today_key})
            used_now = updated_doc.get("count", 1) if updated_doc else 1
            messages_left = None if is_pro else max(0, daily_limit - used_now)
            await _save_turn(confirmation_text, pending_entries_out=intent_result["entries"])
            return {
                "response": confirmation_text,
                "status": "success",
                "messages_left": messages_left,
                "layer": 1,
                "pending_entries": intent_result["entries"],
            }
        # ── END LAYER 1 ────────────────────────────────────────────────────────

        # ── LAYER 2: Claude (ambiguous / queries / goals) ───────────────────
        # Build context from DB history (single source of truth for sync)
        db_history = await db.chat_messages.find(
            {"user_id": current_user['id'], "deleted": {"$ne": True}, "role": {"$in": ["user", "assistant"]}}
        ).sort("timestamp", -1).limit(20).to_list(20)
        db_history.reverse()
        messages = [{"role": m["role"], "content": m["content"]} for m in db_history if m.get("content")]
        messages.append({"role": "user", "content": input.message})

        plan_ctx = f"\n\nUser plan: {'Pro' if current_user.get('is_pro') else 'Free'}."
        if isinstance(system_message, str):
            system_message = system_message + plan_ctx

        # Smart model routing:
        # Sonnet — guided flows, action-taking, complex multi-step Q&A
        # Haiku  — pure advice/queries where no JSON action will be needed
        _ACTION_INTENTS = {'trip', 'goal', 'emi', 'loan', 'investment', 'gold',
                           'gift', 'credit_card', 'recurring', 'upi', 'piggybank',
                           'expense', 'income', 'delete', 'edit'}
        _use_sonnet = (
            _in_guided_qa                                    # mid Q&A always Sonnet
            or intent_result.get("type") in _ACTION_INTENTS  # action intent → Sonnet
            or intent_result.get("needs_claude") and intent_result.get("type") not in ('query', 'unknown')
        )
        _model = "claude-sonnet-4-6" if _use_sonnet else "claude-haiku-4-5-20251001"
        _max_tokens = 2048 if _use_sonnet else 512

        client = AsyncAnthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))
        result = await client.messages.create(
            model=_model,
            max_tokens=_max_tokens,
            temperature=0.0 if _use_sonnet else 0.3,
            system=system_message,
            messages=messages
        )
        response = result.content[0].text.strip()

        # Try to parse Claude's response as a structured action
        try:
            _parsed = _json.loads(response)
            # Support compound actions: Claude may return a JSON array
            if isinstance(_parsed, list):
                _action_list = _parsed[:5]  # max 5 actions per turn
                action = _action_list[0] if _action_list else {}
                _remaining_actions = _action_list[1:]
            else:
                action = _parsed
                _remaining_actions = []
            _response_parts = []
            act = action.get("action", "")
            ist_now2 = datetime.now(pytz.timezone("Asia/Kolkata"))
            _today_str2 = ist_now2.strftime("%Y-%m-%d")

            def _clamp_date(d: str) -> str:
                """Return d if it's today or in the past, else today."""
                return d if d and d <= _today_str2 else _today_str2

            # ── Expense ──
            if act == "add_transaction":
                from intent_engine import infer_category
                amount      = float(action.get("amount", 0))
                description = action.get("description", "Expense")
                cat_guess   = action.get("category_guess", "")
                date_str    = _clamp_date(action.get("date") or _today_str2)
                if amount > 0:
                    entry = {
                        "intent": "expense",
                        "amount": amount,
                        "description": description,
                        "category": infer_category(cat_guess or description, expense_cat_names),
                        "date": date_str,
                        "raw": description,
                        "is_recurring": bool(action.get("is_recurring", False)),
                        "frequency": action.get("frequency", "monthly"),
                    }
                    logged = await _log_entries([entry])
                    if logged:
                        response = format_single_response(logged[0], user_ctx)
                    else:
                        response = f"Got ₹{amount:,.0f} but no expense categories set up yet. Add some categories first and I'll handle this automatically."

            # ── Income ──
            elif act == "add_income":
                amount      = float(action.get("amount", 0))
                description = action.get("description", "Income")
                date_str    = _clamp_date(action.get("date") or _today_str2)
                if amount > 0:
                    entry = {"intent": "income", "amount": amount, "description": description, "date": date_str, "raw": description, "source_type": action.get("source_type") or infer_income_source_type(description)}
                    logged = await _log_entries([entry])
                    if logged:
                        response = format_single_response(logged[0], user_ctx)

            # ── Add EMI ──
            elif act == "add_emi":
                import math as _math
                _loan_name = action.get("loan_name", "Loan")
                _loan_type = action.get("loan_type", "other")
                _principal = float(action.get("principal_amount", 0))
                _rate      = float(action.get("interest_rate", 0))
                _tenure    = int(action.get("tenure_months", 0))
                _emi_amt   = float(action.get("monthly_payment", 0))
                _start     = action.get("start_date") or ist_now2.strftime("%Y-%m")
                _debit_day = int(action.get("emi_debit_day", 5))
                if _principal > 0 and _rate > 0 and _tenure > 0:
                    # Recalculate EMI to ensure accuracy
                    _r = _rate / 12 / 100
                    _pmt = _math.ceil(_principal * _r * (1 + _r)**_tenure / ((1 + _r)**_tenure - 1))
                    _emi_amt = _emi_amt or _pmt
                    _emi_doc = {
                        "id":               str(__import__("uuid").uuid4()),
                        "user_id":          _cb_uid,
                        "family_group_id":  current_user.get("family_group_id"),
                        "loan_name":        _loan_name,
                        "loan_type":        _loan_type,
                        "principal_amount": _principal,
                        "interest_rate":    _rate,
                        "tenure_months":    _tenure,
                        "monthly_payment":  _emi_amt,
                        "start_date":       _start,
                        "emi_debit_day":    _debit_day,
                        "paid_months":      0,
                        "remaining_balance":_principal,
                        "status":           "active",
                        "created_at":       ist_now2.isoformat(),
                        "source":           "chanakya",
                    }
                    await db.emis.insert_one(_emi_doc)
                    _total_int = round(_emi_amt * _tenure - _principal)
                    response = (
                        f"✅ *{_loan_name}* added — ₹{_emi_amt:,.0f}/month for {_tenure} months at {_rate}% p.a.\n"
                        f"You'll pay ₹{_total_int:,.0f} in interest over the loan. Your total EMI outflow is now ₹{total_emi + _emi_amt:,.0f}/month."
                    )
                else:
                    response = "I need the principal amount, interest rate, and tenure to add the EMI. Can you share those details?"

            # ── EMI Payment ──
            elif act == "emi_payment":
                _loan_id   = action.get("loan_id", "")
                _loan_name = action.get("loan_name", "")
                _pay_amt   = float(action.get("amount", 0))
                _pay_date  = action.get("payment_date") or ist_now2.strftime("%Y-%m-%d")
                # Try to find the EMI by id first, then by name
                _emi_match = next((e for e in emis if e.get("id") == _loan_id), None)
                if not _emi_match and _loan_name:
                    _emi_match = next((e for e in emis if _loan_name.lower() in e.get("loan_name", "").lower()), None)
                if _emi_match:
                    _eid = _emi_match["id"]
                    _pay_amt = _pay_amt or _emi_match["monthly_payment"]
                    # Record payment
                    _new_paid = _emi_match.get("paid_months", 0) + 1
                    _r2 = _emi_match["interest_rate"] / 12 / 100
                    _bal = _emi_match.get("remaining_balance", _emi_match["principal_amount"])
                    _new_bal = max(0, round(_bal * (1 + _r2) - _pay_amt, 2))
                    await db.emis.update_one({"id": _eid}, {
                        "$set":  {"remaining_balance": _new_bal},
                        "$inc":  {"paid_months": 1},
                    })
                    await db.emi_payments.insert_one({
                        "id": str(__import__("uuid").uuid4()),
                        "emi_id": _eid,
                        "user_id": _cb_uid,
                        "amount": _pay_amt,
                        "payment_date": _pay_date,
                        "created_at": ist_now2.isoformat(),
                    })
                    _months_left = _emi_match["tenure_months"] - _new_paid
                    response = (
                        f"✅ ₹{_pay_amt:,.0f} recorded for *{_emi_match['loan_name']}*.\n"
                        f"Remaining balance: ₹{_new_bal:,.0f} · {_months_left} months left."
                    )
                else:
                    response = f"I couldn't find a matching active EMI{' for ' + _loan_name if _loan_name else ''}. Which loan did you pay?"

            # ── EMI query (plain text from Claude) ──
            elif act == "emi_query":
                response = action.get("summary", response)

            # ── Add Goal ──
            elif act == "add_goal":
                import uuid as _uuid2
                _goal_doc = {
                    "id": str(_uuid2.uuid4()),
                    "user_id": _cb_uid,
                    "family_group_id": current_user.get("family_group_id"),
                    "name": action.get("name", "New Goal"),
                    "target_amount": float(action.get("target_amount", 0)),
                    "current_amount": 0.0,
                    "target_date": action.get("target_date", ""),
                    "category": action.get("category", "general"),
                    "priority": action.get("priority", "medium"),
                    "status": "active",
                    "notes": action.get("notes", ""),
                    "created_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                }
                await db.savings_goals.insert_one(_goal_doc)
                invalidate_user_cache(_cb_uid)
                response = f"✅ Goal **{_goal_doc['name']}** created — target ₹{_goal_doc['target_amount']:,.0f} by {_goal_doc['target_date']}."

            # ── Contribute to Goal ──
            elif act == "contribute_goal":
                _goal_id   = action.get("goal_id", "")
                _goal_name = action.get("goal_name", "")
                _contrib   = float(action.get("amount", 0))
                _goal = await db.savings_goals.find_one({"user_id": _cb_uid, "$or": [{"id": _goal_id}, {"name": {"$regex": _goal_name, "$options": "i"}}]})
                if _goal and _contrib > 0:
                    _new_saved = (_goal.get("current_amount", 0) or 0) + _contrib
                    _completed = _new_saved >= _goal.get("target_amount", 1)
                    await db.savings_goals.update_one(
                        {"id": _goal["id"]},
                        {"$set": {"current_amount": round(_new_saved, 2), "status": "completed" if _completed else "active"}}
                    )
                    invalidate_user_cache(_cb_uid)
                    response = f"✅ Added ₹{_contrib:,.0f} to **{_goal['name']}** — now ₹{_new_saved:,.0f} saved."
                    if _completed:
                        response += " 🎉 Goal completed!"
                else:
                    response = f"I couldn't find a matching active goal{' named ' + _goal_name if _goal_name else ''}. Which goal did you contribute to?"

            # ── Add Investment ──
            elif act == "add_investment":
                import uuid as _uuid3
                _inv_doc = {
                    "id": str(_uuid3.uuid4()),
                    "user_id": _cb_uid,
                    "family_group_id": current_user.get("family_group_id"),
                    "type": action.get("type", "other"),
                    "name": action.get("name", "Investment"),
                    "invested_amount": float(action.get("invested_amount", 0)),
                    "current_value": float(action.get("current_value", action.get("invested_amount", 0))),
                    "start_date": action.get("start_date", ""),
                    "notes": action.get("notes", ""),
                    "created_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                }
                await db.investments.insert_one(_inv_doc)
                invalidate_user_cache(_cb_uid)
                response = f"✅ Investment **{_inv_doc['name']}** added — ₹{_inv_doc['invested_amount']:,.0f} invested."

            # ── Add Hand Loan ──
            elif act == "add_hand_loan":
                import uuid as _uuid4
                _hl_doc = {
                    "id": str(_uuid4.uuid4()),
                    "user_id": _cb_uid,
                    "family_group_id": current_user.get("family_group_id"),
                    "loan_type": action.get("loan_type", "lent"),
                    "person_name": action.get("person_name", ""),
                    "amount": float(action.get("amount", 0)),
                    "date": action.get("date", datetime.now(pytz.timezone("Asia/Kolkata")).strftime("%Y-%m-%d")),
                    "due_date": action.get("due_date", ""),
                    "reason": action.get("reason", ""),
                    "status": "active",
                    "created_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                }
                await db.hand_loans.insert_one(_hl_doc)
                invalidate_user_cache(_cb_uid)
                _dir = "lent to" if _hl_doc["loan_type"] == "lent" else "borrowed from"
                response = f"✅ Hand loan recorded — ₹{_hl_doc['amount']:,.0f} {_dir} **{_hl_doc['person_name']}**."

            # ── Add Calendar Event ──
            elif act == "add_calendar_event":
                import uuid as _uuid5
                _ev_title  = action.get("title", "Event")
                _ev_date   = action.get("date", datetime.now(pytz.timezone("Asia/Kolkata")).strftime("%Y-%m-%d"))
                _ev_type   = action.get("type", "custom")
                _ev_amount = float(action.get("amount")) if action.get("amount") else None
                _ev_notes  = action.get("notes", "")
                _ev_doc = {
                    "id":         str(_uuid5.uuid4()),
                    "user_id":    _cb_uid,
                    "title":      _ev_title,
                    "date":       _ev_date,
                    "type":       _ev_type,
                    "amount":     _ev_amount,
                    "notes":      _ev_notes,
                    "created_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                }
                await db.calendar_events.insert_one(_ev_doc)
                invalidate_user_cache(_cb_uid)
                response = f"📅 Added **{_ev_title}** on {_ev_date} to your calendar."

            # ── Add Circle Expense ──
            elif act == "add_circle_expense":
                desc    = action.get("description", "Shared expense")
                amount  = float(action.get("amount", 0))
                paid_by = action.get("paid_by", current_user["name"])
                date_   = action.get("date", datetime.now(pytz.timezone("Asia/Kolkata")).strftime('%Y-%m-%d'))
                # Find user's circle
                circle  = await db.circles.find_one({"members.user_id": user_id}, {"_id": 0})
                if not circle:
                    response = "❌ You don't have a Circle yet. Create one first under the Circle tab."
                else:
                    member_names = [m["name"] for m in circle.get("members", [])]
                    n = len(member_names) or 1
                    _ce_doc = {
                        "id": str(uuid.uuid4()), "circle_id": circle["id"],
                        "description": desc, "amount": amount, "paid_by": paid_by,
                        "split_among": member_names, "share_per_person": round(amount / n, 2),
                        "date": date_, "category": "General", "added_by": current_user["name"],
                        "settled": False, "created_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                    }
                    await db.circle_expenses.insert_one(_ce_doc)
                    response = f"✅ Added ₹{amount:,.0f} for {desc} to your Circle. Split ₹{round(amount/n):,} each among {n} members."

            elif act == "create_circle":
                _existing_circle = await db.circles.find_one({"owner_id": user_id}, {"_id": 0})
                if _existing_circle:
                    response = f"You already have a Circle called '{_existing_circle['name']}'. Invite code: **{_existing_circle['invite_code']}**"
                else:
                    _circle_name = action.get("name", "Our Circle").strip() or "Our Circle"
                    _circle_doc = {
                        "id": str(uuid.uuid4()), "owner_id": user_id,
                        "name": _circle_name,
                        "invite_code": _gen_invite_code(),
                        "members": [{"user_id": user_id, "name": current_user["name"], "email": current_user.get("email",""), "role": "owner"}],
                        "created_at": ist_now2.isoformat(),
                    }
                    await db.circles.insert_one(_circle_doc)
                    response = f"✅ Created circle **{_circle_name}**! Share this invite code with your group: **{_circle_doc['invite_code']}**"

            elif act == "join_circle":
                _invite_code = action.get("invite_code", "").strip().upper()
                if not _invite_code:
                    response = "Please share the invite code — e.g. 'join circle ABC123'."
                else:
                    _jc = await db.circles.find_one({"invite_code": _invite_code})
                    if not _jc:
                        response = f"❌ No circle found with code {_invite_code}. Double-check the code."
                    else:
                        _already = any(m["user_id"] == user_id for m in _jc.get("members", []))
                        if _already:
                            response = f"You're already in **{_jc['name']}**!"
                        else:
                            await db.circles.update_one(
                                {"id": _jc["id"]},
                                {"$push": {"members": {"user_id": user_id, "name": current_user["name"], "email": current_user.get("email",""), "role": "member"}}}
                            )
                            response = f"✅ Joined **{_jc['name']}**! You can now split expenses with the group."

            elif act == "set_notification_prefs":
                _allowed_notif = {"email_enabled","notify_emi","notify_subscriptions",
                                  "notify_birthdays","notify_budget_summary","notify_savings_goals",
                                  "notify_hand_loans","notify_salary","notify_when_to_buy"}
                _updates = {k: bool(v) for k, v in action.items() if k in _allowed_notif}
                if _updates:
                    # Merge with existing prefs
                    _cur_doc = await db.users.find_one({"id": user_id}, {"notification_prefs": 1})
                    _cur_prefs = (_cur_doc or {}).get("notification_prefs") or {}
                    _cur_prefs.update(_updates)
                    await db.users.update_one({"id": user_id}, {"$set": {"notification_prefs": _cur_prefs}})
                    _changed = [f"{'✅' if v else '🔕'} {k.replace('_',' ')}" for k, v in _updates.items()]
                    response = f"Done! Updated your notification settings:\n" + "\n".join(_changed)
                else:
                    response = "I didn't catch what you'd like to change. Say something like 'turn on email notifications' or 'disable EMI reminders'."

            elif act == "add_gold":
                _gold_doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "name":                   action.get("name", "Gold"),
                    "type":                   action.get("type", "physical"),
                    "karat":                  int(action.get("karat", 24)),
                    "weight_grams":           float(action.get("weight_grams", 0)),
                    "quantity":               float(action.get("quantity", 0)),
                    "purchase_price_per_gram":  float(action.get("purchase_price_per_gram", 0)),
                    "purchase_price_per_unit":  float(action.get("purchase_price_per_unit", 0)),
                    "purchase_date":          action.get("purchase_date", ist_now2.strftime("%Y-%m-%d")),
                    "notes":                  action.get("notes", ""),
                    "created_at":             ist_now2.isoformat(),
                }
                await db.gold.insert_one(_gold_doc)
                invalidate_user_cache(user_id)
                _wt = _gold_doc["weight_grams"] or _gold_doc["quantity"]
                response = f"✅ Added {_gold_doc['name']} ({_gold_doc['type']}, {_wt}{'g' if _gold_doc['weight_grams'] else ' units'}) to your Gold tracker."

            elif act == "add_silver":
                _silver_doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "name":                   action.get("name", "Silver"),
                    "type":                   action.get("type", "physical"),
                    "purity":                 int(action.get("purity", 999)),
                    "weight_grams":           float(action.get("weight_grams", 0)),
                    "quantity":               float(action.get("quantity", 0)),
                    "purchase_price_per_gram":  float(action.get("purchase_price_per_gram", 0)),
                    "purchase_price_per_unit":  float(action.get("purchase_price_per_unit", 0)),
                    "purchase_date":          action.get("purchase_date", ist_now2.strftime("%Y-%m-%d")),
                    "notes":                  action.get("notes", ""),
                    "created_at":             ist_now2.isoformat(),
                }
                await db.silver.insert_one(_silver_doc)
                invalidate_user_cache(user_id)
                _wt = _silver_doc["weight_grams"] or _silver_doc["quantity"]
                response = f"✅ Added {_silver_doc['name']} ({_silver_doc['type']}, {_wt}{'g' if _silver_doc['weight_grams'] else ' units'}) to your Silver tracker."

            elif act == "log_credit_card_expense":
                _card_id   = action.get("card_id", "")
                _card_name = action.get("card_name", "")
                _cc_amount = float(action.get("amount", 0))
                _cc_desc   = action.get("description", "Expense")
                _cc_date   = action.get("date", ist_now2.strftime("%Y-%m-%d"))
                _cc_cat    = action.get("category", "Shopping")
                _card = await db.credit_cards.find_one({"id": _card_id, "user_id": user_id}) if _card_id else None
                if not _card and _card_name:
                    _card = await db.credit_cards.find_one({"user_id": user_id, "is_active": True,
                        "card_name": {"$regex": _card_name, "$options": "i"}})
                if not _card:
                    _card = await db.credit_cards.find_one({"user_id": user_id, "is_active": True})
                if not _card:
                    response = "❌ No credit card found. Add one first in the Credit Cards section."
                elif _cc_amount <= 0:
                    response = "❌ Amount must be greater than zero."
                else:
                    _exp_doc = {
                        "id": str(uuid.uuid4()), "card_id": _card["id"], "user_id": user_id,
                        "amount": _cc_amount, "description": _cc_desc,
                        "category": _cc_cat, "date": _cc_date,
                        "created_at": ist_now2.isoformat(),
                    }
                    await db.credit_card_expenses.insert_one(_exp_doc)
                    await db.credit_cards.update_one(
                        {"id": _card["id"]},
                        {"$inc": {"outstanding_balance": _cc_amount}}
                    )
                    invalidate_user_cache(user_id)
                    response = f"✅ Logged ₹{_cc_amount:,.0f} for {_cc_desc} on {_card['bank_name']} {_card['card_name']}."

            elif act == "add_recurring_expense":
                _rc_name   = action.get("name", "Recurring Expense")
                _rc_amount = float(action.get("amount", 0))
                _rc_cat    = action.get("category_name", "")
                _rc_freq   = action.get("frequency", "monthly")
                _rc_day    = int(action.get("day_of_month", ist_now2.day))
                _rc_start  = action.get("start_date", ist_now2.strftime("%Y-%m-%d"))
                _rc_emoji  = action.get("emoji", "🔄")
                # Match category
                _rc_matched_cat = next(
                    (c for c in categories if c["type"] == "expense" and c["name"].lower() == _rc_cat.lower()),
                    next((c for c in categories if c["type"] == "expense"), None)
                )
                if not _rc_matched_cat:
                    response = "❌ No expense categories found. Set up your budget categories first."
                elif _rc_amount <= 0:
                    response = "❌ Amount must be greater than zero."
                else:
                    _rc_doc = {
                        "id": str(uuid.uuid4()), "user_id": user_id,
                        "name": _rc_name, "amount": _rc_amount,
                        "category_id": _rc_matched_cat["id"], "category_name": _rc_matched_cat["name"],
                        "description": _rc_name, "frequency": _rc_freq,
                        "day_of_month": min(max(_rc_day, 1), 28),
                        "start_date": _rc_start, "end_date": "", "emoji": _rc_emoji,
                        "is_active": True, "created_at": ist_now2.isoformat(),
                    }
                    await db.recurring_expenses.insert_one(_rc_doc)
                    invalidate_user_cache(user_id)
                    response = f"✅ Set up {_rc_emoji} {_rc_name} as a ₹{_rc_amount:,.0f} {_rc_freq} recurring expense under {_rc_matched_cat['name']}."

            elif act == "add_gift":
                _gift_doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "person_name":      action.get("person_name", "Someone"),
                    "relationship":     action.get("relationship", "Friend"),
                    "direction":        action.get("direction", "given"),
                    "occasion":         action.get("occasion", "Other"),
                    "gift_description": action.get("gift_description", ""),
                    "amount":           float(action.get("amount", 0)),
                    "date":             action.get("date", ist_now2.strftime("%Y-%m-%d")),
                    "return_expected":  bool(action.get("return_expected", False)),
                    "returned":         False, "notes": "", "event_id": None, "event_name": None,
                    "created_at":       ist_now2.isoformat(),
                }
                await db.gifts.insert_one(_gift_doc)
                invalidate_user_cache(user_id)
                _dir = "gave" if _gift_doc["direction"] == "given" else "received"
                response = f"✅ Logged: {_dir} {_gift_doc['person_name']} — {_gift_doc['gift_description'] or _gift_doc['occasion']} worth ₹{_gift_doc['amount']:,.0f}."

            elif act == "update_profile":
                _prof_updates: dict = {}
                if action.get("name", "").strip():
                    _prof_updates["name"] = action["name"].strip()
                if action.get("phone", "").strip():
                    _p = str(action["phone"]).strip().replace(" ", "").replace("-", "")
                    if _p.startswith("+91") and len(_p) == 13: _p = _p[3:]
                    elif _p.startswith("91") and len(_p) == 12: _p = _p[2:]
                    if _p: _prof_updates["phone"] = _p
                if action.get("email", "").strip():
                    import re as _re
                    _em = action["email"].strip().lower()
                    if _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', _em):
                        _existing_em = await db.users.find_one({"email": _em, "id": {"$ne": user_id}})
                        if _existing_em:
                            response = "❌ That email is already used by another account."
                        else:
                            _prof_updates["email"] = _em
                if action.get("dob", "").strip():
                    _prof_updates["dob"] = action["dob"].strip()
                if _prof_updates and "❌" not in response:
                    await db.users.update_one({"id": user_id}, {"$set": _prof_updates})
                    _changed_keys = list(_prof_updates.keys())
                    response = f"✅ Updated your profile: {', '.join(_changed_keys)}."
                elif not _prof_updates:
                    response = "I didn't catch what you'd like to update. Say something like 'change my name to Arjun' or 'my phone is 9876543210'."

            # ── Import SMS Transactions ──
            elif act == "import_sms_transactions":
                _sms_text = action.get("data", {}).get("text", "").strip()
                if not _sms_text:
                    response = "Please paste the SMS messages in your message so I can parse them."
                else:
                    _sms_messages = split_sms_messages(_sms_text)
                    _imported = 0
                    _skipped = 0
                    for _sms_i, _sms in enumerate(_sms_messages):
                        _txn = parse_upi_sms(_sms)
                        if not _txn:
                            _skipped += 1
                            continue
                        try:
                            _sms_doc = {
                                "id":          str(uuid.uuid4()),
                                "user_id":     _cb_uid,
                                "date":        _txn.get("date", datetime.now(pytz.timezone("Asia/Kolkata")).strftime("%Y-%m-%d")),
                                "amount":      float(_txn.get("amount", 0)),
                                "description": _txn.get("merchant") or "SMS Import",
                                "type":        _txn.get("type", "expense"),
                                "category_id": None,
                                "source":      "sms_import",
                                "upi_ref":     _txn.get("upi_ref"),
                                "upi_app":     _txn.get("upi_app"),
                                "vpa":         _txn.get("vpa"),
                                "created_at":  datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                            }
                            # Deduplicate on upi_ref if present
                            if _sms_doc["upi_ref"]:
                                _dup = await db.transactions.find_one({"user_id": _cb_uid, "upi_ref": _sms_doc["upi_ref"]})
                                if _dup:
                                    _skipped += 1
                                    continue
                            await db.transactions.insert_one(_sms_doc)
                            _imported += 1
                        except Exception:
                            _skipped += 1
                    invalidate_user_cache(_cb_uid)
                    if _imported:
                        response = f"✅ Imported **{_imported} transaction{'s' if _imported > 1 else ''}** from your SMS messages."
                        if _skipped:
                            response += f" ({_skipped} skipped)"
                    else:
                        response = "I couldn't find any transactions in those SMS messages. Make sure they're standard bank debit/credit SMS formats."

            # ── Add Trip ──
            elif act == "add_trip":
                _trip_data = action.get("data", {})
                _trip_name = _trip_data.get("name", "").strip()
                _trip_dest = _trip_data.get("destination", "").strip()
                _trip_start = _trip_data.get("start_date", "")
                _trip_end = _trip_data.get("end_date", "")
                _trip_budget = _trip_data.get("budget")
                if not _trip_name:
                    response = "Please provide a trip name."
                else:
                    _trip_doc = {
                        "id": str(uuid.uuid4()),
                        "user_id": _cb_uid,
                        "name": _trip_name,
                        "destination": _trip_dest,
                        "start_date": _trip_start,
                        "end_date": _trip_end,
                        "budget": float(_trip_budget) if _trip_budget else None,
                        "members": [],
                        "status": "planned",
                        "created_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
                    }
                    await db.trips.insert_one(_trip_doc)
                    invalidate_user_cache(_cb_uid)
                    response = f"✅ Trip **{_trip_name}** to {_trip_dest or 'destination TBD'} created!"

            # ── Add Trip Expense ──
            elif act == "add_trip_expense":
                _te_data = action.get("data", {})
                _te_trip_name = _te_data.get("trip_name", "").strip()
                _te_desc = _te_data.get("description", "").strip()
                _te_amount = _te_data.get("amount")
                _te_paid_by = _te_data.get("paid_by", current_user.get("name", "")).strip()
                _te_date = _te_data.get("date") or ist_now2.strftime("%Y-%m-%d")
                if not _te_amount:
                    response = "Please provide an amount for the trip expense."
                else:
                    # Find trip by partial name match
                    _te_trip = None
                    if _te_trip_name:
                        _te_trip = await db.trips.find_one({
                            "user_id": _cb_uid,
                            "name": {"$regex": _te_trip_name, "$options": "i"}
                        })
                        if not _te_trip:
                            # Try destination match
                            _te_trip = await db.trips.find_one({
                                "user_id": _cb_uid,
                                "destination": {"$regex": _te_trip_name, "$options": "i"}
                            })
                    if not _te_trip:
                        # Fall back to most recent trip
                        _te_trip = await db.trips.find_one(
                            {"user_id": _cb_uid},
                            sort=[("created_at", -1)]
                        )
                    if not _te_trip:
                        response = f"I couldn't find a trip matching '{_te_trip_name}'. Please create a trip first."
                    else:
                        _te_expense = {
                            "id": str(uuid.uuid4()),
                            "description": _te_desc or "Expense",
                            "amount": float(_te_amount),
                            "paid_by": _te_paid_by,
                            "date": _te_date,
                            "created_at": ist_now2.isoformat(),
                        }
                        await db.trips.update_one(
                            {"id": _te_trip["id"]},
                            {"$push": {"expenses": _te_expense}}
                        )
                        invalidate_user_cache(_cb_uid)
                        _te_trip_label = _te_trip.get("name") or _te_trip.get("destination", "your trip")
                        response = f"✅ Added ₹{float(_te_amount):,.0f} for **{_te_desc or 'expense'}** to {_te_trip_label} (paid by {_te_paid_by or 'you'})."

            # ── Delete Transaction ──
            elif act == "delete_transaction":
                _dt_data = action.get("data", {})
                _dt_desc = _dt_data.get("description", "").strip().lower()
                _dt_amount = _dt_data.get("amount")
                _dt_date = _dt_data.get("date")
                _dt_query = {"user_id": _cb_uid}
                if _dt_desc:
                    _dt_query["description"] = {"$regex": _dt_desc, "$options": "i"}
                if _dt_amount:
                    _dt_query["amount"] = float(_dt_amount)
                if _dt_date:
                    _dt_query["date"] = _dt_date
                _dt_txn = await db.transactions.find_one(_dt_query, sort=[("_id", -1)])
                if not _dt_txn:
                    response = "I couldn't find a matching transaction to delete."
                else:
                    await db.transactions.delete_one({"_id": _dt_txn["_id"]})
                    invalidate_user_cache(_cb_uid)
                    response = f"🗑️ Deleted transaction: **{_dt_txn['description']}** ₹{_dt_txn['amount']:,.0f} on {_dt_txn.get('date', '')}"

            # ── Add Category ──
            elif act == "add_category":
                _ac_data = action.get("data", {})
                _ac_name = _ac_data.get("name", "").strip()
                _ac_type = _ac_data.get("type", "expense")
                _ac_icon = _ac_data.get("icon", "💸")
                if not _ac_name:
                    response = "Please provide a category name."
                else:
                    _ac_existing = await db.budget_categories.find_one({
                        "user_id": _cb_uid,
                        "name": {"$regex": f"^{_ac_name}$", "$options": "i"}
                    })
                    if _ac_existing:
                        response = f"Category **{_ac_name}** already exists."
                    else:
                        _ac_doc = {
                            "id": str(uuid.uuid4()),
                            "user_id": _cb_uid,
                            "family_group_id": current_user.get("family_group_id"),
                            "name": _ac_name,
                            "type": _ac_type,
                            "icon": _ac_icon,
                            "allocated_amount": 0.0,
                            "spent_amount": 0.0,
                            "is_default": False,
                            "created_at": ist_now2.isoformat(),
                        }
                        await db.budget_categories.insert_one(_ac_doc)
                        invalidate_user_cache(_cb_uid)
                        response = f"✅ Created **{_ac_name}** category ({_ac_type})."

            # ── Plan Trip (creates trip + fires background itinerary generation) ──
            elif act == "plan_trip":
                _pt_data = action.get("data", {})
                _pt_name = _pt_data.get("name", "").strip() or f"{_pt_data.get('destination', 'My Trip')} Trip"
                _pt_dest = _pt_data.get("destination", "").strip()
                _pt_start = _pt_data.get("start_date", "")
                _pt_end = _pt_data.get("end_date", "")
                _pt_budget = _pt_data.get("budget")
                _pt_members = int(_pt_data.get("members", 1))
                _pt_prefs = _pt_data.get("preferences", "")

                _pt_doc = {
                    "id": str(uuid.uuid4()),
                    "user_id": _cb_uid,
                    "name": _pt_name,
                    "destination": _pt_dest,
                    "start_date": _pt_start,
                    "end_date": _pt_end,
                    "budget": float(_pt_budget) if _pt_budget else None,
                    "members": [],
                    "status": "planned",
                    "itinerary": [],
                    "itinerary_status": "generating",
                    "created_at": ist_now2.isoformat(),
                }
                await db.trips.insert_one(_pt_doc)
                invalidate_user_cache(_cb_uid)

                # Fire background itinerary generation
                _pt_origin = _pt_data.get("origin_city", "").strip()
                asyncio.ensure_future(_generate_trip_plan_async(
                    _pt_doc["id"], _cb_uid, _pt_prefs, _pt_name, _pt_dest,
                    origin_city=_pt_origin, adults=_pt_members,
                ))

                response = (
                    f"✅ **{_pt_name}** created! I'm now generating your day-by-day itinerary with local tips, "
                    f"activities and must-dos — I'll ping you here when it's ready. "
                    f"You can also check [Planner →](/trips) anytime."
                )

            # ── Compound action: collect first response part ──
            if response:
                _response_parts.append(response)

            # ── Compound action: process remaining actions in the list ──
            for _extra_action in _remaining_actions:
                _ea = _extra_action.get("action", "")
                _ea_ist = datetime.now(pytz.timezone("Asia/Kolkata"))
                _ea_resp = ""

                if _ea == "add_transaction":
                    from intent_engine import infer_category as _ea_ic
                    _ea_amount = float(_extra_action.get("amount", 0))
                    _ea_desc   = _extra_action.get("description", "Expense")
                    _ea_cat    = _extra_action.get("category_guess", "")
                    _ea_date   = _clamp_date(_extra_action.get("date") or _today_str2)
                    if _ea_amount > 0:
                        _ea_entry = {
                            "intent": "expense",
                            "amount": _ea_amount,
                            "description": _ea_desc,
                            "category": _ea_ic(_ea_cat or _ea_desc, expense_cat_names),
                            "date": _ea_date,
                            "raw": _ea_desc,
                            "is_recurring": bool(_extra_action.get("is_recurring", False)),
                            "frequency": _extra_action.get("frequency", "monthly"),
                        }
                        _ea_logged = await _log_entries([_ea_entry])
                        if _ea_logged:
                            _ea_resp = format_single_response(_ea_logged[0], user_ctx)
                        else:
                            _ea_resp = f"Got ₹{_ea_amount:,.0f} but no expense categories set up yet."

                elif _ea == "add_income":
                    _ea_amount = float(_extra_action.get("amount", 0))
                    _ea_desc   = _extra_action.get("description", "Income")
                    _ea_date   = _clamp_date(_extra_action.get("date") or _today_str2)
                    if _ea_amount > 0:
                        _ea_entry = {"intent": "income", "amount": _ea_amount, "description": _ea_desc, "date": _ea_date, "raw": _ea_desc, "source_type": _extra_action.get("source_type") or infer_income_source_type(_ea_desc)}
                        _ea_logged = await _log_entries([_ea_entry])
                        if _ea_logged:
                            _ea_resp = format_single_response(_ea_logged[0], user_ctx)

                elif _ea == "add_emi":
                    import math as _ea_math
                    _ea_loan_name = _extra_action.get("loan_name", "Loan")
                    _ea_loan_type = _extra_action.get("loan_type", "other")
                    _ea_principal = float(_extra_action.get("principal_amount", 0))
                    _ea_rate      = float(_extra_action.get("interest_rate", 0))
                    _ea_tenure    = int(_extra_action.get("tenure_months", 0))
                    _ea_emi_amt   = float(_extra_action.get("monthly_payment", 0))
                    _ea_start     = _extra_action.get("start_date") or _ea_ist.strftime("%Y-%m")
                    _ea_debit_day = int(_extra_action.get("emi_debit_day", 5))
                    if _ea_principal > 0 and _ea_rate > 0 and _ea_tenure > 0:
                        _ea_r   = _ea_rate / 12 / 100
                        _ea_pmt = _ea_math.ceil(_ea_principal * _ea_r * (1 + _ea_r)**_ea_tenure / ((1 + _ea_r)**_ea_tenure - 1))
                        _ea_emi_amt = _ea_emi_amt or _ea_pmt
                        _ea_emi_doc = {
                            "id": str(__import__("uuid").uuid4()), "user_id": _cb_uid,
                            "family_group_id": current_user.get("family_group_id"),
                            "loan_name": _ea_loan_name, "loan_type": _ea_loan_type,
                            "principal_amount": _ea_principal, "interest_rate": _ea_rate,
                            "tenure_months": _ea_tenure, "monthly_payment": _ea_emi_amt,
                            "start_date": _ea_start, "emi_debit_day": _ea_debit_day,
                            "paid_months": 0, "remaining_balance": _ea_principal,
                            "status": "active", "created_at": _ea_ist.isoformat(), "source": "chanakya",
                        }
                        await db.emis.insert_one(_ea_emi_doc)
                        _ea_total_int = round(_ea_emi_amt * _ea_tenure - _ea_principal)
                        _ea_resp = (
                            f"✅ *{_ea_loan_name}* added — ₹{_ea_emi_amt:,.0f}/month for {_ea_tenure} months at {_ea_rate}% p.a.\n"
                            f"You'll pay ₹{_ea_total_int:,.0f} in interest over the loan."
                        )
                    else:
                        _ea_resp = "I need the principal amount, interest rate, and tenure to add the EMI."

                elif _ea == "emi_payment":
                    _ea_loan_id   = _extra_action.get("loan_id", "")
                    _ea_loan_name = _extra_action.get("loan_name", "")
                    _ea_pay_amt   = float(_extra_action.get("amount", 0))
                    _ea_pay_date  = _extra_action.get("payment_date") or _ea_ist.strftime("%Y-%m-%d")
                    _ea_emi_match = next((e for e in emis if e.get("id") == _ea_loan_id), None)
                    if not _ea_emi_match and _ea_loan_name:
                        _ea_emi_match = next((e for e in emis if _ea_loan_name.lower() in e.get("loan_name", "").lower()), None)
                    if _ea_emi_match:
                        _ea_eid = _ea_emi_match["id"]
                        _ea_pay_amt = _ea_pay_amt or _ea_emi_match["monthly_payment"]
                        _ea_new_paid = _ea_emi_match.get("paid_months", 0) + 1
                        _ea_r2  = _ea_emi_match["interest_rate"] / 12 / 100
                        _ea_bal = _ea_emi_match.get("remaining_balance", _ea_emi_match["principal_amount"])
                        _ea_new_bal = max(0, round(_ea_bal * (1 + _ea_r2) - _ea_pay_amt, 2))
                        await db.emis.update_one({"id": _ea_eid}, {"$set": {"remaining_balance": _ea_new_bal}, "$inc": {"paid_months": 1}})
                        await db.emi_payments.insert_one({
                            "id": str(__import__("uuid").uuid4()), "emi_id": _ea_eid,
                            "user_id": _cb_uid, "amount": _ea_pay_amt,
                            "payment_date": _ea_pay_date, "created_at": _ea_ist.isoformat(),
                        })
                        _ea_months_left = _ea_emi_match["tenure_months"] - _ea_new_paid
                        _ea_resp = (
                            f"✅ ₹{_ea_pay_amt:,.0f} recorded for *{_ea_emi_match['loan_name']}*.\n"
                            f"Remaining balance: ₹{_ea_new_bal:,.0f} · {_ea_months_left} months left."
                        )
                    else:
                        _ea_resp = f"I couldn't find a matching active EMI{' for ' + _ea_loan_name if _ea_loan_name else ''}."

                elif _ea == "add_goal":
                    import uuid as _ea_uuid
                    _ea_goal_doc = {
                        "id": str(_ea_uuid.uuid4()), "user_id": _cb_uid,
                        "family_group_id": current_user.get("family_group_id"),
                        "name": _extra_action.get("name", "New Goal"),
                        "target_amount": float(_extra_action.get("target_amount", 0)),
                        "current_amount": 0.0,
                        "target_date": _extra_action.get("target_date", ""),
                        "category": _extra_action.get("category", "general"),
                        "priority": _extra_action.get("priority", "medium"),
                        "status": "active", "notes": _extra_action.get("notes", ""),
                        "created_at": _ea_ist.isoformat(),
                    }
                    await db.savings_goals.insert_one(_ea_goal_doc)
                    invalidate_user_cache(_cb_uid)
                    _ea_resp = f"✅ Goal **{_ea_goal_doc['name']}** created — target ₹{_ea_goal_doc['target_amount']:,.0f} by {_ea_goal_doc['target_date']}."

                elif _ea == "contribute_goal":
                    _ea_goal_id   = _extra_action.get("goal_id", "")
                    _ea_goal_name = _extra_action.get("goal_name", "")
                    _ea_contrib   = float(_extra_action.get("amount", 0))
                    _ea_goal = await db.savings_goals.find_one({"user_id": _cb_uid, "$or": [{"id": _ea_goal_id}, {"name": {"$regex": _ea_goal_name, "$options": "i"}}]})
                    if _ea_goal and _ea_contrib > 0:
                        _ea_new_saved = (_ea_goal.get("current_amount", 0) or 0) + _ea_contrib
                        _ea_completed = _ea_new_saved >= _ea_goal.get("target_amount", 1)
                        await db.savings_goals.update_one({"id": _ea_goal["id"]}, {"$set": {"current_amount": round(_ea_new_saved, 2), "status": "completed" if _ea_completed else "active"}})
                        invalidate_user_cache(_cb_uid)
                        _ea_resp = f"✅ Added ₹{_ea_contrib:,.0f} to **{_ea_goal['name']}** — now ₹{_ea_new_saved:,.0f} saved."
                        if _ea_completed:
                            _ea_resp += " 🎉 Goal completed!"
                    else:
                        _ea_resp = f"I couldn't find a matching goal{' named ' + _ea_goal_name if _ea_goal_name else ''}."

                elif _ea == "add_investment":
                    import uuid as _ea_uuid2
                    _ea_inv_doc = {
                        "id": str(_ea_uuid2.uuid4()), "user_id": _cb_uid,
                        "family_group_id": current_user.get("family_group_id"),
                        "type": _extra_action.get("type", "other"),
                        "name": _extra_action.get("name", "Investment"),
                        "invested_amount": float(_extra_action.get("invested_amount", 0)),
                        "current_value": float(_extra_action.get("current_value", _extra_action.get("invested_amount", 0))),
                        "start_date": _extra_action.get("start_date", ""),
                        "notes": _extra_action.get("notes", ""),
                        "created_at": _ea_ist.isoformat(),
                    }
                    await db.investments.insert_one(_ea_inv_doc)
                    invalidate_user_cache(_cb_uid)
                    _ea_resp = f"✅ Investment **{_ea_inv_doc['name']}** added — ₹{_ea_inv_doc['invested_amount']:,.0f} invested."

                elif _ea == "add_hand_loan":
                    import uuid as _ea_uuid3
                    _ea_hl_doc = {
                        "id": str(_ea_uuid3.uuid4()), "user_id": _cb_uid,
                        "family_group_id": current_user.get("family_group_id"),
                        "loan_type": _extra_action.get("loan_type", "lent"),
                        "person_name": _extra_action.get("person_name", ""),
                        "amount": float(_extra_action.get("amount", 0)),
                        "date": _extra_action.get("date", _ea_ist.strftime("%Y-%m-%d")),
                        "due_date": _extra_action.get("due_date", ""),
                        "reason": _extra_action.get("reason", ""),
                        "status": "active", "created_at": _ea_ist.isoformat(),
                    }
                    await db.hand_loans.insert_one(_ea_hl_doc)
                    invalidate_user_cache(_cb_uid)
                    _ea_dir = "lent to" if _ea_hl_doc["loan_type"] == "lent" else "borrowed from"
                    _ea_resp = f"✅ Hand loan recorded — ₹{_ea_hl_doc['amount']:,.0f} {_ea_dir} **{_ea_hl_doc['person_name']}**."

                elif _ea == "add_calendar_event":
                    import uuid as _ea_uuid4
                    _ea_ev_doc = {
                        "id": str(_ea_uuid4.uuid4()), "user_id": _cb_uid,
                        "title":  _extra_action.get("title", "Event"),
                        "date":   _extra_action.get("date", _ea_ist.strftime("%Y-%m-%d")),
                        "type":   _extra_action.get("type", "custom"),
                        "amount": float(_extra_action.get("amount")) if _extra_action.get("amount") else None,
                        "notes":  _extra_action.get("notes", ""),
                        "created_at": _ea_ist.isoformat(),
                    }
                    await db.calendar_events.insert_one(_ea_ev_doc)
                    invalidate_user_cache(_cb_uid)
                    _ea_resp = f"📅 Added **{_ea_ev_doc['title']}** on {_ea_ev_doc['date']} to your calendar."

                elif _ea == "add_recurring_expense":
                    _ea_rc_name   = _extra_action.get("name", "Recurring Expense")
                    _ea_rc_amount = float(_extra_action.get("amount", 0))
                    _ea_rc_cat    = _extra_action.get("category_name", "")
                    _ea_rc_freq   = _extra_action.get("frequency", "monthly")
                    _ea_rc_day    = int(_extra_action.get("day_of_month", _ea_ist.day))
                    _ea_rc_start  = _extra_action.get("start_date", _ea_ist.strftime("%Y-%m-%d"))
                    _ea_rc_emoji  = _extra_action.get("emoji", "🔄")
                    _ea_rc_cat_match = next(
                        (c for c in categories if c["type"] == "expense" and c["name"].lower() == _ea_rc_cat.lower()),
                        next((c for c in categories if c["type"] == "expense"), None)
                    )
                    if _ea_rc_cat_match and _ea_rc_amount > 0:
                        import uuid as _ea_uuid5
                        _ea_rc_doc = {
                            "id": str(_ea_uuid5.uuid4()), "user_id": user_id,
                            "name": _ea_rc_name, "amount": _ea_rc_amount,
                            "category_id": _ea_rc_cat_match["id"], "category_name": _ea_rc_cat_match["name"],
                            "description": _ea_rc_name, "frequency": _ea_rc_freq,
                            "day_of_month": min(max(_ea_rc_day, 1), 28),
                            "start_date": _ea_rc_start, "end_date": "", "emoji": _ea_rc_emoji,
                            "is_active": True, "created_at": _ea_ist.isoformat(),
                        }
                        await db.recurring_expenses.insert_one(_ea_rc_doc)
                        invalidate_user_cache(user_id)
                        _ea_resp = f"✅ Set up {_ea_rc_emoji} {_ea_rc_name} as a ₹{_ea_rc_amount:,.0f} {_ea_rc_freq} recurring expense under {_ea_rc_cat_match['name']}."
                    elif not _ea_rc_cat_match:
                        _ea_resp = "❌ No expense categories found. Set up your budget categories first."
                    else:
                        _ea_resp = "❌ Amount must be greater than zero."

                elif _ea == "add_gift":
                    import uuid as _ea_uuid6
                    _ea_gift_doc = {
                        "id": str(_ea_uuid6.uuid4()), "user_id": user_id,
                        "person_name":      _extra_action.get("person_name", "Someone"),
                        "relationship":     _extra_action.get("relationship", "Friend"),
                        "direction":        _extra_action.get("direction", "given"),
                        "occasion":         _extra_action.get("occasion", "Other"),
                        "gift_description": _extra_action.get("gift_description", ""),
                        "amount":           float(_extra_action.get("amount", 0)),
                        "date":             _extra_action.get("date", _ea_ist.strftime("%Y-%m-%d")),
                        "return_expected":  bool(_extra_action.get("return_expected", False)),
                        "returned": False, "notes": "", "event_id": None, "event_name": None,
                        "created_at": _ea_ist.isoformat(),
                    }
                    await db.gifts.insert_one(_ea_gift_doc)
                    invalidate_user_cache(user_id)
                    _ea_gift_dir = "gave" if _ea_gift_doc["direction"] == "given" else "received"
                    _ea_resp = f"✅ Logged: {_ea_gift_dir} {_ea_gift_doc['person_name']} — {_ea_gift_doc['gift_description'] or _ea_gift_doc['occasion']} worth ₹{_ea_gift_doc['amount']:,.0f}."

                if _ea_resp:
                    _response_parts.append(_ea_resp)

            # Join all parts for compound responses
            if _response_parts:
                response = "\n\n".join(_response_parts)

        except (_json.JSONDecodeError, ValueError, TypeError):
            # Claude sometimes emits JSON + text in same reply (mixed response).
            import re as _re

            # Pattern 1: JSON first, then plain text  →  {…}\n\ntext
            _mix = _re.match(r'^\s*(\{[\s\S]+?\})\s*\n+([\s\S]+)', response)
            if _mix:
                try:
                    _action2 = _json.loads(_mix.group(1))
                    _remaining = _mix.group(2).strip()
                    _act2 = _action2.get("action", "")
                    _ist2 = datetime.now(pytz.timezone("Asia/Kolkata"))
                    if _act2 == "add_transaction":
                        from intent_engine import infer_category as _ic2
                        _amt2 = float(_action2.get("amount", 0))
                        _desc2 = _action2.get("description", "Expense")
                        _cat2 = _action2.get("category_guess", "")
                        _date2 = _action2.get("date") or _ist2.strftime("%Y-%m-%d")
                        if _amt2 > 0:
                            _entry2 = {"intent": "expense", "amount": _amt2, "description": _desc2, "category": _ic2(_cat2 or _desc2, expense_cat_names), "date": _date2, "raw": _desc2, "is_recurring": bool(_action2.get("is_recurring", False)), "frequency": _action2.get("frequency", "monthly")}
                            await _log_entries([_entry2])
                    elif _act2 == "add_income":
                        _amt2 = float(_action2.get("amount", 0))
                        _desc2 = _action2.get("description", "Income")
                        _date2 = _action2.get("date") or _ist2.strftime("%Y-%m-%d")
                        if _amt2 > 0:
                            await _log_entries([{"intent": "income", "amount": _amt2, "description": _desc2, "date": _date2, "raw": _desc2, "source_type": _action2.get("source_type") or infer_income_source_type(_desc2)}])
                    # Always use the plain-text part as the visible reply
                    response = _remaining
                except Exception:
                    pass

            # Pattern 2: text first, then JSON in a ```json code block  →  text\n```json{…}```
            if not _mix:
                _cf = _re.search(r'```(?:json)?\s*(\{[\s\S]+?\})\s*```', response, _re.DOTALL)
                if _cf:
                    _natural_text = response[:_cf.start()].strip()
                    try:
                        _action3 = _json.loads(_cf.group(1).strip())
                        _act3 = _action3.get("action", "")
                        _ist3 = datetime.now(pytz.timezone("Asia/Kolkata"))
                        if _act3 == "plan_trip":
                            _pt3 = _action3.get("data", {})
                            _pt3_name = _pt3.get("name", "").strip() or f"{_pt3.get('destination', 'My Trip')} Trip"
                            _pt3_doc = {
                                "id": str(uuid.uuid4()), "user_id": _cb_uid,
                                "name": _pt3_name, "destination": _pt3.get("destination", ""),
                                "start_date": _pt3.get("start_date", ""), "end_date": _pt3.get("end_date", ""),
                                "budget": float(_pt3.get("budget")) if _pt3.get("budget") else None,
                                "members": [], "status": "planned", "itinerary": [],
                                "itinerary_status": "generating",
                                "origin_city": _pt3.get("origin_city", "").strip(),
                                "created_at": _ist3.isoformat(),
                            }
                            await db.trips.insert_one(_pt3_doc)
                            invalidate_user_cache(_cb_uid)
                            asyncio.ensure_future(_generate_trip_plan_async(
                                _pt3_doc["id"], _cb_uid, _pt3.get("preferences", ""), _pt3_name, _pt3.get("destination", ""),
                                origin_city=_pt3.get("origin_city", "").strip(),
                                adults=int(_pt3.get("members", 1)),
                            ))
                        # Use Claude's natural language text as the reply
                        response = _natural_text or f"✅ Done!"
                    except Exception:
                        # Couldn't parse the JSON block — just strip it from display
                        response = _natural_text

            # Final safety: strip remaining code blocks and bare JSON from display text
            response = _re.sub(r'```(?:json)?[\s\S]*?```', '', response).strip()
            response = _re.sub(r'\{[^{}]*\}', '', response).replace('\n\n\n', '\n\n').strip()

        # ── Claude path: save turn + increment usage ──────────────────────────
        await _asyncio.gather(
            db.ai_usage.update_one(
                {"user_id": current_user['id'], "feature": "chatbot", "date": today_key},
                {"$inc": {"count": 1}}, upsert=True,
            ),
            _save_turn(response),
            return_exceptions=True,
        )
        updated_doc   = await db.ai_usage.find_one({"user_id": current_user['id'], "feature": "chatbot", "date": today_key})
        used_now      = updated_doc.get("count", 1) if updated_doc else 1
        messages_left = None if is_pro else max(0, daily_limit - used_now)

        return {
            "response":      response,
            "status":        "success",
            "layer":         1,
            "messages_left": messages_left,
        }

    except Exception as e:
        logger.error(f"Chatbot error: {str(e)}")
        err = str(e).lower()
        name = current_user.get('name', '').split()[0] if current_user else 'there'

        if "rate_limit" in err or "overloaded" in err or "529" in err:
            msg = (
                f"Hey {name}, I'm a little swamped right now — too many people asking me things at once 😅\n"
                f"Give it 30 seconds and try again, I'll be back."
            )
        elif "token" in err or "length" in err or "context" in err:
            msg = (
                f"That was a long one {name}! I got a bit overwhelmed processing it.\n"
                f"Try breaking it into smaller bits — I handle those much better."
            )
        elif "timeout" in err or "connect" in err or "network" in err:
            msg = (
                f"Looks like the connection hiccuped {name} — not your fault at all.\n"
                f"Just try again in a moment, I'm not going anywhere."
            )
        else:
            msg = (
                f"Something went sideways on my end {name}, sorry about that.\n"
                f"Your data is safe — just try again and I'll pick right up."
            )

        # Save error exchange to history (best-effort, non-blocking)
        try:
            ist_err = datetime.now(pytz.timezone("Asia/Kolkata"))
            import asyncio as _asyncio2
            await _asyncio2.gather(
                db.chat_messages.insert_one({"user_id": current_user['id'], "role": "user",      "content": input.message, "timestamp": ist_err, "pinned": False, "deleted": False, "reply_to": input.reply_to, "attachment": input.attachment}),
                db.chat_messages.insert_one({"user_id": current_user['id'], "role": "assistant", "content": msg,           "timestamp": ist_err, "pinned": False, "deleted": False, "reply_to": None, "attachment": None}),
                return_exceptions=True,
            )
        except Exception:
            pass

        return {"response": msg, "status": "error"}

@api_router.get("/")
async def root():
    return {"message": "Budget Mantra API"}

@api_router.get("/cache-stats")
async def get_cache_stats(_current_user: dict = Depends(get_current_user)):
    """Get cache statistics (admin endpoint)"""
    return {
        "caches": {
            "budget_summary": {
                "size": len(budget_summary_cache),
                "max_size": budget_summary_cache.maxsize,
                "ttl_seconds": 300
            },
            "financial_score": {
                "size": len(financial_score_cache),
                "max_size": financial_score_cache.maxsize,
                "ttl_seconds": 300
            },
            "emi_recommendations": {
                "size": len(emi_recommendations_cache),
                "max_size": emi_recommendations_cache.maxsize,
                "ttl_seconds": 600
            },
            "savings_summary": {
                "size": len(savings_summary_cache),
                "max_size": savings_summary_cache.maxsize,
                "ttl_seconds": 300
            }
        },
        "total_cached_items": (
            len(budget_summary_cache) + 
            len(financial_score_cache) + 
            len(emi_recommendations_cache) + 
            len(savings_summary_cache)
        )
    }

# ── Auto-debit Scheduler ─────────────────────────────────────────────────────

scheduler = AsyncIOScheduler(timezone=pytz.timezone("Asia/Kolkata"))

async def auto_debit_emi_payments():
    """Run daily: find EMIs whose debit day matches today, record payment automatically."""
    ist = pytz.timezone("Asia/Kolkata")
    today = datetime.now(ist)
    today_day = today.day
    today_date_str = today.strftime('%Y-%m-%d')
    logger.info(f"[Auto-debit] Running for day={today_day} date={today_date_str}")

    # Only process EMIs not already auto-debited today
    emis = await db.emis.find(
        {"emi_debit_day": today_day, "status": "active", "last_auto_debit_date": {"$ne": today_date_str}},
        {"_id": 0}
    ).to_list(1000)

    processed, skipped = 0, 0
    for emi_doc in emis:
        try:
            # Skip if all payments already recorded (data guard)
            if emi_doc.get('paid_months', 0) >= emi_doc.get('tenure_months', 0):
                logger.info(f"[Auto-debit] Skipping '{emi_doc['loan_name']}' — already fully paid")
                skipped += 1
                continue

            amount = emi_doc['monthly_payment']
            monthly_rate  = emi_doc['interest_rate'] / 12 / 100
            interest_paid = emi_doc['remaining_balance'] * monthly_rate
            # principal_paid must never be negative (prevents balance from increasing)
            principal_paid = max(0, amount - interest_paid)
            new_balance    = round(max(0, emi_doc['remaining_balance'] - principal_paid), 2)
            new_paid_months = emi_doc['paid_months'] + 1
            new_status = "closed" if new_balance <= 1 else "active"  # ≤1 rupee float tolerance

            await db.emis.update_one(
                {"id": emi_doc['id']},
                {"$set": {
                    "remaining_balance": new_balance,
                    "paid_months": new_paid_months,
                    "status": new_status,
                    "last_auto_debit_date": today_date_str,
                }}
            )
            invalidate_user_cache(emi_doc['user_id'])
            logger.info(f"[Auto-debit] ✓ '{emi_doc['loan_name']}' ₹{amount:,.0f} | balance ₹{new_balance:,.0f} | {new_paid_months}/{emi_doc['tenure_months']} paid")

            # Notify in Chanakya chat
            if new_status == "closed":
                chat_content = (
                    f"🎉 *{emi_doc['loan_name']}* — Loan fully paid off! Final payment of ₹{amount:,.0f} debited today. "
                    f"You're debt-free on this one! That's ₹{amount:,.0f}/month back in your pocket."
                )
            else:
                pct_done = round(new_paid_months / emi_doc['tenure_months'] * 100)
                chat_content = (
                    f"✓ EMI auto-debited: *{emi_doc['loan_name']}* ₹{amount:,.0f} paid today. "
                    f"{new_paid_months}/{emi_doc['tenure_months']} payments done ({pct_done}%). "
                    f"Balance remaining: ₹{new_balance:,.0f}."
                )
            await _insert_system_chat(emi_doc['user_id'], chat_content, notification_type="emi_debited")
            processed += 1
        except Exception as e:
            logger.error(f"[Auto-debit] ✗ EMI {emi_doc.get('id')}: {e}")
            skipped += 1

    logger.info(f"[Auto-debit] Done — {processed} debited, {skipped} failed")

@api_router.get("/spending-breakdown")
async def get_spending_breakdown(current_user: dict = Depends(get_current_user)):
    """Top 5 expense categories for the current calendar month."""
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": current_user['id']}

    ist = pytz.timezone("Asia/Kolkata")
    today = datetime.now(ist)
    month_start = f"{today.year}-{today.month:02d}-01"

    transactions = await db.transactions.find(
        {**family_filter, "type": "expense", "date": {"$gte": month_start}},
        {"_id": 0}
    ).to_list(1000)

    category_totals: dict = {}
    for txn in transactions:
        cat = txn.get("category_name", "Other")
        category_totals[cat] = category_totals.get(cat, 0) + txn["amount"]

    sorted_cats = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:5]
    total_spend = sum(v for _, v in sorted_cats) or 1

    return [
        {"category": cat, "amount": round(amount, 2), "pct": round(amount / total_spend * 100)}
        for cat, amount in sorted_cats
    ]


@api_router.post("/emis/trigger-auto-debit")
async def trigger_auto_debit(current_user: dict = Depends(get_current_user)):
    """Manual trigger for testing the auto-debit job."""
    await auto_debit_emi_payments()
    return {"message": "Auto-debit job executed"}

# ─────────────────────────────────────────────────────────────────────────────
# Category helpers
# ─────────────────────────────────────────────────────────────────────────────

_DEFAULT_EXPENSE_CATEGORIES = [
    "Rent / Housing", "Food & Dining", "Groceries", "Transport",
    "Bills & Utilities", "Shopping", "Entertainment", "Health & Medical",
    "Personal Care", "Education", "Travel", "Miscellaneous", "UPI Transfers",
]

async def _ensure_default_categories(uid: str, fgid: str | None) -> list:
    """Fetch categories for this user (respecting family sharing), seed any
    missing defaults, and return the deduplicated list."""
    from datetime import datetime as _dt

    if fgid:
        all_cats = await db.budget_categories.find(
            {"$or": [{"user_id": uid}, {"family_group_id": fgid}]}, {"_id": 0}
        ).to_list(1000)
    else:
        all_cats = await db.budget_categories.find({"user_id": uid}, {"_id": 0}).to_list(1000)

    # Deduplicate by (type, name_lower), preferring the user's own copy
    seen: dict = {}
    for cat in all_cats:
        key = (cat.get("type", ""), cat.get("name", "").lower())
        if key not in seen or cat.get("user_id") == uid:
            seen[key] = cat
    categories = list(seen.values())

    # Seed any missing defaults
    existing_names = {c["name"].lower() for c in categories if c.get("type") == "expense"}
    new_cats = []
    for name in _DEFAULT_EXPENSE_CATEGORIES:
        if name.lower() not in existing_names:
            doc = {
                "id": str(uuid.uuid4()), "name": name, "type": "expense",
                "allocated_amount": 0.0, "spent_amount": 0.0,
                "user_id": uid, "family_group_id": fgid,
                "created_at": _dt.utcnow().isoformat(),
            }
            new_cats.append(doc)
            existing_names.add(name.lower())
    if new_cats:
        await db.budget_categories.insert_many(new_cats)
        categories = categories + new_cats

    return categories


# ─────────────────────────────────────────────────────────────────────────────
# WhatsApp milestone notifications
# ─────────────────────────────────────────────────────────────────────────────

# ═════════════════════════════════════════════════════════════════════════════
# EMAIL FRAMEWORK — single core sender + branded template wrapper
# All email functions must use _bm_send_email() — never raw smtplib directly.
# ═════════════════════════════════════════════════════════════════════════════

def _bm_email_wrap(preheader: str, title: str, body_html: str,
                   cta_text: str = "", cta_url: str = "") -> str:
    """Generate a consistent branded HTML email shell around any content."""
    cta_block = f"""
    <div style="padding:0 32px 28px;text-align:center">
      <a href="{cta_url}"
         style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea6c0a);
                color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;
                border-radius:14px;text-decoration:none;letter-spacing:0.02em;
                box-shadow:0 4px 16px rgba(249,115,22,0.35)">
        {cta_text}
      </a>
    </div>""" if cta_text and cta_url else ""

    frontend_url = os.getenv("FRONTEND_URL", "https://budgetmantra.vercel.app")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f2ede8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;font-size:1px;color:#f2ede8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">{preheader}</div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2ede8;padding:24px 0 48px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Logo header bar -->
        <tr>
          <td style="padding:0 0 16px;text-align:center">
            <span style="font-family:Georgia,serif;font-size:13px;font-weight:600;color:#78716c;letter-spacing:1px;text-transform:uppercase">
              Budget Mantra
            </span>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 2px 24px rgba(0,0,0,0.06)">

            <!-- Orange header band -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg,#f97316 0%,#ea6c0a 100%);padding:36px 32px 28px">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:rgba(255,255,255,0.18);border-radius:12px;padding:10px 14px;margin-bottom:12px">
                        <span style="font-size:26px;line-height:1">₹</span>
                      </td>
                      <td style="padding-left:14px">
                        <p style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.3px">Budget Mantra</p>
                        <p style="margin:3px 0 0;color:rgba(255,255,255,0.8);font-size:12px">Your personal finance command centre</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Body content -->
            <div style="padding:32px 32px 20px">
              {body_html}
            </div>

            {cta_block}

            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:18px 32px;text-align:center">
                  <p style="margin:0 0 4px;color:#a8a29e;font-size:11px">
                    Made with ❤️ for India · <a href="{frontend_url}" style="color:#f97316;text-decoration:none">{frontend_url.replace("https://","")}</a>
                  </p>
                  <p style="margin:0;color:#c4bfba;font-size:11px">
                    You're receiving this because you signed up for Budget Mantra.
                    <a href="{frontend_url}/settings" style="color:#c4bfba;text-decoration:underline">Manage email preferences</a>
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def _bm_send_email(to_email: str, subject: str, html_body: str,
                         text_body: str, sender_label: str = "Budget Mantra") -> bool:
    """Core SMTP sender. All email helpers must call this — never raw smtplib."""
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)

    if not smtp_user or not smtp_pass:
        logger.info(f"[Email] SMTP not configured — skipping {to_email} | {subject}")
        return False

    msg              = MIMEMultipart("alternative")
    msg["Subject"]   = subject
    msg["From"]      = f"{sender_label} <{smtp_from}>"
    msg["To"]        = to_email
    msg["List-Unsubscribe"] = f"<mailto:{smtp_from}?subject=unsubscribe>"
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    def _send():
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_from, to_email, msg.as_string())

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)
        logger.info(f"[Email] ✓ sent '{subject}' → {to_email}")
        return True
    except Exception as exc:
        logger.error(f"[Email] ✗ failed '{subject}' → {to_email}: {exc}")
        return False


# ── Email type builders ───────────────────────────────────────────────────────

async def _email_welcome(to_email: str, name: str) -> bool:
    first = name.split()[0] if name else "there"
    frontend_url = os.getenv("FRONTEND_URL", "https://budgetmantra.vercel.app")

    def feat(emoji, title, desc):
        return f"""<tr>
      <td style="padding:0 10px 14px 0;vertical-align:top;width:26px;font-size:20px">{emoji}</td>
      <td style="padding:0 0 14px;vertical-align:top">
        <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#1c1917">{title}</p>
        <p style="margin:0;font-size:12px;color:#78716c;line-height:1.5">{desc}</p>
      </td>
    </tr>"""

    features_html = "".join(feat(e, t, d) for e, t, d in [
        ("🤖", "Chanakya AI", "Ask anything — net worth, EMI burden, can I afford this?"),
        ("💸", "Expense Tracking", "Log via chat, UPI SMS, or the quick composer. Bulk import too."),
        ("📊", "Budget Alerts", "Set category limits and get warned before you overshoot."),
        ("🏦", "EMI Manager", "All loans in one place with foreclosure planner."),
        ("🎯", "Savings Goals", "Set targets for travel, gadgets, or emergencies."),
        ("✈️", "Trip Planner", "AI itineraries, group expense splits, PDF export."),
        ("📈", "Investments", "Stocks, MFs, gold, insurance — full portfolio view."),
        ("💑", "Circle", "Share finances with your partner. Real-time sync."),
    ])

    body = f"""
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1c1917">Hey {first}! 👋</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#57534e;line-height:1.65">
      Welcome to Budget Mantra. Your AI advisor <strong style="color:#f97316">Chanakya</strong> is live and ready.
      Here's what's waiting for you:
    </p>
    <div style="background:#fffbf5;border:1px solid #fed7aa;border-radius:14px;padding:20px 20px 6px">
      <table width="100%" cellpadding="0" cellspacing="0">{features_html}</table>
    </div>
    <div style="margin-top:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 18px">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#166534">💡 Fastest way to log: WhatsApp</p>
      <p style="margin:0;font-size:13px;color:#15803d;line-height:1.55">
        Add your number in Profile, then WhatsApp <strong>+1 415 523 8886</strong>.<br>
        Just say <em>"spent ₹800 on petrol"</em> — Chanakya logs it instantly.
      </p>
    </div>"""

    text = f"""Hey {first}!

Welcome to Budget Mantra — your personal finance command centre.

Your AI advisor Chanakya is live. Here's what you have access to:
• Expense tracking, budget alerts, category limits
• EMI manager, savings goals, investment portfolio
• Trip planner with group splits, Circle for partner finance
• WhatsApp logging: message +1 415 523 8886 "spent ₹800 on petrol"

Open your dashboard: {frontend_url}/dashboard

— The Budget Mantra team"""

    html = _bm_email_wrap(
        preheader=f"Your financial command centre is live, {first}. Meet Chanakya — your AI money advisor.",
        title="Welcome to Budget Mantra",
        body_html=body,
        cta_text="Open your Dashboard →",
        cta_url=f"{frontend_url}/dashboard",
    )
    return await _bm_send_email(to_email, "Welcome to Budget Mantra — your command centre is ready 🎉", html, text)


async def _email_emi_reminder(to_email: str, name: str, emi_name: str, amount: float, due_days: int) -> bool:
    first = name.split()[0] if name else "there"
    frontend_url = os.getenv("FRONTEND_URL", "https://budgetmantra.vercel.app")
    due_str = "today" if due_days == 0 else f"tomorrow" if due_days == 1 else f"in {due_days} days"
    body = f"""
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1c1917">EMI Reminder 🔔</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#57534e">Hey {first}, your EMI is due {due_str}.</p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:20px 24px">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.05em">EMI Due</p>
      <p style="margin:0 0 2px;font-size:20px;font-weight:800;color:#1c1917">{emi_name}</p>
      <p style="margin:0;font-size:28px;font-weight:900;color:#f97316">₹{int(amount):,}</p>
      <p style="margin:6px 0 0;font-size:12px;color:#a8a29e">Due {due_str}</p>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#78716c">Make sure your account has sufficient balance to avoid bounce charges or late fees.</p>"""

    text = f"""Hey {first},

Reminder: Your EMI "{emi_name}" of ₹{int(amount):,} is due {due_str}.

Ensure your bank account has sufficient balance.

View your EMIs: {frontend_url}/emis

— Budget Mantra"""

    html = _bm_email_wrap(
        preheader=f"EMI reminder: {emi_name} — ₹{int(amount):,} due {due_str}",
        title="EMI Reminder",
        body_html=body,
        cta_text="View EMIs →",
        cta_url=f"{frontend_url}/emis",
    )
    return await _bm_send_email(to_email, f"EMI Reminder: {emi_name} due {due_str} — ₹{int(amount):,}", html, text)


async def _email_goal_milestone(to_email: str, name: str, goal_name: str, pct: int, saved: float, target: float) -> bool:
    first = name.split()[0] if name else "there"
    frontend_url = os.getenv("FRONTEND_URL", "https://budgetmantra.vercel.app")
    body = f"""
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1c1917">Goal Milestone! 🎯</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#57534e">Nice work {first} — you've hit <strong>{pct}%</strong> of your savings goal!</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px 24px">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.05em">Goal Progress</p>
      <p style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1c1917">{goal_name}</p>
      <div style="background:#dcfce7;border-radius:100px;height:10px;margin-bottom:8px">
        <div style="background:linear-gradient(to right,#10b981,#059669);height:10px;border-radius:100px;width:{min(100,pct)}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:13px;color:#15803d;font-weight:700">Saved: ₹{int(saved):,}</span>
        <span style="font-size:13px;color:#a8a29e">Target: ₹{int(target):,}</span>
      </div>
    </div>"""

    text = f"""Hey {first}!

You've reached {pct}% of your "{goal_name}" savings goal! 🎯

Saved: ₹{int(saved):,} of ₹{int(target):,}

Keep it up! View your goals: {frontend_url}/savings-goals

— Budget Mantra"""

    html = _bm_email_wrap(
        preheader=f"You're {pct}% of the way to '{goal_name}' — ₹{int(saved):,} saved!",
        title="Goal Milestone",
        body_html=body,
        cta_text="View Goals →",
        cta_url=f"{frontend_url}/savings-goals",
    )
    return await _bm_send_email(to_email, f"🎯 You're {pct}% of the way to '{goal_name}'!", html, text)


async def _email_budget_alert(to_email: str, name: str, category: str, spent: float, budget: float, pct: int) -> bool:
    first = name.split()[0] if name else "there"
    frontend_url = os.getenv("FRONTEND_URL", "https://budgetmantra.vercel.app")
    over = pct >= 100
    body = f"""
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1c1917">
      {"Budget Exceeded ⚠️" if over else "Budget Alert ⚠️"}
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:#57534e">
      Hey {first}, your <strong>{category}</strong> budget has {'been exceeded' if over else f'hit {pct}%'} this month.
    </p>
    <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;padding:20px 24px">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#be123c;text-transform:uppercase;letter-spacing:0.05em">Category Limit</p>
      <p style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1c1917">{category}</p>
      <div style="background:#ffe4e6;border-radius:100px;height:10px;margin-bottom:8px">
        <div style="background:linear-gradient(to right,#f43f5e,#e11d48);height:10px;border-radius:100px;width:{min(100,pct)}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:13px;color:#be123c;font-weight:700">Spent: ₹{int(spent):,}</span>
        <span style="font-size:13px;color:#a8a29e">Budget: ₹{int(budget):,}</span>
      </div>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#78716c">
      Consider reviewing your spending in this category or adjusting your budget limit for next month.
    </p>"""

    text = f"""Hey {first},

{"Budget exceeded!" if over else f"Budget alert — {pct}% used!"} Your {category} budget is {"over the limit" if over else f"at {pct}%"}.

Spent: ₹{int(spent):,} / Budget: ₹{int(budget):,}

Review your spending: {frontend_url}/budget

— Budget Mantra"""

    html = _bm_email_wrap(
        preheader=f"Budget alert: {category} is at {pct}% — ₹{int(spent):,} of ₹{int(budget):,} used",
        title="Budget Alert",
        body_html=body,
        cta_text="Review Budget →",
        cta_url=f"{frontend_url}/budget",
    )
    subject = f"{'🚨 Budget exceeded' if over else '⚠️ Budget alert'}: {category} at {pct}%"
    return await _bm_send_email(to_email, subject, html, text)


async def _email_weekly_digest(to_email: str, name: str, spent: float, income: float,
                                top_cat: str, top_cat_amt: float, txn_count: int) -> bool:
    first = name.split()[0] if name else "there"
    frontend_url = os.getenv("FRONTEND_URL", "https://budgetmantra.vercel.app")
    saved = income - spent
    savings_rate = round(saved / income * 100) if income > 0 else 0

    body = f"""
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1c1917">Your Weekly Snapshot 📊</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#57534e">Hey {first}, here's how your week looked:</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:0 6px 12px 0;width:50%;vertical-align:top">
          <div style="background:#f5f0eb;border-radius:12px;padding:14px 16px">
            <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#a8a29e;text-transform:uppercase;letter-spacing:0.1em">Spent</p>
            <p style="margin:0;font-size:20px;font-weight:800;color:#1c1917">₹{int(spent):,}</p>
          </div>
        </td>
        <td style="padding:0 0 12px 6px;width:50%;vertical-align:top">
          <div style="background:#f0fdf4;border-radius:12px;padding:14px 16px">
            <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#a8a29e;text-transform:uppercase;letter-spacing:0.1em">Saved</p>
            <p style="margin:0;font-size:20px;font-weight:800;color:{'#10b981' if saved >= 0 else '#ef4444'}">₹{int(abs(saved)):,}</p>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0 0 12px">
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px">
            <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.1em">Top Category</p>
            <p style="margin:0;font-size:15px;font-weight:700;color:#1c1917">{top_cat} · <span style="color:#f97316">₹{int(top_cat_amt):,}</span></p>
            <p style="margin:4px 0 0;font-size:12px;color:#a8a29e">{txn_count} transactions logged</p>
          </div>
        </td>
      </tr>
    </table>
    <p style="margin:8px 0 0;font-size:13px;color:#78716c">
      {'Great job saving ' + str(savings_rate) + '% this week! 🎉' if savings_rate > 20 else 'Keep logging — awareness is the first step to better saving.'}
    </p>"""

    text = f"""Your Budget Mantra weekly snapshot, {first}:

Spent this week: ₹{int(spent):,}
Saved: ₹{int(abs(saved)):,} ({savings_rate}% of income)
Top category: {top_cat} — ₹{int(top_cat_amt):,}
Transactions: {txn_count}

View your full dashboard: {frontend_url}/dashboard

— Budget Mantra"""

    html = _bm_email_wrap(
        preheader=f"This week: spent ₹{int(spent):,}, top category {top_cat}",
        title="Weekly Snapshot",
        body_html=body,
        cta_text="Open Dashboard →",
        cta_url=f"{frontend_url}/dashboard",
    )
    return await _bm_send_email(to_email, "Your Budget Mantra weekly snapshot 📊", html, text)


async def _send_password_reset_email(to_email: str, name: str, token: str) -> bool:
    """Send password reset link via email."""
    first = name.split()[0] if name else "there"
    frontend_url = os.getenv("FRONTEND_URL", "https://budgetmantra.vercel.app")
    reset_url = f"{frontend_url}/reset-password?token={token}"
    body_html = f"""
<p style="margin:0 0 16px;font-size:15px;color:#57534e;line-height:1.6">
  Hi {first}, we received a request to reset your Budget Mantra password.
</p>
<p style="margin:0 0 8px;font-size:13px;color:#a8a29e">
  This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.
</p>"""
    text_body = f"Hi {first},\n\nReset your Budget Mantra password:\n{reset_url}\n\nThis link expires in 1 hour.\n\n— The Budget Mantra team"
    html = _bm_email_wrap(
        preheader="Reset your Budget Mantra password",
        title="Reset your password",
        body_html=body_html,
        cta_text="Reset Password →",
        cta_url=reset_url,
    )
    return await _bm_send_email(to_email, "Reset your Budget Mantra password", html, text_body)


async def _send_otp_email(to_email: str, name: str, otp: str) -> bool:
    """Send 6-digit OTP for email verification."""
    first = name.split()[0] if name else "there"
    body_html = f"""
<p style="margin:0 0 16px;font-size:15px;color:#57534e;line-height:1.6">
  Hi {first}, use this code to complete your Budget Mantra signup:
</p>
<div style="background:#fff7ed;border:2px solid #fed7aa;border-radius:16px;padding:28px;text-align:center;margin:0 0 16px">
  <span style="font-size:44px;font-weight:800;letter-spacing:14px;color:#ea580c;font-family:monospace">{otp}</span>
</div>
<p style="margin:0;font-size:13px;color:#a8a29e">
  This code expires in <strong>10 minutes</strong>. If you didn't request this, ignore this email.
</p>"""
    text_body = f"Hi {first},\n\nYour Budget Mantra verification code: {otp}\n\nExpires in 10 minutes.\n\n— The Budget Mantra team"
    html = _bm_email_wrap(
        preheader=f"Your verification code is {otp}",
        title="Verify your email",
        body_html=body_html,
        cta_text=None,
        cta_url=None,
    )
    return await _bm_send_email(to_email, f"Your Budget Mantra verification code: {otp}", html, text_body)


async def _send_onboarding_email(to_email: str, name: str) -> bool:
    """Deprecated shim — delegates to _email_welcome()."""
    return await _email_welcome(to_email, name)


async def send_email_notification(to_email: str, subject: str, text_body: str) -> bool:
    """Send a generic notification email using the branded framework."""
    _paragraphs = "".join(
        f'<p style="margin:0 0 14px;font-size:14px;color:#292524;line-height:1.6">{line}</p>'
        for line in text_body.split("\n") if line.strip()
    )
    html = _bm_email_wrap(
        preheader=subject,
        title="A message from Budget Mantra",
        body_html=_paragraphs,
    )
    return await _bm_send_email(to_email, subject, html, text_body, sender_label="Chanakya | Budget Mantra")


async def send_whatsapp_notification(phone: str, message: str) -> bool:
    """Send a proactive WhatsApp message via Twilio REST API.
    Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM env vars."""
    sid   = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_ = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")  # Twilio sandbox default
    if not sid or not token:
        logger.warning("[WA-Notify] TWILIO_ACCOUNT_SID/AUTH_TOKEN not set — skipping")
        return False
    # Normalise phone to whatsapp:+91XXXXXXXXXX
    raw = phone.strip().replace(" ", "")
    if not raw.startswith("+"):
        raw = "+91" + raw.lstrip("91").lstrip("0")
    to = f"whatsapp:{raw}"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    payload = {"From": from_, "To": to, "Body": message}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=payload, auth=aiohttp.BasicAuth(sid, token),
                                    timeout=aiohttp.ClientTimeout(total=8)) as resp:
                ok = resp.status in (200, 201)
                if not ok:
                    body = await resp.text()
                    logger.warning(f"[WA-Notify] Twilio error {resp.status}: {body[:200]}")
                return ok
    except Exception as exc:
        logger.error(f"[WA-Notify] send failed for {raw}: {exc}")
        return False


async def send_milestone_notifications():
    """Daily job: check each user's upcoming financial milestones and notify via WhatsApp and/or email."""
    ist = pytz.timezone("Asia/Kolkata")
    today = datetime.now(ist)
    today_str = today.strftime("%Y-%m-%d")
    today_day = today.day
    today_month = today.month
    is_month_start = today_day == 1

    logger.info(f"[Notify] Running milestone notifications for {today_str}")

    # Fetch all users — chat notifications go to everyone, WA/email only when configured
    users = await db.users.find({}, {"_id": 0}).to_list(5000)

    for user in users:
        phone = user.get("phone", "").strip()
        email = user.get("email", "").strip()
        uid   = user["id"]
        name  = user.get("name", "there")

        # Load notification preferences (use defaults if not set)
        raw_prefs = user.get("notification_prefs", {}) or {}
        prefs = NotificationPrefs(**raw_prefs)

        wa_enabled    = prefs.whatsapp_enabled and bool(phone)
        email_enabled = prefs.email_enabled and bool(email)
        chat_enabled  = prefs.notify_via_chat   # always true by default
        if not wa_enabled and not email_enabled and not chat_enabled:
            continue

        remind_days = prefs.reminder_days_before
        messages = []   # shared list; each entry is plain-text message

        try:
            # ── 1. Salary / paycheck day ─────────────────────────────────────
            if prefs.notify_salary:
                jobs = await db.jobs.find({"user_id": uid, "end_month": {"$exists": False}}, {"_id": 0}).to_list(5)
                for job in jobs:
                    salary_day = job.get("salary_day") or job.get("payday")
                    if salary_day and int(salary_day) == today_day:
                        take_home = job.get("take_home") or job.get("salary", 0)
                        messages.append(
                            f"💰 Salary Day!\nHey {name}, your ₹{int(take_home):,} from {job.get('company','your company')} "
                            f"should hit your account today. Budget wisely!"
                        )

            # ── 2. EMI due within N days ──────────────────────────────────────
            if prefs.notify_emi:
                emis = await db.emis.find({"user_id": uid, "status": "active"}, {"_id": 0}).to_list(50)
                for emi in emis:
                    debit_day = emi.get("emi_debit_day") or emi.get("debit_day")
                    if debit_day:
                        days_until = int(debit_day) - today_day
                        if 0 <= days_until <= remind_days:
                            when = "today" if days_until == 0 else f"in {days_until} day{'s' if days_until > 1 else ''}"
                            messages.append(
                                f"⏰ EMI Reminder\n₹{int(emi['monthly_payment']):,} for {emi['loan_name']} is due {when}. "
                                f"Make sure funds are ready!"
                            )

            # ── 3. Subscriptions due within N days ───────────────────────────
            if prefs.notify_subscriptions:
                subs = await db.subscriptions.find({"user_id": uid}, {"_id": 0}).to_list(100)
                for sub in subs:
                    nbd = sub.get("next_billing_date", "")
                    if not nbd:
                        continue
                    try:
                        nbd_dt = datetime.strptime(nbd[:10], "%Y-%m-%d").replace(tzinfo=ist)
                        days_until = (nbd_dt - today).days
                        if 0 <= days_until <= remind_days:
                            when = "today" if days_until == 0 else f"in {days_until} day{'s' if days_until > 1 else ''}"
                            messages.append(
                                f"📺 Subscription Renewal\n{sub['name']} renews {when} — ₹{int(sub['amount']):,} will be auto-debited."
                            )
                    except Exception:
                        pass

            # ── 4. Savings goal deadline approaching (≤30 days) ──────────────
            if prefs.notify_savings_goals:
                goals = await db.savings_goals.find(
                    {"user_id": uid, "status": "active", "target_date": {"$exists": True, "$ne": ""}},
                    {"_id": 0}
                ).to_list(20)
                for g in goals:
                    td = g.get("target_date", "")
                    if not td:
                        continue
                    try:
                        target_dt = datetime.strptime(td[:10], "%Y-%m-%d").replace(tzinfo=ist)
                        days_left = (target_dt - today).days
                        if days_left == 0:
                            messages.append(
                                f"🏆 Goal Day!\nToday is the target date for '{g['name']}'. "
                                f"You've saved ₹{int(g.get('current_amount',0)):,} — amazing work!"
                            )
                        elif 0 < days_left <= 30:
                            saved  = g.get("current_amount", 0)
                            needed = g.get("target_amount", 0) - saved
                            messages.append(
                                f"🎯 Goal Alert!\nYour goal '{g['name']}' is due in {days_left} days. "
                                f"You still need ₹{int(needed):,} to reach your target. Keep going!"
                            )
                    except Exception:
                        pass

            # ── 5. Birthdays & anniversaries today ───────────────────────────
            if prefs.notify_birthdays:
                # People events (birthday / anniversary / etc.)
                events = await db.people_events.find(
                    {"user_id": uid, "month": today_month, "day": today_day},
                    {"_id": 0}
                ).to_list(20)
                for ev in events:
                    etype = ev.get("event_type", "event").capitalize()
                    emoji = ev.get("emoji") or ("🎂" if ev.get("event_type") == "birthday" else "💍")
                    gift  = ev.get("gift_budget", 0)
                    gift_note = f" Budget set: ₹{int(gift):,}" if gift else ""
                    messages.append(
                        f"{emoji} {etype} Today!\n{ev['person_name']}'s {etype.lower()} is today.{gift_note} Don't forget to celebrate!"
                    )
                # Children birthdays
                children = await db.children.find({"user_id": uid}, {"_id": 0}).to_list(20)
                for child in children:
                    dob = child.get("dob", "")
                    if dob:
                        try:
                            dob_dt = datetime.strptime(dob[:10], "%Y-%m-%d")
                            if dob_dt.month == today_month and dob_dt.day == today_day:
                                age = today.year - dob_dt.year
                                messages.append(
                                    f"🎂 Birthday Alert!\n{child['name']} turns {age} today! Wishing them a wonderful birthday!"
                                )
                        except Exception:
                            pass

            # ── 6. Hand loans due within N days ──────────────────────────────
            if prefs.notify_hand_loans:
                loans = await db.hand_loans.find(
                    {"user_id": uid, "status": {"$ne": "settled"}, "due_date": {"$exists": True, "$ne": ""}},
                    {"_id": 0}
                ).to_list(30)
                for loan in loans:
                    due = loan.get("due_date", "")
                    if not due:
                        continue
                    try:
                        due_dt = datetime.strptime(due[:10], "%Y-%m-%d").replace(tzinfo=ist)
                        days_until = (due_dt - today).days
                        if 0 <= days_until <= remind_days:
                            direction = "you gave" if loan.get("type") == "given" else "you owe"
                            when = "today" if days_until == 0 else f"in {days_until} day{'s' if days_until > 1 else ''}"
                            messages.append(
                                f"🤝 Hand Loan Reminder\n₹{int(loan['amount']):,} {direction} to {loan['person_name']} is due {when}."
                            )
                    except Exception:
                        pass

            # ── 7. Monthly budget summary (1st of every month) ───────────────
            if prefs.notify_budget_summary and is_month_start:
                last_month = today.replace(day=1) - timedelta(days=1)
                lm_start  = last_month.strftime("%Y-%m-01")
                lm_end    = last_month.strftime("%Y-%m-%d")
                cats = await db.budget_categories.find({"user_id": uid}, {"_id": 0}).to_list(50)
                txns = await db.transactions.find(
                    {"user_id": uid, "date": {"$gte": lm_start, "$lte": lm_end}, "type": "expense"},
                    {"_id": 0}
                ).to_list(1000)
                total_income = sum(c.get("allocated_amount", 0) for c in cats if c.get("type") == "income")
                total_spent  = sum(t.get("amount", 0) for t in txns)
                savings_rate = round((total_income - total_spent) / total_income * 100) if total_income else 0
                month_name   = last_month.strftime("%B")
                mood = "Great job!" if savings_rate >= 20 else "Good effort!" if savings_rate >= 10 else "Watch your spending next month!"
                messages.append(
                    f"📊 {month_name} Summary\n"
                    f"Income: ₹{int(total_income):,} | Spent: ₹{int(total_spent):,}\n"
                    f"Savings rate: {savings_rate}% — {mood} New month, fresh start!"
                )

            # ── 8. When-to-Buy items now affordable ──────────────────────────
            if prefs.notify_when_to_buy:
                # Recalculate affordability for items the user has previously checked
                history_items = await db.when_to_buy_history.find(
                    {"user_id": uid}, {"_id": 0, "item_name": 1, "target_amount": 1, "status": 1, "created_at": 1}
                ).sort("created_at", -1).to_list(200)
                # Get latest status per item_name
                seen: dict = {}
                for h in history_items:
                    iname = h.get("item_name", "")
                    if iname and iname not in seen:
                        seen[iname] = h
                # Recalculate current surplus once
                cats_now = await db.budget_categories.find({"user_id": uid}, {"_id": 0}).to_list(50)
                emis_now = await db.emis.find({"user_id": uid, "status": "active"}, {"_id": 0}).to_list(50)
                income_now  = sum(c.get("allocated_amount", 0) for c in cats_now if c.get("type") == "income")
                expense_now = sum(c.get("allocated_amount", 0) for c in cats_now if c.get("type") == "expense")
                emi_now     = sum(e.get("monthly_payment", 0) for e in emis_now)
                surplus_now = income_now - expense_now - emi_now
                if surplus_now > 0:
                    for iname, last in seen.items():
                        if last.get("status") in ("not_advisable", "save_more"):
                            target = last.get("target_amount", 0)
                            months_now = int(target / surplus_now) if surplus_now > 0 else 999
                            if months_now <= 3:
                                messages.append(
                                    f"🛍️ Ready to Buy!\nGreat news! Based on your current finances, "
                                    f"you can now afford {iname} (₹{int(target):,}) in just {months_now} month{'s' if months_now != 1 else ''}!"
                                )

            # ── Send via enabled channels ─────────────────────────────────────
            if not messages:
                continue

            app_url = os.getenv("APP_URL", "https://budget-mantra-nine.vercel.app").strip()
            url_footer = f"\n\n🔗 Open app: {app_url}" if app_url else ""

            expo_push_token = user.get("expo_push_token", "").strip()

            for msg_text in messages:
                if wa_enabled:
                    await send_whatsapp_notification(phone, f"*Chanakya*\n{msg_text}{url_footer}")
                if email_enabled:
                    subject = msg_text.split("\n")[0].strip()
                    await send_email_notification(email, subject, msg_text + (f"\n\nOpen app: {app_url}" if app_url else ""))
                if expo_push_token:
                    title = msg_text.split("\n")[0].strip()
                    body  = msg_text.split("\n", 1)[1].strip() if "\n" in msg_text else msg_text
                    asyncio.create_task(_send_expo_push(expo_push_token, title, body))

            # ── Chat notifications (batch insert, one write per user) ─────────
            if chat_enabled:
                now = datetime.now(timezone.utc)
                chat_docs = [
                    {
                        "user_id": uid,
                        "role": "assistant",
                        "source": "system",
                        "notification_type": "daily_reminder",
                        "content": msg_text,
                        "timestamp": now,
                        "pinned": False,
                        "deleted": False,
                        "reply_to": None,
                        "attachment": None,
                    }
                    for msg_text in messages
                ]
                await db.chat_messages.insert_many(chat_docs)

        except Exception as exc:
            logger.error(f"[Notify] Error processing user {uid}: {exc}")

    logger.info(f"[Notify] Done for {today_str}")


@api_router.post("/notifications/trigger")
async def trigger_notifications(current_user: dict = Depends(get_current_user)):
    """Manual trigger for testing milestone notifications."""
    await send_milestone_notifications()
    return {"message": "Notification job executed"}


@api_router.get("/preferences/daily-limit")
async def get_daily_limit(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    user = await db.users.find_one({"id": uid}, {"_id": 0, "daily_spend_limit": 1})
    return {"daily_spend_limit": (user or {}).get("daily_spend_limit")}

@api_router.put("/preferences/daily-limit")
async def set_daily_limit(body: dict, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    limit = body.get("daily_spend_limit")
    if limit is not None:
        limit = float(limit)
    await db.users.update_one({"id": uid}, {"$set": {"daily_spend_limit": limit}})
    return {"daily_spend_limit": limit}

@api_router.get("/income-entries")
async def list_income_entries(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    entries = await db.income_entries.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(500)
    return entries

@api_router.post("/income-entries", status_code=201)
async def add_income_entry(body: dict, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "amount": amount,
        "source_type": body.get("source_type", "other"),  # salary|freelance|rental|business|dividend|interest|other
        "source": body.get("source", "").strip(),          # e.g. "Acme Corp", "Flat 3B tenant"
        "description": body.get("description", "").strip(),
        "date": body.get("date", datetime.now(timezone.utc).date().isoformat()),
        "is_recurring": bool(body.get("is_recurring", False)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.income_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/income-entries/{entry_id}")
async def update_income_entry(entry_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    if not await db.income_entries.find_one({"id": entry_id, "user_id": uid}):
        raise HTTPException(status_code=404, detail="Entry not found")
    allowed = {"amount", "source_type", "source", "description", "date", "is_recurring"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "amount" in updates:
        updates["amount"] = float(updates["amount"])
    await db.income_entries.update_one({"id": entry_id}, {"$set": updates})
    return {"success": True}

@api_router.delete("/income-entries/{entry_id}", status_code=204)
async def delete_income_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    result = await db.income_entries.delete_one({"id": entry_id, "user_id": uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    invalidate_user_cache(uid)

@api_router.get("/income-entries/month-summary")
async def income_month_summary(current_user: dict = Depends(get_current_user)):
    """Total income for the current month broken down by source type."""
    from datetime import date as _date
    uid = current_user["id"]
    today = _date.today()
    month_start = f"{today.year}-{today.month:02d}-01"
    month_end   = f"{today.year}-{today.month:02d}-{today.day:02d}"
    entries = await db.income_entries.find(
        {"user_id": uid, "date": {"$gte": month_start, "$lte": month_end}},
        {"_id": 0}
    ).to_list(500)
    total = sum(e["amount"] for e in entries)
    by_type = {}
    for e in entries:
        t = e.get("source_type", "other")
        by_type[t] = by_type.get(t, 0) + e["amount"]
    # Pull latest paycheck net pay if no salary entry this month
    salary_in_entries = by_type.get("salary", 0)
    paycheck_salary = 0
    if not salary_in_entries:
        latest_paycheck = await db.paychecks.find_one(
            {"user_id": uid},
            {"_id": 0, "net_pay": 1, "payment_date": 1},
            sort=[("payment_date", -1)]
        )
        if latest_paycheck and latest_paycheck.get("net_pay"):
            paycheck_salary = float(latest_paycheck["net_pay"])
    return {
        "total": round(total, 2),
        "by_type": {k: round(v, 2) for k, v in by_type.items()},
        "paycheck_salary": round(paycheck_salary, 2),
        "entries": entries,
    }


@api_router.get("/transactions/today-summary")
async def get_today_summary(current_user: dict = Depends(get_current_user)):
    """Sum of expense transactions for today (local date of user)."""
    from datetime import date as _date
    today_str = _date.today().isoformat()  # YYYY-MM-DD
    uid = current_user["id"]
    family_filter = {"family_group_id": current_user.get("family_group_id")} if current_user.get("family_group_id") else {"user_id": uid}
    txns = await db.transactions.find(
        {**family_filter, "date": today_str, "type": "expense"},
        {"_id": 0, "amount": 1, "category_name": 1, "description": 1}
    ).to_list(500)
    total = sum(t.get("amount", 0) for t in txns)
    return {"total": round(total, 2), "count": len(txns), "transactions": txns, "date": today_str}


@api_router.get("/notifications/preferences")
async def get_notification_preferences(current_user: dict = Depends(get_current_user)):
    """Get the current user's notification preferences."""
    uid = current_user["id"]
    user = await db.users.find_one({"id": uid}, {"_id": 0, "notification_prefs": 1})
    raw = (user or {}).get("notification_prefs") or {}
    return NotificationPrefs(**raw).model_dump()


@api_router.put("/notifications/preferences")
async def update_notification_preferences(prefs: NotificationPrefs, current_user: dict = Depends(get_current_user)):
    """Update the current user's notification preferences."""
    uid = current_user["id"]
    await db.users.update_one({"id": uid}, {"$set": {"notification_prefs": prefs.model_dump()}})
    return {"message": "Preferences saved", "prefs": prefs.model_dump()}


# ─────────────────────────────────────────────────────────────────────────────
# Recurring Expenses
# ─────────────────────────────────────────────────────────────────────────────

class RecurringExpenseCreate(BaseModel):
    name: str
    amount: float
    category_id: str
    category_name: str
    description: str = ""
    frequency: str = "monthly"      # monthly | weekly | yearly
    day_of_month: int = 1           # 1-28; for weekly = weekday (0=Mon); for yearly = day in start_date month
    start_date: str                 # YYYY-MM-DD
    end_date: str = ""              # YYYY-MM-DD or "" = indefinite
    emoji: str = "🔄"

class RecurringExpenseUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    description: Optional[str] = None
    frequency: Optional[str] = None
    day_of_month: Optional[int] = None
    end_date: Optional[str] = None
    is_active: Optional[bool] = None
    emoji: Optional[str] = None


async def auto_create_recurring_expenses():
    """Daily job: auto-create transactions for active recurring expenses due today."""
    ist = pytz.timezone("Asia/Kolkata")
    today = datetime.now(ist)
    today_str   = today.strftime("%Y-%m-%d")
    today_day   = today.day
    today_month = today.month
    today_year  = today.year

    logger.info(f"[Recurring] Running auto-create for {today_str}")
    recs = await db.recurring_expenses.find({"is_active": True}, {"_id": 0}).to_list(10000)

    for rec in recs:
        try:
            # Deactivate if past end_date
            if rec.get("end_date") and rec["end_date"] < today_str:
                await db.recurring_expenses.update_one({"id": rec["id"]}, {"$set": {"is_active": False}})
                continue
            # Skip if start_date not reached yet
            if rec.get("start_date", "") > today_str:
                continue

            freq = rec.get("frequency", "monthly")
            last = rec.get("last_created_date", "")
            should_create = False

            if freq == "monthly":
                day = rec.get("day_of_month", 1)
                if today_day == day and last[:7] != today_str[:7]:
                    should_create = True
            elif freq == "yearly":
                try:
                    sd = datetime.strptime(rec["start_date"][:10], "%Y-%m-%d")
                    if today_month == sd.month and today_day == sd.day and last[:4] != str(today_year):
                        should_create = True
                except Exception:
                    pass
            elif freq == "weekly":
                try:
                    sd = datetime.strptime(rec["start_date"][:10], "%Y-%m-%d")
                    # make sd timezone-aware
                    sd_aware = sd.replace(tzinfo=ist)
                    days_since = (today - sd_aware).days
                    if days_since >= 0 and days_since % 7 == 0 and last != today_str:
                        should_create = True
                except Exception:
                    pass

            if not should_create:
                continue

            uid = rec["user_id"]
            txn_doc = {
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "family_group_id": rec.get("family_group_id"),
                "category_id": rec["category_id"],
                "category_name": rec["category_name"],
                "amount": rec["amount"],
                "description": rec.get("description") or rec["name"],
                "type": "expense",
                "date": today_str,
                "source": "recurring",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.transactions.insert_one(txn_doc)
            await db.budget_categories.update_one(
                {"id": rec["category_id"]},
                {"$inc": {"spent_amount": rec["amount"]}}
            )
            await db.recurring_expenses.update_one(
                {"id": rec["id"]}, {"$set": {"last_created_date": today_str}}
            )
            invalidate_user_cache(uid)
            logger.info(f"[Recurring] ✅ {rec['name']} ₹{rec['amount']} → user {uid}")

            # Notify via Chanakya chat
            freq_label = {"monthly": "monthly", "weekly": "weekly", "yearly": "annual"}.get(
                rec.get("frequency", "monthly"), "recurring"
            )
            chat_content = (
                f"✓ Auto-logged your *{rec['name']}* ₹{int(rec['amount']):,} "
                f"({rec['category_name']}) — {freq_label} expense for {today_str[:7]}. "
                f"Budget updated. Nothing for you to do."
            )
            await _insert_system_chat(uid, chat_content, notification_type="recurring_logged")
        except Exception as exc:
            logger.error(f"[Recurring] Error for {rec.get('id')}: {exc}")

    logger.info(f"[Recurring] Done for {today_str}")


async def calendar_event_notifications():
    """Run daily at 08:00 IST — send smart reminders for upcoming calendar events."""
    ist   = pytz.timezone("Asia/Kolkata")
    today = datetime.now(ist).date()

    # Lead-time rules: how many days before should we notify (and whether to notify day-of too)
    # Format: { type: (days_before, notify_day_of) }
    RULES = {
        "emi":      ([2, 1], True),
        "paycheck": ([1],    False),
        "trip":     ([2],    False),
        "goal":     ([3, 1], False),
        "people":   ([2, 1], True),
        "custom":   ([1],    False),
    }

    # Collect target dates: today + up to 3 days ahead
    target_dates = [(today + timedelta(days=d)).strftime("%Y-%m-%d") for d in range(0, 4)]

    # Fetch custom calendar events in the target window
    custom_events = await db.calendar_events.find(
        {"date": {"$in": target_dates}}, {"_id": 0}
    ).to_list(500)

    # Build auto-generated events for the next 3 days (EMIs, trips, goals, people)
    auto_events = []

    for date_str in target_dates:
        y, m, d_int = int(date_str[:4]), int(date_str[5:7]), int(date_str[8:10])

        # EMIs due
        emis = await db.emis.find({"status": "active"}, {"_id": 0}).to_list(500)
        import calendar as _cal_notif
        last_day = _cal_notif.monthrange(y, m)[1]
        for emi in emis:
            due = emi.get("emi_debit_day")
            if due and min(int(due), last_day) == d_int:
                auto_events.append({
                    "id": f"emi-{emi['id']}-{date_str[:7]}",
                    "user_id": emi["user_id"],
                    "type": "emi",
                    "title": f"EMI: {emi['loan_name']}",
                    "date": date_str,
                    "amount": emi.get("monthly_payment"),
                })

        # People events (yearly recurring)
        people_evs = await db.people_events.find({"month": m, "day": d_int}, {"_id": 0}).to_list(200)
        for pe in people_evs:
            emoji = pe.get("emoji") or ("🎂" if pe["event_type"] == "birthday" else "❤️")
            auto_events.append({
                "id": f"people-{pe['id']}",
                "user_id": pe["user_id"],
                "type": "people",
                "title": f"{emoji} {pe['person_name']}'s {pe['event_type'].capitalize()}",
                "date": date_str,
                "amount": pe.get("gift_budget"),
            })

        # Trips starting
        trips = await db.trips.find({"start_date": date_str, "status": {"$in": ["planned", "booked"]}}, {"_id": 0}).to_list(50)
        for trip in trips:
            auto_events.append({
                "id": f"trip-{trip['id']}",
                "user_id": trip["user_id"],
                "type": "trip",
                "title": f"✈️ Trip to {trip['destination']}",
                "date": date_str,
                "amount": trip.get("estimated_cost_inr"),
            })

        # Goal deadlines
        goals = await db.savings_goals.find({"target_date": date_str, "status": "active"}, {"_id": 0}).to_list(50)
        for goal in goals:
            auto_events.append({
                "id": f"goal-{goal['id']}",
                "user_id": goal["user_id"],
                "type": "goal",
                "title": f"🎯 Goal deadline: {goal['name']}",
                "date": date_str,
                "amount": goal.get("target_amount"),
            })

    all_events = custom_events + auto_events
    notified_count = 0

    for ev in all_events:
        ev_type   = ev.get("type", "custom")
        ev_date   = ev.get("date", "")
        user_id   = ev.get("user_id")
        if not user_id or not ev_date:
            continue

        try:
            ev_dt   = datetime.strptime(ev_date, "%Y-%m-%d").date()
            days_ahead = (ev_dt - today).days
        except Exception:
            continue

        lead_days, notify_day_of = RULES.get(ev_type, ([1], False))
        should_notify = (days_ahead in lead_days) or (days_ahead == 0 and notify_day_of)
        if not should_notify:
            continue

        # De-duplicate using notified list on custom events (auto events always re-notify)
        notif_key = f"day_{days_ahead}"
        if ev["id"].startswith(("emi-", "trip-", "goal-", "people-")):
            # For auto events, use a lightweight sent-log in the event doc isn't feasible;
            # use a separate tiny collection keyed by (event_id, notif_key, date)
            already = await db.calendar_notif_log.find_one(
                {"event_id": ev["id"], "notif_key": notif_key, "date": today.strftime("%Y-%m-%d")},
            )
            if already:
                continue
            await db.calendar_notif_log.insert_one({
                "event_id": ev["id"], "notif_key": notif_key,
                "date": today.strftime("%Y-%m-%d"), "user_id": user_id,
            })
        else:
            # For custom events stored in calendar_events, use a notified list field
            already_notified = ev.get("notified", [])
            if notif_key in already_notified:
                continue
            await db.calendar_events.update_one(
                {"id": ev["id"]},
                {"$addToSet": {"notified": notif_key}},
            )

        # Build message
        amt_str = f" — ₹{int(ev['amount']):,}" if ev.get("amount") else ""
        if days_ahead == 0:
            when_str = "today"
        elif days_ahead == 1:
            when_str = "tomorrow"
        else:
            when_str = f"in {days_ahead} days"

        message = f"📅 Reminder: **{ev['title']}** is {when_str} ({ev_date}){amt_str}."

        try:
            await _insert_system_chat(user_id, message, notification_type="calendar_reminder")
            notified_count += 1
        except Exception as exc:
            logger.error(f"[CalNotify] Failed to notify user {user_id} for event {ev['id']}: {exc}")

    logger.info(f"[CalNotify] Done — sent {notified_count} reminder(s) for {today.strftime('%Y-%m-%d')}")


@api_router.get("/recurring-expenses")
async def list_recurring_expenses(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    items = await db.recurring_expenses.find({"user_id": uid}, {"_id": 0}).sort("name", 1).to_list(500)
    return items


@api_router.post("/recurring-expenses")
async def create_recurring_expense(body: RecurringExpenseCreate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "family_group_id": current_user.get("family_group_id"),
        "is_active": True,
        "last_created_date": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        **body.model_dump(),
    }
    await db.recurring_expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/recurring-expenses/{rec_id}")
async def update_recurring_expense(rec_id: str, body: RecurringExpenseUpdate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    rec = await db.recurring_expenses.find_one({"id": rec_id, "user_id": uid}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.recurring_expenses.update_one({"id": rec_id}, {"$set": updates})
    return {**rec, **updates}


@api_router.delete("/recurring-expenses/{rec_id}")
async def delete_recurring_expense(rec_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    await db.recurring_expenses.delete_one({"id": rec_id, "user_id": uid})
    invalidate_user_cache(uid)
    return {"message": "Deleted"}


@api_router.post("/recurring-expenses/{rec_id}/backfill")
async def backfill_recurring_expense(rec_id: str, current_user: dict = Depends(get_current_user)):
    """Create all missed past transactions for a recurring expense from start_date to today."""
    uid = current_user["id"]
    rec = await db.recurring_expenses.find_one({"id": rec_id, "user_id": uid}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")

    ist = pytz.timezone("Asia/Kolkata")
    today = datetime.now(ist)
    today_str = today.strftime("%Y-%m-%d")

    try:
        start = datetime.strptime(rec["start_date"][:10], "%Y-%m-%d").replace(tzinfo=ist)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_date")

    freq = rec.get("frequency", "monthly")
    created = []
    check_date = start

    while check_date <= today:
        date_str = check_date.strftime("%Y-%m-%d")
        # Skip if transaction already exists for this date from this recurring expense
        exists = await db.transactions.find_one({
            "user_id": uid,
            "date": date_str,
            "description": rec.get("description") or rec["name"],
            "source": "recurring",
        })
        if not exists:
            txn_doc = {
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "family_group_id": rec.get("family_group_id"),
                "category_id": rec["category_id"],
                "category_name": rec["category_name"],
                "amount": rec["amount"],
                "description": rec.get("description") or rec["name"],
                "type": "expense",
                "date": date_str,
                "source": "recurring",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.transactions.insert_one(txn_doc)
            await db.budget_categories.update_one(
                {"id": rec["category_id"]},
                {"$inc": {"spent_amount": rec["amount"]}}
            )
            created.append(date_str)

        # Advance to next occurrence
        if freq == "monthly":
            from dateutil.relativedelta import relativedelta
            check_date = check_date + relativedelta(months=1)
        elif freq == "weekly":
            check_date = check_date + timedelta(weeks=1)
        elif freq == "yearly":
            from dateutil.relativedelta import relativedelta
            check_date = check_date + relativedelta(years=1)
        else:
            break

    if created:
        await db.recurring_expenses.update_one(
            {"id": rec_id}, {"$set": {"last_created_date": today_str}}
        )
        invalidate_user_cache(uid)

    return {"created": len(created), "dates": created}


@api_router.post("/recurring-expenses/trigger")
async def trigger_recurring(current_user: dict = Depends(get_current_user)):
    """Manual trigger for testing."""
    await auto_create_recurring_expenses()
    return {"message": "Recurring job executed"}


# ─── Smart Parser: Subscription / Recurring Detector ──────────────────────────

_SUBSCRIPTION_KEYWORDS = {
    "netflix": "🎬", "spotify": "🎵", "amazon prime": "📦",
    "prime video": "🎬", "hotstar": "⭐", "disney+": "🏰",
    "youtube premium": "▶️", "youtube music": "🎵",
    "apple music": "🎵", "icloud": "☁️",
    "zee5": "📺", "voot": "📺", "sonyliv": "📺", "sony liv": "📺",
    "mxplayer": "📺", "mx player": "📺", "jiocinema": "🎬",
    "gym": "💪", "fitness": "💪", "crossfit": "💪", "yoga": "🧘",
    "swiggy one": "🛵", "zomato pro": "🍔", "zomato gold": "🍔",
    "jio": "📱", "airtel": "📱", "bsnl": "📱",
    "electricity": "⚡", "water bill": "💧", "gas bill": "🔥",
    "insurance": "🛡️", "lic ": "🛡️", "hdfc life": "🛡️",
    "maintenance": "🏢", "society fee": "🏢",
    "microsoft": "💻", "office 365": "💻", "google one": "☁️",
    "dropbox": "📦", "adobe": "🎨", "canva": "🎨",
    "notion": "📝", "slack": "💬", "zoom": "📹",
    "github": "💻", "linkedin": "💼",
    "zerodha": "📈", "groww": "📈", " sip": "📊", "mf sip": "📊",
    "playstation": "🎮", "xbox": "🎮", "twitch": "🎮",
    "prime": "📦",
}

def _detect_subscriptions_from_txns(transactions: list) -> list:
    from collections import defaultdict
    keyword_groups: dict = {}

    for t in transactions:
        desc = (t.get("description", "") or "").lower().strip()
        for keyword, emoji in _SUBSCRIPTION_KEYWORDS.items():
            if keyword in desc:
                norm = desc[:40]
                if norm not in keyword_groups:
                    keyword_groups[norm] = {"txns": [], "emoji": emoji}
                keyword_groups[norm]["txns"].append(t)
                break

    # Pattern detection: same description ~30 days apart (no keyword needed)
    pattern_groups: dict = defaultdict(list)
    for t in transactions:
        desc = (t.get("description", "") or "").lower().strip()[:40]
        amt = round((t.get("amount") or 0) / 10) * 10
        if amt > 50:
            pattern_groups[(desc, amt)].append(t)

    for (desc, amt), txns in pattern_groups.items():
        if len(txns) < 2 or desc in keyword_groups:
            continue
        dates = sorted([t.get("date", "") for t in txns if t.get("date")])
        if len(dates) < 2:
            continue
        try:
            dts = [datetime.strptime(d[:10], "%Y-%m-%d") for d in dates]
            gaps = [(dts[i + 1] - dts[i]).days for i in range(len(dts) - 1)]
            avg_gap = sum(gaps) / len(gaps)
        except Exception:
            continue
        if 20 <= avg_gap <= 45:
            keyword_groups[desc] = {"txns": txns, "emoji": "🔄"}

    results = []
    for norm, data in keyword_groups.items():
        txns = data["txns"]
        emoji = data["emoji"]
        if not txns:
            continue
        amounts = [t.get("amount") or 0 for t in txns]
        avg_amount = round(sum(amounts) / len(amounts), 2)
        latest = sorted(txns, key=lambda t: t.get("date", ""), reverse=True)[0]
        day_of_month = 1
        try:
            day_of_month = int(latest.get("date", "2024-01-01").split("-")[2])
        except Exception:
            pass
        results.append({
            "suggested_name": (latest.get("description") or norm).strip()[:40],
            "description": latest.get("description", norm),
            "amount": avg_amount,
            "emoji": emoji,
            "frequency": "monthly",
            "day_of_month": day_of_month,
            "occurrences": len(txns),
            "last_date": latest.get("date", ""),
            "category_id": latest.get("category_id", ""),
            "category_name": latest.get("category_name", "General"),
            "transaction_ids": [t.get("id", "") for t in txns if t.get("id")],
        })

    results.sort(key=lambda x: (-x["occurrences"], -x["amount"]))
    return results[:20]


@api_router.get("/smart-parser/subscriptions")
async def detect_subscriptions(current_user: dict = Depends(get_current_user)):
    """Scan last 90 days of expenses and return suspected subscriptions/recurring payments."""
    uid = current_user["id"]
    cutoff = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
    transactions = await db.transactions.find(
        {"user_id": uid, "type": "expense", "date": {"$gte": cutoff}},
        {"_id": 0},
    ).to_list(1000)

    existing = await db.recurring_expenses.find(
        {"user_id": uid, "is_active": True},
        {"_id": 0, "name": 1, "description": 1},
    ).to_list(200)
    existing_set = {r.get("name", "").lower() for r in existing} | {r.get("description", "").lower() for r in existing}

    detected = _detect_subscriptions_from_txns(transactions)
    filtered = [d for d in detected if d["description"].lower() not in existing_set and d["suggested_name"].lower() not in existing_set]
    return {"detected": filtered}


async def auto_refresh_all_investment_prices():
    """Scheduled job: refresh current_value for ALL users' tracked stocks and MFs.
    Runs at 16:00 IST Mon-Fri (30 min after NSE close at 15:30 IST).
    Only processes investments with symbol+shares_held (stocks) or scheme_code+units_held (MFs)."""
    import yfinance as yf
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist)
    now_utc = datetime.now(timezone.utc)
    logger.info(f"[InvRefresh] Starting post-market price refresh at {now_ist.strftime('%H:%M IST')}")

    investments = await db.investments.find(
        {"$or": [
            {"type": "stocks",       "symbol": {"$exists": True, "$ne": None},       "shares_held": {"$exists": True, "$ne": None}},
            {"type": "mutual_funds", "scheme_code": {"$exists": True, "$ne": None},  "units_held":  {"$exists": True, "$ne": None}},
        ]},
        {"_id": 0}
    ).to_list(5000)

    updated, errors = 0, []
    affected_users: set = set()

    for inv in investments:
        inv_id  = inv.get("id")
        inv_type = inv.get("type")

        if inv_type == "stocks":
            try:
                ticker_sym = inv["symbol"].upper()
                if not ticker_sym.endswith(".NS") and not ticker_sym.endswith(".BO"):
                    ticker_sym += ".NS"
                stock = yf.Ticker(ticker_sym)
                price = float(stock.fast_info.last_price)
                new_value = round(float(inv["shares_held"]) * price, 2)
                await db.investments.update_one(
                    {"id": inv_id},
                    {"$set": {
                        "current_value": new_value,
                        "price_as_of": now_utc.isoformat(),
                        "updated_at": now_utc,
                    }}
                )
                updated += 1
                affected_users.add(inv.get("user_id", ""))
                logger.info(f"[InvRefresh] ✓ {inv.get('name', inv_id)} — {inv['shares_held']} shares × ₹{price:,.2f} = ₹{new_value:,.0f}")
            except Exception as e:
                errors.append(f"{inv.get('name', inv_id)}: {e}")
                logger.warning(f"[InvRefresh] ✗ {inv.get('name', inv_id)}: {e}")

        elif inv_type == "mutual_funds":
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"https://api.mfapi.in/mf/{inv['scheme_code']}",
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as resp:
                        data = await resp.json()
                nav      = float(data["data"][0]["nav"])
                nav_date = data["data"][0]["date"]
                new_value = round(float(inv["units_held"]) * nav, 2)
                await db.investments.update_one(
                    {"id": inv_id},
                    {"$set": {
                        "current_value": new_value,
                        "price_as_of": nav_date,   # MF NAV date (DD-MM-YYYY from mfapi)
                        "updated_at": now_utc,
                    }}
                )
                updated += 1
                affected_users.add(inv.get("user_id", ""))
                logger.info(f"[InvRefresh] ✓ {inv.get('name', inv_id)} — {inv['units_held']} units × NAV ₹{nav} = ₹{new_value:,.0f} (as of {nav_date})")
            except Exception as e:
                errors.append(f"{inv.get('name', inv_id)}: {e}")
                logger.warning(f"[InvRefresh] ✗ {inv.get('name', inv_id)}: {e}")

    # Invalidate cache for all affected users
    for uid in affected_users:
        if uid:
            invalidate_user_cache(uid)

    # Store global refresh metadata
    await db.market_meta.update_one(
        {"key": "last_investment_refresh"},
        {"$set": {
            "key": "last_investment_refresh",
            "refreshed_at": now_utc.isoformat(),
            "updated_count": updated,
            "error_count": len(errors),
        }},
        upsert=True
    )

    logger.info(f"[InvRefresh] Done — {updated} updated, {len(errors)} errors, {len(affected_users)} users affected")


@app.on_event("startup")
async def startup_event():
    # ── DB Indexes for scale (idempotent — safe to run every startup) ──────
    try:
        await db.transactions.create_index([("user_id", 1), ("date", -1)])
        await db.transactions.create_index([("family_group_id", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("type", 1), ("date", -1)])
        await db.budget_categories.create_index([("user_id", 1)])
        await db.budget_categories.create_index([("family_group_id", 1)])
        await db.emis.create_index([("user_id", 1), ("status", 1)])
        await db.savings_goals.create_index([("user_id", 1), ("status", 1)])
        await db.income_entries.create_index([("user_id", 1), ("date", -1)])
        await db.users.create_index([("email", 1)], unique=True)
        await db.users.create_index([("phone", 1)])
        await db.ai_usage.create_index([("user_id", 1), ("feature", 1), ("date", 1)])
        # ── chat_messages — engineered for million-user scale ──────────────
        # Primary query: user history pagination (user_id + timestamp desc)
        await db.chat_messages.create_index([("user_id", 1), ("timestamp", -1)])
        # Pinned messages per user
        await db.chat_messages.create_index([("user_id", 1), ("pinned", 1)], sparse=True)
        # Full-text search on message content
        await db.chat_messages.create_index([("content", "text")])
        # TTL: auto-delete messages older than 1 year (keeps DB lean at scale)
        await db.chat_messages.create_index([("timestamp", 1)], expireAfterSeconds=365 * 24 * 3600, name="chat_ttl")
        # ── circle_messages — ordered, deduplicated, paginated ────────────────
        await db.circle_messages.create_index([("circle_id", 1), ("created_at", 1)])
        await db.circle_messages.create_index([("id", 1)], unique=True)
        await db.circle_messages.create_index([("circle_id", 1), ("seq", 1)])
        # TTL: system join/leave messages expire after 24 hours
        await db.circle_messages.create_index(
            [("created_at_dt", 1)],
            expireAfterSeconds=86400,
            partialFilterExpression={"type": "system"},
            name="circle_system_msg_ttl",
        )
        # ── circle_expenses, trips ────────────────────────────────────────────
        await db.circle_expenses.create_index([("circle_id", 1), ("date", -1)])
        await db.trips.create_index([("user_id", 1), ("created_at", -1)])
        await db.trip_expenses.create_index([("trip_id", 1), ("date", -1)])
        logger.info("[DB] Indexes ensured — ready to scale")
    except Exception as e:
        logger.warning(f"[DB] Index creation warning (non-fatal): {e}")

    # Run at 09:00 IST every day
    scheduler.add_job(auto_debit_emi_payments, CronTrigger(hour=9, minute=0), id="auto_debit", replace_existing=True)
    # Run milestone WhatsApp notifications at 08:30 IST every day
    scheduler.add_job(send_milestone_notifications, CronTrigger(hour=8, minute=30), id="wa_notify", replace_existing=True)
    # Run recurring expense auto-create at 00:05 IST every day
    scheduler.add_job(auto_create_recurring_expenses, CronTrigger(hour=0, minute=5), id="recurring_expenses", replace_existing=True)
    # Run calendar event reminders at 08:00 IST every day
    scheduler.add_job(calendar_event_notifications, CronTrigger(hour=8, minute=0), id="cal_notify", replace_existing=True)
    # Refresh stock & MF prices at 16:00 IST Mon–Fri (30 min after NSE closes at 15:30)
    scheduler.add_job(auto_refresh_all_investment_prices, CronTrigger(hour=16, minute=0, day_of_week="mon-fri"), id="inv_price_refresh", replace_existing=True)
    scheduler.start()
    logger.info("[Scheduler] Auto-debit @ 09:00 IST + WA notifications @ 08:30 IST + Recurring @ 00:05 IST + Calendar reminders @ 08:00 IST + Investment price refresh @ 16:00 IST Mon-Fri")
    # Also run immediately on startup to catch any missed debits for today
    try:
        await auto_debit_emi_payments()
    except Exception as e:
        logger.error(f"[Startup] Auto-debit on startup failed (non-fatal): {e}")
    try:
        await auto_create_recurring_expenses()
    except Exception as e:
        logger.error(f"[Startup] Recurring expenses on startup failed (non-fatal): {e}")

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown(wait=False)
    logger.info("[Scheduler] Stopped")

# ── Investment helpers ────────────────────────────────────────────────────────
async def _sync_goal_from_investments(goal_id: str, user_id: str):
    """Recompute a savings goal's current_amount as the sum of all linked FD/RD current_values."""
    linked = await db.investments.find(
        {"user_id": user_id, "savings_goal_id": goal_id},
        {"_id": 0, "current_value": 1}
    ).to_list(500)
    total = sum(i.get("current_value", 0) for i in linked)
    goal = await db.savings_goals.find_one({"id": goal_id, "user_id": user_id}, {"_id": 0, "target_amount": 1})
    if not goal:
        return
    new_status = "completed" if total >= goal["target_amount"] else "active"
    await db.savings_goals.update_one(
        {"id": goal_id},
        {"$set": {"current_amount": round(total, 2), "status": new_status}}
    )

_EQUITY    = {"stocks", "mutual_funds"}
_DEBT      = {"ppf", "nps", "fd", "rd"}
_GOLD      = {"gold"}
_REALTY    = {"real_estate"}
_INSURANCE = {"health_insurance", "term_insurance"}

# ── Investment CRUD ───────────────────────────────────────────────────────────
@api_router.get("/investments")
async def list_investments(current_user: dict = Depends(get_current_user)):
    filt = {"family_group_id": current_user["family_group_id"]} if current_user.get("family_group_id") else {"user_id": current_user["id"]}
    return await db.investments.find(filt, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.post("/investments", status_code=201)
async def create_investment(data: InvestmentCreate, current_user: dict = Depends(get_current_user)):
    inv = Investment(user_id=current_user["id"], family_group_id=current_user.get("family_group_id"), **data.model_dump())
    await db.investments.insert_one(inv.model_dump())
    if data.savings_goal_id:
        await _sync_goal_from_investments(data.savings_goal_id, current_user["id"])
    invalidate_user_cache(current_user["id"])
    return inv.model_dump()

@api_router.put("/investments/{inv_id}")
async def update_investment(inv_id: str, data: InvestmentUpdate, current_user: dict = Depends(get_current_user)):
    filt = {"family_group_id": current_user["family_group_id"]} if current_user.get("family_group_id") else {"user_id": current_user["id"]}
    existing = await db.investments.find_one({"id": inv_id, **filt})
    if not existing:
        raise HTTPException(status_code=404, detail="Investment not found")
    patch = {k: v for k, v in data.model_dump().items() if v is not None}
    patch["updated_at"] = datetime.now(timezone.utc)
    await db.investments.update_one({"id": inv_id}, {"$set": patch})
    # Auto-sync linked savings goal when FD/RD value is updated
    goal_id = patch.get("savings_goal_id") or existing.get("savings_goal_id")
    if goal_id and existing.get("type") in ("fd", "rd"):
        await _sync_goal_from_investments(goal_id, current_user["id"])
    invalidate_user_cache(current_user["id"])
    return {"message": "Updated"}

@api_router.delete("/investments/{inv_id}")
async def delete_investment(inv_id: str, current_user: dict = Depends(get_current_user)):
    filt = {"family_group_id": current_user["family_group_id"]} if current_user.get("family_group_id") else {"user_id": current_user["id"]}
    result = await db.investments.delete_one({"id": inv_id, **filt})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Investment not found")
    invalidate_user_cache(current_user["id"])
    return {"message": "Deleted"}

@api_router.post("/investments/refresh-prices")
async def refresh_investment_prices(current_user: dict = Depends(get_current_user)):
    """Refresh current_value for all tracked stocks and MFs using latest EOD prices.
    Designed to be called once daily after market close (NSE closes 3:30 PM IST).
    Only updates investments that have symbol+shares_held (stocks) or scheme_code+units_held (MFs)."""
    import yfinance as yf
    filt = {"family_group_id": current_user["family_group_id"]} if current_user.get("family_group_id") else {"user_id": current_user["id"]}
    investments = await db.investments.find(filt, {"_id": 0}).to_list(1000)
    updated, skipped, errors = 0, 0, []

    now_utc = datetime.now(timezone.utc)
    for inv in investments:
        inv_id = inv.get("id")
        inv_type = inv.get("type")

        if inv_type == "stocks" and inv.get("symbol") and inv.get("shares_held"):
            try:
                ticker_sym = inv["symbol"].upper()
                if not ticker_sym.endswith(".NS") and not ticker_sym.endswith(".BO"):
                    ticker_sym += ".NS"
                stock = yf.Ticker(ticker_sym)
                price = float(stock.fast_info.last_price)
                new_value = round(float(inv["shares_held"]) * price, 2)
                await db.investments.update_one(
                    {"id": inv_id},
                    {"$set": {
                        "current_value": new_value,
                        "price_as_of": now_utc.isoformat(),
                        "updated_at": now_utc,
                    }}
                )
                updated += 1
            except Exception as e:
                errors.append(f"{inv.get('name', inv_id)}: {str(e)}")

        elif inv_type == "mutual_funds" and inv.get("scheme_code") and inv.get("units_held"):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"https://api.mfapi.in/mf/{inv['scheme_code']}",
                        timeout=aiohttp.ClientTimeout(total=8)
                    ) as resp:
                        data = await resp.json()
                nav = float(data["data"][0]["nav"])
                nav_date = data["data"][0]["date"]
                new_value = round(float(inv["units_held"]) * nav, 2)
                await db.investments.update_one(
                    {"id": inv_id},
                    {"$set": {
                        "current_value": new_value,
                        "price_as_of": nav_date,   # NAV date from mfapi
                        "updated_at": now_utc,
                    }}
                )
                updated += 1
            except Exception as e:
                errors.append(f"{inv.get('name', inv_id)}: {str(e)}")
        else:
            skipped += 1

    # Store global refresh metadata
    await db.market_meta.update_one(
        {"key": "last_investment_refresh"},
        {"$set": {
            "key": "last_investment_refresh",
            "refreshed_at": now_utc.isoformat(),
            "updated_count": updated,
            "triggered_by": "manual",
        }},
        upsert=True
    )

    invalidate_user_cache(current_user["id"])
    return {
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "refreshed_at": now_utc.isoformat(),
        "message": f"Refreshed {updated} investment(s) with post-market closing prices."
    }


@api_router.get("/investments/refresh-status")
async def investment_refresh_status(current_user: dict = Depends(get_current_user)):
    """Returns when investment prices were last refreshed (auto or manual).
    Frontend uses this to show the post-market pricing disclaimer."""
    meta = await db.market_meta.find_one({"key": "last_investment_refresh"}, {"_id": 0})
    if not meta:
        return {"refreshed_at": None, "message": "Prices have not been auto-refreshed yet. Use 'Refresh Prices' to update."}
    return {
        "refreshed_at": meta.get("refreshed_at"),
        "updated_count": meta.get("updated_count", 0),
        "triggered_by": meta.get("triggered_by", "auto"),
    }

@api_router.get("/investments/summary")
async def investment_summary(current_user: dict = Depends(get_current_user)):
    filt = {"family_group_id": current_user["family_group_id"]} if current_user.get("family_group_id") else {"user_id": current_user["id"]}
    all_inv  = await db.investments.find(filt, {"_id": 0}).to_list(1000)
    non_ins  = [i for i in all_inv if i["type"] not in _INSURANCE]
    t_invest = sum(i["invested_amount"] for i in non_ins)
    t_curr   = sum(i["current_value"]   for i in non_ins)
    t_gain   = t_curr - t_invest
    gain_pct = round(t_gain / t_invest * 100, 2) if t_invest > 0 else 0

    def alloc(types):
        v = sum(i["current_value"] for i in non_ins if i["type"] in types)
        return {"value": round(v, 2), "pct": round(v / t_curr * 100) if t_curr > 0 else 0}

    return {
        "total_invested": round(t_invest, 2),
        "total_current":  round(t_curr, 2),
        "total_gain":     round(t_gain, 2),
        "gain_pct":       gain_pct,
        "investment_count": len(non_ins),
        "has_health_insurance": any(i["type"] == "health_insurance" for i in all_inv),
        "has_term_insurance":   any(i["type"] == "term_insurance"   for i in all_inv),
        "insurance": [i for i in all_inv if i["type"] in _INSURANCE],
        "allocation": {
            "equity":      alloc(_EQUITY),
            "debt":        alloc(_DEBT),
            "gold":        alloc(_GOLD),
            "real_estate": alloc(_REALTY),
        },
    }

@api_router.get("/investments/suggestions")
async def investment_suggestions(current_user: dict = Depends(get_current_user)):
    filt    = {"family_group_id": current_user["family_group_id"]} if current_user.get("family_group_id") else {"user_id": current_user["id"]}
    all_inv = await db.investments.find(filt, {"_id": 0}).to_list(1000)
    non_ins = [i for i in all_inv if i["type"] not in _INSURANCE]
    t_curr  = sum(i["current_value"] for i in non_ins)

    tips = []

    if not any(i["type"] == "health_insurance" for i in all_inv):
        tips.append({"priority": "high", "icon": "shield", "title": "No Health Insurance",
            "body": "A single hospitalisation can wipe out years of savings. Add a ₹5–10L family floater policy immediately."})
    if not any(i["type"] == "term_insurance" for i in all_inv):
        tips.append({"priority": "high", "icon": "shield", "title": "No Term Life Cover",
            "body": "A ₹1Cr term plan costs under ₹1,000/mo. Protect your family's financial future."})

    if len(non_ins) == 0:
        tips.append({"priority": "medium", "icon": "rocket", "title": "Start Investing Today",
            "body": "No investments tracked yet. Start with a simple index fund SIP — ₹500/mo grows significantly over 20 years."})
    elif t_curr > 0:
        eq_pct   = sum(i["current_value"] for i in non_ins if i["type"] in _EQUITY)   / t_curr * 100
        dbt_pct  = sum(i["current_value"] for i in non_ins if i["type"] in _DEBT)     / t_curr * 100
        gold_pct = sum(i["current_value"] for i in non_ins if i["type"] in _GOLD)     / t_curr * 100

        if eq_pct < 40:
            tips.append({"priority": "medium", "icon": "trending_up", "title": "Increase Equity Allocation",
                "body": f"Equity is {round(eq_pct)}% of your portfolio (ideal: 40–60%). Index funds or large-cap MFs are a good start."})
        if gold_pct > 15:
            tips.append({"priority": "medium", "icon": "rebalance", "title": "Gold Allocation is High",
                "body": f"Gold is {round(gold_pct)}% of your portfolio (ideal: 5–10%). Consider rebalancing into equity or debt."})
        if dbt_pct < 15:
            tips.append({"priority": "low", "icon": "landmark", "title": "Add Debt Instruments",
                "body": f"Debt (PPF/NPS/FD) is {round(dbt_pct)}% (ideal: 20–30%). These provide stability and tax benefits."})

    return tips[:5]

# ─────────────────────────────────────────────────────────────────────────────
# Market Data Endpoints (no auth required — public data)
# ─────────────────────────────────────────────────────────────────────────────
import time as _time

# ── In-memory caches ──────────────────────────────────────────────────────────
_mmi_cache:   dict = {}   # {data, ts}  — 1 hour TTL
_nav_cache:   dict = {}   # scheme_code -> {nav, ts}  — 4 hour TTL
_stock_cache: dict = {}   # symbol -> {price, ts}  — 15 min TTL
_mf_search_cache: dict = {}  # query -> {results, ts}  — 30 min TTL
_stock_search_cache: dict = {}  # query -> {results, ts}  — 30 min TTL

_MMI_TTL   = 3600      # 1 hour
_NAV_TTL   = 14400     # 4 hours
_STOCK_TTL = 21600     # 6 hours — post-market close, not real-time
_MFSEARCH_TTL = 1800   # 30 minutes
_STOCKSEARCH_TTL = 1800  # 30 minutes


def _mmi_zone(score: float) -> dict:
    if score >= 75:
        return {"zone": "Extreme Greed", "emoji": "🤑", "color": "#ef4444",
                "advice": "Market is overheated. Consider booking partial profits and moving gains to debt/FD."}
    if score >= 55:
        return {"zone": "Greed", "emoji": "😀", "color": "#f97316",
                "advice": "Momentum is strong. Stay invested but avoid fresh lump-sum equity buys."}
    if score >= 45:
        return {"zone": "Neutral", "emoji": "😐", "color": "#f59e0b",
                "advice": "Market is balanced. SIPs are ideal — no need to time the market."}
    if score >= 25:
        return {"zone": "Fear", "emoji": "😨", "color": "#3b82f6",
                "advice": "Market is fearful. Good time to start or increase SIP investments."}
    return {"zone": "Extreme Fear", "emoji": "😱", "color": "#6366f1",
            "advice": "Panic in markets. Historically the best time to invest lump sums in index funds."}


@api_router.get("/market/mood")
async def market_mood_index():
    """Compute Market Mood Index from Nifty 50 52-week range + India VIX."""
    now = _time.time()
    if _mmi_cache.get("ts") and now - _mmi_cache["ts"] < _MMI_TTL:
        return _mmi_cache["data"]

    try:
        import yfinance as yf

        nifty = yf.Ticker("^NSEI")
        vix   = yf.Ticker("^INDIAVIX")

        nifty_hist = nifty.history(period="1y")
        vix_hist   = vix.history(period="5d")

        if nifty_hist.empty or vix_hist.empty:
            raise ValueError("Empty data from yfinance")

        nifty_close = float(nifty_hist["Close"].iloc[-1])
        nifty_52w_low  = float(nifty_hist["Low"].min())
        nifty_52w_high = float(nifty_hist["High"].max())
        vix_current = float(vix_hist["Close"].iloc[-1])

        # Nifty position in 52-week range (0–100)
        nifty_range = nifty_52w_high - nifty_52w_low
        nifty_score = ((nifty_close - nifty_52w_low) / nifty_range * 100) if nifty_range > 0 else 50

        # VIX inverse score — VIX 10=calm(high score) VIX 40+=panic(low score)
        vix_score = max(0, min(100, (40 - vix_current) / 30 * 100))

        # Weighted MMI
        mmi = round(0.55 * nifty_score + 0.45 * vix_score, 1)
        mmi = max(0, min(100, mmi))

        zone = _mmi_zone(mmi)
        data = {
            "mmi": mmi,
            "zone": zone["zone"],
            "emoji": zone["emoji"],
            "color": zone["color"],
            "advice": zone["advice"],
            "nifty": round(nifty_close, 2),
            "nifty_52w_low": round(nifty_52w_low, 2),
            "nifty_52w_high": round(nifty_52w_high, 2),
            "vix": round(vix_current, 2),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        _mmi_cache["data"] = data
        _mmi_cache["ts"]   = now
        return data

    except Exception as e:
        logging.warning(f"MMI fetch failed: {e}")
        # Return a neutral fallback so UI doesn't break
        return {
            "mmi": 50, "zone": "Neutral", "emoji": "😐",
            "color": "#f59e0b",
            "advice": "Market data temporarily unavailable. Check back shortly.",
            "nifty": None, "vix": None, "updated_at": None,
        }


@api_router.get("/market/mf-search")
async def mf_search(q: str = ""):
    """Search mutual funds by name using MFAPI.in."""
    if not q or len(q) < 2:
        return []
    key = q.lower().strip()
    now = _time.time()
    if _mf_search_cache.get(key) and now - _mf_search_cache[key]["ts"] < _MFSEARCH_TTL:
        return _mf_search_cache[key]["results"]
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"https://api.mfapi.in/mf/search?q={q}",
                timeout=aiohttp.ClientTimeout(total=8)
            ) as resp:
                data = await resp.json()
        results = [{"scheme_code": str(d["schemeCode"]), "name": d["schemeName"]} for d in (data or [])[:20]]
        _mf_search_cache[key] = {"results": results, "ts": now}
        return results
    except Exception as e:
        logging.warning(f"MF search failed: {e}")
        return []


@api_router.get("/market/stock-search")
async def stock_search(q: str = ""):
    """Search NSE-listed stocks by name or ticker using NSE India autocomplete API."""
    if not q or len(q) < 2:
        return []
    key = q.lower().strip()
    now = _time.time()
    if _stock_search_cache.get(key) and now - _stock_search_cache[key]["ts"] < _STOCKSEARCH_TTL:
        return _stock_search_cache[key]["results"]
    browser_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nseindia.com/",
    }
    try:
        async with aiohttp.ClientSession(headers=browser_headers) as session:
            await session.get("https://www.nseindia.com", timeout=aiohttp.ClientTimeout(total=6))
            async with session.get(
                f"https://www.nseindia.com/api/search/autocomplete?q={q}",
                timeout=aiohttp.ClientTimeout(total=8)
            ) as resp:
                if resp.status != 200:
                    raise ValueError(f"NSE search returned {resp.status}")
                data = await resp.json()
        symbols = data.get("symbols", [])
        results = [
            {"symbol": s["symbol"], "name": s.get("symbol_info") or s.get("name") or s["symbol"]}
            for s in symbols
            if s.get("symbol") and s.get("type", "").lower() in ("equity", "")
        ][:10]
        _stock_search_cache[key] = {"results": results, "ts": now}
        return results
    except Exception as e:
        logging.warning(f"Stock search failed for '{q}': {e}")
        return []


@api_router.get("/market/mf-nav/{scheme_code}")
async def mf_nav(scheme_code: str):
    """Fetch latest NAV for a mutual fund from MFAPI.in."""
    now = _time.time()
    if _nav_cache.get(scheme_code) and now - _nav_cache[scheme_code]["ts"] < _NAV_TTL:
        return _nav_cache[scheme_code]["data"]
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"https://api.mfapi.in/mf/{scheme_code}",
                timeout=aiohttp.ClientTimeout(total=8)
            ) as resp:
                data = await resp.json()
        meta = data.get("meta", {})
        nav_list = data.get("data", [])
        if not nav_list:
            raise ValueError("No NAV data")
        latest = nav_list[0]
        result = {
            "scheme_code": scheme_code,
            "name": meta.get("scheme_name", ""),
            "nav": float(latest["nav"]),
            "nav_date": latest["date"],
            "fund_house": meta.get("fund_house", ""),
            "scheme_type": meta.get("scheme_type", ""),
        }
        _nav_cache[scheme_code] = {"data": result, "ts": now}
        return result
    except Exception as e:
        logging.warning(f"MF NAV fetch failed for {scheme_code}: {e}")
        raise HTTPException(status_code=404, detail="Could not fetch NAV")


@api_router.get("/market/stock-price/{symbol}")
async def stock_price(symbol: str):
    """Fetch NSE closing price via NSE India official API (cookie-based session)."""
    ticker = symbol.upper().strip().replace(".NS", "").replace(".BO", "")
    cache_key = ticker
    now = _time.time()
    if _stock_cache.get(cache_key) and now - _stock_cache[cache_key]["ts"] < _STOCK_TTL:
        return _stock_cache[cache_key]["data"]

    browser_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nseindia.com/",
        "Connection": "keep-alive",
    }
    try:
        async with aiohttp.ClientSession(headers=browser_headers) as session:
            # Step 1: hit homepage to get session cookies (NSE requires this)
            await session.get("https://www.nseindia.com", timeout=aiohttp.ClientTimeout(total=8))
            # Step 2: fetch quote
            async with session.get(
                f"https://www.nseindia.com/api/quote-equity?symbol={ticker}",
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status != 200:
                    raise ValueError(f"NSE returned {resp.status} for {ticker}")
                data = await resp.json()

        price_info = data.get("priceInfo", {})
        price = float(price_info.get("lastPrice") or price_info.get("close") or 0)
        prev  = float(price_info.get("previousClose") or price)
        if not price:
            raise ValueError(f"No price in NSE response for {ticker}")

        change_pct   = round((price - prev) / prev * 100, 2) if prev else 0
        company_name = data.get("info", {}).get("companyName") or ticker

        result = {
            "symbol":     ticker,
            "name":       company_name,
            "price":      round(price, 2),
            "prev_close": round(prev, 2),
            "change_pct": change_pct,
            "currency":   "INR",
        }
        _stock_cache[cache_key] = {"data": result, "ts": now}
        return result
    except Exception as e:
        logging.warning(f"NSE price fetch failed for {ticker}: {e}")
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found on NSE. Try the exact ticker (e.g. IDFCFIRSTB, RELIANCE, HDFCBANK).")


# ─────────────────────────────────────────────────────────────────────────────
# Excel Import / Sample Template
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/import/sample")
async def download_sample_excel(current_user: dict = Depends(get_current_user)):
    """Return a pre-filled sample Excel workbook the user can fill in and re-upload."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        pd.DataFrame([
            {"date": "2024-01-15", "description": "Salary", "amount": 80000, "type": "income", "category": "Salary"},
            {"date": "2024-01-20", "description": "Groceries at DMart", "amount": 3500, "type": "expense", "category": "Groceries"},
            {"date": "2024-01-22", "description": "Electricity bill", "amount": 1200, "type": "expense", "category": "Utilities"},
            {"date": "2024-01-25", "description": "Zomato dinner", "amount": 850, "type": "expense", "category": "Food & Dining"},
            {"date": "2024-02-01", "description": "Freelance project", "amount": 15000, "type": "income", "category": "Freelance"},
            {"date": "2024-02-05", "description": "Petrol", "amount": 2200, "type": "expense", "category": "Transport"},
        ]).to_excel(writer, sheet_name="Transactions", index=False)

        pd.DataFrame([
            {"loan_name": "Home Loan", "principal_amount": 3000000, "interest_rate": 8.5,
             "monthly_payment": 26000, "start_date": "2023-06-01", "tenure_months": 240, "emi_debit_day": 5},
            {"loan_name": "Car Loan", "principal_amount": 600000, "interest_rate": 9.0,
             "monthly_payment": 12500, "start_date": "2024-01-01", "tenure_months": 60, "emi_debit_day": 10},
            {"loan_name": "Personal Loan", "principal_amount": 200000, "interest_rate": 12.5,
             "monthly_payment": 6800, "start_date": "2024-03-01", "tenure_months": 36, "emi_debit_day": 3},
        ]).to_excel(writer, sheet_name="EMIs", index=False)

        pd.DataFrame([
            {"name": "Salary", "type": "income", "allocated_amount": 80000},
            {"name": "Freelance", "type": "income", "allocated_amount": 20000},
            {"name": "Groceries", "type": "expense", "allocated_amount": 8000},
            {"name": "Utilities", "type": "expense", "allocated_amount": 3000},
            {"name": "Food & Dining", "type": "expense", "allocated_amount": 5000},
            {"name": "Transport", "type": "expense", "allocated_amount": 4000},
            {"name": "Entertainment", "type": "expense", "allocated_amount": 2000},
            {"name": "Healthcare", "type": "expense", "allocated_amount": 3000},
        ]).to_excel(writer, sheet_name="Budget Categories", index=False)

        pd.DataFrame([
            {"goal_name": "Emergency Fund", "target_amount": 300000, "current_amount": 120000, "target_date": "2025-12-31", "notes": "6 months expenses"},
            {"goal_name": "Europe Vacation", "target_amount": 200000, "current_amount": 45000, "target_date": "2025-09-01", "notes": "Paris + Rome trip"},
            {"goal_name": "New Laptop", "target_amount": 80000, "current_amount": 30000, "target_date": "2025-06-01", "notes": "MacBook Pro"},
        ]).to_excel(writer, sheet_name="Savings Goals", index=False)

        pd.DataFrame([
            {"name": "Nifty 50 Index Fund", "type": "Mutual Fund", "invested_amount": 120000, "current_value": 148000, "units": 450, "buy_date": "2023-01-15", "notes": "Parag Parikh Flexi Cap"},
            {"name": "HDFC Bank", "type": "Stocks", "invested_amount": 50000, "current_value": 68000, "units": 20, "buy_date": "2023-06-10", "notes": "Long term hold"},
            {"name": "SBI Fixed Deposit", "type": "FD", "invested_amount": 100000, "current_value": 107000, "units": 1, "buy_date": "2024-01-01", "notes": "7% p.a., 1 year"},
            {"name": "PPF", "type": "PPF", "invested_amount": 150000, "current_value": 162000, "units": 1, "buy_date": "2020-04-01", "notes": "Annual contribution"},
        ]).to_excel(writer, sheet_name="Investments", index=False)

        pd.DataFrame([
            {"purchase_date": "2023-11-05", "grams": 10, "rate_per_gram": 5800, "total_cost": 58000, "purity": "22K", "form": "Coin", "notes": "Dhanteras purchase"},
            {"purchase_date": "2024-01-20", "grams": 5, "rate_per_gram": 6100, "total_cost": 30500, "purity": "24K", "form": "Bar", "notes": "SGB alternative"},
        ]).to_excel(writer, sheet_name="Gold", index=False)

        pd.DataFrame([
            {"borrower_name": "Ramesh Kumar", "amount": 50000, "date_given": "2024-02-14", "due_date": "2024-08-14", "interest_rate": 0, "notes": "Brother-in-law, house purchase", "direction": "lent"},
            {"borrower_name": "Amit Sharma", "amount": 15000, "date_given": "2024-04-01", "due_date": "2024-07-01", "interest_rate": 0, "notes": "Colleague emergency", "direction": "lent"},
            {"borrower_name": "Priya's parents", "amount": 30000, "date_given": "2024-03-10", "due_date": "2025-03-10", "interest_rate": 0, "notes": "Medical expense", "direction": "borrowed"},
        ]).to_excel(writer, sheet_name="Hand Loans", index=False)

        pd.DataFrame([
            {"name": "Rolex Submariner", "category": "Watch", "purchase_price": 850000, "current_value": 920000, "purchase_date": "2022-12-25", "brand": "Rolex", "insured": True, "notes": "Christmas gift to self"},
            {"name": "Louis Vuitton Neverfull", "category": "Bag", "purchase_price": 120000, "current_value": 110000, "purchase_date": "2023-06-15", "brand": "Louis Vuitton", "insured": False, "notes": "Paris trip"},
            {"name": "Diamond Necklace Set", "category": "Jewellery", "purchase_price": 200000, "current_value": 240000, "purchase_date": "2022-12-01", "brand": "Tanishq", "insured": True, "notes": "Wedding anniversary"},
        ]).to_excel(writer, sheet_name="Luxury Items", index=False)

        pd.DataFrame([
            {"child_name": "Aadhya", "date_of_birth": "2024-08-22", "gender": "Female", "notes": "Our little star"},
        ]).to_excel(writer, sheet_name="Children", index=False)

        pd.DataFrame([
            {"person_name": "Priya Sharma", "occasion": "Birthday", "direction": "given", "amount": 5000, "item_description": "Silk saree", "date": "2024-03-15", "return_expected": False, "notes": "Her 30th birthday"},
            {"person_name": "Rahul Gupta", "occasion": "Wedding", "direction": "given", "amount": 11000, "item_description": "Cash in envelope", "date": "2024-02-10", "return_expected": False, "notes": "Shagun amount"},
            {"person_name": "Mohan Uncle", "occasion": "Diwali", "direction": "received", "amount": 2100, "item_description": "Dry fruits box", "date": "2024-11-01", "return_expected": True, "notes": "Return gift pending"},
        ]).to_excel(writer, sheet_name="Gifts", index=False)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=budget_mantra_template.xlsx"}
    )


@api_router.get("/export/excel")
async def export_all_data_excel(current_user: dict = Depends(get_current_user)):
    """Export all user data across every feature as a multi-sheet Excel file."""
    uid = current_user["id"]
    family_group_id = current_user.get("family_group_id")
    query = {"family_group_id": family_group_id} if family_group_id else {"user_id": uid}

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:

        # Transactions
        txs = await db.transactions.find(query, {"_id": 0}).sort("date", -1).to_list(5000)
        pd.DataFrame([{
            "date": t.get("date"), "description": t.get("description"),
            "amount": t.get("amount"), "type": t.get("type"),
            "category": t.get("category_name"), "notes": t.get("notes", ""),
        } for t in txs] or [{"date": "", "description": "", "amount": "", "type": "", "category": "", "notes": ""}]
        ).to_excel(writer, sheet_name="Transactions", index=False)

        # EMIs
        emis = await db.emis.find(query, {"_id": 0}).to_list(500)
        pd.DataFrame([{
            "loan_name": e.get("loan_name"), "principal_amount": e.get("principal_amount"),
            "interest_rate": e.get("interest_rate"), "monthly_payment": e.get("monthly_payment"),
            "start_date": e.get("start_date"), "tenure_months": e.get("tenure_months"),
            "emi_debit_day": e.get("emi_debit_day"), "remaining_balance": e.get("remaining_balance"),
        } for e in emis] or [{}]).to_excel(writer, sheet_name="EMIs", index=False)

        # Budget Categories
        cats = await db.budget_categories.find(query, {"_id": 0}).to_list(500)
        pd.DataFrame([{
            "name": c.get("name"), "type": c.get("type"),
            "allocated_amount": c.get("allocated_amount"), "spent_amount": c.get("spent_amount", 0),
        } for c in cats] or [{}]).to_excel(writer, sheet_name="Budget Categories", index=False)

        # Savings Goals
        goals = await db.savings_goals.find({"user_id": uid}, {"_id": 0}).to_list(500)
        pd.DataFrame([{
            "goal_name": g.get("goal_name"), "target_amount": g.get("target_amount"),
            "current_amount": g.get("current_amount"), "target_date": g.get("target_date"),
            "notes": g.get("notes", ""),
        } for g in goals] or [{}]).to_excel(writer, sheet_name="Savings Goals", index=False)

        # Investments
        invs = await db.investments.find({"user_id": uid}, {"_id": 0}).to_list(500)
        pd.DataFrame([{
            "name": i.get("name"), "type": i.get("type"),
            "invested_amount": i.get("invested_amount"), "current_value": i.get("current_value"),
            "units": i.get("units"), "buy_date": i.get("buy_date"), "notes": i.get("notes", ""),
        } for i in invs] or [{}]).to_excel(writer, sheet_name="Investments", index=False)

        # Gold
        gold = await db.gold.find({"user_id": uid}, {"_id": 0}).to_list(500)
        pd.DataFrame([{
            "purchase_date": g.get("purchase_date"), "grams": g.get("grams"),
            "rate_per_gram": g.get("rate_per_gram"), "total_cost": g.get("total_cost"),
            "purity": g.get("purity"), "form": g.get("form"), "notes": g.get("notes", ""),
        } for g in gold] or [{}]).to_excel(writer, sheet_name="Gold", index=False)

        # Hand Loans
        loans = await db.hand_loans.find({"user_id": uid}, {"_id": 0}).to_list(500)
        pd.DataFrame([{
            "borrower_name": l.get("borrower_name"), "amount": l.get("amount"),
            "date_given": l.get("date_given"), "due_date": l.get("due_date"),
            "interest_rate": l.get("interest_rate", 0), "direction": l.get("direction", "lent"),
            "notes": l.get("notes", ""),
        } for l in loans] or [{}]).to_excel(writer, sheet_name="Hand Loans", index=False)

        # Luxury Items
        luxury = await db.luxury_items.find({"user_id": uid}, {"_id": 0}).to_list(500)
        pd.DataFrame([{
            "name": x.get("name"), "category": x.get("category"),
            "purchase_price": x.get("purchase_price"), "current_value": x.get("current_value"),
            "purchase_date": x.get("purchase_date"), "brand": x.get("brand", ""),
            "insured": x.get("insured", False), "notes": x.get("notes", ""),
        } for x in luxury] or [{}]).to_excel(writer, sheet_name="Luxury Items", index=False)

        # Children
        children = await db.children.find({"user_id": uid}, {"_id": 0}).to_list(100)
        pd.DataFrame([{
            "child_name": c.get("name"), "date_of_birth": c.get("dob"),
            "gender": c.get("gender", ""), "notes": c.get("notes", ""),
        } for c in children] or [{}]).to_excel(writer, sheet_name="Children", index=False)

        # Gifts
        gifts = await db.gifts.find({"user_id": uid}, {"_id": 0}).to_list(1000)
        pd.DataFrame([{
            "person_name": g.get("person_name"), "occasion": g.get("occasion"),
            "direction": g.get("direction"), "amount": g.get("amount"),
            "item_description": g.get("item_description", ""), "date": g.get("date"),
            "return_expected": g.get("return_expected", False), "notes": g.get("notes", ""),
        } for g in gifts] or [{}]).to_excel(writer, sheet_name="Gifts", index=False)

    buf.seek(0)
    from datetime import date as _date
    filename = f"budgetmantra_export_{_date.today().isoformat()}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.post("/import/excel")
async def import_excel(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Parse an uploaded Excel file and bulk-insert rows into the database."""
    content = await file.read()
    try:
        xls = pd.ExcelFile(io.BytesIO(content), engine="openpyxl")
    except ImportError:
        raise HTTPException(
            status_code=422,
            detail="Server missing openpyxl. Run: pip install openpyxl  then restart the backend."
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read file: {e}. Make sure it is a valid .xlsx file.")

    user_id = current_user['id']
    family_group_id = current_user.get('family_group_id')
    summary = {"transactions": 0, "emis": 0, "categories": 0,
               "savings_goals": 0, "investments": 0, "gold": 0,
               "hand_loans": 0, "luxury_items": 0, "children": 0, "gifts": 0,
               "errors": []}

    # ── Budget Categories sheet ───────────────────────────────────────────────
    if "Budget Categories" in xls.sheet_names:
        df = xls.parse("Budget Categories").dropna(how="all")
        for _, row in df.iterrows():
            try:
                name = str(row.get("name", "")).strip()
                cat_type = str(row.get("type", "expense")).strip().lower()
                amount = float(row.get("allocated_amount", 0))
                if not name or cat_type not in ("income", "expense"):
                    continue
                cat = BudgetCategory(
                    user_id=user_id,
                    family_group_id=family_group_id,
                    name=name,
                    type=cat_type,
                    allocated_amount=amount,
                )
                doc = cat.model_dump()
                doc['created_at'] = doc['created_at'].isoformat()
                await db.budget_categories.insert_one(doc)
                summary["categories"] += 1
            except Exception as e:
                summary["errors"].append(f"Category row error: {e}")

    # ── EMIs sheet ────────────────────────────────────────────────────────────
    if "EMIs" in xls.sheet_names:
        df = xls.parse("EMIs").dropna(how="all")
        for _, row in df.iterrows():
            try:
                loan_name = str(row.get("loan_name", "")).strip()
                if not loan_name:
                    continue
                debit_day = row.get("emi_debit_day")
                debit_day = int(debit_day) if pd.notna(debit_day) else None
                emi = EMI(
                    user_id=user_id,
                    family_group_id=family_group_id,
                    loan_name=loan_name,
                    principal_amount=float(row["principal_amount"]),
                    interest_rate=float(row["interest_rate"]),
                    monthly_payment=float(row["monthly_payment"]),
                    start_date=str(row["start_date"])[:10],
                    tenure_months=int(row["tenure_months"]),
                    emi_debit_day=debit_day,
                    remaining_balance=float(row["principal_amount"]),
                )
                doc = emi.model_dump()
                doc['created_at'] = doc['created_at'].isoformat()
                await db.emis.insert_one(doc)
                summary["emis"] += 1
            except Exception as e:
                summary["errors"].append(f"EMI row error: {e}")

    # ── Transactions sheet ────────────────────────────────────────────────────
    if "Transactions" in xls.sheet_names:
        df = xls.parse("Transactions").dropna(how="all")
        # Need at least one category to link transactions — fetch user's categories
        cats = await db.budget_categories.find(
            {"family_group_id": family_group_id} if family_group_id else {"user_id": user_id},
            {"_id": 0}
        ).to_list(1000)
        cat_map = {c["name"].lower(): c["id"] for c in cats}

        for _, row in df.iterrows():
            try:
                desc = str(row.get("description", "")).strip()
                amount = float(row.get("amount", 0))
                tx_type = str(row.get("type", "expense")).strip().lower()
                cat_name = str(row.get("category", "")).strip().lower()
                date_val = row.get("date", "")
                if isinstance(date_val, pd.Timestamp):
                    date_str = date_val.strftime("%Y-%m-%d")
                else:
                    date_str = str(date_val)[:10]

                cat_id = cat_map.get(cat_name, list(cat_map.values())[0] if cat_map else None)
                if not cat_id:
                    summary["errors"].append(f"No category found for transaction '{desc}' — skipped")
                    continue

                # Resolve the display name from the matched category
                matched_cat = next((c for c in cats if c["id"] == cat_id), None)
                cat_display_name = matched_cat["name"] if matched_cat else cat_name

                # Dedup: skip if same description+amount+date+user already exists
                exists = await db.transactions.find_one({
                    "user_id": user_id,
                    "description": desc,
                    "amount": amount,
                    "date": date_str,
                })
                if exists:
                    continue

                tx = Transaction(
                    user_id=user_id,
                    family_group_id=family_group_id,
                    category_id=cat_id,
                    category_name=cat_display_name,
                    description=desc,
                    amount=amount,
                    type=tx_type,
                    date=date_str,
                )
                doc = tx.model_dump()
                doc['created_at'] = doc['created_at'].isoformat()
                await db.transactions.insert_one(doc)
                # Update spent_amount on the category if expense
                if tx_type == "expense":
                    await db.budget_categories.update_one(
                        {"id": cat_id},
                        {"$inc": {"spent_amount": amount}}
                    )
                summary["transactions"] += 1
            except Exception as e:
                summary["errors"].append(f"Transaction row error: {e}")

    # ── Savings Goals sheet ───────────────────────────────────────────────────
    if "Savings Goals" in xls.sheet_names:
        df = xls.parse("Savings Goals").dropna(how="all")
        for _, row in df.iterrows():
            try:
                goal_name = str(row.get("goal_name", "")).strip()
                if not goal_name:
                    continue
                doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "goal_name": goal_name,
                    "target_amount": float(row.get("target_amount", 0)),
                    "current_amount": float(row.get("current_amount", 0)),
                    "target_date": str(row.get("target_date", ""))[:10] if pd.notna(row.get("target_date")) else "",
                    "notes": str(row.get("notes", "")) if pd.notna(row.get("notes")) else "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.savings_goals.insert_one(doc)
                summary["savings_goals"] += 1
            except Exception as e:
                summary["errors"].append(f"Savings Goal row error: {e}")

    # ── Investments sheet ─────────────────────────────────────────────────────
    if "Investments" in xls.sheet_names:
        df = xls.parse("Investments").dropna(how="all")
        for _, row in df.iterrows():
            try:
                name = str(row.get("name", "")).strip()
                if not name:
                    continue
                doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "name": name,
                    "type": str(row.get("type", "Other")).strip(),
                    "invested_amount": float(row.get("invested_amount", 0)),
                    "current_value": float(row.get("current_value", 0)),
                    "units": float(row.get("units", 1)) if pd.notna(row.get("units")) else 1,
                    "buy_date": str(row.get("buy_date", ""))[:10] if pd.notna(row.get("buy_date")) else "",
                    "notes": str(row.get("notes", "")) if pd.notna(row.get("notes")) else "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.investments.insert_one(doc)
                summary["investments"] += 1
            except Exception as e:
                summary["errors"].append(f"Investment row error: {e}")

    # ── Gold sheet ────────────────────────────────────────────────────────────
    if "Gold" in xls.sheet_names:
        df = xls.parse("Gold").dropna(how="all")
        for _, row in df.iterrows():
            try:
                grams = row.get("grams")
                if not pd.notna(grams):
                    continue
                purchase_date = row.get("purchase_date")
                date_str = purchase_date.strftime("%Y-%m-%d") if isinstance(purchase_date, pd.Timestamp) else str(purchase_date)[:10]
                doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "purchase_date": date_str,
                    "grams": float(grams),
                    "rate_per_gram": float(row.get("rate_per_gram", 0)),
                    "total_cost": float(row.get("total_cost", 0)),
                    "purity": str(row.get("purity", "22K")) if pd.notna(row.get("purity")) else "22K",
                    "form": str(row.get("form", "Coin")) if pd.notna(row.get("form")) else "Coin",
                    "notes": str(row.get("notes", "")) if pd.notna(row.get("notes")) else "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.gold.insert_one(doc)
                summary["gold"] += 1
            except Exception as e:
                summary["errors"].append(f"Gold row error: {e}")

    # ── Hand Loans sheet ──────────────────────────────────────────────────────
    if "Hand Loans" in xls.sheet_names:
        df = xls.parse("Hand Loans").dropna(how="all")
        for _, row in df.iterrows():
            try:
                borrower_name = str(row.get("borrower_name", "")).strip()
                if not borrower_name:
                    continue
                date_given = row.get("date_given")
                date_given_str = date_given.strftime("%Y-%m-%d") if isinstance(date_given, pd.Timestamp) else str(date_given)[:10]
                due_date = row.get("due_date")
                due_date_str = due_date.strftime("%Y-%m-%d") if isinstance(due_date, pd.Timestamp) else str(due_date)[:10] if pd.notna(due_date) else ""
                doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "borrower_name": borrower_name,
                    "amount": float(row.get("amount", 0)),
                    "date_given": date_given_str,
                    "due_date": due_date_str,
                    "interest_rate": float(row.get("interest_rate", 0)) if pd.notna(row.get("interest_rate")) else 0,
                    "direction": str(row.get("direction", "lent")).strip().lower(),
                    "notes": str(row.get("notes", "")) if pd.notna(row.get("notes")) else "",
                    "status": "active",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.hand_loans.insert_one(doc)
                summary["hand_loans"] += 1
            except Exception as e:
                summary["errors"].append(f"Hand Loan row error: {e}")

    # ── Luxury Items sheet ────────────────────────────────────────────────────
    if "Luxury Items" in xls.sheet_names:
        df = xls.parse("Luxury Items").dropna(how="all")
        for _, row in df.iterrows():
            try:
                name = str(row.get("name", "")).strip()
                if not name:
                    continue
                purchase_date = row.get("purchase_date")
                date_str = purchase_date.strftime("%Y-%m-%d") if isinstance(purchase_date, pd.Timestamp) else str(purchase_date)[:10]
                doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "name": name,
                    "category": str(row.get("category", "Other")).strip(),
                    "purchase_price": float(row.get("purchase_price", 0)),
                    "current_value": float(row.get("current_value", 0)),
                    "purchase_date": date_str,
                    "brand": str(row.get("brand", "")) if pd.notna(row.get("brand")) else "",
                    "insured": bool(row.get("insured", False)),
                    "notes": str(row.get("notes", "")) if pd.notna(row.get("notes")) else "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.luxury_items.insert_one(doc)
                summary["luxury_items"] += 1
            except Exception as e:
                summary["errors"].append(f"Luxury Item row error: {e}")

    # ── Children sheet ────────────────────────────────────────────────────────
    if "Children" in xls.sheet_names:
        df = xls.parse("Children").dropna(how="all")
        for _, row in df.iterrows():
            try:
                child_name = str(row.get("child_name", "")).strip()
                if not child_name:
                    continue
                # Dedup: skip if child with same name already exists
                exists = await db.children.find_one({"user_id": user_id, "name": child_name})
                if exists:
                    continue
                dob = row.get("date_of_birth")
                dob_str = dob.strftime("%Y-%m-%d") if isinstance(dob, pd.Timestamp) else str(dob)[:10]
                doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "name": child_name,  # match the API field name
                    "dob": dob_str,
                    "gender": str(row.get("gender", "")) if pd.notna(row.get("gender")) else "",
                    "notes": str(row.get("notes", "")) if pd.notna(row.get("notes")) else "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.children.insert_one(doc)
                summary["children"] += 1
            except Exception as e:
                summary["errors"].append(f"Children row error: {e}")

    # ── Gifts sheet ───────────────────────────────────────────────────────────
    if "Gifts" in xls.sheet_names:
        df = xls.parse("Gifts").dropna(how="all")
        for _, row in df.iterrows():
            try:
                person_name = str(row.get("person_name", "")).strip()
                if not person_name:
                    continue
                gift_date = row.get("date")
                date_str = gift_date.strftime("%Y-%m-%d") if isinstance(gift_date, pd.Timestamp) else str(gift_date)[:10]
                amount = float(row.get("amount", 0))
                # Dedup: skip if same person + date + amount already recorded
                exists = await db.gifts.find_one({"user_id": user_id, "person_name": person_name, "date": date_str, "amount": amount})
                if exists:
                    continue
                doc = {
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "person_name": person_name,
                    "occasion": str(row.get("occasion", "Other")).strip(),
                    "direction": str(row.get("direction", "given")).strip().lower(),
                    "amount": amount,
                    "item_description": str(row.get("item_description", "")) if pd.notna(row.get("item_description")) else "",
                    "date": date_str,
                    "return_expected": bool(row.get("return_expected", False)),
                    "notes": str(row.get("notes", "")) if pd.notna(row.get("notes")) else "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.gifts.insert_one(doc)
                summary["gifts"] += 1
            except Exception as e:
                summary["errors"].append(f"Gift row error: {e}")

    invalidate_user_cache(user_id)
    return {
        "success": True,
        "imported": {
            "categories": summary["categories"],
            "emis": summary["emis"],
            "transactions": summary["transactions"],
            "savings_goals": summary["savings_goals"],
            "investments": summary["investments"],
            "gold": summary["gold"],
            "hand_loans": summary["hand_loans"],
            "luxury_items": summary["luxury_items"],
            "children": summary["children"],
            "gifts": summary["gifts"],
        },
        "errors": summary["errors"][:10],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Gold Portfolio Tracker
# ─────────────────────────────────────────────────────────────────────────────

# Simple in-process cache: {"price": float, "usd_inr": float, "ts": float}
_gold_price_cache: dict = {}
_GOLD_CACHE_TTL = 900  # 15 minutes


async def _fetch_live_gold_price() -> dict:
    import time, asyncio
    now = time.time()
    if _gold_price_cache.get("ts") and now - _gold_price_cache["ts"] < _GOLD_CACHE_TTL:
        return _gold_price_cache

    price_per_gram_inr = None
    # Indian MCX = international spot × ~1.15 (import duty 10.75% + GST 3% + levies)
    INDIA_GOLD_PREMIUM = 1.15

    # ── Source 1: yfinance GOLD.MCX (INR per 10g, most accurate) ──────────────
    try:
        import yfinance as yf
        loop = asyncio.get_event_loop()
        def _yf_mcx():
            for ticker_sym in ("GOLD.MCX", "GOLDPETAL.MCX"):
                try:
                    ticker = yf.Ticker(ticker_sym)
                    fi = ticker.fast_info
                    price = getattr(fi, "last_price", None) or getattr(fi, "regular_market_price", None)
                    if price and float(price) > 0:
                        # GOLD.MCX = ₹/10g, GOLDPETAL.MCX = ₹/1g
                        divisor = 10 if "GOLD.MCX" in ticker_sym else 1
                        return float(price) / divisor
                except Exception:
                    pass
            return None
        price_g = await loop.run_in_executor(None, _yf_mcx)
        if price_g and price_g > 0:
            price_per_gram_inr = round(price_g, 2)
    except Exception:
        pass

    # ── Source 2: Yahoo Finance REST — GC=F (COMEX Gold Futures, USD/troy oz) ─
    if not price_per_gram_inr:
        try:
            usd_inr = 84.0
            headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"}
            async with aiohttp.ClientSession(headers=headers) as session:
                # Get USD/INR rate
                async with session.get("https://query1.finance.yahoo.com/v8/finance/chart/INR%3DX?interval=1d&range=1d",
                                       timeout=aiohttp.ClientTimeout(total=5)) as r:
                    if r.status == 200:
                        d = await r.json()
                        usd_inr = d.get("chart",{}).get("result",[{}])[0].get("meta",{}).get("regularMarketPrice", 84.0) or 84.0
                # Get GC=F price (COMEX gold, USD/troy oz)
                async with session.get("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d",
                                       timeout=aiohttp.ClientTimeout(total=6)) as r:
                    if r.status == 200:
                        d = await r.json()
                        meta = d.get("chart",{}).get("result",[{}])[0].get("meta",{})
                        usd_oz = meta.get("regularMarketPrice") or meta.get("previousClose")
                        if usd_oz and float(usd_oz) > 0:
                            price_per_gram_inr = round((float(usd_oz) / 31.1035) * usd_inr * INDIA_GOLD_PREMIUM, 2)
        except Exception:
            pass

    # ── Source 3: open.er-api.com — XAU/INR (gold spot in INR per troy oz) ────
    if not price_per_gram_inr:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get("https://open.er-api.com/v6/latest/XAU",
                                       timeout=aiohttp.ClientTimeout(total=5)) as r:
                    if r.status == 200:
                        d = await r.json()
                        inr_per_oz = d.get("rates", {}).get("INR")
                        if inr_per_oz and float(inr_per_oz) > 0:
                            # This is international spot in INR/troy oz — apply India premium
                            price_per_gram_inr = round((float(inr_per_oz) / 31.1035) * INDIA_GOLD_PREMIUM, 2)
        except Exception:
            pass

    # ── Source 4: metals-api (free tier) ──────────────────────────────────────
    if not price_per_gram_inr:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get("https://api.metals.live/v1/spot/gold",
                                       timeout=aiohttp.ClientTimeout(total=5)) as r:
                    if r.status == 200:
                        d = await r.json()
                        # returns price in USD per troy oz
                        usd_oz = d[0].get("gold") if isinstance(d, list) else d.get("price")
                        if usd_oz and float(usd_oz) > 0:
                            usd_inr = 84.0
                            price_per_gram_inr = round((float(usd_oz) / 31.1035) * usd_inr * INDIA_GOLD_PREMIUM, 2)
        except Exception:
            pass

    # ── Sanity check: Indian 24K ₹9,000–25,000/gram (2025–27) ─────────────────
    if price_per_gram_inr and not (9000 <= price_per_gram_inr <= 25000):
        price_per_gram_inr = None

    # ── Stale-cache fallback: serve last known price rather than hard-fail ─────
    if not price_per_gram_inr and _gold_price_cache.get("price"):
        return {**_gold_price_cache, "stale": True}

    # ── Last-resort: hardcoded recent MCX estimate (March 2026) ───────────────
    if not price_per_gram_inr:
        price_per_gram_inr = 15000.0   # ≈ MCX 24K rate, India, Mar 2026
        _gold_price_cache.update({"price": price_per_gram_inr, "ts": now, "stale": True})
        return {"price": price_per_gram_inr, "ts": now, "stale": True}

    _gold_price_cache.update({"price": price_per_gram_inr, "ts": now, "stale": False})
    return {"price": price_per_gram_inr, "ts": now, "stale": False}


# In-memory store for WhatsApp pending transaction confirmations
# Maps user_id → {"txn_data": {...}, "matched_cat": {...}, "ts": float}
_wa_pending: dict = {}
_WA_PENDING_TTL = 300  # seconds (5 minutes)

# City-level premium over MCX base price (₹/gram, approximate based on local jeweller
# association rates, state taxes, and making charge norms — as of early 2026)
_CITY_GOLD_PREMIUM: dict = {
    "mumbai": 0, "pune": 20, "nagpur": 30, "goa": 10,
    "delhi": 50, "new delhi": 50, "noida": 50, "gurgaon": 50, "gurugram": 50, "faridabad": 50,
    "bangalore": 80, "bengaluru": 80, "mysore": 80, "mysuru": 80,
    "chennai": 100, "coimbatore": 90, "madurai": 90,
    "hyderabad": 60, "secunderabad": 60, "warangal": 60,
    "kolkata": 40, "howrah": 40,
    "ahmedabad": 30, "surat": 30, "vadodara": 30, "rajkot": 30,
    "jaipur": 50, "jodhpur": 50, "udaipur": 50,
    "lucknow": 60, "kanpur": 60, "varanasi": 60, "agra": 60,
    "bhopal": 50, "indore": 50,
    "kochi": 20, "thiruvananthapuram": 20, "kozhikode": 20, "thrissur": 20,
    "patna": 50, "ranchi": 50,
    "chandigarh": 50, "amritsar": 50, "ludhiana": 50,
    "bhubaneswar": 40, "visakhapatnam": 60,
}


def _city_premium(city: str) -> float:
    """Return approximate ₹/gram premium for a given city name."""
    if not city:
        return 0.0
    key = city.lower().strip()
    # Direct match
    if key in _CITY_GOLD_PREMIUM:
        return float(_CITY_GOLD_PREMIUM[key])
    # Partial match
    for k, v in _CITY_GOLD_PREMIUM.items():
        if k in key or key in k:
            return float(v)
    return 0.0


@api_router.get("/buy-goal/metal-prices")
async def get_metal_prices_for_buy_goal(_current_user: dict = Depends(get_current_user)):
    """Return live gold and silver prices for the Buy Goals calculator."""
    gold_data, silver_data = await asyncio.gather(
        _fetch_live_gold_price(), _fetch_live_silver_price()
    )
    gold_per_gram   = gold_data.get("price") or 9500
    silver_per_gram = silver_data.get("price") or 100
    return {
        "gold": {
            "per_gram":   round(gold_per_gram),
            "per_10g":    round(gold_per_gram * 10),
            "per_100g":   round(gold_per_gram * 100),
            "source":     gold_data.get("source", "estimated"),
        },
        "silver": {
            "per_gram":   round(silver_per_gram),
            "per_100g":   round(silver_per_gram * 100),
            "per_kg":     round(silver_per_gram * 1000),
            "source":     silver_data.get("source", "estimated"),
        },
    }


@api_router.get("/gold/price")
async def get_gold_price(city: str = "", _current_user: dict = Depends(get_current_user)):
    data = await _fetch_live_gold_price()
    price_24k = data.get("price")
    if not price_24k:
        price_24k = 15000.0  # MCX estimate fallback
    premium = _city_premium(city)
    price_24k_city = round(price_24k + premium, 2)
    return {
        "price_per_gram": price_24k_city,
        "price_per_gram_inr": price_24k_city,
        "price_24k_per_gram": price_24k_city,
        "price_22k_per_gram": round(price_24k_city * 22 / 24, 2),
        "price_18k_per_gram": round(price_24k_city * 18 / 24, 2),
        "source": "MCX (live)" if not data.get("stale") else "estimated",
        "stale": data.get("stale", False),
        "city": city or None,
        "city_premium": premium,
    }


@api_router.get("/gold/summary")
async def get_gold_summary(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    items = await db.gold_items.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)

    price_data = await _fetch_live_gold_price()
    current_price = price_data.get("price") or 0

    enriched = []
    total_current = 0.0
    total_purchase = 0.0

    for item in items:
        weight = item.get("weight_grams", 0)
        qty    = item.get("quantity", 0)
        ppp_g  = item.get("purchase_price_per_gram", 0)
        ppp_u  = item.get("purchase_price_per_unit", 0)
        itype  = item.get("type", "physical")
        karat  = item.get("karat", 24)

        # Price adjusted for karat purity (SGB/ETF are always 24K)
        karat_factor = (karat / 24) if itype in ("physical", "digital") else 1.0
        effective_price = current_price * karat_factor

        if itype in ("physical", "digital"):
            purchase_value  = weight * ppp_g
            current_value   = weight * effective_price
        else:
            # SGB / ETF: 1 unit ≈ 1 gram of 24K gold
            purchase_value  = qty * ppp_u
            current_value   = qty * current_price

        enriched.append({**item, "purchase_value": round(purchase_value, 2), "current_value": round(current_value, 2)})
        total_current  += current_value
        total_purchase += purchase_value

    return {
        "items": enriched,
        "total_current_value": round(total_current, 2),
        "total_purchase_value": round(total_purchase, 2),
        "current_price_per_gram": current_price,
    }


@api_router.get("/gold")
async def list_gold_items(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    items = await db.gold_items.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.post("/gold", status_code=201)
async def create_gold_item(data: GoldItemCreate, current_user: dict = Depends(get_current_user)):
    item = GoldItem(**data.model_dump(), user_id=current_user["id"])
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.gold_items.insert_one(doc)
    return item


@api_router.get("/gold/buy-advice")
async def gold_buy_advice(current_user: dict = Depends(get_current_user)):
    """Chanakya-powered intelligent advice on whether/when to buy more gold,
    based on live price, user's financial situation and current gold allocation."""
    import asyncio
    uid = current_user["id"]
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": uid}

    # ── 1. Gather data in parallel ────────────────────────────────────────────
    from datetime import date as _date
    today = _date.today()
    month_prefix = f"{today.year}-{today.month:02d}"

    price_data_task    = _fetch_live_gold_price()
    gold_items_task    = db.gold_items.find({"user_id": uid}, {"_id": 0}).to_list(500)
    income_entries_task = db.income_entries.find(
        {"user_id": uid, "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "amount": 1, "source_type": 1}
    ).to_list(500)
    month_txn_task     = db.transactions.find(
        {**family_filter, "type": "expense", "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "amount": 1}
    ).to_list(5000)
    investments_task   = db.investments.find({"user_id": uid}, {"_id": 0, "type": 1, "current_value": 1}).to_list(500)
    emis_task          = db.emis.find({**family_filter, "status": "active"}, {"_id": 0, "monthly_payment": 1}).to_list(500)
    goals_task         = db.savings_goals.find({"user_id": uid, "status": "active"}, {"_id": 0, "name": 1, "target_amount": 1, "current_amount": 1, "target_date": 1}).to_list(20)

    price_data, gold_items, income_entries, month_txns, investments, emis, savings_goals = await asyncio.gather(
        price_data_task, gold_items_task, income_entries_task,
        month_txn_task, investments_task, emis_task, goals_task
    )

    # ── 2. Compute financials ─────────────────────────────────────────────────
    current_price = price_data.get("price") or 0

    income_total = sum(e.get("amount", 0) for e in income_entries)
    has_salary   = any(e.get("source_type") == "salary" for e in income_entries)
    if not has_salary:
        pc = await db.paychecks.find_one({"user_id": uid}, {"_id": 0, "net_pay": 1}, sort=[("payment_date", -1)])
        if pc and pc.get("net_pay"):
            income_total += float(pc["net_pay"])

    monthly_expenses = sum(t.get("amount", 0) for t in month_txns)
    total_emi        = sum(e.get("monthly_payment", 0) for e in emis)
    monthly_surplus  = income_total - monthly_expenses - total_emi

    # Gold value
    total_gold_value = 0.0
    total_gold_grams = 0.0
    for item in gold_items:
        itype = item.get("type", "physical")
        karat = item.get("karat", 24)
        kf    = (karat / 24) if itype in ("physical", "digital") else 1.0
        eff   = current_price * kf
        if itype in ("physical", "digital"):
            val = item.get("weight_grams", 0) * eff
            total_gold_grams += item.get("weight_grams", 0)
        else:
            val = item.get("quantity", 0) * current_price
        total_gold_value += val

    # Total portfolio value (investments + gold)
    total_invest_value = sum(i.get("current_value", 0) for i in investments)
    total_portfolio    = total_invest_value + total_gold_value
    gold_pct           = (total_gold_value / total_portfolio * 100) if total_portfolio > 0 else 0

    # ── 3. Ask Chanakya (Claude) ──────────────────────────────────────────────
    client = AsyncAnthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))

    goals_block = ""
    if savings_goals:
        goals_block = "\nSAVINGS GOALS (active):\n" + "\n".join(
            f"- {g['name']}: saved ₹{g['current_amount']:,.0f} of ₹{g['target_amount']:,.0f} "
            f"({round(g['current_amount']/g['target_amount']*100) if g['target_amount'] else 0}%) "
            f"by {g.get('target_date','?')}"
            for g in savings_goals
        )

    context_block = f"""
USER FINANCIAL SNAPSHOT (current month: {today.strftime('%B %Y')}):
- Monthly income: ₹{income_total:,.0f}
- Monthly expenses (actual): ₹{monthly_expenses:,.0f}
- Monthly EMIs: ₹{total_emi:,.0f}
- Monthly surplus (free cash): ₹{monthly_surplus:,.0f}
- Savings rate: {round(monthly_surplus / income_total * 100, 1) if income_total > 0 else 0}%
{goals_block}
GOLD HOLDINGS:
- Total gold weight held: {total_gold_grams:.2f}g
- Gold portfolio value (live): ₹{total_gold_value:,.0f}
- Gold as % of total portfolio: {gold_pct:.1f}%
- Number of gold items: {len(gold_items)}

LIVE GOLD PRICE (MCX / Indian market — as of {today.strftime('%d %b %Y')}):
- 24K: ₹{current_price:,.0f}/gram  ({"LIVE" if not price_data.get("stale") else "last known"})
- 22K: ₹{round(current_price * 22/24):,.0f}/gram
- 18K: ₹{round(current_price * 18/24):,.0f}/gram
"""

    system_prompt = """You are Chanakya, Budget Mantra's financial advisor.
You give sharp, data-driven, personalised gold investment advice to Indian users.
Your advice is grounded in the user's actual financial numbers — never generic.
Keep response under 200 words. Be direct and specific. Use Indian financial context.
Format: give ONE clear recommendation (Buy Now / Wait / Not Now), then 2-3 bullet reasons why, then ONE practical tip.
Do NOT add disclaimers about SEBI unless recommending a specific product."""

    user_msg = f"""Based on my current financial situation, should I buy more gold?

{context_block}

Give me your direct Chanakya advice — should I buy gold now, wait, or skip?"""

    try:
        result = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}]
        )
        advice_text = result.content[0].text
    except Exception:
        # Fallback rule-based advice if AI unavailable
        if monthly_surplus <= 0:
            advice_text = "**Not Now.** Your monthly outflows exceed income — buying gold now would strain your finances. Fix your expense-to-income ratio first."
        elif gold_pct > 15:
            advice_text = f"**Wait.** Gold is already {gold_pct:.0f}% of your portfolio — above the ideal 5–10% range. Diversify into equity or debt before adding more gold."
        elif monthly_surplus > 10000:
            grams_affordable = monthly_surplus * 0.15 / current_price if current_price else 0
            advice_text = f"**Consider Buying.** You have ₹{monthly_surplus:,.0f} monthly surplus. Allocating 10–15% (≈{grams_affordable:.1f}g) monthly into SGB or Gold ETF is sensible."
        else:
            advice_text = f"**Small Steps.** Surplus is tight at ₹{monthly_surplus:,.0f}/month. If you want gold exposure, SGB or Gold ETF in small amounts (₹500–1000/month via SIP) is the safest route."

    return {
        "advice": advice_text,
        "current_price_24k": round(current_price, 2),
        "current_price_22k": round(current_price * 22 / 24, 2),
        "monthly_surplus": round(monthly_surplus, 2),
        "gold_portfolio_pct": round(gold_pct, 1),
        "total_gold_value": round(total_gold_value, 2),
        "total_gold_grams": round(total_gold_grams, 2),
        "price_stale": price_data.get("stale", False),
        "income_total": round(income_total, 2),
    }


@api_router.put("/gold/{item_id}")
async def update_gold_item(item_id: str, data: GoldItemCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.gold_items.find_one({"id": item_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Gold item not found")
    patch = {k: v for k, v in data.model_dump().items() if v is not None}
    await db.gold_items.update_one({"id": item_id}, {"$set": patch})
    invalidate_user_cache(current_user["id"])
    return {"success": True}


@api_router.delete("/gold/{item_id}")
async def delete_gold_item(item_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.gold_items.delete_one({"id": item_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gold item not found")
    invalidate_user_cache(current_user["id"])
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────────────
# WhatsApp Webhook (Twilio)
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/webhook/whatsapp")
async def whatsapp_webhook(From: str = Form(...), Body: str = Form(...)):
    """Receive Twilio WhatsApp messages and reply via Chanakya AI."""

    # Parse phone number — build multiple variants to match whatever format user saved
    raw = From.replace("whatsapp:", "").strip()  # e.g. "+919876543210"
    digits_only = raw.lstrip("+").replace(" ", "").replace("-", "")  # "919876543210"

    # Extract 10-digit Indian number
    if digits_only.startswith("91") and len(digits_only) == 12:
        ten_digit = digits_only[2:]
    else:
        ten_digit = digits_only[-10:] if len(digits_only) >= 10 else digits_only

    # Try all common formats users might have saved
    phone_variants = list(dict.fromkeys([
        ten_digit,           # 9876543210
        digits_only,         # 919876543210
        raw,                 # +919876543210
        f"+91{ten_digit}",   # +919876543210
        f"91{ten_digit}",    # 919876543210
    ]))

    user_doc = None
    for variant in phone_variants:
        user_doc = await db.users.find_one({"phone": variant}, {"_id": 0})
        if user_doc:
            logger.info(f"[WA] matched user {user_doc.get('email')} via phone variant '{variant}'")
            break

    if not user_doc:
        logger.warning(f"[WA] no user found — From={From!r} tried variants={phone_variants}")

    reg_url = "https://budget-mantra-nine.vercel.app"

    # Handle Twilio sandbox join keyword — send a friendly welcome instead of silence
    body_lower = Body.strip().lower()
    if body_lower.startswith("join "):
        if not user_doc:
            reply = (
                f"🙏 Welcome to *Chanakya* — your AI financial advisor on WhatsApp!\n\n"
                f"To get started, register at {reg_url} and add your phone number in Profile.\n\n"
                f"Once set up you can:\n"
                f"• Say *spent 500 on swiggy* to log an expense\n"
                f"• Say *dashboard* to see your finances\n"
                f"• Ask anything about your budget, EMIs or goals"
            )
        elif not user_doc.get("is_pro"):
            reply = (
                f"🙏 Welcome back, *{user_doc['name']}*!\n\n"
                f"WhatsApp integration is a *Pro feature*. Upgrade at {reg_url} to start logging expenses and chatting with Chanakya here."
            )
        else:
            reply = (
                f"🙏 Welcome back, *{user_doc['name']}*! Chanakya is ready.\n\n"
                f"Try:\n"
                f"• *spent 500 on swiggy* — log an expense\n"
                f"• *dashboard* — see your financial snapshot\n"
                f"• Ask anything about your budget, EMIs or goals"
            )
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{_html.escape(reply)}</Message>
</Response>"""
        return Response(content=twiml, media_type="text/xml")

    if not user_doc:
        reply = (
            f"👋 I couldn't find a Budget Mantra account linked to *{ten_digit}*.\n\n"
            f"To fix this:\n"
            f"1. Go to {reg_url}\n"
            f"2. Open Profile → add your phone number as *{ten_digit}*\n"
            f"3. Message me again and I'll be ready!"
        )
    elif not user_doc.get("is_pro"):
        reply = (
            "🔒 *WhatsApp integration is a Premium feature.*\n\n"
            "Upgrade to Budget Mantra Pro to:\n"
            "• Add expenses via WhatsApp\n"
            "• Get your dashboard summary\n"
            "• Chat with Chanakya AI\n"
            "• Receive smart milestone alerts\n\n"
            f"Upgrade now 👉 {reg_url}"
        )
    else:
        import time as _time

        user_id = user_doc["id"]
        body_stripped = Body.strip().lower()

        # ── YES/NO confirmation for pending transactions ──────────────────────
        pending = _wa_pending.get(user_id)
        if pending and (_time.time() - pending["ts"] < _WA_PENDING_TTL):
            if body_stripped in ("yes", "y", "haan", "ha"):
                txn_data    = pending["txn_data"]
                matched_cat = pending["matched_cat"]
                del _wa_pending[user_id]

                txn = Transaction(**txn_data)
                doc = txn.model_dump()
                doc["created_at"] = doc["created_at"].isoformat()
                await db.transactions.insert_one(doc)
                await db.budget_categories.update_one(
                    {"id": matched_cat["id"]},
                    {"$inc": {"spent_amount": txn_data["amount"]}},
                )
                await update_streak(user_id)

                ist = pytz.timezone("Asia/Kolkata")
                now_ist = datetime.now(ist)
                family_group_id = user_doc.get("family_group_id")
                categories = await _ensure_default_categories(user_id, family_group_id)
                cat_fresh  = next((c for c in categories if c["id"] == matched_cat["id"]), matched_cat)

                reply = (
                    f"✅ Added ₹{txn_data['amount']:,.0f} for *{txn_data['description']}* "
                    f"under *{matched_cat['name']}*.\n"
                    f"Total spent in {matched_cat['name']} this month: "
                    f"₹{cat_fresh.get('spent_amount', 0):,.0f} / ₹{matched_cat['allocated_amount']:,.0f}."
                )
                if not reply.startswith("*Chanakya*"):
                    reply = f"*Chanakya*\n{reply}"
                twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{_html.escape(reply)}</Message>
</Response>"""
                return Response(content=twiml, media_type="text/xml")

            elif body_stripped in ("no", "n", "nahi", "nope", "cancel"):
                pending_desc   = pending["txn_data"]["description"]
                pending_amount = pending["txn_data"]["amount"]
                del _wa_pending[user_id]
                reply = f"❌ Cancelled. ₹{pending_amount:,.0f} for *{pending_desc}* was not added."
                if not reply.startswith("*Chanakya*"):
                    reply = f"*Chanakya*\n{reply}"
                twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{_html.escape(reply)}</Message>
</Response>"""
                return Response(content=twiml, media_type="text/xml")
        elif pending:
            # Expired — clean up
            del _wa_pending[user_id]
        # ─────────────────────────────────────────────────────────────────────

        try:
            # Build same financial context as the chatbot endpoint
            family_group_id = user_doc.get("family_group_id")
            family_filter = {"family_group_id": family_group_id} if family_group_id else {"user_id": user_id}

            ist = pytz.timezone("Asia/Kolkata")
            now_ist = datetime.now(ist)
            month_start = now_ist.replace(day=1).strftime("%Y-%m-%d")

            categories    = await _ensure_default_categories(user_id, family_group_id)
            emis          = await db.emis.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(100)
            savings_goals = await db.savings_goals.find({**family_filter, "status": "active"}, {"_id": 0}).to_list(50)
            recent_txns   = await db.transactions.find(
                {**family_filter, "date": {"$gte": month_start}}, {"_id": 0}
            ).sort("date", -1).to_list(100)

            total_income = sum(c["allocated_amount"] for c in categories if c["type"] == "income")
            total_spent  = sum(c.get("spent_amount", 0) for c in categories if c["type"] == "expense")
            total_emi    = sum(e["monthly_payment"] for e in emis)
            free_cash    = total_income - total_spent - total_emi
            savings_rate = round(free_cash / total_income * 100, 1) if total_income > 0 else 0
            emi_ratio    = round(total_emi / total_income * 100, 1) if total_income > 0 else 0

            cat_lines  = [
                f"  • {c['name']}: ₹{c.get('spent_amount',0):,.0f} / ₹{c['allocated_amount']:,.0f}"
                for c in categories if c["type"] == "expense"
            ]
            emi_lines  = [
                f"  • {e['loan_name']}: ₹{e['monthly_payment']:,.0f}/mo @ {e['interest_rate']}%"
                for e in emis[:6]
            ]
            goal_lines = [
                f"  • {g['name']}: ₹{g['current_amount']:,.0f}/₹{g['target_amount']:,.0f}"
                for g in savings_goals[:4]
            ]
            txn_summary: dict = {}
            for t in recent_txns:
                k = t.get("category_name", "Other")
                txn_summary[k] = txn_summary.get(k, 0) + t.get("amount", 0)
            txn_lines = [f"  • {c}: ₹{a:,.0f}" for c, a in sorted(txn_summary.items(), key=lambda x: -x[1])[:5]]

            financial_context = f"""
=== {user_doc['name']}'s Financial Snapshot — {now_ist.strftime('%B %Y')} ===
INCOME & CASH FLOW:
  • Monthly Income: ₹{total_income:,.0f}
  • Savings Rate:   {savings_rate}%
  • EMI-to-Income:  {emi_ratio}%
BUDGET vs ACTUAL:
{chr(10).join(cat_lines) if cat_lines else '  No categories set up yet'}
ACTIVE EMIs:
{chr(10).join(emi_lines) if emi_lines else '  No active EMIs'}
SAVINGS GOALS:
{chr(10).join(goal_lines) if goal_lines else '  No active goals'}
TOP SPENDING THIS MONTH:
{chr(10).join(txn_lines) if txn_lines else '  No transactions recorded yet'}
"""

            expense_cat_names = [c["name"] for c in categories if c["type"] == "expense"]
            cat_list_str = ", ".join(expense_cat_names) if expense_cat_names else "none set up yet"

            system_message = f"""You are Chanakya — a sharp, warm AI financial advisor built into BudgetMantra.
User's name: {user_doc['name']}. Today: {now_ist.strftime('%Y-%m-%d')}.

IMPORTANT — follow these rules strictly:

1. ADD expense — message has amount + context (e.g. "add 500 swiggy", "spent 200 petrol", "paid 1200 groceries"):
Respond ONLY with JSON, no extra text:
{{"action":"add_transaction","amount":<number>,"description":"<short description>","category_guess":"<exact category name from list>"}}

2. ADD expense — category unclear or only amount given (e.g. "add expense", "add 500"):
List their categories as options:
"Sure! Which category? 📋\n1. Food\n2. Transport\n...\nReply: *<category> <amount>* (e.g. Food 500)"

3. DASHBOARD / SUMMARY — user asks "dashboard", "summary", "how am I doing", "show my budget":
Respond ONLY with JSON:
{{"action":"dashboard"}}

4. GOALS — user asks "goals", "savings goals", "my goals", "goal progress":
Respond ONLY with JSON:
{{"action":"goals"}}

5. UPCOMING BILLS — user asks "upcoming", "bills", "what's due", "recurring":
Respond ONLY with JSON:
{{"action":"upcoming_bills"}}

6. UPDATE last transaction — user says "update", "change last entry", "wrong amount", "edit last":
Respond ONLY with JSON:
{{"action":"update_last","amount":<new_amount_or_null>,"description":"<new_description_or_empty>"}}

7. All other messages (advice, questions) — plain text, 3–5 sentences max.

User's expense categories: {cat_list_str}
Use ₹ and Indian numbering. Never claim to be human.
{financial_context}"""

            lower_body = Body.strip().lower()

            # ── App link ──────────────────────────────────────────────────────────────
            import re as _re
            _link_kw = ["app link", "website", "app url", "open app", "send link", "where is the app", "download"]
            _link_single = ["link", "url", "site"]
            if any(w in lower_body for w in _link_kw) or any(_re.search(r'\b' + w + r'\b', lower_body) for w in _link_single):
                reply = (
                    f"*Chanakya*\n"
                    f"📱 Here's the Budget Mantra app link:\n\n"
                    f"👉 https://budget-mantra-nine.vercel.app/\n\n"
                    f"Open it in your browser, sign up, and add your phone number in Profile to use WhatsApp features. 🙏"
                )
                twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{_html.escape(reply)}</Message>
</Response>"""
                return Response(content=twiml, media_type="text/xml")

            # ── Event Planner commands ─────────────────────────────────────────────────
            _event_list_kw  = ["my events", "upcoming events", "event list", "show events"]
            _event_month_kw = ["events this month"]
            _event_add_kw   = ["add event"]

            if any(w in lower_body for w in _event_add_kw):
                reply = (
                    "📅 *Add Event*\n\n"
                    "To add a new event, please open the Budget Mantra app — "
                    "event creation works best there so you can set the date, budget breakdown, and more. 🙏"
                )
                if not reply.startswith("*Chanakya*"):
                    reply = f"*Chanakya*\n{reply}"
                twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{_html.escape(reply)}</Message>
</Response>"""
                return Response(content=twiml, media_type="text/xml")

            elif any(w in lower_body for w in _event_list_kw + _event_month_kw):
                is_month_filter = any(w in lower_body for w in _event_month_kw)
                today_str = now_ist.strftime("%Y-%m-%d")

                event_query: dict = {
                    "status": {"$ne": "completed"},
                    "date":   {"$gte": today_str},
                }
                if is_month_filter:
                    month_prefix = now_ist.strftime("%Y-%m")
                    event_query["date"] = {"$regex": f"^{month_prefix}"}

                if family_group_id:
                    event_query["$or"] = [{"user_id": user_id}, {"family_group_id": family_group_id}]
                else:
                    event_query["user_id"] = user_id

                events = await db.events.find(event_query, {"_id": 0}).sort("date", 1).to_list(5)

                if not events:
                    if is_month_filter:
                        reply = "📅 *Events This Month* — No upcoming events found for this month. Open Budget Mantra to plan one!"
                    else:
                        reply = "📅 *Upcoming Events* — No upcoming events found. Open Budget Mantra to plan one!"
                else:
                    header = "📅 *Events This Month*" if is_month_filter else "📅 *Upcoming Events*"
                    lines = [header, ""]
                    for idx, ev in enumerate(events, start=1):
                        ev_name   = ev.get("name", "Unnamed Event")
                        ev_date   = ev.get("date", "")
                        # Format date "2026-04-15" → "15 Apr 2026"
                        try:
                            from datetime import datetime as _dt
                            ev_date_fmt = _dt.strptime(ev_date[:10], "%Y-%m-%d").strftime("%-d %b %Y")
                        except Exception:
                            ev_date_fmt = ev_date

                        # Resolve budget: prefer budget_total, else sum breakdown
                        budget = ev.get("budget_total", 0)
                        if not budget:
                            breakdown = ev.get("breakdown", [])
                            if isinstance(breakdown, list):
                                budget = sum(item.get("amount", 0) for item in breakdown)
                            elif isinstance(breakdown, dict):
                                budget = sum(breakdown.values())

                        lines.append(f"{idx}. *{ev_name}*")
                        lines.append(f"   📆 {ev_date_fmt} · ₹{budget:,.0f} budget")
                        lines.append("")

                    lines.append("_Showing next 5 events. Open Budget Mantra for details._")
                    reply = "\n".join(lines)

                if not reply.startswith("*Chanakya*"):
                    reply = f"*Chanakya*\n{reply}"
                twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{_html.escape(reply)}</Message>
</Response>"""
                return Response(content=twiml, media_type="text/xml")
            # ─────────────────────────────────────────────────────────────────────────

            # ── Piggy Bank commands ────────────────────────────────────────────────────
            _piggy_kw = ["cash jar", "cash balance", "my cash", "home cash", "wallet cash"]
            _piggy_single = ["piggy"]
            if any(w in lower_body for w in _piggy_kw) or any(_re.search(r'\b' + w + r'\b', lower_body) for w in _piggy_single):
                pig = await db.piggy_bank.find_one({"user_id": user_id}, {"_id": 0})
                if not pig or not pig.get("jars"):
                    reply = "🐷 *Piggy Bank* — No cash jars found. Visit the app to create your first jar!"
                else:
                    jars = pig.get("jars", [])
                    total = sum(j.get("balance", 0) for j in jars)
                    lines = [f"🐷 *Your Cash Jars*", f"Total: ₹{total:,.0f}", ""]
                    for j in jars:
                        lines.append(f"{j.get('emoji','🐷')} *{j['name']}* — ₹{j.get('balance',0):,.0f}")
                    reply = "\n".join(lines)
                if not reply.startswith("*Chanakya*"):
                    reply = f"*Chanakya*\n{reply}"
                twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{_html.escape(reply)}</Message>
</Response>"""
                return Response(content=twiml, media_type="text/xml")
            # ─────────────────────────────────────────────────────────────────────────

            import json as _json
            ai_client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
            result = await ai_client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=256,
                system=system_message,
                messages=[{"role": "user", "content": Body}],
            )
            raw_reply = result.content[0].text.strip()

            # Try to parse as an add_transaction action
            action_taken = False
            try:
                action = _json.loads(raw_reply)
                if action.get("action") == "add_transaction":
                    amount      = float(action.get("amount", 0))
                    description = action.get("description", "WhatsApp expense")
                    cat_guess   = action.get("category_guess", "")

                    if amount <= 0:
                        reply = "❓ I couldn't find a valid amount in your message. Try: *spent 500 on groceries*"
                        action_taken = True

                    # Match category (case-insensitive) — only when amount is valid
                    matched_cat = None
                    if not action_taken:
                      for c in categories:
                        if c["type"] == "expense" and c["name"].lower() == cat_guess.lower():
                            matched_cat = c
                            break
                    # Fuzzy fallback
                    if not action_taken and not matched_cat:
                        for c in categories:
                            if c["type"] == "expense" and (
                                cat_guess.lower() in c["name"].lower() or
                                c["name"].lower() in cat_guess.lower()
                            ):
                                matched_cat = c
                                break
                    # If still no match, ask the user to pick a category
                    if not action_taken and not matched_cat:
                        expense_cats = [c for c in categories if c["type"] == "expense"]
                        if expense_cats:
                            cat_opts = "\n".join(f"{i+1}. {c['name']}" for i, c in enumerate(expense_cats[:8]))
                            reply = (
                                f"I couldn't figure out the category for *{description}* (₹{amount:,.0f}).\n\n"
                                f"Which one fits? 📋\n{cat_opts}\n\n"
                                f"Reply: *<category name> {int(amount)}* (e.g. Food {int(amount)})"
                            )
                        else:
                            reply = "No expense categories found. Please set up categories in the app first."
                        action_taken = True

                    if not action_taken and matched_cat and amount > 0:
                        # Store as pending — ask for confirmation instead of auto-inserting
                        import time as _time
                        _wa_pending[user_id] = {
                            "txn_data": {
                                "user_id": user_id,
                                "family_group_id": user_doc.get("family_group_id"),
                                "category_id": matched_cat["id"],
                                "category_name": matched_cat["name"],
                                "amount": amount,
                                "description": description,
                                "type": "expense",
                                "date": now_ist.strftime("%Y-%m-%d"),
                                "source": "whatsapp",
                            },
                            "matched_cat": matched_cat,
                            "ts": _time.time(),
                        }
                        reply = (
                            f"💳 ₹{amount:,.0f} for *{description}* → *{matched_cat['name']}*\n\n"
                            f"Reply *YES* to confirm or *NO* to cancel."
                        )
                        action_taken = True
                    else:
                        reply = "I couldn't match a category. Please set up budget categories in the app first."
                        action_taken = True

                elif action.get("action") == "dashboard":
                    # Build a text dashboard snapshot
                    lines = [f"📊 *{user_doc['name']}'s Dashboard — {now_ist.strftime('%B %Y')}*\n"]
                    lines.append(f"💰 Income: ₹{total_income:,.0f}  |  Spent: ₹{total_spent:,.0f}  |  Free: ₹{free_cash:,.0f}")
                    lines.append(f"📈 Savings rate: {savings_rate}%  |  EMI ratio: {emi_ratio}%\n")
                    if cat_lines:
                        lines.append("*Budget vs Actual:*")
                        lines.extend(cat_lines[:6])
                    if emi_lines:
                        lines.append("\n*Active EMIs:*")
                        lines.extend(emi_lines[:3])
                    if goal_lines:
                        lines.append("\n*Savings Goals:*")
                        lines.extend(goal_lines[:3])
                    reply = "\n".join(lines)
                    action_taken = True

                elif action.get("action") == "goals":
                    lines = [f"🎯 *{user_doc['name']}'s Savings Goals*\n"]
                    if savings_goals:
                        for g in savings_goals:
                            saved   = g.get("current_amount", 0)
                            target  = g.get("target_amount", 0)
                            pct     = round(saved / target * 100, 1) if target > 0 else 0
                            bar     = "█" * int(pct / 10) + "░" * (10 - int(pct / 10))
                            deadline = f" · due {g['target_date']}" if g.get("target_date") else ""
                            lines.append(f"*{g['name']}*{deadline}")
                            lines.append(f"₹{saved:,.0f} / ₹{target:,.0f}  ({pct}%)")
                            lines.append(f"{bar}\n")
                    else:
                        lines.append("No active savings goals. Set one at budget-mantra-nine.vercel.app")
                    reply = "\n".join(lines)
                    action_taken = True

                elif action.get("action") == "upcoming_bills":
                    recurring_items = await db.recurring_expenses.find(
                        {**family_filter, "is_active": True}, {"_id": 0}
                    ).to_list(50)
                    today_ist = now_ist.date()
                    due_soon = []
                    for item in recurring_items:
                        try:
                            if item.get("frequency") == "monthly":
                                day = item.get("day_of_month", 1)
                                import calendar as _cal
                                last_day = _cal.monthrange(today_ist.year, today_ist.month)[1]
                                due_day  = min(day, last_day)
                                from datetime import date as _date
                                due = _date(today_ist.year, today_ist.month, due_day)
                                if due < today_ist:
                                    if today_ist.month == 12:
                                        due = _date(today_ist.year + 1, 1, min(day, 31))
                                    else:
                                        next_last = _cal.monthrange(today_ist.year, today_ist.month + 1)[1]
                                        due = _date(today_ist.year, today_ist.month + 1, min(day, next_last))
                                days_left = (due - today_ist).days
                                if days_left <= 7:
                                    due_soon.append((days_left, item["name"], item["amount"], due))
                        except Exception:
                            pass
                    due_soon.sort(key=lambda x: x[0])
                    lines = [f"📅 *Upcoming Bills — Next 7 Days*\n"]
                    if due_soon:
                        for days_left, name, amount, due in due_soon:
                            when = "Today" if days_left == 0 else f"{due.strftime('%d %b')} ({days_left}d)"
                            lines.append(f"• *{name}* — ₹{amount:,.0f} — {when}")
                    else:
                        lines.append("No bills due in the next 7 days.")
                    reply = "\n".join(lines)
                    action_taken = True

                elif action.get("action") == "update_last":
                    # Find the most recent WhatsApp transaction
                    last_txn = await db.transactions.find_one(
                        {**family_filter, "source": "whatsapp"},
                        {"_id": 0},
                        sort=[("created_at", -1)],
                    )
                    if not last_txn:
                        reply = "I couldn't find a recent transaction to update. Try adding one first."
                    else:
                        updates = {}
                        new_amount = action.get("amount")
                        new_desc   = action.get("description", "").strip()
                        if new_amount and float(new_amount) > 0:
                            diff = float(new_amount) - last_txn["amount"]
                            updates["amount"] = float(new_amount)
                            if diff != 0:
                                await db.budget_categories.update_one(
                                    {"id": last_txn["category_id"]},
                                    {"$inc": {"spent_amount": diff}},
                                )
                        if new_desc:
                            updates["description"] = new_desc
                        if updates:
                            await db.transactions.update_one({"id": last_txn["id"]}, {"$set": updates})
                            reply = (
                                f"✏️ Updated last entry (*{last_txn['description']}*) → "
                                f"₹{updates.get('amount', last_txn['amount']):,.0f}"
                                + (f", \"{new_desc}\"" if new_desc else "") + "."
                            )
                        else:
                            reply = "Nothing to update — please specify a new amount or description."
                    action_taken = True

            except (_json.JSONDecodeError, KeyError, ValueError):
                pass

            if not action_taken:
                reply = raw_reply

        except Exception as exc:
            logger.error(f"WhatsApp webhook AI error: {exc}")
            reply = "Sorry, I'm having trouble right now. Please try again in a moment."

    # Prepend Chanakya branding — Twilio sandbox shows its own number as sender,
    # so we label the message body so users know who they're talking to.
    if not reply.startswith("*Chanakya*"):
        reply = f"*Chanakya*\n{reply}"

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>{_html.escape(reply)}</Message>
</Response>"""
    return Response(content=twiml, media_type="text/xml")


# ─────────────────────────────────────────────────────────────────────────────
# Trip helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_trip(trip: dict) -> dict:
    """Merge nested plan.* fields to top-level for consistent API response.
    Needed because the seeded Bali demo stores everything under trip['plan'],
    while user-created trips store fields at the top level."""
    plan = trip.get("plan") or {}
    return {
        **trip,
        "destination":        trip.get("destination")        or plan.get("destination")        or "",
        "start_date":         trip.get("start_date")         or plan.get("start_date")         or "",
        "end_date":           trip.get("end_date")           or plan.get("end_date")           or "",
        "travelers":          trip.get("travelers")          or plan.get("travelers")          or 1,
        "estimated_cost_inr": trip.get("estimated_cost_inr") or plan.get("estimated_total_inr") or plan.get("estimated_cost_inr") or 0,
        "itinerary":          trip.get("itinerary")          or plan.get("itinerary",    []),
        "cost_breakdown":     trip.get("cost_breakdown")     or plan.get("cost_breakdown", {}),
        "affordability":      trip.get("affordability")      or plan.get("affordability",  {}),
        "booking_tips":       trip.get("booking_tips")       or plan.get("booking_tips",   []),
        "best_months":        trip.get("best_months")        or plan.get("best_months"),
        "visa_info":          trip.get("visa_info")          or plan.get("visa_info"),
        "currency_tip":       trip.get("currency_tip")       or plan.get("currency_tip"),
        "status":             trip.get("status", "planned"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Trip Collaboration — Public (no /api prefix, no auth required)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/trips/shared/{share_token}")
@api_router.get("/trips/shared/{share_token}")
async def get_shared_trip(share_token: str):
    """Public endpoint — get trip by share token (no auth required)."""
    trip = await db.trips.find_one({"share_token": share_token}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found or link expired")
    return _normalize_trip(trip)

@app.patch("/trips/shared/{share_token}/itinerary")
@api_router.patch("/trips/shared/{share_token}/itinerary")
async def update_shared_trip_itinerary(share_token: str, body: dict):
    """Public endpoint — collaborator edits a single itinerary day."""
    trip = await db.trips.find_one({"share_token": share_token})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    day_idx = body.get("day_idx")
    day_data = body.get("day")
    if day_idx is None or day_data is None:
        raise HTTPException(status_code=422, detail="day_idx and day are required")
    plan = trip.get("plan", {})
    itinerary = plan.get("itinerary", [])
    if day_idx >= len(itinerary):
        raise HTTPException(status_code=404, detail="Day not found")
    itinerary[day_idx] = {**itinerary[day_idx], **day_data}
    plan["itinerary"] = itinerary
    await db.trips.update_one({"share_token": share_token}, {"$set": {"plan": plan}})
    return {"ok": True, "itinerary": itinerary}

@app.post("/trips/shared/{share_token}/chat")
@api_router.post("/trips/shared/{share_token}/chat")
async def shared_trip_chat(share_token: str, body: dict):
    """Public AI chat for shared trip collaborators."""
    trip = await db.trips.find_one({"share_token": share_token}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    message = body.get("message", "").strip()
    history = body.get("history", [])
    if not message:
        raise HTTPException(status_code=422, detail="message is required")
    plan = trip.get("plan", {})
    itinerary = plan.get("itinerary", [])
    itinerary_text = "\n".join([
        f"Day {i+1}: {day.get('title','')} @ {day.get('location','')} — ₹{day.get('estimated_cost_inr',0):,.0f} — Activities: {', '.join(day.get('activities', day.get('highlights', [])))}"
        for i, day in enumerate(itinerary)
    ])
    system_prompt = f"""You are a friendly AI travel guide for a trip to {trip.get('destination','')}.
Trip dates: {trip.get('start_date','')} to {trip.get('end_date','')}. Travelers: {trip.get('travelers',1)}. Style: {trip.get('style','mid-range')}.
Day-by-day itinerary:\n{itinerary_text}
Best months: {plan.get('best_months','N/A')}. Visa: {plan.get('visa_info','N/A')}. Currency: {plan.get('currency_tip','N/A')}.
You are a collaborative travel guide. Be warm, conversational, and specific to this itinerary. Use emojis."""
    conv_history = [{"role": m["role"], "content": m["content"]} for m in history[-10:]]
    conv_history.append({"role": "user", "content": message})
    client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    response = await client.messages.create(model="claude-sonnet-4-6", max_tokens=600, temperature=0.5, system=system_prompt, messages=conv_history)
    return {"response": response.content[0].text}


# ─────────────────────────────────────────────────────────────────────────────
# Hand Loan Routes
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/hand-loans/summary")
async def get_hand_loans_summary(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    loans = await db.hand_loans.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    total_given = sum(l["amount"] for l in loans if l["type"] == "given" and l["status"] != "settled")
    total_taken = sum(l["amount"] for l in loans if l["type"] == "taken" and l["status"] != "settled")
    total_given_settled = sum(l["amount"] for l in loans if l["type"] == "given" and l["status"] == "settled")
    total_taken_settled = sum(l["amount"] for l in loans if l["type"] == "taken" and l["status"] == "settled")
    count_given = sum(1 for l in loans if l["type"] == "given")
    count_taken = sum(1 for l in loans if l["type"] == "taken")
    overdue_count = sum(
        1 for l in loans
        if l.get("due_date") and l["due_date"] < today and l["status"] != "settled"
    )

    return {
        "total_given": total_given,
        "total_taken": total_taken,
        "total_given_settled": total_given_settled,
        "total_taken_settled": total_taken_settled,
        "count_given": count_given,
        "count_taken": count_taken,
        "overdue_count": overdue_count,
    }


@api_router.get("/hand-loans")
async def list_hand_loans(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    loans = await db.hand_loans.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    return loans


@api_router.post("/hand-loans", status_code=201)
async def create_hand_loan(data: HandLoanCreate, current_user: dict = Depends(get_current_user)):
    loan = HandLoan(**data.model_dump(), user_id=current_user["id"])
    doc = loan.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.hand_loans.insert_one(doc)
    return loan


@api_router.put("/hand-loans/{loan_id}")
async def update_hand_loan(loan_id: str, data: HandLoanUpdate, current_user: dict = Depends(get_current_user)):
    existing = await db.hand_loans.find_one({"id": loan_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Hand loan not found")
    patch = {k: v for k, v in data.model_dump().items() if v is not None}
    if patch:
        await db.hand_loans.update_one({"id": loan_id}, {"$set": patch})
    invalidate_user_cache(current_user["id"])
    return {"success": True}


@api_router.delete("/hand-loans/{loan_id}")
async def delete_hand_loan(loan_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.hand_loans.delete_one({"id": loan_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Hand loan not found")
    invalidate_user_cache(current_user["id"])
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────────────
# Credit Card Routes
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/credit-cards/summary")
async def get_credit_cards_summary(current_user: dict = Depends(get_current_user)):
    cards = await db.credit_cards.find({"user_id": current_user["id"], "is_active": True}, {"_id": 0}).to_list(100)
    total_limit = sum(c["credit_limit"] for c in cards)
    total_outstanding = sum(c["outstanding_balance"] for c in cards)
    utilization = round(total_outstanding / total_limit * 100, 1) if total_limit > 0 else 0
    return {
        "total_cards": len(cards),
        "total_limit": total_limit,
        "total_outstanding": total_outstanding,
        "utilization_pct": utilization,
        "total_available": total_limit - total_outstanding,
        "total_minimum_due": sum(
            round(c["outstanding_balance"] * c.get("minimum_due_pct", 5) / 100, 2)
            for c in cards
        ),
    }


@api_router.get("/credit-cards")
async def list_credit_cards(current_user: dict = Depends(get_current_user)):
    cards = await db.credit_cards.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return cards


@api_router.post("/credit-cards", status_code=201)
async def create_credit_card(data: CreditCardCreate, current_user: dict = Depends(get_current_user)):
    card = CreditCard(**data.model_dump(), user_id=current_user["id"])
    doc = card.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.credit_cards.insert_one(doc)
    return card


@api_router.put("/credit-cards/{card_id}")
async def update_credit_card(card_id: str, data: CreditCardUpdate, current_user: dict = Depends(get_current_user)):
    existing = await db.credit_cards.find_one({"id": card_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Credit card not found")
    patch = {k: v for k, v in data.model_dump().items() if v is not None}
    if patch:
        await db.credit_cards.update_one({"id": card_id}, {"$set": patch})
    invalidate_user_cache(current_user["id"])
    return {"success": True}


@api_router.delete("/credit-cards/{card_id}")
async def delete_credit_card(card_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.credit_cards.delete_one({"id": card_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Credit card not found")
    invalidate_user_cache(current_user["id"])
    return {"success": True}


@api_router.post("/credit-cards/{card_id}/expense", status_code=201)
async def add_credit_card_expense(
    card_id: str,
    data: CreditCardExpense,
    current_user: dict = Depends(get_current_user),
):
    """Log an expense against a credit card — increases outstanding balance."""
    card = await db.credit_cards.find_one({"id": card_id, "user_id": current_user["id"]}, {"_id": 0})
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    new_balance = card["outstanding_balance"] + data.amount
    await db.credit_cards.update_one({"id": card_id}, {"$set": {"outstanding_balance": new_balance}})

    expense_doc = {
        "id": str(uuid.uuid4()),
        "card_id": card_id,
        "user_id": current_user["id"],
        "amount": data.amount,
        "description": data.description,
        "category": data.category,
        "date": data.date,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.credit_card_expenses.insert_one(expense_doc)
    expense_doc.pop("_id", None)
    return {**expense_doc, "new_outstanding_balance": new_balance}


@api_router.get("/credit-cards/{card_id}/expenses")
async def list_credit_card_expenses(card_id: str, current_user: dict = Depends(get_current_user)):
    card = await db.credit_cards.find_one({"id": card_id, "user_id": current_user["id"]})
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    expenses = await db.credit_card_expenses.find(
        {"card_id": card_id, "user_id": current_user["id"]}, {"_id": 0}
    ).sort("date", -1).to_list(500)
    return expenses


# ─────────────────────────────────────────────────────────────────────────────
# Silver Portfolio Tracker
# ─────────────────────────────────────────────────────────────────────────────

_silver_price_cache: dict = {}
_SILVER_CACHE_TTL = 900  # 15 minutes


async def _fetch_live_silver_price() -> dict:
    import time, asyncio
    now = time.time()
    if _silver_price_cache.get("ts") and now - _silver_price_cache["ts"] < _SILVER_CACHE_TTL:
        return _silver_price_cache

    price_per_gram_inr = None

    # Primary: yfinance — handles Yahoo Finance cookie/crumb auth reliably
    # SILVER.MCX is priced in INR per kg on MCX
    try:
        import yfinance as yf
        loop = asyncio.get_event_loop()
        def _yf_fetch_silver():
            ticker = yf.Ticker("SILVER.MCX")
            fi = ticker.fast_info
            price = getattr(fi, "last_price", None)
            if price is None:
                price = getattr(fi, "regular_market_price", None)
            return float(price) if price else None
        price_kg = await loop.run_in_executor(None, _yf_fetch_silver)
        if price_kg and price_kg > 0:
            price_per_gram_inr = round(price_kg / 1000, 4)
    except Exception:
        pass

    # Secondary: Yahoo Finance v8 REST (fallback if yfinance import fails)
    if not price_per_gram_inr:
        try:
            headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(
                    "https://query2.finance.yahoo.com/v8/finance/chart/SILVER.MCX?interval=1m&range=1d",
                    timeout=aiohttp.ClientTimeout(total=6),
                ) as r:
                    if r.status == 200:
                        data = await r.json()
                        meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
                        price_kg = meta.get("regularMarketPrice") or meta.get("previousClose")
                        if price_kg and float(price_kg) > 0:
                            price_per_gram_inr = round(float(price_kg) / 1000, 4)
        except Exception:
            pass

    # Fallback: international silver spot (XAG) via gold-api.com × USD/INR
    if not price_per_gram_inr:
        usd_inr = 83.5
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://api.exchangerate-api.com/v4/latest/USD",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as r:
                    if r.status == 200:
                        data = await r.json()
                        usd_inr = data.get("rates", {}).get("INR", 83.5)
        except Exception:
            pass
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://api.gold-api.com/price/XAG",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as r:
                    if r.status == 200:
                        data = await r.json()
                        price_usd_oz = data.get("price")
                        if price_usd_oz:
                            # 1 troy oz = 31.1035g
                            price_per_gram_inr = round((float(price_usd_oz) / 31.1035) * usd_inr, 4)
        except Exception:
            pass

    # ── Stale-cache fallback ──────────────────────────────────────────────────
    if not price_per_gram_inr and _silver_price_cache.get("price"):
        return {**_silver_price_cache, "stale": True}

    # ── Last-resort: hardcoded recent MCX estimate (March 2026) ──────────────
    if not price_per_gram_inr:
        price_per_gram_inr = 96.0   # ≈ MCX 999 fine silver, India, Mar 2026 (₹96/gram)
        _silver_price_cache.update({"price": price_per_gram_inr, "ts": now, "stale": True})
        return {"price": price_per_gram_inr, "ts": now, "stale": True}

    _silver_price_cache.update({"price": price_per_gram_inr, "ts": now, "stale": False})
    return {"price": price_per_gram_inr, "ts": now, "stale": False}


# ── Skyscanner Flight Search (via RapidAPI sky-scrapper) ─────────────────────

_SSKY_HOST = "sky-scrapper.p.rapidapi.com"
_SSKY_BASE = f"https://{_SSKY_HOST}"


async def _skyscanner_search_airport(query: str) -> dict | None:
    """Resolve a city/airport name to Skyscanner skyId + entityId."""
    api_key = os.environ.get("RAPIDAPI_KEY")
    if not api_key:
        return None
    try:
        import httpx as _hx
        async with _hx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{_SSKY_BASE}/api/v1/flights/searchAirport",
                params={"query": query, "locale": "en-US"},
                headers={"X-RapidAPI-Key": api_key, "X-RapidAPI-Host": _SSKY_HOST},
            )
            if r.status_code == 200:
                results = r.json().get("data", [])
                if results:
                    return results[0]
    except Exception as e:
        logger.warning(f"[Skyscanner airport] {e}")
    return None


async def _skyscanner_search_flights(
    origin: str, destination: str,
    depart_date: str, return_date: str | None = None,
    adults: int = 1,
) -> list[dict]:
    """
    Search flights via Skyscanner (RapidAPI sky-scrapper).
    Returns list of dicts: airline, departure, arrival, duration_mins, stops, price_inr, score.
    Gracefully returns [] if RAPIDAPI_KEY is absent or API fails.
    """
    api_key = os.environ.get("RAPIDAPI_KEY")
    if not api_key or not origin or not destination or not depart_date:
        return []
    try:
        import httpx as _hx
        orig_ap, dest_ap = await asyncio.gather(
            _skyscanner_search_airport(origin),
            _skyscanner_search_airport(destination),
        )
        if not orig_ap or not dest_ap:
            logger.warning(f"[Skyscanner flights] Could not resolve airports: {origin} / {destination}")
            return []

        params = {
            "originSkyId":        orig_ap.get("skyId", ""),
            "destinationSkyId":   dest_ap.get("skyId", ""),
            "originEntityId":     orig_ap.get("entityId", ""),
            "destinationEntityId":dest_ap.get("entityId", ""),
            "date":               depart_date,
            "cabinClass":         "economy",
            "adults":             str(adults),
            "currency":           "INR",
            "market":             "IN",
            "locale":             "en-IN",
            "sortBy":             "best",
        }
        if return_date:
            params["returnDate"] = return_date

        async with _hx.AsyncClient(timeout=30) as c:
            r = await c.get(
                f"{_SSKY_BASE}/api/v2/flights/searchFlightsComplete",
                params=params,
                headers={"X-RapidAPI-Key": api_key, "X-RapidAPI-Host": _SSKY_HOST},
            )
        if r.status_code != 200:
            logger.warning(f"[Skyscanner flights] HTTP {r.status_code}: {r.text[:200]}")
            return []

        itineraries = r.json().get("data", {}).get("itineraries", [])
        results = []
        for it in itineraries[:6]:
            price_inr = it.get("price", {}).get("raw", 0)
            legs = it.get("legs", [])
            if not legs:
                continue
            leg = legs[0]
            carriers = leg.get("carriers", {}).get("marketing", [])
            airline = carriers[0].get("name", "Unknown") if carriers else "Unknown"
            logo   = carriers[0].get("logoUrl", "") if carriers else ""
            results.append({
                "airline":       airline,
                "logo":          logo,
                "departure":     leg.get("departure", ""),
                "arrival":       leg.get("arrival", ""),
                "duration_mins": leg.get("durationInMinutes", 0),
                "stops":         leg.get("stopCount", 0),
                "price_inr":     int(price_inr),
                "score":         round(it.get("score", 0), 2),
            })
        return sorted(results, key=lambda x: x["price_inr"])
    except Exception as e:
        logger.warning(f"[Skyscanner flights] {e}")
        return []


@api_router.get("/silver/price")
async def get_silver_price(_current_user: dict = Depends(get_current_user)):
    data = await _fetch_live_silver_price()
    price_999 = data.get("price")
    if not price_999:
        price_999 = 96.0  # MCX estimate fallback
    return {
        "price_per_gram": price_999,
        "price_per_gram_inr": price_999,
        "price_999_per_gram": round(price_999, 2),
        "price_925_per_gram": round(price_999 * 925 / 999, 2),
        "price_800_per_gram": round(price_999 * 800 / 999, 2),
        "source": "MCX (Yahoo Finance)",
    }


@api_router.get("/silver/summary")
async def get_silver_summary(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    items = await db.silver_items.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)

    price_data = await _fetch_live_silver_price()
    current_price = price_data.get("price") or 0

    enriched = []
    total_current = 0.0
    total_purchase = 0.0

    for item in items:
        weight = item.get("weight_grams", 0)
        qty    = item.get("quantity", 0)
        ppp_g  = item.get("purchase_price_per_gram", 0)
        ppp_u  = item.get("purchase_price_per_unit", 0)
        itype  = item.get("type", "physical")
        purity = item.get("purity", 999)

        purity_factor = (purity / 999) if itype != "silver_etf" else 1.0
        effective_price = current_price * purity_factor

        if itype in ("physical", "digital"):
            purchase_value = weight * ppp_g
            current_value  = weight * effective_price
        else:
            purchase_value = qty * ppp_u
            current_value  = qty * current_price

        enriched.append({**item, "purchase_value": round(purchase_value, 2), "current_value": round(current_value, 2)})
        total_current  += current_value
        total_purchase += purchase_value

    return {
        "items": enriched,
        "total_current_value": round(total_current, 2),
        "total_purchase_value": round(total_purchase, 2),
        "current_price_per_gram": current_price,
    }


@api_router.get("/silver")
async def list_silver(current_user: dict = Depends(get_current_user)):
    return await db.silver_items.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/silver", status_code=201)
async def add_silver(data: SilverItemCreate, current_user: dict = Depends(get_current_user)):
    item = SilverItem(**data.model_dump(), user_id=current_user["id"])
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.silver_items.insert_one(doc)
    return item


@api_router.get("/silver/buy-advice")
async def silver_buy_advice(current_user: dict = Depends(get_current_user)):
    """Chanakya-powered intelligent advice on whether/when to buy more silver,
    based on live price, user's financial situation and current silver allocation."""
    import asyncio
    uid = current_user["id"]
    family_filter = {"family_group_id": current_user.get('family_group_id')} if current_user.get('family_group_id') else {"user_id": uid}

    from datetime import date as _date
    today = _date.today()
    month_prefix = f"{today.year}-{today.month:02d}"

    price_data_task     = _fetch_live_silver_price()
    silver_items_task   = db.silver_items.find({"user_id": uid}, {"_id": 0}).to_list(500)
    income_entries_task = db.income_entries.find(
        {"user_id": uid, "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "amount": 1, "source_type": 1}
    ).to_list(500)
    month_txn_task = db.transactions.find(
        {**family_filter, "type": "expense", "date": {"$regex": f"^{month_prefix}"}},
        {"_id": 0, "amount": 1}
    ).to_list(5000)
    investments_task = db.investments.find({"user_id": uid}, {"_id": 0, "type": 1, "current_value": 1}).to_list(500)
    emis_task        = db.emis.find({**family_filter, "status": "active"}, {"_id": 0, "monthly_payment": 1}).to_list(500)
    goals_task       = db.savings_goals.find({"user_id": uid, "status": "active"}, {"_id": 0, "name": 1, "target_amount": 1, "current_amount": 1, "target_date": 1}).to_list(20)

    price_data, silver_items, income_entries, month_txns, investments, emis, savings_goals = await asyncio.gather(
        price_data_task, silver_items_task, income_entries_task,
        month_txn_task, investments_task, emis_task, goals_task
    )

    current_price = price_data.get("price") or 0

    income_total = sum(e.get("amount", 0) for e in income_entries)
    has_salary   = any(e.get("source_type") == "salary" for e in income_entries)
    if not has_salary:
        pc = await db.paychecks.find_one({"user_id": uid}, {"_id": 0, "net_pay": 1}, sort=[("payment_date", -1)])
        if pc and pc.get("net_pay"):
            income_total += float(pc["net_pay"])

    monthly_expenses = sum(t.get("amount", 0) for t in month_txns)
    total_emi        = sum(e.get("monthly_payment", 0) for e in emis)
    monthly_surplus  = income_total - monthly_expenses - total_emi

    total_silver_value = 0.0
    total_silver_grams = 0.0
    for item in silver_items:
        itype  = item.get("type", "physical")
        purity = item.get("purity", 999)
        pf     = (purity / 999) if itype != "silver_etf" else 1.0
        eff    = current_price * pf
        if itype in ("physical", "digital"):
            val = item.get("weight_grams", 0) * eff
            total_silver_grams += item.get("weight_grams", 0)
        else:
            val = item.get("quantity", 0) * current_price
        total_silver_value += val

    total_invest_value = sum(i.get("current_value", 0) for i in investments)
    total_portfolio    = total_invest_value + total_silver_value
    silver_pct         = (total_silver_value / total_portfolio * 100) if total_portfolio > 0 else 0

    client = AsyncAnthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))

    goals_block = ""
    if savings_goals:
        goals_block = "\nSAVINGS GOALS (active):\n" + "\n".join(
            f"- {g['name']}: saved ₹{g['current_amount']:,.0f} of ₹{g['target_amount']:,.0f} "
            f"({round(g['current_amount']/g['target_amount']*100) if g['target_amount'] else 0}%) "
            f"by {g.get('target_date','?')}"
            for g in savings_goals
        )

    context_block = f"""
USER FINANCIAL SNAPSHOT (current month: {today.strftime('%B %Y')}):
- Monthly income: ₹{income_total:,.0f}
- Monthly expenses (actual): ₹{monthly_expenses:,.0f}
- Monthly EMIs: ₹{total_emi:,.0f}
- Monthly surplus (free cash): ₹{monthly_surplus:,.0f}
- Savings rate: {round(monthly_surplus / income_total * 100, 1) if income_total > 0 else 0}%
{goals_block}
SILVER HOLDINGS:
- Total silver weight held: {total_silver_grams:.2f}g
- Silver portfolio value (live): ₹{total_silver_value:,.0f}
- Silver as % of total portfolio: {silver_pct:.1f}%

LIVE SILVER PRICE (Indian market — as of {today.strftime('%d %b %Y')}):
- 999 Fine: ₹{current_price:,.2f}/gram
- 925 Sterling: ₹{round(current_price * 925/999, 2):,.2f}/gram
"""

    system_prompt = """You are Chanakya, Budget Mantra's financial advisor.
You give sharp, data-driven, personalised silver investment advice to Indian users.
Silver is less common than gold as an Indian investment — factor this in.
Keep response under 180 words. Be direct and specific.
Format: give ONE clear recommendation (Buy Now / Wait / Not Now / Small Allocation), then 2-3 bullet reasons, then ONE practical tip."""

    user_msg = f"""Based on my current financial situation, should I buy more silver?

{context_block}

Give me your direct Chanakya advice on silver now."""

    try:
        result = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=350,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}]
        )
        advice_text = result.content[0].text
    except Exception:
        if monthly_surplus <= 0:
            advice_text = "**Not Now.** Your expenses exceed income — fix your monthly surplus before adding silver."
        elif silver_pct > 5:
            advice_text = f"**Wait.** Silver already makes up {silver_pct:.0f}% of your portfolio. Silver is more volatile than gold — keep it under 5% of your portfolio."
        else:
            advice_text = f"**Small Allocation.** With ₹{monthly_surplus:,.0f} monthly surplus, a small silver SIP (₹500–2000/month via Silver ETF) is a reasonable diversifier."

    return {
        "advice": advice_text,
        "current_price_999": round(current_price, 2),
        "current_price_925": round(current_price * 925 / 999, 2),
        "monthly_surplus": round(monthly_surplus, 2),
        "silver_portfolio_pct": round(silver_pct, 1),
        "total_silver_value": round(total_silver_value, 2),
        "total_silver_grams": round(total_silver_grams, 2),
        "income_total": round(income_total, 2),
    }


@api_router.put("/silver/{item_id}")
async def update_silver(item_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    existing = await db.silver_items.find_one({"id": item_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Silver item not found")
    data.pop("id", None); data.pop("user_id", None); data.pop("created_at", None)
    await db.silver_items.update_one({"id": item_id}, {"$set": data})
    invalidate_user_cache(current_user["id"])
    return {"success": True}


@api_router.delete("/silver/{item_id}")
async def delete_silver(item_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.silver_items.delete_one({"id": item_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Silver item not found")
    invalidate_user_cache(current_user["id"])
    return {"success": True}


# ── Credit Score Model ────────────────────────────────────────────────────────
class CreditScoreUpdate(BaseModel):
    score: int        # 300-900 CIBIL range
    bureau: str = "CIBIL"   # CIBIL | Experian | CRIF | Equifax
    checked_on: str = ""    # YYYY-MM-DD

@api_router.get("/credit-score")
async def get_credit_score(current_user: dict = Depends(get_current_user)):
    rec = await db.credit_scores.find_one({"user_id": current_user["id"]}, {"_id": 0})
    return rec or {}

@api_router.post("/credit-score")
async def upsert_credit_score(data: CreditScoreUpdate, current_user: dict = Depends(get_current_user)):
    from datetime import date as _date
    doc = {
        "user_id": current_user["id"],
        "score": data.score,
        "bureau": data.bureau,
        "checked_on": data.checked_on or str(_date.today()),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.credit_scores.replace_one({"user_id": current_user["id"]}, doc, upsert=True)
    return doc

@api_router.get("/ai-usage")
async def get_ai_usage(current_user: dict = Depends(get_current_user)):
    from datetime import date as _date
    now = datetime.now(timezone.utc)
    month_key = f"{now.year}-{now.month:02d}"
    records = await db.ai_usage.find({"user_id": current_user["id"], "month": month_key}, {"_id": 0}).to_list(20)
    return records

# ─────────────────────────────────────────────────────────────────────────────
# Trip Planner Routes
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/trips/plan")
async def plan_trip(req: TripPlanRequest, current_user: dict = Depends(get_current_user)):
    """Generate AI itinerary + cost estimate + affordability check."""
    import json as _json
    from datetime import date as _date

    # Calculate duration
    try:
        start = _date.fromisoformat(req.start_date)
        end   = _date.fromisoformat(req.end_date)
        days  = (end - start).days or 1
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid date format: {e}")

    # Get user's financial context for affordability
    user_id = current_user["id"]
    # Monthly usage gate: free = 3/month, pro = 15/month
    _now_m = datetime.now(timezone.utc)
    _month_key = f"{_now_m.year}-{_now_m.month:02d}"
    _usage_rec = await db.ai_usage.find_one({"user_id": user_id, "month": _month_key, "feature": "trip_plan"})
    _used = _usage_rec["count"] if _usage_rec else 0
    _limit = 15 if current_user.get("is_pro") else 3
    if _used >= _limit:
        raise HTTPException(
            status_code=429,
            detail=f"You've used {_used}/{_limit} trip plans this month. {'Upgrade to Pro for 15 plans/month.' if not current_user.get('is_pro') else 'Limit resets next month.'}"
        )
    categories    = await db.budget_categories.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    emis          = await db.emis.find({"user_id": user_id, "status": "active"}, {"_id": 0}).to_list(50)
    total_income  = sum(c["allocated_amount"] for c in categories if c["type"] == "income")
    total_spent   = sum(c.get("spent_amount", 0) for c in categories if c["type"] == "expense")
    total_emi     = sum(e["monthly_payment"] for e in emis)
    free_cash     = total_income - total_spent - total_emi

    style_map = {
        "budget":  "backpacker/budget (hostels, local food, public transport)",
        "mid":     "mid-range (3-star hotels, mix of dining, metro/cab)",
        "luxury":  "luxury (5-star, fine dining, private transfers)",
    }
    style_desc = style_map.get(req.style, style_map["mid"])

    # For long trips group days into phases to keep response compact and avoid truncation
    if days <= 5:
        itinerary_fmt = """  "itinerary": [
    {"day": 1, "title": "short title", "location": "area", "activities": ["act1", "act2", "act3"], "meals": {"breakfast": "x", "lunch": "y", "dinner": "z"}, "estimated_cost_inr": 0}
  ],"""
        itinerary_note = f"Include all {days} days."
    else:
        phase_size = 3 if days <= 12 else 4
        itinerary_fmt = """  "itinerary": [
    {"day": "1-3", "title": "phase title", "location": "area", "highlights": ["highlight1", "highlight2"], "estimated_cost_inr": 0}
  ],"""
        itinerary_note = f"Group days into phases of ~{phase_size} days each. Max 5 phase objects total."

    prompt = f"""You are a realistic Indian travel cost expert. Plan a {days}-day trip to {req.destination} for {req.travelers} traveler(s) departing from India.
Style: {style_desc}. Interests: {req.interests or 'general sightseeing'}. Dates: {req.start_date} to {req.end_date}.

PRICING RULES — be accurate, not optimistic:
FLIGHTS (round-trip per person from major Indian city, 2026 prices):
- Domestic India: budget ₹4,000–10,000 (short haul), ₹8,000–18,000 (long haul like Leh/Andaman)
- Southeast Asia (Thailand, Bali, Vietnam, Singapore, Malaysia): ₹18,000–35,000
- Middle East / Sri Lanka / Maldives: ₹15,000–45,000
- East Asia (Japan, Korea, China): ₹30,000–65,000
- Europe: ₹55,000–1,20,000 (budget/mid), ₹1,50,000–3,00,000 (luxury/direct)
- USA / Canada: ₹70,000–1,40,000 (economy), ₹1,50,000–3,00,000+ (business)
- Africa / South America / Australia: ₹60,000–1,20,000
- Flight prices VARY significantly. Show realistic min-max range: flights_min = best-case early booking, flights_max = peak/last-minute.
- Book early (2-4 months ahead) saves 30-40% vs last-minute.

HOTELS (per room per night in INR, 2026 prices — adjust for destination cost of living):
- SE Asia (Thailand, Bali, Vietnam): budget ₹2,500–5,000, mid ₹6,000–14,000, luxury ₹20,000–60,000
- India domestic: budget ₹1,200–3,000, mid ₹4,000–10,000, luxury ₹12,000–50,000+
- Europe: budget ₹6,000–12,000, mid ₹14,000–28,000, luxury ₹40,000–1,00,000+
- USA/Canada/Australia: budget ₹8,000–15,000, mid ₹16,000–32,000, luxury ₹40,000–1,20,000+
- Middle East: budget ₹5,000–9,000, mid ₹10,000–22,000, luxury ₹30,000–80,000+
- Japan/Korea: budget ₹5,000–9,000, mid ₹10,000–20,000, luxury ₹25,000–70,000+
- Maldives/Seychelles: budget ₹12,000–20,000, mid ₹22,000–50,000, luxury ₹80,000–3,00,000+
- Hotel cost = per night × {days} nights × rooms needed (1 room per 2 travelers typically)

OTHER RULES:
- Always multiply per-person costs by {req.travelers} for totals
- Peak season (Dec-Jan, Apr-Jun school holidays, local festivals) adds 25-50%
- Dates given: {req.start_date} to {req.end_date} — account for seasonality at {req.destination}
- Food/day per person: budget ₹600–1,500, mid ₹1,500–3,500, luxury ₹3,500–8,000

Return ONLY compact valid JSON, no markdown:
{{
  "estimated_total_inr": 0,
  "estimated_min_inr": 0,
  "estimated_max_inr": 0,
  "cost_breakdown": {{"flights_min": 0, "flights_max": 0, "flights": 0, "accommodation": 0, "food": 0, "local_transport": 0, "activities": 0, "shopping_misc": 0}},
{itinerary_fmt}
  "booking_tips": [{{"tip": "tip text", "when": "3 months before", "saves": "5000"}}],
  "best_months": "Oct-Mar",
  "visa_info": "visa info for Indian passport",
  "currency_tip": "currency and current INR rate"
}}

{itinerary_note} All amounts in INR for ALL {req.travelers} traveler(s) combined. estimated_total_inr = mid-range realistic total. flights = mid of flights_min and flights_max. Be destination-specific and accurate."""

    _api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not _api_key:
        raise HTTPException(status_code=503, detail="AI service not configured. ANTHROPIC_API_KEY is missing on the server.")
    try:
        ai_client = AsyncAnthropic(api_key=_api_key)
        result = await ai_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = result.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()
        # Extract JSON even if there's surrounding text
        start_idx = raw.find("{")
        end_idx   = raw.rfind("}")
        if start_idx != -1 and end_idx != -1:
            raw = raw[start_idx:end_idx + 1]
        # If response was truncated (stop_reason == max_tokens), try to close JSON
        if result.stop_reason == "max_tokens":
            open_brackets = raw.count("{") - raw.count("}")
            open_arrays   = raw.count("[") - raw.count("]")
            raw = raw.rstrip(",\n ") + ("]" * max(open_arrays, 0)) + ("}" * max(open_brackets, 0))
        plan = _json.loads(raw)
        # Increment usage only on success
        await db.ai_usage.update_one(
            {"user_id": user_id, "month": _month_key, "feature": "trip_plan"},
            {"$inc": {"count": 1}},
            upsert=True,
        )
    except _json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI returned malformed JSON — please try again. ({e})")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI itinerary generation failed: {str(e)}")

    total_cost = plan.get("estimated_total_inr", 0)

    # Affordability calculation
    months_to_save = None
    can_afford_now = False
    savings_available = 0

    # Check existing savings goals surplus + free cash
    savings_available = max(free_cash, 0)
    if savings_available > 0:
        if savings_available >= total_cost:
            can_afford_now = True
            months_to_save = 0
        else:
            months_to_save = round((total_cost - savings_available) / savings_available, 1) if savings_available > 0 else None

    affordability = {
        "can_afford_now": can_afford_now,
        "monthly_free_cash": round(free_cash, 0),
        "months_to_save": months_to_save,
        "total_cost_inr": total_cost,
        "cost_per_person_inr": round(total_cost / req.travelers, 0),
        "pct_of_annual_income": round(total_cost / (total_income * 12) * 100, 1) if total_income > 0 else None,
        "suggestion": (
            "You can book this trip now! 🎉" if can_afford_now else
            f"Save ₹{round(savings_available):,}/mo → ready in {months_to_save} months" if months_to_save else
            "Set up a savings goal to work towards this trip"
        )
    }

    # Save the trip
    trip = Trip(
        user_id=user_id,
        destination=req.destination,
        start_date=req.start_date,
        end_date=req.end_date,
        travelers=req.travelers,
        style=req.style,
        interests=req.interests or "",
        estimated_cost_inr=total_cost,
        cost_breakdown=plan.get("cost_breakdown", {}),
        itinerary=plan.get("itinerary", []),
        booking_tips=plan.get("booking_tips", []),
        affordability=affordability,
    )
    doc = trip.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["best_months"]  = plan.get("best_months")
    doc["visa_info"]    = plan.get("visa_info")
    doc["currency_tip"] = plan.get("currency_tip")
    await db.trips.insert_one(doc)
    doc.pop("_id", None)  # insert_one mutates doc with ObjectId — remove before returning

    return doc


@api_router.get("/trips")
async def list_trips(current_user: dict = Depends(get_current_user)):
    trips_raw = await db.trips.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [_normalize_trip(t) for t in trips_raw]


@api_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    normalized = _normalize_trip(trip)
    # Include trip expenses for unified planner trips
    expenses = await db.trip_expenses.find({"trip_id": trip_id}, {"_id": 0}).sort("date", -1).to_list(500)
    return {**normalized, "expenses": expenses}


@api_router.put("/trips/{trip_id}")
async def update_trip(trip_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """Update trip details (destination, dates, travelers, budget, notes)."""
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    updates = {}
    if "destination" in body: updates["destination"] = body["destination"]
    if "start_date"  in body: updates["start_date"]  = body["start_date"]
    if "end_date"    in body: updates["end_date"]     = body["end_date"]
    if "travelers"   in body: updates["travelers"]    = int(body["travelers"])
    if "budget"      in body: updates["budget"]       = float(body["budget"]) if body["budget"] else None
    if "notes"       in body: updates["notes"]        = body["notes"]
    if updates:
        await db.trips.update_one({"id": trip_id}, {"$set": updates})
    updated = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    return updated


@api_router.put("/trips/{trip_id}/status")
async def update_trip_status(trip_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    await db.trips.update_one({"id": trip_id}, {"$set": {"status": body.get("status", "planned")}})
    return {"success": True}


@api_router.patch("/trips/{trip_id}/itinerary")
async def update_trip_itinerary(trip_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """Update a single itinerary day for a trip."""
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    day_idx = body.get("day_idx")
    day_data = body.get("day")
    if day_idx is None or day_data is None:
        raise HTTPException(status_code=422, detail="day_idx and day are required")
    plan = trip.get("plan", {})
    itinerary = plan.get("itinerary", [])
    if day_idx >= len(itinerary):
        raise HTTPException(status_code=404, detail="Day not found")
    itinerary[day_idx] = {**itinerary[day_idx], **day_data}
    plan["itinerary"] = itinerary
    await db.trips.update_one({"id": trip_id}, {"$set": {"plan": plan}})
    return {"ok": True, "itinerary": itinerary}

@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.trips.delete_one({"id": trip_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trip not found")
    # Cascade: remove all child records for this trip
    await db.trip_expenses.delete_many({"trip_id": trip_id})
    await db.trip_savings.delete_many({"trip_id": trip_id})
    # Also unlink any savings goal that was created for this trip
    await db.goals.delete_many({"trip_id": trip_id, "user_id": current_user["id"]})
    invalidate_user_cache(current_user["id"])
    return {"success": True}


# ── Trip Planner (unified: itinerary + budget + group splits) ─────────────────

@api_router.post("/trips", status_code=201)
async def create_trip(body: TripCreate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "name": body.name,
        "destination": body.destination,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "budget": body.budget,
        "members": body.members or [current_user["name"]],
        "savings_goal_id": body.savings_goal_id,
        "status": "planned",      # planned | ongoing | completed | cancelled
        "itinerary": [],          # list of TripItineraryDay dicts
        "itinerary_status": "pending",  # pending | generating | ready | failed
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trips.insert_one(doc)
    doc.pop("_id", None)
    invalidate_user_cache(uid)
    return doc

@api_router.post("/trips/{trip_id}/generate")
async def generate_trip_itinerary(
    trip_id: str,
    background_tasks: BackgroundTasks,
    body: Optional[dict] = None,
    current_user: dict = Depends(get_current_user),
):
    """Trigger AI itinerary generation for an existing trip."""
    if body is None:
        body = {}
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    preferences = body.get("preferences", "sightseeing, local food, authentic experiences")
    origin_city  = body.get("origin_city", "")
    adults       = int(body.get("adults", 1))
    # Reset itinerary so polling can detect "still generating"
    await db.trips.update_one({"id": trip_id}, {"$set": {"itinerary": [], "itinerary_status": "generating"}})
    background_tasks.add_task(
        _generate_trip_plan_async,
        trip_id, current_user["id"], preferences,
        trip.get("name", "Trip"), trip.get("destination", ""),
        origin_city=origin_city, adults=adults,
    )
    return {"ok": True, "status": "generating"}

@api_router.get("/trips/{trip_id}/quick-insights")
async def get_trip_quick_insights(trip_id: str, current_user: dict = Depends(get_current_user)):
    """Return AI-generated cash, baggage, and forex tips for a trip. Cached on the trip document."""
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")

    # Return cached insights if already generated
    if trip.get("quick_insights"):
        return trip["quick_insights"]

    destination = trip.get("destination") or trip.get("name", "")
    start_date  = trip.get("start_date", "")
    end_date    = trip.get("end_date", "")
    budget_inr  = trip.get("budget") or trip.get("estimated_cost_inr") or 0
    travelers   = trip.get("travelers", trip.get("members_count", 1)) or 1
    currency_tip = trip.get("currency_tip", "")

    # Compute days from itinerary or dates
    itinerary = trip.get("itinerary") or []
    days_count = len(itinerary)
    if not days_count and start_date and end_date:
        try:
            from datetime import date
            sd = date.fromisoformat(start_date); ed = date.fromisoformat(end_date)
            days_count = max(1, (ed - sd).days + 1)
        except Exception:
            days_count = 0

    per_day_inr = round(budget_inr / days_count, 0) if days_count and budget_inr else 0

    _api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not _api_key:
        raise HTTPException(status_code=503, detail="AI service not configured.")

    prompt = f"""You are a travel planning assistant. Generate concise, practical quick-insights for an Indian traveller going to {destination}.
Trip: {start_date} to {end_date}, {travelers} traveller(s), budget ₹{budget_inr:,.0f} INR total.
Existing currency info: {currency_tip}

Return ONLY valid compact JSON (no markdown):
{{
  "local_currency_name": "full currency name",
  "local_currency_code": "3-letter ISO code",
  "approx_inr_rate": "1 USD = ₹83 (example)",
  "cash_to_carry_local": "recommended cash amount in local currency per person",
  "cash_to_carry_inr": 5000,
  "forex_fee_tip": "one sentence on best way to exchange / avoid fees",
  "baggage_economy_kg": 20,
  "baggage_cabin_kg": 7,
  "baggage_note": "one sentence — international standard + common airline policy for this route",
  "per_day_inr": {per_day_inr},
  "per_day_local": "equivalent amount in local currency"
}}

Be specific to {destination}. For domestic India trips, use INR throughout and set baggage_economy_kg to 15 (IndiGo/Air India domestic standard)."""

    try:
        ai_client = AsyncAnthropic(api_key=_api_key)
        result = await ai_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = result.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()
        start_idx = raw.find("{"); end_idx = raw.rfind("}")
        if start_idx != -1 and end_idx != -1:
            raw = raw[start_idx:end_idx + 1]
        insights = _json.loads(raw)
        if per_day_inr:
            insights["per_day_inr"] = per_day_inr
        await db.trips.update_one({"id": trip_id}, {"$set": {"quick_insights": insights}})
        return insights
    except Exception as e:
        logger.warning(f"quick-insights failed for trip {trip_id}: {e}")
        # Return a minimal fallback so the UI doesn't break
        fallback = {
            "approx_inr_rate": "—",
            "cash_to_carry_local": "—",
            "baggage_economy_kg": 20,
            "baggage_cabin_kg": 7,
            "per_day_inr": per_day_inr,
            "per_day_local": "—",
            "forex_fee_tip": "Check with your bank for the best rates.",
            "baggage_note": "Check your airline's website for the latest baggage policy.",
        }
        return fallback


@api_router.patch("/trips/{trip_id}")
async def patch_trip(trip_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    allowed = {"name", "destination", "start_date", "end_date", "budget", "members", "status", "savings_goal_id", "itinerary"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if updates:
        await db.trips.update_one({"id": trip_id}, {"$set": updates})
    invalidate_user_cache(current_user["id"])
    return {"success": True}

@api_router.post("/trips/{trip_id}/expenses", status_code=201)
async def add_trip_expense(trip_id: str, body: TripExpenseCreate, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    members = trip.get("members", [current_user["name"]])
    split_among = body.split_among if body.split_among else members
    n = len(split_among) or 1
    doc = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "description": body.description,
        "amount": body.amount,
        "paid_by": body.paid_by,
        "category": body.category,
        "split_among": split_among,
        "share_per_person": round(body.amount / n, 2),
        "date": body.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trip_expenses.insert_one(doc)
    doc.pop("_id", None)
    invalidate_user_cache(current_user["id"])
    return doc

@api_router.delete("/trips/{trip_id}/expenses/{expense_id}")
async def delete_trip_expense(trip_id: str, expense_id: str, current_user: dict = Depends(get_current_user)):
    await db.trip_expenses.delete_one({"id": expense_id, "trip_id": trip_id})
    invalidate_user_cache(current_user["id"])
    return {"success": True}

@api_router.get("/trips/{trip_id}/balances")
async def trip_balances(trip_id: str, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    expenses = await db.trip_expenses.find({"trip_id": trip_id}, {"_id": 0}).to_list(1000)
    balance: dict = {}
    for exp in expenses:
        paid = exp["paid_by"]
        split = exp.get("split_among") or trip.get("members", [])
        n = len(split) or 1
        share = round(exp["amount"] / n, 2)
        balance[paid] = balance.get(paid, 0) + exp["amount"]
        for m in split:
            balance[m] = balance.get(m, 0) - share
    # Simplify debts using a greedy settlement algorithm
    pos = sorted([(k, v) for k, v in balance.items() if v > 0.01], key=lambda x: -x[1])
    neg = sorted([(k, -v) for k, v in balance.items() if v < -0.01], key=lambda x: -x[1])
    settlements = []
    i = j = 0
    while i < len(pos) and j < len(neg):
        creditor, credit = pos[i]
        debtor, debt = neg[j]
        amt = round(min(credit, debt), 2)
        if amt > 0.01:
            settlements.append({"from": debtor, "to": creditor, "amount": amt})
        pos[i] = (creditor, round(credit - amt, 2))
        neg[j] = (debtor, round(debt - amt, 2))
        if pos[i][1] < 0.01: i += 1
        if neg[j][1] < 0.01: j += 1
    total_spent = sum(e["amount"] for e in expenses)
    return {"settlements": settlements, "member_balances": balance, "total_spent": total_spent}


# ─────────────────────────────────────────────────────────────────────────────
# Group Expenses Routes
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/expense-groups")
async def list_groups(current_user: dict = Depends(get_current_user)):
    return await db.expense_groups.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.post("/expense-groups", status_code=201)
async def create_group(data: ExpenseGroupCreate, current_user: dict = Depends(get_current_user)):
    require_pro(current_user, "group_expenses")
    members = [n.strip() for n in data.members if n.strip()]
    group = ExpenseGroup(user_id=current_user["id"], name=data.name,
                         description=data.description, members=members)
    doc = group.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.expense_groups.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/expense-groups/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    await db.expense_groups.delete_one({"id": group_id, "user_id": current_user["id"]})
    await db.group_expenses.delete_many({"group_id": group_id})
    invalidate_user_cache(current_user["id"])
    return {"success": True}


@api_router.get("/expense-groups/{group_id}/expenses")
async def list_group_expenses(group_id: str, current_user: dict = Depends(get_current_user)):
    group = await db.expense_groups.find_one({"id": group_id, "user_id": current_user["id"]})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    expenses = await db.group_expenses.find({"group_id": group_id}, {"_id": 0}).sort("date", -1).to_list(500)
    return expenses


@api_router.post("/expense-groups/{group_id}/expenses", status_code=201)
async def add_group_expense(group_id: str, data: GroupExpenseCreate, current_user: dict = Depends(get_current_user)):
    from datetime import date as _date
    group = await db.expense_groups.find_one({"id": group_id, "user_id": current_user["id"]}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    all_members = group["members"]
    split_among = data.split_among if data.split_among else all_members

    expense = GroupExpense(
        group_id=group_id, user_id=current_user["id"],
        description=data.description, amount=data.amount,
        paid_by=data.paid_by, split_among=split_among,
        date=data.date or _date.today().isoformat(),
        category=data.category,
        notes=data.notes or "",
        split_type=data.split_type or "equal",
        splits=data.splits,
    )
    doc = expense.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.group_expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/expense-groups/{group_id}/balances")
async def group_balances(group_id: str, current_user: dict = Depends(get_current_user)):
    """Calculate net who-owes-who for the group. Returns [{from, to, amount}]."""
    group = await db.expense_groups.find_one({"id": group_id, "user_id": current_user["id"]}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    expenses = await db.group_expenses.find({"group_id": group_id}, {"_id": 0}).to_list(1000)

    # Net balance per member (positive = is owed money, negative = owes money)
    balance: dict = {}
    for exp in expenses:
        paid_by = exp["paid_by"]
        split_among = exp.get("split_among", group["members"])
        n = len(split_among) or 1
        share = round(exp["amount"] / n, 2)
        # Payer gains the full amount
        balance[paid_by] = balance.get(paid_by, 0.0) + exp["amount"]
        # Each person in split owes their share
        for member in split_among:
            balance[member] = balance.get(member, 0.0) - share

    # Apply recorded settlements (reduce balances)
    recorded = await db.group_settlements.find({"group_id": group_id}, {"_id": 0}).to_list(1000)
    for s in recorded:
        payer = s["paid_by"]
        receiver = s["paid_to"]
        amt = s["amount"]
        balance[payer]    = balance.get(payer, 0.0)    + amt
        balance[receiver] = balance.get(receiver, 0.0) - amt

    # Convert to "from → to" settlement pairs
    debts = [(m, round(b, 2)) for m, b in balance.items()]
    positive = sorted([(m, b) for m, b in debts if b > 0.01], key=lambda x: -x[1])
    negative = sorted([(m, -b) for m, b in debts if b < -0.01], key=lambda x: -x[1])

    settlements = []
    i, j = 0, 0
    pos = [list(x) for x in positive]
    neg = [list(x) for x in negative]
    while i < len(pos) and j < len(neg):
        creditor, credit = pos[i]
        debtor,   debt   = neg[j]
        amount = min(credit, debt)
        settlements.append({"from": debtor, "to": creditor, "amount": round(amount, 2)})
        pos[i][1] -= amount
        neg[j][1] -= amount
        if pos[i][1] < 0.01: i += 1
        if neg[j][1] < 0.01: j += 1

    return settlements


@api_router.delete("/expense-groups/{group_id}/expenses/{expense_id}")
async def delete_group_expense(group_id: str, expense_id: str, current_user: dict = Depends(get_current_user)):
    await db.group_expenses.delete_one({"id": expense_id, "group_id": group_id})
    return {"success": True}


@api_router.put("/expense-groups/{group_id}/expenses/{expense_id}")
async def edit_group_expense(group_id: str, expense_id: str, data: GroupExpenseCreate, current_user: dict = Depends(get_current_user)):
    group = await db.expense_groups.find_one({"id": group_id, "user_id": current_user["id"]}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    split_among = data.split_among if data.split_among else group["members"]
    update_data = {
        "description": data.description,
        "amount": data.amount,
        "paid_by": data.paid_by,
        "split_among": split_among,
        "category": data.category,
        "notes": data.notes or "",
        "split_type": data.split_type or "equal",
        "splits": data.splits,
    }
    await db.group_expenses.update_one({"id": expense_id, "group_id": group_id}, {"$set": update_data})
    return {"success": True}


@api_router.post("/expense-groups/{group_id}/settle", status_code=201)
async def settle_group_debt(group_id: str, data: GroupSettlementCreate, current_user: dict = Depends(get_current_user)):
    group = await db.expense_groups.find_one({"id": group_id, "user_id": current_user["id"]}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    from datetime import date as _date2
    settlement = GroupSettlement(
        group_id=group_id, user_id=current_user["id"],
        paid_by=data.paid_by, paid_to=data.paid_to,
        amount=data.amount, note=data.note,
        date=data.date or _date2.today().isoformat(),
    )
    doc = settlement.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.group_settlements.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/expense-groups/{group_id}/settlements")
async def list_group_settlements(group_id: str, current_user: dict = Depends(get_current_user)):
    group = await db.expense_groups.find_one({"id": group_id, "user_id": current_user["id"]}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    docs = await db.group_settlements.find({"group_id": group_id}, {"_id": 0}).sort("date", -1).to_list(500)
    return docs


# ─────────────────────────────────────────────────────────────────────────────
# Circle Routes — shared finance space (couple / roommate mode)
# ─────────────────────────────────────────────────────────────────────────────

def _gen_invite_code() -> str:
    import random, string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@api_router.post("/circle", status_code=201)
async def create_circle(body: CircleCreate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = await db.circles.find_one({"owner_id": uid}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="You already have a circle. Delete it first.")
    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": uid,
        "name": body.name,
        "invite_code": _gen_invite_code(),
        "members": [{"user_id": uid, "name": current_user["name"], "email": current_user["email"], "role": "owner"}],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.circles.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/circle")
async def get_my_circles(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    circles = await db.circles.find({"members.user_id": uid}, {"_id": 0}).to_list(10)
    return circles

@api_router.post("/circle/join")
async def join_circle(body: dict, current_user: dict = Depends(get_current_user)):
    code = body.get("invite_code", "").strip().upper()
    circle = await db.circles.find_one({"invite_code": code})
    if not circle:
        raise HTTPException(status_code=404, detail="Invalid invite code.")
    uid = current_user["id"]
    already = any(m["user_id"] == uid for m in circle.get("members", []))
    if already:
        circle.pop("_id", None)
        return circle
    await db.circles.update_one(
        {"id": circle["id"]},
        {"$push": {"members": {"user_id": uid, "name": current_user["name"], "email": current_user["email"], "role": "member"}}}
    )
    circle.pop("_id", None)
    return circle

@api_router.get("/circle/{circle_id}")
async def get_circle(circle_id: str, current_user: dict = Depends(get_current_user)):
    circle = await db.circles.find_one({"id": circle_id}, {"_id": 0})
    if not circle or not any(m["user_id"] == current_user["id"] for m in circle.get("members", [])):
        raise HTTPException(status_code=404, detail="Circle not found.")
    return circle

@api_router.delete("/circle/{circle_id}")
async def delete_circle(circle_id: str, current_user: dict = Depends(get_current_user)):
    circle = await db.circles.find_one({"id": circle_id})
    if not circle or circle["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete this circle.")
    await db.circles.delete_one({"id": circle_id})
    await db.circle_expenses.delete_many({"circle_id": circle_id})
    return {"success": True}

@api_router.post("/circle/{circle_id}/leave")
async def leave_circle(circle_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    circle = await db.circles.find_one({"id": circle_id})
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found.")
    if circle["owner_id"] == uid:
        raise HTTPException(status_code=400, detail="Owner cannot leave. Delete the circle instead.")
    await db.circles.update_one({"id": circle_id}, {"$pull": {"members": {"user_id": uid}}})
    return {"success": True}

@api_router.get("/circle/{circle_id}/expenses")
async def list_circle_expenses(circle_id: str, current_user: dict = Depends(get_current_user)):
    circle = await db.circles.find_one({"id": circle_id}, {"_id": 0})
    if not circle or not any(m["user_id"] == current_user["id"] for m in circle.get("members", [])):
        raise HTTPException(status_code=403, detail="Not a member.")
    expenses = await db.circle_expenses.find({"circle_id": circle_id}, {"_id": 0}).sort("date", -1).to_list(500)
    return expenses

@api_router.post("/circle/{circle_id}/expenses", status_code=201)
async def add_circle_expense(circle_id: str, body: CircleExpenseCreate, current_user: dict = Depends(get_current_user)):
    circle = await db.circles.find_one({"id": circle_id}, {"_id": 0})
    if not circle or not any(m["user_id"] == current_user["id"] for m in circle.get("members", [])):
        raise HTTPException(status_code=403, detail="Not a member.")
    member_names = [m["name"] for m in circle.get("members", [])]
    split_among = body.split_among if body.split_among else member_names
    n = len(split_among) or 1
    doc = {
        "id": str(uuid.uuid4()),
        "circle_id": circle_id,
        "description": body.description,
        "amount": body.amount,
        "paid_by": body.paid_by,
        "split_among": split_among,
        "share_per_person": round(body.amount / n, 2),
        "date": body.date or datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        "category": body.category,
        "added_by": current_user["name"],
        "settled": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.circle_expenses.insert_one(doc)
    doc.pop("_id", None)
    # Broadcast expense event to any connected circle members
    expense_event = {
        "id": str(uuid.uuid4()),
        "circle_id": circle_id,
        "sender_id": "system",
        "sender_name": "System",
        "text": f"💸 {current_user['name']} added ₹{body.amount:,.0f} for {body.description}",
        "type": "expense_event",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.circle_messages.insert_one(expense_event)
    expense_event.pop("_id", None)
    await _circle_manager.broadcast(circle_id, expense_event)
    return doc

@api_router.delete("/circle/{circle_id}/expenses/{expense_id}")
async def delete_circle_expense(circle_id: str, expense_id: str, current_user: dict = Depends(get_current_user)):
    await db.circle_expenses.delete_one({"id": expense_id, "circle_id": circle_id})
    return {"success": True}

@api_router.get("/circle/{circle_id}/balances")
async def circle_balances(circle_id: str, current_user: dict = Depends(get_current_user)):
    circle = await db.circles.find_one({"id": circle_id}, {"_id": 0})
    if not circle or not any(m["user_id"] == current_user["id"] for m in circle.get("members", [])):
        raise HTTPException(status_code=403, detail="Not a member.")
    expenses = await db.circle_expenses.find({"circle_id": circle_id, "settled": False}, {"_id": 0}).to_list(1000)
    balance: dict = {}
    for exp in expenses:
        paid = exp["paid_by"]
        split = exp.get("split_among") or [m["name"] for m in circle.get("members", [])]
        n = len(split) or 1
        share = round(exp["amount"] / n, 2)
        balance[paid] = balance.get(paid, 0.0) + exp["amount"]
        for person in split:
            balance[person] = balance.get(person, 0.0) - share
    # Simplify to min transactions
    pos = sorted([(m, round(b,2)) for m, b in balance.items() if b > 0.01], key=lambda x: -x[1])
    neg = sorted([(m, round(-b,2)) for m, b in balance.items() if b < -0.01], key=lambda x: -x[1])
    pos, neg = [list(x) for x in pos], [list(x) for x in neg]
    settlements, i, j = [], 0, 0
    while i < len(pos) and j < len(neg):
        creditor, credit = pos[i]; debtor, debt = neg[j]
        amount = min(credit, debt)
        settlements.append({"from": debtor, "to": creditor, "amount": round(amount, 2)})
        pos[i][1] -= amount; neg[j][1] -= amount
        if pos[i][1] < 0.01: i += 1
        if neg[j][1] < 0.01: j += 1
    member_totals = {m["name"]: round(balance.get(m["name"], 0.0), 2) for m in circle.get("members", [])}
    return {"settlements": settlements, "member_totals": member_totals}

@api_router.post("/circle/{circle_id}/settle")
async def settle_circle(circle_id: str, current_user: dict = Depends(get_current_user)):
    circle = await db.circles.find_one({"id": circle_id})
    if not circle or circle["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can settle up.")
    await db.circle_expenses.update_many({"circle_id": circle_id}, {"$set": {"settled": True}})
    return {"success": True}


# ── Circle Joint EMIs ──────────────────────────────────────────────────────────

class CircleEMICreate(BaseModel):
    name: str
    total_amount: float
    members_share: dict  # {"MemberName": amount_per_month}
    due_day: int = 1  # day of month due
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    category: str = "Home Loan"

@api_router.post("/circle/{circle_id}/emis")
async def create_circle_emi(circle_id: str, input: CircleEMICreate, current_user: dict = Depends(get_current_user)):
    circle = await db.circles.find_one({"id": circle_id})
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")
    doc = {
        "id": str(uuid.uuid4()),
        "circle_id": circle_id,
        "created_by": current_user["id"],
        **input.dict(),
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.circle_emis.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    return doc

@api_router.get("/circle/{circle_id}/emis")
async def get_circle_emis(circle_id: str, current_user: dict = Depends(get_current_user)):
    items = await db.circle_emis.find({"circle_id": circle_id}, {"_id": 0}).to_list(100)
    return items

@api_router.delete("/circle/{circle_id}/emis/{emi_id}")
async def delete_circle_emi(circle_id: str, emi_id: str, current_user: dict = Depends(get_current_user)):
    await db.circle_emis.delete_one({"id": emi_id, "circle_id": circle_id})
    return {"message": "Deleted"}

# ── Circle Joint Goals ─────────────────────────────────────────────────────────

class CircleGoalCreate(BaseModel):
    name: str
    target_amount: float
    target_date: str  # YYYY-MM-DD
    description: str = ""

@api_router.post("/circle/{circle_id}/goals")
async def create_circle_goal(circle_id: str, input: CircleGoalCreate, current_user: dict = Depends(get_current_user)):
    circle = await db.circles.find_one({"id": circle_id})
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")
    doc = {
        "id": str(uuid.uuid4()),
        "circle_id": circle_id,
        "created_by": current_user["id"],
        **input.dict(),
        "contributions": [],  # list of {member_name, amount, date}
        "saved_amount": 0.0,
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.circle_goals.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    return doc

@api_router.get("/circle/{circle_id}/goals")
async def get_circle_goals(circle_id: str, current_user: dict = Depends(get_current_user)):
    items = await db.circle_goals.find({"circle_id": circle_id}, {"_id": 0}).to_list(100)
    return items

@api_router.post("/circle/{circle_id}/goals/{goal_id}/contribute")
async def contribute_circle_goal(circle_id: str, goal_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    # body: {"member_name": str, "amount": float}
    member_name = body.get("member_name", current_user.get("name", ""))
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    contribution = {"member_name": member_name, "amount": amount, "date": datetime.utcnow().strftime("%Y-%m-%d")}
    await db.circle_goals.update_one(
        {"id": goal_id, "circle_id": circle_id},
        {"$push": {"contributions": contribution}, "$inc": {"saved_amount": amount}},
    )
    return {"message": "Contributed"}

@api_router.delete("/circle/{circle_id}/goals/{goal_id}")
async def delete_circle_goal(circle_id: str, goal_id: str, current_user: dict = Depends(get_current_user)):
    await db.circle_goals.delete_one({"id": goal_id, "circle_id": circle_id})
    return {"message": "Deleted"}


# ── Circle Chat REST Endpoints ────────────────────────────────────────────────

@api_router.get("/circle/{circle_id}/messages")
async def get_circle_messages(
    circle_id: str,
    limit: int = 50,
    before_seq: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    circle = await db.circles.find_one({"id": circle_id}, {"_id": 0})
    if not circle or not any(m["user_id"] == current_user["id"] for m in circle.get("members", [])):
        raise HTTPException(status_code=403, detail="Not a member.")
    query: dict = {"circle_id": circle_id}
    if before_seq is not None:
        query["seq"] = {"$lt": before_seq}
    msgs = await db.circle_messages.find(
        query, {"_id": 0, "created_at_dt": 0}
    ).sort("seq", -1).limit(limit).to_list(limit)
    msgs.reverse()  # oldest first
    return msgs

@api_router.post("/circle/{circle_id}/messages", status_code=201)
async def post_circle_message(circle_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """REST fallback for sending a message (WebSocket preferred)."""
    circle = await db.circles.find_one({"id": circle_id}, {"_id": 0})
    if not circle or not any(m["user_id"] == current_user["id"] for m in circle.get("members", [])):
        raise HTTPException(status_code=403, detail="Not a member.")
    text = body.get("text", "").strip()[:1000]
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Idempotency: if client supplied an ID and it already exists, return existing
    client_id = body.get("id")
    if client_id:
        existing = await db.circle_messages.find_one({"id": client_id}, {"_id": 0})
        if existing:
            existing.pop("created_at_dt", None)
            return existing

    # Sequence number for guaranteed ordering
    last = await db.circle_messages.find_one(
        {"circle_id": circle_id},
        sort=[("seq", -1)],
        projection={"seq": 1},
    )
    seq = (last.get("seq", 0) if last else 0) + 1

    now_dt = datetime.now(timezone.utc)
    msg = {
        "id": client_id or str(uuid.uuid4()),
        "seq": seq,
        "circle_id": circle_id,
        "sender_id": current_user["id"],
        "sender_name": current_user["name"],
        "text": text,
        "type": "chat",
        "created_at": now_dt.isoformat(),
        "created_at_dt": now_dt,  # native datetime for TTL index
    }
    await db.circle_messages.insert_one(msg)
    msg.pop("_id", None)
    msg.pop("created_at_dt", None)
    await _circle_manager.broadcast(circle_id, msg)
    return msg


# ─────────────────────────────────────────────────────────────────────────────
# Financial Calendar Routes
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/calendar")
async def get_calendar(month: str, current_user: dict = Depends(get_current_user)):
    """Return all events for a month (YYYY-MM). Merges custom + auto-generated events."""
    user_id = current_user["id"]
    year, mon = int(month.split("-")[0]), int(month.split("-")[1])

    # Custom events
    custom = await db.calendar_events.find(
        {"user_id": user_id, "date": {"$regex": f"^{month}"}}, {"_id": 0}
    ).to_list(200)

    events = list(custom)

    # Auto: EMI due dates
    emis = await db.emis.find({"user_id": user_id, "status": "active"}, {"_id": 0}).to_list(50)
    import calendar as _cal
    last_day = _cal.monthrange(year, mon)[1]
    for emi in emis:
        day = emi.get("emi_debit_day")
        if day:
            day = min(day, last_day)
            events.append({"id": f"emi-{emi['id']}-{month}", "type": "emi", "color": "indigo",
                           "title": f"EMI: {emi['loan_name']}", "date": f"{month}-{day:02d}",
                           "amount": emi["monthly_payment"], "ref_id": emi["id"]})

    # Auto: Trips
    trips = await db.trips.find({"user_id": user_id, "status": {"$in": ["planned", "booked"]}}, {"_id": 0}).to_list(50)
    for trip in trips:
        t_start = trip.get("start_date") or ""
        t_end   = trip.get("end_date")   or ""
        if t_start.startswith(month) or t_end.startswith(month):
            events.append({"id": f"trip-{trip['id']}", "type": "trip", "color": "emerald",
                           "title": f"✈️ {trip.get('name') or trip.get('destination', 'Trip')}",
                           "date": t_start, "end_date": t_end,
                           "amount": trip.get("estimated_cost_inr") or trip.get("budget") or 0,
                           "ref_id": trip["id"]})

    # Auto: Savings goal deadlines
    goals = await db.savings_goals.find({"user_id": user_id, "status": "active"}, {"_id": 0}).to_list(20)
    for goal in goals:
        if goal.get("target_date", "").startswith(month):
            events.append({"id": f"goal-{goal['id']}", "type": "goal", "color": "teal",
                           "title": f"🎯 Goal: {goal['name']}", "date": goal["target_date"],
                           "amount": goal["target_amount"], "ref_id": goal["id"]})

    # Auto: People events (recurring yearly — birthdays, anniversaries, etc.)
    people_evs = await db.people_events.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    import calendar as _cal2
    last_day2 = _cal2.monthrange(year, mon)[1]
    for pe in people_evs:
        if pe["month"] == mon:
            day = min(pe["day"], last_day2)
            emoji = pe.get("emoji") or ("🎂" if pe["event_type"] == "birthday" else "❤️")
            events.append({
                "id": f"people-{pe['id']}",
                "type": "people",
                "title": f"{emoji} {pe['person_name']}'s {pe['event_type'].capitalize()}",
                "date": f"{year}-{mon:02d}-{day:02d}",
                "notes": pe.get("notes", ""),
                "amount": pe.get("gift_budget") or None,
                "person_name": pe["person_name"],
                "event_type": pe["event_type"],
                "people_event_id": pe["id"],
            })

    return sorted(events, key=lambda e: e.get("date", ""))


@api_router.post("/calendar", status_code=201)
async def create_event(data: CalendarEventCreate, current_user: dict = Depends(get_current_user)):
    event = CalendarEvent(**data.model_dump(), user_id=current_user["id"])
    doc = event.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.calendar_events.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ── People Events (birthdays, anniversaries, etc.) ────────────────────────────

@api_router.get("/people-events")
async def list_people_events(current_user: dict = Depends(get_current_user)):
    docs = await db.people_events.find({"user_id": current_user["id"]}, {"_id": 0}).sort("month", 1).to_list(500)
    return docs


@api_router.post("/people-events", status_code=201)
async def create_people_event(data: PeopleEventCreate, current_user: dict = Depends(get_current_user)):
    ev = PeopleEvent(**data.model_dump(), user_id=current_user["id"])
    doc = ev.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.people_events.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/people-events/{event_id}")
async def update_people_event(event_id: str, data: PeopleEventCreate, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.model_dump().items()}
    await db.people_events.update_one(
        {"id": event_id, "user_id": current_user["id"]},
        {"$set": update},
    )
    invalidate_user_cache(current_user["id"])
    doc = await db.people_events.find_one({"id": event_id}, {"_id": 0})
    return doc


@api_router.delete("/people-events/{event_id}")
async def delete_people_event(event_id: str, current_user: dict = Depends(get_current_user)):
    await db.people_events.delete_one({"id": event_id, "user_id": current_user["id"]})
    invalidate_user_cache(current_user["id"])
    return {"success": True}


@api_router.delete("/calendar/{event_id}")
async def delete_event(event_id: str, current_user: dict = Depends(get_current_user)):
    await db.calendar_events.delete_one({"id": event_id, "user_id": current_user["id"]})
    invalidate_user_cache(current_user["id"])
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────────────
# Paycheck & Lifetime Earnings Routes
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/paychecks")
async def list_paychecks(current_user: dict = Depends(get_current_user)):
    return await db.paychecks.find({"user_id": current_user["id"]}, {"_id": 0}).sort("month", -1).to_list(200)


@api_router.post("/paychecks", status_code=201)
async def add_paycheck(data: PaycheckCreate, current_user: dict = Depends(get_current_user)):
    require_pro(current_user, "paycheck_tracker")
    # Auto-calc net if not provided
    payload = data.model_dump()
    if not payload["net_take_home"] and payload["gross_monthly"]:
        deductions = payload["tds"] + payload["pf_employee"] + payload["professional_tax"] + payload["other_deductions"]
        payload["net_take_home"] = max(0, payload["gross_monthly"] - deductions)
    rec = PaycheckRecord(**payload, user_id=current_user["id"])
    doc = rec.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    # Upsert by month (one record per month)
    await db.paychecks.replace_one({"user_id": current_user["id"], "month": data.month}, doc, upsert=True)
    return doc


@api_router.post("/paychecks/fill-history")
async def fill_paycheck_history(data: PaycheckCreate, from_month: str = "", current_user: dict = Depends(get_current_user)):
    """Create paycheck records from from_month up to today, skipping months that already exist."""
    require_pro(current_user, "paycheck_tracker")
    from datetime import date as _date
    import re as _re

    # Validate from_month format YYYY-MM
    if not from_month or not _re.match(r"^\d{4}-\d{2}$", from_month):
        raise HTTPException(status_code=422, detail="from_month must be YYYY-MM format")

    uid = current_user["id"]
    start_yr, start_mo = int(from_month[:4]), int(from_month[5:7])
    today = _date.today()
    end_yr, end_mo = today.year, today.month

    # Build list of all YYYY-MM from start to today
    months = []
    yr, mo = start_yr, start_mo
    while (yr, mo) <= (end_yr, end_mo):
        months.append(f"{yr}-{mo:02d}")
        mo += 1
        if mo > 12:
            mo = 1; yr += 1

    # Find which months already have a record
    existing = await db.paychecks.find({"user_id": uid, "month": {"$in": months}}, {"month": 1}).to_list(500)
    existing_months = {r["month"] for r in existing}

    # Auto-calc net if missing
    payload = data.model_dump()
    if not payload["net_take_home"] and payload["gross_monthly"]:
        deductions = payload["tds"] + payload["pf_employee"] + payload["professional_tax"] + payload["other_deductions"]
        payload["net_take_home"] = max(0, payload["gross_monthly"] - deductions)

    created = []
    for month_str in months:
        if month_str in existing_months:
            continue
        rec = PaycheckRecord(**payload, user_id=uid, month=month_str)
        doc = rec.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.paychecks.insert_one(doc)
        created.append(month_str)

    return {"created": len(created), "skipped": len(existing_months), "months": created}

@api_router.post("/paychecks/parse-pdf")
async def parse_payslip_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Parse a payslip PDF and return extracted fields using Claude vision."""
    require_pro(current_user, "paycheck_tracker")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF too large (max 10 MB)")

    import base64
    pdf_b64 = base64.standard_b64encode(content).decode()

    client = AsyncAnthropic()
    prompt = (
        "This is an Indian payslip PDF. Extract the following fields and return ONLY valid JSON with these exact keys "
        "(use 0 for missing numbers, empty string for missing text):\n"
        '{"month": "YYYY-MM", "employer": "", "ctc_annual": 0, "gross_monthly": 0, '
        '"basic": 0, "hra": 0, "tds": 0, "pf_employee": 0, "pf_employer": 0, '
        '"professional_tax": 0, "other_deductions": 0, "net_take_home": 0}\n\n'
        "month should be derived from the pay period date on the slip. "
        "All monetary values should be plain numbers (no commas, no ₹ symbol)."
    )
    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": pdf_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        raw = response.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        import json as _json
        parsed = _json.loads(raw.strip())
        return parsed
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not parse payslip: {str(e)}")


@api_router.delete("/paychecks/{month}")
async def delete_paycheck(month: str, current_user: dict = Depends(get_current_user)):
    await db.paychecks.delete_one({"user_id": current_user["id"], "month": month})
    return {"success": True}


@api_router.get("/paychecks/lifetime-stats")
async def lifetime_stats(current_user: dict = Depends(get_current_user)):
    records = await db.paychecks.find({"user_id": current_user["id"]}, {"_id": 0}).sort("month", 1).to_list(500)
    if not records:
        return {"total_gross": 0, "total_net": 0, "total_tax": 0, "total_pf": 0, "months_tracked": 0}

    total_gross = sum(r["gross_monthly"] for r in records)
    total_net   = sum(r["net_take_home"] for r in records)
    total_tax   = sum(r["tds"] for r in records)
    total_pf    = sum(r["pf_employee"] + r.get("pf_employer", 0) for r in records)
    first_month = records[0]["month"]
    last_month  = records[-1]["month"]
    avg_net     = round(total_net / len(records), 0)

    return {
        "total_gross": round(total_gross, 0),
        "total_net": round(total_net, 0),
        "total_tax": round(total_tax, 0),
        "total_pf": round(total_pf, 0),
        "months_tracked": len(records),
        "first_month": first_month,
        "last_month": last_month,
        "avg_net_monthly": avg_net,
        "records": records,
    }


# ── Job / Career Tenure Models ────────────────────────────────────────────────
class JobTenureCreate(BaseModel):
    employer: str
    role: str = ""
    start_month: str          # YYYY-MM
    end_month: str = ""       # YYYY-MM or "" = still working here
    net_take_home: float      # monthly credited amount (required)
    ctc_annual: float = 0
    gross_monthly: float = 0
    tds: float = 0
    pf_employee: float = 0
    notes: str = ""

class JobTenure(JobTenureCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

@api_router.get("/jobs")
async def list_jobs(current_user: dict = Depends(get_current_user)):
    jobs = await db.jobs.find({"user_id": current_user["id"]}, {"_id": 0}).sort("start_month", 1).to_list(100)
    return jobs

@api_router.post("/jobs", status_code=201)
async def add_job(data: JobTenureCreate, current_user: dict = Depends(get_current_user)):
    require_pro(current_user, "paycheck_tracker")
    rec = JobTenure(**data.model_dump(), user_id=current_user["id"])
    doc = rec.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.jobs.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/jobs/{job_id}")
async def update_job(job_id: str, data: JobTenureCreate, current_user: dict = Depends(get_current_user)):
    await db.jobs.update_one(
        {"id": job_id, "user_id": current_user["id"]},
        {"$set": {**data.model_dump(), "id": job_id}}
    )
    return {"ok": True}

@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    await db.jobs.delete_one({"id": job_id, "user_id": current_user["id"]})
    return {"ok": True}

@api_router.get("/jobs/career-stats")
async def career_stats(current_user: dict = Depends(get_current_user)):
    """Compute lifetime career earnings from job tenures."""
    from datetime import date as _date
    jobs = await db.jobs.find({"user_id": current_user["id"]}, {"_id": 0}).sort("start_month", 1).to_list(100)
    if not jobs:
        return {"total_net": 0, "highest_salary": 0, "jobs": 0, "total_months": 0, "current_employer": "", "current_salary": 0}
    today = _date.today()
    total_net = 0
    total_months = 0
    highest = 0
    current_job = None
    for j in jobs:
        sy, sm = int(j["start_month"][:4]), int(j["start_month"][5:7])
        if j.get("end_month"):
            ey, em = int(j["end_month"][:4]), int(j["end_month"][5:7])
        else:
            ey, em = today.year, today.month
            current_job = j
        months = (ey - sy) * 12 + (em - sm) + 1
        total_months += months
        total_net += j.get("net_take_home", 0) * months
        if j.get("net_take_home", 0) > highest:
            highest = j["net_take_home"]
    return {
        "total_net": round(total_net, 0),
        "highest_salary": highest,
        "jobs": len(jobs),
        "total_months": total_months,
        "current_employer": current_job["employer"] if current_job else "",
        "current_salary": current_job["net_take_home"] if current_job else 0,
    }


# ── Life Timeline Models ──────────────────────────────────────────────────────
class TimelineEventCreate(BaseModel):
    type: str          # job | education | marriage | birthday | child | home | car | achievement | travel | other
    title: str
    date: str          # YYYY-MM-DD or YYYY-MM
    description: str = ""
    emoji: str = ""
    contacts: List[str] = []   # people who can help / have been there

class TimelineEvent(TimelineEventCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

@api_router.get("/timeline")
async def list_timeline(current_user: dict = Depends(get_current_user)):
    events = await db.timeline.find({"user_id": current_user["id"]}, {"_id": 0}).sort("date", 1).to_list(200)
    return events

@api_router.post("/timeline", status_code=201)
async def add_timeline_event(data: TimelineEventCreate, current_user: dict = Depends(get_current_user)):
    require_pro(current_user, "life_timeline")
    event = TimelineEvent(**data.dict(), user_id=current_user["id"])
    doc = event.dict()
    await db.timeline.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/timeline/{event_id}")
async def update_timeline_event(event_id: str, data: TimelineEventCreate, current_user: dict = Depends(get_current_user)):
    await db.timeline.update_one(
        {"id": event_id, "user_id": current_user["id"]},
        {"$set": {**data.dict(), "id": event_id}}
    )
    return {"ok": True}

@api_router.delete("/timeline/{event_id}")
async def delete_timeline_event(event_id: str, current_user: dict = Depends(get_current_user)):
    await db.timeline.delete_one({"id": event_id, "user_id": current_user["id"]})
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Luxury Items Tracker
# ─────────────────────────────────────────────────────────────────────────────

LUXURY_CATEGORIES = ["Watch", "Bag", "Jewellery", "Art", "Collectible", "Car", "Wine", "Electronics", "Footwear", "Other"]

@api_router.get("/luxury-items")
async def list_luxury_items(current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    items = await db.luxury_items.find({"user_id": current_user["id"]}, {"_id": 0}).sort("purchase_date", -1).to_list(500)
    total_cost  = sum(i.get("purchase_price", 0) for i in items)
    total_value = sum(i.get("current_value", i.get("purchase_price", 0)) for i in items)
    return {"items": items, "total_cost": round(total_cost, 2), "total_value": round(total_value, 2), "gain": round(total_value - total_cost, 2)}

@api_router.post("/luxury-items", status_code=201)
async def add_luxury_item(body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": body.get("name", "").strip(),
        "brand": body.get("brand", "").strip(),
        "category": body.get("category", "Other"),
        "purchase_price": float(body.get("purchase_price", 0)),
        "current_value": float(body.get("current_value") or body.get("purchase_price", 0)),
        "purchase_date": body.get("purchase_date", ""),
        "condition": body.get("condition", "Good"),
        "serial_number": body.get("serial_number", ""),
        "insured": bool(body.get("insured", False)),
        "insurance_value": float(body.get("insurance_value", 0)),
        "notes": body.get("notes", ""),
        "image_url": body.get("image_url", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not doc["name"]:
        raise HTTPException(status_code=400, detail="name is required")
    await db.luxury_items.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/luxury-items/{item_id}")
async def update_luxury_item(item_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    existing = await db.luxury_items.find_one({"id": item_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    allowed = {"name","brand","category","purchase_price","current_value","purchase_date","condition","serial_number","insured","insurance_value","notes","image_url"}
    updates = {k: v for k, v in body.items() if k in allowed}
    await db.luxury_items.update_one({"id": item_id}, {"$set": updates})
    return {"success": True}

@api_router.delete("/luxury-items/{item_id}", status_code=204)
async def delete_luxury_item(item_id: str, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    result = await db.luxury_items.delete_one({"id": item_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")


# ─────────────────────────────────────────────────────────────────────────────
# Children Cost Tracker
# ─────────────────────────────────────────────────────────────────────────────

CHILD_STAGES = ["Birth & Infancy", "Early Childhood", "Primary School", "Secondary School", "Higher Education", "Wedding", "Other"]
CHILD_COST_CATS = ["Medical", "Education", "Extracurricular", "Clothing", "Travel", "Food", "Wedding", "Toys & Books", "Other"]

@api_router.get("/children")
async def list_children(current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    children = await db.children.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(20)
    for child in children:
        expenses = await db.child_expenses.find({"child_id": child["id"]}, {"_id": 0}).to_list(1000)
        child["total_spent"] = sum(e.get("amount", 0) for e in expenses)
        child["expenses"] = expenses
    return children

@api_router.post("/children", status_code=201)
async def add_child(body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": name,
        "dob": body.get("dob", ""),
        "gender": body.get("gender", ""),
        "notes": body.get("notes", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.children.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/children/{child_id}", status_code=204)
async def delete_child(child_id: str, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    await db.children.delete_one({"id": child_id, "user_id": current_user["id"]})
    await db.child_expenses.delete_many({"child_id": child_id})
    invalidate_user_cache(current_user["id"])

@api_router.post("/children/{child_id}/expenses", status_code=201)
async def add_child_expense(child_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    child = await db.children.find_one({"id": child_id, "user_id": current_user["id"]})
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    doc = {
        "id": str(uuid.uuid4()),
        "child_id": child_id,
        "user_id": current_user["id"],
        "stage": body.get("stage", "Other"),
        "category": body.get("category", "Other"),
        "description": body.get("description", "").strip(),
        "amount": float(body.get("amount", 0)),
        "date": body.get("date", ""),
        "notes": body.get("notes", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.child_expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/children/{child_id}/expenses/{expense_id}", status_code=204)
async def delete_child_expense(child_id: str, expense_id: str, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    await db.child_expenses.delete_one({"id": expense_id, "child_id": child_id, "user_id": current_user["id"]})


# ─────────────────────────────────────────────────────────────────────────────
# Gift Tracker
# ─────────────────────────────────────────────────────────────────────────────

GIFT_OCCASIONS = ["Birthday", "Wedding", "Festival", "Diwali", "Holi", "Eid", "Christmas", "Anniversary", "Baby Shower", "Housewarming", "Graduation", "Thank You", "Other"]
GIFT_RELATIONS = ["Friend", "Family", "Colleague", "Relative", "Partner", "Neighbour", "Other"]

# ── Gift People Profiles ──────────────────────────────────────────────────────
@api_router.get("/gift-people")
async def list_gift_people(current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    people = await db.gift_people.find({"user_id": current_user["id"]}, {"_id": 0}).sort("name", 1).to_list(500)
    return people

@api_router.post("/gift-people", status_code=201)
async def create_gift_person(body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": name,
        "relationship": body.get("relationship", "Friend"),
        "birthday": body.get("birthday", ""),          # MM-DD or full date
        "anniversary": body.get("anniversary", ""),    # MM-DD
        "interests": body.get("interests", ""),        # free text: "loves cooking, into fitness, reads sci-fi"
        "dislikes": body.get("dislikes", ""),
        "age": body.get("age", None),
        "notes": body.get("notes", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.gift_people.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/gift-people/{person_id}")
async def update_gift_person(person_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    if not await db.gift_people.find_one({"id": person_id, "user_id": current_user["id"]}):
        raise HTTPException(status_code=404, detail="Person not found")
    allowed = {"name","relationship","birthday","anniversary","interests","dislikes","age","notes"}
    updates = {k: v for k, v in body.items() if k in allowed}
    await db.gift_people.update_one({"id": person_id}, {"$set": updates})
    return {"success": True}

@api_router.delete("/gift-people/{person_id}", status_code=204)
async def delete_gift_person(person_id: str, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    result = await db.gift_people.delete_one({"id": person_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Person not found")
    invalidate_user_cache(current_user["id"])


@api_router.get("/gifts")
async def list_gifts(current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    gifts = await db.gifts.find({"user_id": current_user["id"]}, {"_id": 0}).sort("date", -1).to_list(1000)
    return gifts

@api_router.post("/gifts", status_code=201)
async def add_gift(body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    person = body.get("person_name", "").strip()
    if not person:
        raise HTTPException(status_code=400, detail="person_name is required")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "person_name": person,
        "relationship": body.get("relationship", "Friend"),
        "direction": body.get("direction", "given"),  # 'given' | 'received'
        "occasion": body.get("occasion", "Other"),
        "gift_description": body.get("gift_description", "").strip(),
        "amount": float(body.get("amount", 0)),
        "date": body.get("date", ""),
        "return_expected": bool(body.get("return_expected", False)),
        "returned": bool(body.get("returned", False)),
        "notes": body.get("notes", ""),
        "event_id": body.get("event_id", None),
        "event_name": body.get("event_name", None),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.gifts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/gifts/{gift_id}")
async def update_gift(gift_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    if not await db.gifts.find_one({"id": gift_id, "user_id": current_user["id"]}):
        raise HTTPException(status_code=404, detail="Gift not found")
    allowed = {"person_name","relationship","direction","occasion","gift_description","amount","date","return_expected","returned","notes","event_id","event_name"}
    updates = {k: v for k, v in body.items() if k in allowed}
    await db.gifts.update_one({"id": gift_id}, {"$set": updates})
    return {"success": True}

@api_router.delete("/gifts/{gift_id}", status_code=204)
async def delete_gift(gift_id: str, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    result = await db.gifts.delete_one({"id": gift_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gift not found")


@api_router.get("/events/{event_id}/gifts")
async def get_event_gifts(event_id: str, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    gifts = await db.gifts.find(
        {"user_id": current_user["id"], "event_id": event_id},
        {"_id": 0}
    ).sort("date", -1).to_list(200)
    return gifts

@api_router.post("/gifts/recommend")
async def recommend_gift(body: dict, current_user: dict = Depends(get_current_user)):
    """AI gift recommendations personalised to the recipient's profile + gift history."""
    import json as _json
    occasion        = body.get("occasion", "Birthday")
    relationship    = body.get("relationship", "Friend")
    budget          = int(body.get("budget", 1000))
    return_expected = body.get("return_expected", False)
    received_gift   = body.get("received_gift", "")
    person_id       = body.get("person_id", "")

    _api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not _api_key:
        raise HTTPException(status_code=503, detail="AI service not configured.")

    # Build person context from saved profile + gift history
    person_context = ""
    if person_id:
        profile = await db.gift_people.find_one({"id": person_id, "user_id": current_user["id"]}, {"_id": 0})
        if profile:
            relationship = profile.get("relationship", relationship)
            parts = [f"Recipient: {profile['name']}"]
            if profile.get("age"):       parts.append(f"Age: {profile['age']}")
            if profile.get("interests"): parts.append(f"Interests & likes: {profile['interests']}")
            if profile.get("dislikes"):  parts.append(f"Dislikes / avoid: {profile['dislikes']}")
            if profile.get("notes"):     parts.append(f"Notes about them: {profile['notes']}")
            person_context = "\n".join(parts)

            # Pull past gift history for this person
            past = await db.gifts.find(
                {"user_id": current_user["id"], "person_name": profile["name"]},
                {"_id": 0}
            ).sort("date", -1).to_list(20)
            if past:
                given_items = [f"₹{g['amount']} — {g.get('item_description') or g.get('gift_description') or g['occasion']}" for g in past if g.get("direction") == "given"]
                recv_items  = [f"₹{g['amount']} — {g.get('item_description') or g.get('gift_description') or g['occasion']}" for g in past if g.get("direction") == "received"]
                if given_items:
                    person_context += f"\nGifts already given to them (avoid repeating): {', '.join(given_items[:5])}"
                if recv_items:
                    person_context += f"\nGifts they gave you: {', '.join(recv_items[:3])}"

    if not person_context:
        person_context = f"Recipient: (no profile saved)\nRelationship: {relationship}"

    if received_gift:
        context_note = f"This is a return/reciprocal gift — they gave: {received_gift}"
    else:
        context_note = f"Occasion: {occasion}"

    prompt = f"""You are a warm, thoughtful friend helping pick a gift — not a generic gift guide.
You know this person well. Use everything you know about them to suggest gifts they'd genuinely love.

{person_context}
{context_note}
Relationship: {relationship}
Budget: ₹{budget}

Rules:
- Suggest exactly 5 specific, thoughtful gift ideas tailored to THIS person (not generic)
- Reference their interests/age/history in the description — e.g. "Since they love cooking..." or "Given their age and interest in fitness..."
- Do NOT suggest anything in their dislikes list
- Do NOT repeat gifts already given to them
- Stay within ₹{budget}. For return gifts, roughly match what was received in value.
- Be specific: real product names, real brands, real stores
- Think Indian market: mention Amazon.in, Nykaa, Myntra, local stores, Zomato gifting, Blinkit, or artisan/homemade options where appropriate
- For high budgets (>₹5000), include at least one experience gift (spa, class, event, travel)

Return ONLY valid JSON:
{{
  "suggestions": [
    {{"name": "...", "description": "1-2 sentences — WHY this suits them specifically", "price_range": "₹X–₹Y", "where_to_buy": "platform/store", "tags": ["tag1","tag2"], "personalised_note": "one line referencing their interest/history"}}
  ],
  "tip": "one practical tip for this specific occasion or relationship"
}}"""

    try:
        ai_client = AsyncAnthropic(api_key=_api_key)
        result = await ai_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = result.content[0].text.strip()
        if not raw:
            raise ValueError("Empty response from AI")
        start = raw.find("{"); end = raw.rfind("}")
        if start != -1 and end != -1:
            raw = raw[start:end + 1]
        else:
            raise ValueError("No JSON object found in AI response")
        data = _json.loads(raw)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI recommendation failed: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# Event Planner
# ─────────────────────────────────────────────────────────────────────────────

EVENT_TYPES = {"Wedding", "Birthday", "Anniversary", "Pooja", "Festival", "Corporate", "Other"}

@api_router.get("/events")
async def list_events(current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    uid = current_user["id"]
    fgid = current_user.get("family_group_id")
    if fgid:
        query = {"$or": [{"user_id": uid}, {"family_group_id": fgid}]}
    else:
        query = {"user_id": uid}
    events = await db.events.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return events


@api_router.post("/events", status_code=201)
async def create_special_event(body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "family_group_id": current_user.get("family_group_id"),
        "title": title,
        "event_type": body.get("event_type", "Other"),
        "date": body.get("date", ""),
        "venue": body.get("venue", "").strip(),
        "budget": float(body.get("budget", 0)),
        "actual_cost": float(body.get("actual_cost", 0)),
        "guest_count": int(body.get("guest_count", 0)),
        "notes": body.get("notes", "").strip(),
        "status": body.get("status", "upcoming"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.events.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/events/{event_id}")
async def update_event(event_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    existing = await db.events.find_one({"id": event_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")
    allowed = {"title", "event_type", "date", "venue", "budget", "actual_cost", "guest_count", "notes", "status"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "budget" in updates:
        updates["budget"] = float(updates["budget"])
    if "actual_cost" in updates:
        updates["actual_cost"] = float(updates["actual_cost"])
    if "guest_count" in updates:
        updates["guest_count"] = int(updates["guest_count"])
    await db.events.update_one({"id": event_id}, {"$set": updates})
    updated = await db.events.find_one({"id": event_id}, {"_id": 0})
    return updated


@api_router.delete("/events/{event_id}", status_code=204)
async def delete_special_event(event_id: str, current_user: dict = Depends(get_current_user)):
    require_pro(current_user)
    result = await db.events.delete_one({"id": event_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")


@api_router.post("/events/{event_id}/ai-plan")
async def ai_event_plan(event_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """AI event planner — generates menu, invite template, catering checklist, budget breakdown and reminders."""
    import json as _json
    require_pro(current_user)

    uid = current_user["id"]
    fgid = current_user.get("family_group_id")
    query = {"id": event_id, "$or": [{"user_id": uid}, {"family_group_id": fgid}]} if fgid else {"id": event_id, "user_id": uid}
    event = await db.events.find_one(query, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    _api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not _api_key:
        raise HTTPException(status_code=503, detail="AI service not configured.")

    focus = body.get("focus", "full plan").lower()

    title       = event.get("title", "")
    event_type  = event.get("event_type", "Other")
    date        = event.get("date", "")
    venue       = event.get("venue", "")
    budget      = event.get("budget", 0)
    guest_count = event.get("guest_count", 0)
    notes       = event.get("notes", "")

    focus_instruction = {
        "menu & food":       "Focus primarily on the menu section. Provide very detailed food suggestions.",
        "invites":           "Focus primarily on the WhatsApp invite template. Make it warm, festive and culturally appropriate.",
        "catering":          "Focus primarily on the catering checklist with detailed logistics.",
        "budget breakdown":  "Focus primarily on the budget breakdown with specific cost estimates for each item.",
        "full plan":         "Provide a comprehensive plan covering all sections equally.",
    }.get(focus, "Provide a comprehensive plan covering all sections equally.")

    prompt = f"""You are an expert Indian event planner helping organise a {event_type}.

Event Details:
- Title: {title}
- Type: {event_type}
- Date: {date}
- Venue: {venue if venue else 'Not decided yet'}
- Budget: ₹{int(budget):,}
- Guest Count: {guest_count if guest_count else 'Not specified'}
- Notes: {notes if notes else 'None'}

{focus_instruction}

Provide culturally appropriate, India-specific advice. Return ONLY valid JSON in this exact structure:

{{
  "menu": {{
    "veg": ["dish1", "dish2", "dish3", "dish4", "dish5", "dish6"],
    "non_veg": ["dish1", "dish2", "dish3"],
    "desserts": ["item1", "item2", "item3"],
    "beverages": ["item1", "item2"],
    "notes": "Any special food notes or tips"
  }},
  "whatsapp_invite": "Full WhatsApp message text with emojis, formatted for sharing. Include event name, date, venue, RSVP instruction. Make it warm and festive.",
  "catering_checklist": [
    {{"item": "checklist item", "timing": "when to do this", "notes": "tip"}},
    {{"item": "checklist item 2", "timing": "when", "notes": "tip"}}
  ],
  "budget_breakdown": [
    {{"category": "Venue", "estimated_cost": 50000, "percentage": 25, "tips": "booking tip"}},
    {{"category": "Catering", "estimated_cost": 80000, "percentage": 40, "tips": "cost saving tip"}}
  ],
  "reminder_timeline": [
    {{"when": "3 months before", "task": "Book venue and caterer"}},
    {{"when": "2 months before", "task": "Send save-the-dates"}},
    {{"when": "1 month before", "task": "Confirm guest count and send formal invites"}},
    {{"when": "2 weeks before", "task": "Final headcount and menu confirmation"}},
    {{"when": "1 week before", "task": "Confirm all vendors and do a venue walkthrough"}},
    {{"when": "Day before", "task": "Setup and decoration"}}
  ],
  "ai_tip": "One key piece of advice specific to this event type and budget in the Indian context."
}}"""

    try:
        ai_client = AsyncAnthropic(api_key=_api_key)
        result = await ai_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = result.content[0].text.strip()
        start = raw.find("{"); end = raw.rfind("}")
        if start != -1 and end != -1:
            raw = raw[start:end + 1]
        data = _json.loads(raw)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI planning failed: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# Bulk Reset Endpoints — delete all data for a feature
# ─────────────────────────────────────────────────────────────────────────────

@api_router.delete("/reset/transactions", status_code=200)
async def reset_transactions(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.transactions.delete_many({"user_id": uid})
    invalidate_user_cache(uid)
    return {"deleted": r.deleted_count, "feature": "transactions"}

@api_router.delete("/reset/emis", status_code=200)
async def reset_emis(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.emis.delete_many({"user_id": uid})
    invalidate_user_cache(uid)
    return {"deleted": r.deleted_count, "feature": "emis"}

@api_router.delete("/reset/savings-goals", status_code=200)
async def reset_savings_goals(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.savings_goals.delete_many({"user_id": uid})
    invalidate_user_cache(uid)
    return {"deleted": r.deleted_count, "feature": "savings_goals"}

@api_router.delete("/reset/investments", status_code=200)
async def reset_investments(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.investments.delete_many({"user_id": uid})
    invalidate_user_cache(uid)
    return {"deleted": r.deleted_count, "feature": "investments"}

@api_router.delete("/reset/gold", status_code=200)
async def reset_gold(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.gold_items.delete_many({"user_id": uid})
    invalidate_user_cache(uid)
    return {"deleted": r.deleted_count, "feature": "gold"}

@api_router.delete("/reset/hand-loans", status_code=200)
async def reset_hand_loans(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.hand_loans.delete_many({"user_id": uid})
    invalidate_user_cache(uid)
    return {"deleted": r.deleted_count, "feature": "hand_loans"}

@api_router.delete("/reset/luxury-items", status_code=200)
async def reset_luxury_items(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.luxury_items.delete_many({"user_id": uid})
    invalidate_user_cache(uid)
    return {"deleted": r.deleted_count, "feature": "luxury_items"}

@api_router.delete("/reset/children", status_code=200)
async def reset_children(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.children.delete_many({"user_id": uid})
    return {"deleted": r.deleted_count, "feature": "children"}

@api_router.delete("/reset/gifts", status_code=200)
async def reset_gifts(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    r = await db.gifts.delete_many({"user_id": uid})
    return {"deleted": r.deleted_count, "feature": "gifts"}

# ─────────────────────────────────────────────────────────────────────────────
# Trip Collaboration — Authenticated (under /api prefix)
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/trips/{trip_id}/share")
async def generate_trip_share_link(trip_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a collaboration share token for a trip."""
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    import secrets
    share_token = secrets.token_urlsafe(16)
    await db.trips.update_one({"id": trip_id}, {"$set": {"share_token": share_token}})
    return {"share_token": share_token, "trip_id": trip_id}

@api_router.post("/trips/{trip_id}/chat")
async def trip_chat(trip_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    """Embedded AI travel guide with full trip context."""
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    message = body.get("message", "").strip()
    history = body.get("history", [])
    if not message:
        raise HTTPException(status_code=422, detail="message is required")

    plan = trip.get("plan", {})
    itinerary = plan.get("itinerary", [])
    itinerary_text = "\n".join([
        f"Day {i+1}: {day.get('title','')} @ {day.get('location','')} — ₹{day.get('estimated_cost_inr',0):,.0f} — Activities: {', '.join(day.get('activities', day.get('highlights', [])))}"
        for i, day in enumerate(itinerary)
    ])

    system_prompt = f"""You are a friendly AI travel guide for a trip to {trip.get('destination','')}.

Trip details:
- Dates: {trip.get('start_date','')} to {trip.get('end_date','')}
- Travelers: {trip.get('travelers', 1)}
- Style: {trip.get('style', 'mid-range')}
- Total budget: ₹{trip.get('estimated_cost_inr', 0):,.0f}

Day-by-day itinerary:
{itinerary_text}

Best months to visit: {plan.get('best_months', 'N/A')}
Visa info: {plan.get('visa_info', 'N/A')}
Currency tip: {plan.get('currency_tip', 'N/A')}

You are embedded inside the trip planner. The user is discussing this specific trip with you. Answer questions about activities, costs, alternatives, local tips, food, weather, packing, what to do on each day, etc. Be conversational, warm, and specific to this itinerary. Use emojis naturally. Keep answers concise but helpful. If they ask to change something in the itinerary, suggest what to modify and tell them to click Edit on that day."""

    conv_history = [{"role": m["role"], "content": m["content"]} for m in history[-10:]]
    conv_history.append({"role": "user", "content": message})

    client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        system=system_prompt,
        messages=conv_history,
    )
    return {"response": response.content[0].text}

# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Load balancer / uptime health check endpoint."""
    return {"status": "ok", "service": "BudgetMantra API", "version": "1.0.0"}


# ── Sample Data Seeder ────────────────────────────────────────────────────────
@api_router.post("/seed-sample-data")
async def seed_sample_data(current_user: dict = Depends(get_current_user), force: bool = False):
    """Populate all features with realistic Indian sample data for testing.
    Pass ?force=true to wipe existing data and reseed fresh."""
    from datetime import date as _date, timedelta

    uid = current_user["id"]
    today = _date.today()
    seeded = []

    if force:
        # Wipe existing seed-able data so we always get fresh data
        grp_ids = [g["id"] async for g in db.expense_groups.find({"user_id": uid}, {"id": 1})]
        if grp_ids:
            await db.group_expenses.delete_many({"group_id": {"$in": grp_ids}})
        for col in [db.jobs, db.paychecks, db.timeline, db.expense_groups, db.credit_scores, db.trips,
                    db.luxury_items, db.children, db.gifts]:
            await col.delete_many({"user_id": uid})

    # ── Job / Career History ──────────────────────────────────────────────────
    job_count = await db.jobs.count_documents({"user_id": uid})
    if job_count == 0:
        jobs_data = [
            {
                "employer": "Tata Consultancy Services",
                "role": "Software Engineer",
                "start_month": "2016-08",
                "end_month": "2019-03",
                "net_take_home": 32000,
                "ctc_annual": 380000,
                "gross_monthly": 31667,
                "tds": 0,
                "pf_employee": 1800,
                "notes": "First job after B.Tech. Hyderabad office.",
            },
            {
                "employer": "Infosys Ltd",
                "role": "Senior Software Engineer",
                "start_month": "2019-04",
                "end_month": "",
                "net_take_home": 82450,
                "ctc_annual": 1140000,
                "gross_monthly": 95000,
                "tds": 9500,
                "pf_employee": 5700,
                "notes": "Switched for better pay. Pune BPO campus.",
            },
        ]
        for jd in jobs_data:
            doc = {**jd, "id": str(uuid.uuid4()), "user_id": uid,
                   "created_at": datetime.now(timezone.utc).isoformat()}
            await db.jobs.insert_one(doc)
        seeded.append("career history (2 jobs)")

    # ── Paychecks: last 6 months ──────────────────────────────────────────────
    pc_count = await db.paychecks.count_documents({"user_id": uid})
    if pc_count == 0:
        for i in range(5, -1, -1):
            mo = today.replace(day=1) - timedelta(days=i * 30)
            month_str = mo.strftime("%Y-%m")
            gross = 95000
            basic = 47500
            hra = 19000
            tds = 9500
            pf = 5700
            pt = 200
            net = gross - tds - pf - pt
            doc = {
                "id": str(uuid.uuid4()), "user_id": uid, "month": month_str,
                "employer": "Infosys Ltd", "ctc_annual": 1140000,
                "gross_monthly": gross, "basic": basic, "hra": hra,
                "tds": tds, "pf_employee": pf, "pf_employer": pf,
                "professional_tax": pt, "other_deductions": 0,
                "net_take_home": net,
                "notes": "Hike month" if i == 0 else "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.paychecks.replace_one({"user_id": uid, "month": month_str}, doc, upsert=True)
        seeded.append("paychecks (6 months)")

    # ── Life Timeline ─────────────────────────────────────────────────────────
    tl_count = await db.timeline.count_documents({"user_id": uid})
    if tl_count == 0:
        timeline_events = [
            {"type": "education",  "title": "B.Tech from NIT Warangal",        "date": "2016-05-20", "emoji": "🎓", "description": "Graduated with 8.2 CGPA in Computer Science", "contacts": ["Prof. Rajan (mentor)", "Vikram (batchmate @ Google"]},
            {"type": "job",        "title": "First Job — TCS Hyderabad",        "date": "2016-08-01", "emoji": "💼", "description": "Joined as Software Engineer, CTC ₹3.8L. Chennai office, Java team.", "contacts": ["Kiran (TCS buddy)", "Divya (team lead)"]},
            {"type": "job",        "title": "Switched to Infosys — ₹9.5L CTC", "date": "2019-04-01", "emoji": "🚀", "description": "Moved to Infosys Pune as Senior Engineer. Big salary jump!", "contacts": []},
            {"type": "car",        "title": "Bought Maruti Swift",              "date": "2020-02-15", "emoji": "🚗", "description": "First car! Down payment ₹1.5L, EMI ₹9,200/mo for 5 years.", "contacts": ["Raj (helped negotiate at showroom)"]},
            {"type": "home",       "title": "Home Loan Sanctioned",             "date": "2022-01-10", "emoji": "🏠", "description": "₹45L home loan for 2BHK in Baner, Pune. EMI ₹38,000/mo, 20yr tenure.", "contacts": ["Anand (HDFC RM)", "CA Suresh (tax guidance)"]},
            {"type": "marriage",   "title": "Got Married",                      "date": "2022-12-04", "emoji": "💍", "description": "Married Priya in a beautiful ceremony in Chennai. Best day!", "contacts": []},
            {"type": "achievement","title": "Cleared NISM Certification",       "date": "2023-06-15", "emoji": "🏆", "description": "Certified in Mutual Funds distribution — started monthly SIPs.", "contacts": ["Mehul (cleared it too, good study buddy)"]},
            {"type": "finance",    "title": "Reached ₹10L in investments",      "date": "2024-03-01", "emoji": "💰", "description": "₹10L corpus across MF SIPs and direct equity. Compounding is magic!", "contacts": []},
            {"type": "child",      "title": "Baby Girl Born 👶",                "date": "2024-08-22", "emoji": "👶", "description": "Our little Aadhya arrived. Most beautiful day ever. Pure joy.", "contacts": ["Dr. Meena Rao (paediatrician)"]},
        ]
        for ev in timeline_events:
            doc = {**ev, "id": str(uuid.uuid4()), "user_id": uid,
                   "created_at": datetime.now(timezone.utc).isoformat()}
            await db.timeline.insert_one(doc)
        seeded.append("life timeline (9 events)")

    # ── Group Expenses ────────────────────────────────────────────────────────
    grp_count = await db.expense_groups.count_documents({"user_id": uid})
    if grp_count == 0:
        group_id = str(uuid.uuid4())
        members = ["Rahul", "Priya", "Aditya", "Sneha"]
        group_doc = {
            "id": group_id, "user_id": uid,
            "name": "Goa Trip 2025 🏖️", "description": "4 friends, 5 days in Goa",
            "members": members, "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.expense_groups.insert_one(group_doc)

        expenses_data = [
            {"description": "Flight tickets (GoAir)", "amount": 18400, "paid_by": "Rahul",    "split_among": members, "category": "Travel",        "date": "2025-02-10"},
            {"description": "Hotel Marriott — 5 nights", "amount": 32000, "paid_by": "Priya", "split_among": members, "category": "Accommodation",  "date": "2025-02-10"},
            {"description": "Baga Beach dinner",         "amount": 4200,  "paid_by": "Aditya", "split_among": members, "category": "Food",           "date": "2025-02-11"},
            {"description": "Scuba diving activity",     "amount": 8000,  "paid_by": "Sneha",  "split_among": members, "category": "Activities",     "date": "2025-02-12"},
            {"description": "Casinos + Drinks",          "amount": 6500,  "paid_by": "Rahul",  "split_among": ["Rahul","Aditya"], "category": "Entertainment", "date": "2025-02-13"},
            {"description": "Calangute taxi rides",      "amount": 2400,  "paid_by": "Priya",  "split_among": members, "category": "Transport",      "date": "2025-02-13"},
            {"description": "Souvenirs & feni",          "amount": 3200,  "paid_by": "Aditya", "split_among": members, "category": "Shopping",       "date": "2025-02-14"},
        ]
        for ex in expenses_data:
            split_n = len(ex["split_among"])
            per_person = round(ex["amount"] / split_n, 2)
            exp_doc = {
                "id": str(uuid.uuid4()), "group_id": group_id,
                "description": ex["description"], "amount": ex["amount"],
                "paid_by": ex["paid_by"], "split_among": ex["split_among"],
                "per_person": per_person, "category": ex["category"],
                "date": ex["date"], "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.group_expenses.insert_one(exp_doc)
        seeded.append("group expenses (Goa Trip — 1 group, 7 expenses)")

    # ── Credit Score ──────────────────────────────────────────────────────────
    cs_exists = await db.credit_scores.find_one({"user_id": uid})
    if not cs_exists:
        await db.credit_scores.replace_one({"user_id": uid}, {
            "user_id": uid, "score": 762, "bureau": "CIBIL",
            "checked_on": (today - timedelta(days=15)).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, upsert=True)
        seeded.append("credit score (762 CIBIL)")

    # ── Trip Plan (saved) ─────────────────────────────────────────────────────
    trip_count = await db.trips.count_documents({"user_id": uid})
    if trip_count == 0:
        trip_doc = {
            "id": str(uuid.uuid4()), "user_id": uid,
            "destination": "Bali, Indonesia",
            "start_date": "2025-06-15", "end_date": "2025-06-22",
            "travelers": 2, "style": "mid",
            "plan": {
                "estimated_total_inr": 145000,
                "cost_breakdown": {"flights": 45000, "accommodation": 35000, "food": 22000, "local_transport": 12000, "activities": 20000, "shopping_misc": 11000},
                "itinerary": [
                    {"day": "1-2", "title": "Arrival & Kuta Beach", "location": "Kuta / Seminyak", "highlights": ["Sunset at Tanah Lot", "Seminyak beach clubs", "Balinese massage"], "estimated_cost_inr": 38000},
                    {"day": "3-4", "title": "Ubud Cultural Immersion", "location": "Ubud", "highlights": ["Tegallalang Rice Terraces", "Monkey Forest", "Traditional Balinese cooking class"], "estimated_cost_inr": 42000},
                    {"day": "5-6", "title": "Nusa Penida Day Trips", "location": "Nusa Penida", "highlights": ["Kelingking Beach", "Angel's Billabong", "Broken Beach snorkelling"], "estimated_cost_inr": 35000},
                    {"day": "7", "title": "Departure Day", "location": "Ngurah Rai Airport", "highlights": ["Last minute Krisna souvenir shopping", "Airport drop"], "estimated_cost_inr": 15000},
                ],
                "booking_tips": [
                    {"tip": "Book GoAir/IndiGo BLR-DPS at least 3 months ahead", "when": "3 months before", "saves": "12000"},
                    {"tip": "Stay in Ubud for 2 nights — much cheaper than Seminyak", "when": "When booking", "saves": "8000"},
                ],
                "best_months": "April–October (dry season). Avoid Dec–Mar (monsoon).",
                "visa_info": "Visa on Arrival for Indian passport — USD 35, valid 30 days.",
                "currency_tip": "Indonesian Rupiah (IDR). 1 IDR ≈ ₹0.0051. Keep small IDR notes for local warung food stalls.",
                "affordability": {"can_afford_now": True, "monthly_free_cash": 25000, "months_to_save": 0},
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.trips.insert_one(trip_doc)
        seeded.append("trip plan (Bali — 7 days)")

    # ── Luxury Items ──────────────────────────────────────────────────────────
    lux_count = await db.luxury_items.count_documents({"user_id": uid})
    if lux_count == 0:
        luxury_data = [
            {"name": "Rolex Submariner", "category": "Watch", "purchase_price": 850000, "current_value": 920000,
             "purchase_date": "2022-12-25", "brand": "Rolex", "insured": True, "notes": "Christmas gift to self"},
            {"name": "Louis Vuitton Neverfull MM", "category": "Bag", "purchase_price": 120000, "current_value": 110000,
             "purchase_date": "2023-06-15", "brand": "Louis Vuitton", "insured": False, "notes": "Paris trip souvenir"},
            {"name": "Diamond Necklace Set", "category": "Jewellery", "purchase_price": 200000, "current_value": 240000,
             "purchase_date": "2022-12-01", "brand": "Tanishq", "insured": True, "notes": "Wedding anniversary gift"},
            {"name": "MacBook Pro 16\" M3 Max", "category": "Electronics", "purchase_price": 348900, "current_value": 280000,
             "purchase_date": "2024-01-10", "brand": "Apple", "insured": False, "notes": "Work + personal use"},
        ]
        for item in luxury_data:
            doc = {**item, "id": str(uuid.uuid4()), "user_id": uid,
                   "created_at": datetime.now(timezone.utc).isoformat()}
            await db.luxury_items.insert_one(doc)
        seeded.append("luxury items (4 items — watch, bag, jewellery, electronics)")

    # ── Children ──────────────────────────────────────────────────────────────
    child_count = await db.children.count_documents({"user_id": uid})
    if child_count == 0:
        child_id = str(uuid.uuid4())
        child_doc = {
            "id": child_id, "user_id": uid,
            "name": "Aadhya", "dob": "2024-08-22", "gender": "Female",
            "notes": "Our little star",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.children.insert_one(child_doc)
        child_expenses_seed = [
            {"id": str(uuid.uuid4()), "child_id": child_id, "user_id": uid,
             "stage": "Birth & Infancy", "category": "Medical",
             "description": "Hospital delivery charges", "amount": 85000,
             "date": "2024-08-22", "notes": "Apollo Hospital",
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "child_id": child_id, "user_id": uid,
             "stage": "Birth & Infancy", "category": "Medical",
             "description": "Vaccination — 3 months", "amount": 4500,
             "date": "2024-11-22", "notes": "Pentavalent + Rota",
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "child_id": child_id, "user_id": uid,
             "stage": "Birth & Infancy", "category": "Other",
             "description": "Baby gear & stroller", "amount": 22000,
             "date": "2024-09-10", "notes": "Chicco stroller + crib",
             "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.child_expenses.insert_many(child_expenses_seed)
        seeded.append("children tracker (Aadhya — 3 expenses)")

    # ── Gifts ─────────────────────────────────────────────────────────────────
    gift_count = await db.gifts.count_documents({"user_id": uid})
    if gift_count == 0:
        gifts_data = [
            {"person_name": "Priya Sharma", "occasion": "Birthday", "direction": "given", "amount": 5000,
             "item_description": "Silk saree from Nalli", "date": "2024-03-15", "return_expected": False,
             "notes": "Her 30th birthday party"},
            {"person_name": "Rahul & Sunita", "occasion": "Wedding", "direction": "given", "amount": 11000,
             "item_description": "Cash in shagun envelope", "date": "2024-02-10", "return_expected": False,
             "notes": "Colleague's wedding in Jaipur"},
            {"person_name": "Mohan Uncle", "occasion": "Diwali", "direction": "received", "amount": 2100,
             "item_description": "Dry fruits hamper", "date": "2024-11-01", "return_expected": True,
             "notes": "Will return gift next Diwali"},
            {"person_name": "Aditya (brother)", "occasion": "Raksha Bandhan", "direction": "given", "amount": 3100,
             "item_description": "Cash", "date": "2024-08-19", "return_expected": False,
             "notes": ""},
            {"person_name": "In-laws", "occasion": "Anniversary", "direction": "received", "amount": 15000,
             "item_description": "Gold coin 2g", "date": "2024-12-04", "return_expected": False,
             "notes": "1st anniversary blessing"},
        ]
        for g in gifts_data:
            doc = {**g, "id": str(uuid.uuid4()), "user_id": uid,
                   "created_at": datetime.now(timezone.utc).isoformat()}
            await db.gifts.insert_one(doc)
        seeded.append("gifts tracker (5 gifts — Diwali, Wedding, Birthday, Rakhi, Anniversary)")

    # ── PiggyBank ─────────────────────────────────────────────────────────────
    pb_exists = await db.piggy_bank.find_one({"user_id": uid})
    if not pb_exists:
        jar1_id = "jar_1"
        jar2_id = "jar_2"
        pb_doc = {
            "user_id": uid,
            "jars": [
                {"id": jar1_id, "emoji": "🐷", "name": "Home Safe", "balance": 5000},
                {"id": jar2_id, "emoji": "👛", "name": "Wallet",    "balance": 1500},
            ],
            "transactions": [
                {
                    "id": str(uuid.uuid4()), "jar_id": jar1_id, "type": "deposit",
                    "amount": 5000, "note": "Initial deposit — first savings",
                    "date": (today - timedelta(days=30)).isoformat(),
                },
                {
                    "id": str(uuid.uuid4()), "jar_id": jar2_id, "type": "deposit",
                    "amount": 2000, "note": "Cash from ATM",
                    "date": (today - timedelta(days=15)).isoformat(),
                },
                {
                    "id": str(uuid.uuid4()), "jar_id": jar2_id, "type": "withdrawal",
                    "amount": 500, "note": "Auto fare",
                    "date": (today - timedelta(days=7)).isoformat(),
                },
            ],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.piggy_bank.insert_one(pb_doc)
        seeded.append("piggy bank (2 jars — Home Safe \u20b95,000, Wallet \u20b91,500, 3 transactions)")

    # ── Events ────────────────────────────────────────────────────────────────
    ev_count = await db.events.count_documents({"user_id": uid})
    if ev_count == 0:
        events_data = [
            {
                "title": "Priya's Wedding",
                "event_type": "Wedding",
                "date": "2026-05-15",
                "venue": "Kalyana Mandapam, Chennai",
                "budget": 150000,
                "actual_cost": 0,
                "guest_count": 300,
                "notes": "Full South Indian wedding — 3-day ceremony",
                "status": "upcoming",
                "breakdown": {
                    "Venue & Hall":            {"budget": 45000, "actual": 0},
                    "Catering & Food":         {"budget": 55000, "actual": 0},
                    "Photography & Video":     {"budget": 20000, "actual": 0},
                    "Decoration & Flowers":    {"budget": 12000, "actual": 0},
                    "Mehendi & Beauty":        {"budget": 6000,  "actual": 0},
                    "DJ & Music":              {"budget": 5000,  "actual": 0},
                    "Invitations & Cards":     {"budget": 2000,  "actual": 0},
                    "Attire & Jewellery":      {"budget": 3000,  "actual": 0},
                    "Honeymoon":               {"budget": 0,     "actual": 0},
                    "Miscellaneous":           {"budget": 2000,  "actual": 0},
                },
            },
            {
                "title": "Aadhya's 1st Birthday",
                "event_type": "Birthday",
                "date": "2026-04-10",
                "venue": "Home — Pune",
                "budget": 20000,
                "actual_cost": 0,
                "guest_count": 40,
                "notes": "First birthday party — family + close friends",
                "status": "upcoming",
                "breakdown": {
                    "Venue":           {"budget": 0,    "actual": 0},
                    "Cake & Desserts": {"budget": 4000, "actual": 0},
                    "Food & Snacks":   {"budget": 8000, "actual": 0},
                    "Decoration":      {"budget": 4000, "actual": 0},
                    "Return Gifts":    {"budget": 2500, "actual": 0},
                    "Entertainment":   {"budget": 1000, "actual": 0},
                    "Miscellaneous":   {"budget": 500,  "actual": 0},
                },
            },
            {
                "title": "Griha Pravesh Pooja",
                "event_type": "Pooja",
                "date": "2026-01-14",
                "venue": "New Flat — Baner, Pune",
                "budget": 8000,
                "actual_cost": 7600,
                "guest_count": 25,
                "notes": "Vastu puja before moving into new flat. Went smoothly!",
                "status": "completed",
                "breakdown": {
                    "Pandit & Dakshina":  {"budget": 2500, "actual": 2500},
                    "Flowers & Garlands": {"budget": 1500, "actual": 1400},
                    "Prasad & Offerings": {"budget": 1000, "actual": 900},
                    "Food & Langar":      {"budget": 2000, "actual": 2200},
                    "Decoration":         {"budget": 700,  "actual": 600},
                    "Miscellaneous":      {"budget": 300,  "actual": 0},
                },
            },
        ]
        for ev in events_data:
            doc = {
                **ev,
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "family_group_id": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.events.insert_one(doc)
        seeded.append("events (3 — Wedding May 2026, Birthday Apr 2026, Completed Pooja Jan 2026)")

    # ── Bug Reports (Feedback) ────────────────────────────────────────────────
    bug_count = await db.feedback.count_documents({"user_id": uid, "category": "bug"})
    if bug_count == 0:
        bug_reports = [
            {
                "nps_score": None,
                "overall_rating": 0,
                "category": "bug",
                "feature_ratings": {},
                "description": "The EMI calendar sometimes shows next month's EMI as overdue even though it's not due yet. Happens after midnight on the last day of the month.",
                "page": "/calendar",
                "bug_title": "EMI shown as overdue one day early on calendar",
                "severity": "medium",
                "steps_to_reproduce": "1. Add any active EMI\n2. View the Financial Calendar on the last day of the current month (e.g. 31st)\n3. The EMI for next month appears highlighted in red as 'overdue'",
                "browser_info": "Chrome 122.0 on macOS Sonoma 14.3, 15\" MacBook Pro M2",
                "status": "open",
            },
            {
                "nps_score": None,
                "overall_rating": 0,
                "category": "bug",
                "feature_ratings": {},
                "description": "On Android Chrome the PiggyBank jar balances don't update in real time after a withdrawal — need to refresh the page to see the new balance.",
                "page": "/piggy-bank",
                "bug_title": "PiggyBank balance not updating after withdrawal on Android",
                "severity": "medium",
                "steps_to_reproduce": "1. Open PiggyBank on Android Chrome\n2. Tap a jar and add a withdrawal\n3. Confirm — the balance shown stays at the old value until page reload",
                "browser_info": "Chrome 123.0 on Android 14, Samsung Galaxy S23",
                "status": "open",
            },
        ]
        for br in bug_reports:
            doc = {
                **br,
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "user_name": current_user.get("name", "Demo User"),
                "user_email": current_user.get("email", ""),
                "is_pro": current_user.get("is_pro", False),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.feedback.insert_one(doc)
        seeded.append("bug reports (2 — EMI calendar, PiggyBank Android)")

    if not seeded:
        return {"message": "Sample data already exists — nothing was overwritten.", "seeded": []}

    return {
        "message": f"Sample data loaded! {len(seeded)} feature(s) populated.",
        "seeded": seeded,
    }

# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# Subscription Tracker
# ─────────────────────────────────────────────────────────────────────────────

class SubscriptionCreate(BaseModel):
    name: str
    amount: float
    currency: str = "INR"
    billing_cycle: str = "monthly"          # monthly / yearly / quarterly / weekly
    category: str = "OTT"                   # OTT / Music / Software / Gaming / News / Fitness / Other
    next_billing_date: str                  # ISO date YYYY-MM-DD
    auto_debit: bool = True
    notes: str = ""
    color: str = "#f97316"                  # for UI
    logo_emoji: str = "📺"

class Subscription(SubscriptionCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _next_billing(current_date: str, cycle: str) -> str:
    """Advance a billing date by one cycle."""
    from datetime import date, timedelta
    from dateutil.relativedelta import relativedelta
    try:
        d = date.fromisoformat(current_date)
        if cycle == "weekly":    d = d + timedelta(weeks=1)
        elif cycle == "monthly": d = d + relativedelta(months=1)
        elif cycle == "quarterly": d = d + relativedelta(months=3)
        elif cycle == "yearly":  d = d + relativedelta(years=1)
        return d.isoformat()
    except Exception:
        return current_date


def _monthly_equivalent(amount: float, cycle: str) -> float:
    """Convert any billing cycle to monthly cost."""
    if cycle == "weekly":    return amount * 52 / 12
    if cycle == "monthly":   return amount
    if cycle == "quarterly": return amount / 3
    if cycle == "yearly":    return amount / 12
    return amount


@api_router.get("/subscriptions")
async def list_subscriptions(current_user: dict = Depends(get_current_user)):
    subs = await db.subscriptions.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("next_billing_date", 1).to_list(500)
    from datetime import date
    total_monthly = sum(_monthly_equivalent(s["amount"], s["billing_cycle"]) for s in subs)
    due_soon = [s for s in subs if s["next_billing_date"] <= (date.today() + __import__("datetime").timedelta(days=7)).isoformat()]
    return {"items": subs, "total_monthly": round(total_monthly, 2), "due_soon": due_soon}


@api_router.post("/subscriptions", status_code=201)
async def create_subscription(body: SubscriptionCreate, current_user: dict = Depends(get_current_user)):
    sub = Subscription(**body.model_dump(), user_id=current_user["id"])
    doc = sub.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.subscriptions.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api_router.put("/subscriptions/{sub_id}")
async def update_subscription(sub_id: str, body: SubscriptionCreate, current_user: dict = Depends(get_current_user)):
    result = await db.subscriptions.update_one(
        {"id": sub_id, "user_id": current_user["id"]},
        {"$set": body.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"message": "Updated"}


@api_router.delete("/subscriptions/{sub_id}")
async def delete_subscription(sub_id: str, current_user: dict = Depends(get_current_user)):
    await db.subscriptions.delete_one({"id": sub_id, "user_id": current_user["id"]})
    return {"message": "Deleted"}


@api_router.post("/subscriptions/{sub_id}/renew")
async def renew_subscription(sub_id: str, current_user: dict = Depends(get_current_user)):
    """Advance next_billing_date by one cycle (manual renewal confirmation)."""
    sub = await db.subscriptions.find_one({"id": sub_id, "user_id": current_user["id"]})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    new_date = _next_billing(sub["next_billing_date"], sub["billing_cycle"])
    await db.subscriptions.update_one({"id": sub_id}, {"$set": {"next_billing_date": new_date}})
    return {"next_billing_date": new_date}


# ─────────────────────────────────────────────────────────────────────────────
# Feedback & Admin
# ─────────────────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    nps_score: Optional[int] = None        # 0–10 (None for bug-only reports)
    overall_rating: int = 0               # 1–5
    category: str = "general"             # bug / feature_request / praise / general
    feature_ratings: dict = {}
    description: str = ""
    page: str = ""
    # Bug-specific fields
    bug_title: str = ""
    severity: str = ""                    # blocking / high / medium / low
    steps_to_reproduce: str = ""
    browser_info: str = ""
    status: str = "open"                  # open / in_progress / resolved

class Feedback(FeedbackCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    user_email: str
    is_pro: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@api_router.post("/feedback", status_code=201)
async def submit_feedback(body: FeedbackCreate, current_user: dict = Depends(get_current_user)):
    fb = Feedback(
        **body.model_dump(),
        user_id=current_user["id"],
        user_name=current_user.get("name", ""),
        user_email=current_user.get("email", ""),
        is_pro=current_user.get("is_pro", False),
    )
    doc = fb.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.feedback.insert_one(doc)
    return {"message": "Thank you for your feedback!", "id": fb.id}


@api_router.get("/admin/feedback")
async def admin_get_feedback(
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    admin_secret: str = "",
):
    if not ADMIN_SECRET or admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    query = {}
    if category:
        query["category"] = category
    items = await db.feedback.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.feedback.count_documents(query)
    return {"items": items, "total": total}


@api_router.patch("/admin/feedback/{feedback_id}/status")
async def update_feedback_status(
    feedback_id: str,
    body: dict,
    _admin: dict = Depends(get_admin_user),
):
    new_status = body.get("status", "open")
    if new_status not in ("open", "in_progress", "resolved"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.feedback.update_one(
        {"id": feedback_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"status": new_status}


@api_router.get("/admin/users")
async def admin_get_users(
    skip: int = 0,
    limit: int = 100,
    admin_secret: str = "",
):
    if not ADMIN_SECRET or admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    users = await db.users.find(
        {},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents({})
    pro_count = await db.users.count_documents({"is_pro": True})
    return {"items": users, "total": total, "pro_count": pro_count}


@api_router.get("/admin/stats")
async def admin_get_stats(admin_secret: str = ""):
    if not ADMIN_SECRET or admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    import time as _time
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    total_users       = await db.users.count_documents({})
    pro_users         = await db.users.count_documents({"is_pro": True})
    new_this_month    = await db.users.count_documents({"created_at": {"$gte": month_start}})
    total_feedback    = await db.feedback.count_documents({})
    total_transactions= await db.transactions.count_documents({})
    total_trips       = await db.trips.count_documents({})
    total_emis        = await db.emis.count_documents({})

    # NPS average
    nps_docs = await db.feedback.find({}, {"nps_score": 1, "_id": 0}).to_list(10000)
    _nps_scores = [d["nps_score"] for d in nps_docs if d.get("nps_score") is not None]
    avg_nps = round(sum(_nps_scores) / len(_nps_scores), 1) if _nps_scores else None

    # Feedback by category
    pipeline = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    cat_agg = await db.feedback.aggregate(pipeline).to_list(20)
    feedback_by_category = {d["_id"]: d["count"] for d in cat_agg}

    # Signups last 7 days
    days = []
    for i in range(6, -1, -1):
        day_start = (now.replace(hour=0, minute=0, second=0, microsecond=0) -
                     __import__("datetime").timedelta(days=i))
        day_end   = day_start + __import__("datetime").timedelta(days=1)
        count = await db.users.count_documents({
            "created_at": {"$gte": day_start.isoformat(), "$lt": day_end.isoformat()}
        })
        days.append({"date": day_start.strftime("%b %d"), "signups": count})

    return {
        "total_users": total_users,
        "pro_users": pro_users,
        "free_users": total_users - pro_users,
        "pro_pct": round(pro_users / total_users * 100, 1) if total_users else 0,
        "new_this_month": new_this_month,
        "total_feedback": total_feedback,
        "avg_nps": avg_nps,
        "feedback_by_category": feedback_by_category,
        "total_transactions": total_transactions,
        "total_trips": total_trips,
        "total_emis": total_emis,
        "signups_last_7_days": days,
    }


@api_router.post("/admin/make-admin")
async def make_admin(body: dict, _admin: dict = Depends(get_admin_user)):
    """Grant admin to a user by email."""
    email = body.get("email")
    if not email:
        raise HTTPException(status_code=422, detail="email required")
    result = await db.users.update_one({"email": email}, {"$set": {"is_admin": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"{email} is now an admin"}


# ─────────────────────────────────────────────────────────────────────────────
# Piggy Bank
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/piggy-bank")
async def get_piggy_bank(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    doc = await db.piggy_bank.find_one({"user_id": uid}, {"_id": 0})
    if not doc:
        doc = {"user_id": uid, "jars": [], "transactions": []}
    return doc

@api_router.put("/piggy-bank")
async def update_piggy_bank(body: dict, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    jars = body.get("jars", [])
    transactions = body.get("transactions", [])
    await db.piggy_bank.update_one(
        {"user_id": uid},
        {"$set": {"jars": jars, "transactions": transactions, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"status": "ok"}


app.include_router(api_router)


# ── Circle Chat WebSocket ─────────────────────────────────────────────────────
@app.websocket("/ws/circle/{circle_id}")
async def circle_chat_ws(circle_id: str, websocket: WebSocket, token: str = ""):
    """
    WebSocket for real-time Circle chat.
    Connect with: ws://.../ws/circle/{circle_id}?token=<JWT>
    """
    # Authenticate via token query param
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id") or payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "id": 1})
        if not user_doc:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    # Verify membership
    circle = await db.circles.find_one({"id": circle_id}, {"_id": 0})
    if not circle or not any(m["user_id"] == user_id for m in circle.get("members", [])):
        await websocket.close(code=4003)
        return

    user_name = user_doc["name"]
    await _circle_manager.connect(circle_id, websocket, user_id, user_name)

    # Broadcast join event
    join_msg = {
        "id": str(uuid.uuid4()),
        "circle_id": circle_id,
        "sender_id": "system",
        "sender_name": "System",
        "text": f"{user_name} joined the chat",
        "type": "system",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "online": _circle_manager.online_members(circle_id),
    }
    await _circle_manager.broadcast(circle_id, join_msg)

    try:
        while True:
            data = await websocket.receive_json()
            text = str(data.get("text", "")).strip()[:1000]
            if not text:
                continue

            # Idempotency: if client supplied an ID and it already exists, re-broadcast without re-inserting
            client_id = data.get("id")
            if client_id:
                existing = await db.circle_messages.find_one({"id": client_id}, {"_id": 0})
                if existing:
                    await _circle_manager.broadcast(circle_id, existing)
                    continue

            # Sequence number for guaranteed ordering
            last = await db.circle_messages.find_one(
                {"circle_id": circle_id},
                sort=[("seq", -1)],
                projection={"seq": 1},
            )
            seq = (last.get("seq", 0) if last else 0) + 1

            now_dt = datetime.now(timezone.utc)
            msg = {
                "id": client_id or str(uuid.uuid4()),
                "seq": seq,
                "circle_id": circle_id,
                "sender_id": user_id,
                "sender_name": user_name,
                "text": text,
                "type": "chat",
                "created_at": now_dt.isoformat(),
                "created_at_dt": now_dt,  # native datetime for TTL index
            }
            await db.circle_messages.insert_one(msg)
            msg.pop("_id", None)
            msg.pop("created_at_dt", None)
            await _circle_manager.broadcast(circle_id, msg)
    except WebSocketDisconnect:
        _circle_manager.disconnect(circle_id, websocket)
        leave_msg = {
            "id": str(uuid.uuid4()),
            "circle_id": circle_id,
            "sender_id": "system",
            "sender_name": "System",
            "text": f"{user_name} left the chat",
            "type": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "online": _circle_manager.online_members(circle_id),
        }
        await _circle_manager.broadcast(circle_id, leave_msg)
    except Exception:
        _circle_manager.disconnect(circle_id, websocket)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()