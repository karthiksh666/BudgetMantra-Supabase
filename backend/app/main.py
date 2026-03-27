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
from app.routers import auth, transactions, emis, goals, investments, chat

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

app.include_router(auth.router,         prefix=PREFIX)
app.include_router(transactions.router, prefix=PREFIX)
app.include_router(emis.router,         prefix=PREFIX)
app.include_router(goals.router,        prefix=PREFIX)
app.include_router(investments.router,  prefix=PREFIX)
app.include_router(chat.router,         prefix=PREFIX)


@app.get("/")
async def root():
    return {"app": "Budget Mantra", "version": "2.0.0", "db": "supabase"}


@app.get("/health")
async def health():
    return {"status": "ok"}
