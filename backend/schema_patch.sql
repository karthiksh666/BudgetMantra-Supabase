-- ============================================================
-- Budget Mantra — Supabase Schema Patch
-- Run this in Supabase SQL Editor to fix missing columns/tables
-- ============================================================

-- ── profiles (users) ─────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_hash       TEXT,
  ADD COLUMN IF NOT EXISTS family_group_id     TEXT,
  ADD COLUMN IF NOT EXISTS google_id           TEXT,
  ADD COLUMN IF NOT EXISTS reset_token         TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires TEXT,
  ADD COLUMN IF NOT EXISTS monthly_budget      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS savings_goal        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_number     TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled    BOOLEAN DEFAULT FALSE;

-- ── otp_verifications (new table) ────────────────────────────
CREATE TABLE IF NOT EXISTS otp_verifications (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email      TEXT NOT NULL,
  otp_hash   TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_id    TEXT,
  created_at TEXT DEFAULT now()::text
);
CREATE UNIQUE INDEX IF NOT EXISTS otp_verifications_email_idx ON otp_verifications(email);

-- ── emis (missing columns) ───────────────────────────────────
ALTER TABLE emis
  ADD COLUMN IF NOT EXISTS emi_debit_day        INTEGER,
  ADD COLUMN IF NOT EXISTS last_auto_debit_date TEXT,
  ADD COLUMN IF NOT EXISTS remaining_balance    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note                 TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TEXT;

-- ── transactions (missing columns) ───────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category_id      TEXT,
  ADD COLUMN IF NOT EXISTS category_name    TEXT,
  ADD COLUMN IF NOT EXISTS family_group_id  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TEXT;

-- ── gold_items (missing columns) ─────────────────────────────
ALTER TABLE gold_items
  ADD COLUMN IF NOT EXISTS current_value    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_price    NUMERIC DEFAULT 0;

-- ── silver_items (missing columns) ───────────────────────────
ALTER TABLE silver_items
  ADD COLUMN IF NOT EXISTS current_value    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_price    NUMERIC DEFAULT 0;

-- ── savings_goals (missing columns) ──────────────────────────
ALTER TABLE savings_goals
  ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS color            TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS completed_at     TEXT;

-- ── hand_loans (column renames + missing) ────────────────────
-- The code uses loan_type and status; table has type and is_settled
ALTER TABLE hand_loans
  ADD COLUMN IF NOT EXISTS loan_type        TEXT,
  ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS person_phone     TEXT,
  ADD COLUMN IF NOT EXISTS person_email     TEXT,
  ADD COLUMN IF NOT EXISTS note             TEXT,
  ADD COLUMN IF NOT EXISTS settled_at       TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TEXT;
-- Sync existing data
UPDATE hand_loans SET loan_type = type WHERE loan_type IS NULL;
UPDATE hand_loans SET status = CASE WHEN is_settled THEN 'settled' ELSE 'active' END WHERE status IS NULL;

-- ── budget_categories (missing columns) ──────────────────────
ALTER TABLE budget_categories
  ADD COLUMN IF NOT EXISTS type             TEXT DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS monthly_budget   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spent            NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emoji            TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TEXT;

-- ── trips (missing columns) ──────────────────────────────────
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS style            TEXT DEFAULT 'mid-range',
  ADD COLUMN IF NOT EXISTS travelers        INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimated_cost_inr NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan             TEXT,
  ADD COLUMN IF NOT EXISTS share_token      TEXT,
  ADD COLUMN IF NOT EXISTS share_sections   TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TEXT;

-- ── income_entries (missing columns) ─────────────────────────
ALTER TABLE income_entries
  ADD COLUMN IF NOT EXISTS type             TEXT DEFAULT 'income',
  ADD COLUMN IF NOT EXISTS recurring_id     TEXT,
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TEXT;

-- ── investments (missing columns) ────────────────────────────
ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS platform         TEXT,
  ADD COLUMN IF NOT EXISTS account_number   TEXT,
  ADD COLUMN IF NOT EXISTS folio_number     TEXT,
  ADD COLUMN IF NOT EXISTS returns_percent  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at       TEXT;

-- ── credit_cards (missing columns) ───────────────────────────
ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS card_name        TEXT,
  ADD COLUMN IF NOT EXISTS reward_points    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at       TEXT;

-- ── recurring_expenses (missing columns) ─────────────────────
ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS next_due         TEXT,
  ADD COLUMN IF NOT EXISTS last_created     TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TEXT;

-- ── net_worth_snapshots (new table) ──────────────────────────
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL,
  month      TEXT NOT NULL,
  net_worth  NUMERIC DEFAULT 0,
  assets     TEXT,
  liabilities TEXT,
  created_at TEXT DEFAULT now()::text
);
CREATE UNIQUE INDEX IF NOT EXISTS nw_snapshots_user_month_idx ON net_worth_snapshots(user_id, month);

-- ── family_groups (new table) ────────────────────────────────
CREATE TABLE IF NOT EXISTS family_groups (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT,
  invite_code TEXT UNIQUE,
  created_by TEXT,
  members    TEXT,
  created_at TEXT DEFAULT now()::text
);

-- ── Done ─────────────────────────────────────────────────────
