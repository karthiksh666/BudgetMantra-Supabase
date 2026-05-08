-- Migration 005: tables for new feature parity endpoints
-- yearly_earnings, recurring_income_profiles, quick_notes, stock_watchlist, support_tickets

-- ── Yearly CTC / earnings history ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yearly_earnings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL CHECK (year BETWEEN 1980 AND 2060),
    ctc_annual  NUMERIC(14,2) NOT NULL DEFAULT 0,
    months      SMALLINT NOT NULL DEFAULT 12 CHECK (months BETWEEN 0 AND 12),
    notes       TEXT NOT NULL DEFAULT '',
    segments    JSONB,                         -- [{role, ctc_annual, from_month, to_month}]
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, year)
);
CREATE INDEX IF NOT EXISTS idx_yearly_earnings_user ON yearly_earnings(user_id);

-- ── Recurring income profiles (salary, rental, freelance) ────────────────────
CREATE TABLE IF NOT EXISTS recurring_income_profiles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    frequency    TEXT NOT NULL DEFAULT 'monthly'
                     CHECK (frequency IN ('monthly','quarterly','annual','weekly')),
    source_type  TEXT NOT NULL DEFAULT 'salary',
    start_date   DATE,
    end_date     DATE,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    notes        TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_income_user ON recurring_income_profiles(user_id);

-- ── Quick Notes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content    TEXT NOT NULL DEFAULT '',
    pinned     BOOLEAN NOT NULL DEFAULT FALSE,
    color      TEXT NOT NULL DEFAULT 'default',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quick_notes_user ON quick_notes(user_id);

-- ── Stock Watchlist ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_watchlist (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    symbol        TEXT NOT NULL,
    company_name  TEXT NOT NULL DEFAULT '',
    target_price  NUMERIC(14,2) NOT NULL,
    stop_loss     NUMERIC(14,2),
    book_profit   NUMERIC(14,2),
    current_price NUMERIC(14,2),
    notes         TEXT NOT NULL DEFAULT '',
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON stock_watchlist(user_id);

-- ── Support Tickets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_email  TEXT NOT NULL DEFAULT '',
    subject     TEXT NOT NULL,
    description TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'general',
    priority    TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
    status      TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','closed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user   ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
