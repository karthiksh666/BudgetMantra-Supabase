"""
Budget Mantra — Supabase Backend
FastAPI application entry point.

Architecture:
  - Database : Supabase (PostgreSQL)
  - Auth     : Supabase Auth (JWT verified locally)
  - AI       : Anthropic Claude (Chanakya)
  - Hosting  : Railway (same as before)
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import (
    auth, transactions, emis, goals, investments, chat,
    hand_loans, subscriptions, categories, gold_silver,
    expense_groups, calendar, paychecks, jobs,
    luxury_items, children, gifts, timeline,
    nominees, piggy_bank, feedback, admin,
    market, sms, financial_score, reset,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="Budget Mantra API",
    description="Personal finance API powered by Supabase + Claude AI",
    version="2.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = "/api"

# Core
app.include_router(auth.router,             prefix=PREFIX)
app.include_router(transactions.router,     prefix=PREFIX)
app.include_router(emis.router,             prefix=PREFIX)
app.include_router(goals.router,            prefix=PREFIX)
app.include_router(investments.router,      prefix=PREFIX)
app.include_router(chat.router,             prefix=PREFIX)

# Finance features
app.include_router(hand_loans.router,       prefix=PREFIX)
app.include_router(subscriptions.router,    prefix=PREFIX)
app.include_router(categories.router,       prefix=PREFIX)
app.include_router(gold_silver.router,      prefix=PREFIX)
app.include_router(expense_groups.router,   prefix=PREFIX)
app.include_router(piggy_bank.router,       prefix=PREFIX)
app.include_router(financial_score.router,  prefix=PREFIX)

# Life tracking
app.include_router(calendar.router,         prefix=PREFIX)
app.include_router(paychecks.router,        prefix=PREFIX)
app.include_router(jobs.router,             prefix=PREFIX)
app.include_router(luxury_items.router,     prefix=PREFIX)
app.include_router(children.router,         prefix=PREFIX)
app.include_router(gifts.router,            prefix=PREFIX)
app.include_router(timeline.router,         prefix=PREFIX)
app.include_router(nominees.router,         prefix=PREFIX)

# Market & tools
app.include_router(market.router,           prefix=PREFIX)
app.include_router(sms.router,              prefix=PREFIX)

# Admin & system
app.include_router(feedback.router,         prefix=PREFIX)
app.include_router(admin.router,            prefix=PREFIX)
app.include_router(reset.router,            prefix=PREFIX)


@app.get("/")
async def root():
    return {"app": "Budget Mantra", "version": "2.0.0", "db": "supabase"}


@app.get("/health")
async def health():
    return {"status": "ok"}
