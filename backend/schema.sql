-- =============================================================================
-- Budget Mantra — PostgreSQL Schema (via Supabase)
-- Migrated from MongoDB (motor) collections
-- NO Row Level Security — auth handled in Python/FastAPI
-- id fields: TEXT (we generate UUIDs as strings)
-- timestamps: TEXT (stored as ISO-8601 strings)
-- amounts: NUMERIC
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                   TEXT PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    password_hash        TEXT,
    phone                TEXT,
    dob                  TEXT,
    avatar_url           TEXT,
    auth_provider        TEXT,
    family_group_id      TEXT,
    is_pro               BOOLEAN DEFAULT FALSE,
    is_admin             BOOLEAN DEFAULT FALSE,
    profile_locked       BOOLEAN DEFAULT FALSE,
    pdf_password         TEXT,
    email_verified       BOOLEAN DEFAULT FALSE,
    welcome_email_sent   BOOLEAN DEFAULT FALSE,
    onboarding_complete  BOOLEAN DEFAULT FALSE,
    streak               INTEGER DEFAULT 0,
    last_activity_date   TEXT,
    share_token          TEXT,
    share_sections       TEXT,  -- JSON string
    notification_prefs   TEXT,  -- JSON string
    daily_spend_limit    NUMERIC,
    expo_push_token      TEXT,
    created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_share_token ON users (share_token);

-- -----------------------------------------------------------------------------
-- otp_verifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_verifications (
    email      TEXT PRIMARY KEY,
    otp_hash   TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_id    TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- login_otp_verifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_otp_verifications (
    email      TEXT PRIMARY KEY,
    otp_hash   TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_id    TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- password_reset_tokens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    email      TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used       BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_prt_email ON password_reset_tokens (email);

-- -----------------------------------------------------------------------------
-- family_groups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS family_groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_by TEXT NOT NULL,
    members    TEXT,  -- JSON array of user_ids
    created_at TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- nominees
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nominees (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    phone             TEXT,
    name              TEXT,
    relation          TEXT,
    verified          BOOLEAN DEFAULT FALSE,
    otp               TEXT,
    otp_expires       TEXT,
    login_otp         TEXT,
    login_otp_expires TEXT,
    created_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_nominees_user_id ON nominees (user_id);

-- -----------------------------------------------------------------------------
-- budget_categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_categories (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    family_group_id  TEXT,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL,  -- income | expense
    allocated_amount NUMERIC DEFAULT 0,
    spent_amount     NUMERIC DEFAULT 0,
    created_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_budget_categories_user_id ON budget_categories (user_id);
CREATE INDEX IF NOT EXISTS idx_budget_categories_family_group_id ON budget_categories (family_group_id);

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    family_group_id TEXT,
    category_id     TEXT,
    category_name   TEXT,
    amount          NUMERIC NOT NULL,
    description     TEXT,
    type            TEXT NOT NULL,  -- income | expense
    date            TEXT NOT NULL,
    source          TEXT DEFAULT 'manual',
    upi_ref         TEXT,
    upi_app         TEXT,
    vpa             TEXT,
    created_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id_date ON transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_family_group_id ON transactions (family_group_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date ON transactions (user_id, type, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_upi_ref ON transactions (upi_ref);

-- -----------------------------------------------------------------------------
-- income_entries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS income_entries (
    id        TEXT PRIMARY KEY,
    user_id   TEXT NOT NULL,
    source    TEXT,
    amount    NUMERIC NOT NULL,
    frequency TEXT,  -- monthly | one-time | weekly | yearly
    date      TEXT,
    notes     TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_income_entries_user_id_date ON income_entries (user_id, date DESC);

-- -----------------------------------------------------------------------------
-- emis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emis (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    family_group_id  TEXT,
    loan_name        TEXT NOT NULL,
    principal_amount NUMERIC,
    interest_rate    NUMERIC,
    monthly_payment  NUMERIC NOT NULL,
    start_date       TEXT,
    tenure_months    INTEGER,
    emi_debit_day    INTEGER,
    remaining_balance NUMERIC,
    paid_months      INTEGER DEFAULT 0,
    status           TEXT DEFAULT 'active',  -- active | closed
    auto_debited_months TEXT,  -- JSON array of YYYY-MM strings
    created_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_emis_user_id_status ON emis (user_id, status);

-- -----------------------------------------------------------------------------
-- emi_payments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emi_payments (
    id           TEXT PRIMARY KEY,
    emi_id       TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    amount       NUMERIC NOT NULL,
    payment_date TEXT NOT NULL,
    created_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_emi_payments_emi_id ON emi_payments (emi_id);
CREATE INDEX IF NOT EXISTS idx_emi_payments_user_id ON emi_payments (user_id);

-- -----------------------------------------------------------------------------
-- savings_goals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS savings_goals (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    family_group_id TEXT,
    name            TEXT NOT NULL,
    target_amount   NUMERIC NOT NULL,
    current_amount  NUMERIC DEFAULT 0,
    target_date     TEXT,
    category        TEXT DEFAULT 'general',
    priority        TEXT DEFAULT 'medium',
    notes           TEXT,
    status          TEXT DEFAULT 'active',  -- active | completed | paused
    created_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id_status ON savings_goals (user_id, status);

-- -----------------------------------------------------------------------------
-- investments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investments (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL,
    family_group_id       TEXT,
    type                  TEXT NOT NULL,
    name                  TEXT NOT NULL,
    invested_amount       NUMERIC,
    current_value         NUMERIC,
    monthly_sip           NUMERIC,
    symbol                TEXT,
    shares_held           NUMERIC,
    scheme_code           TEXT,
    units_held            NUMERIC,
    goal_amount           NUMERIC,
    savings_goal_id       TEXT,
    start_date            TEXT,
    maturity_date         TEXT,
    notes                 TEXT,
    created_at            TEXT,
    updated_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments (user_id);

-- -----------------------------------------------------------------------------
-- gold_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gold_items (
    id                       TEXT PRIMARY KEY,
    user_id                  TEXT NOT NULL,
    name                     TEXT NOT NULL,
    type                     TEXT NOT NULL,  -- physical | sgb | gold_etf | digital
    karat                    INTEGER DEFAULT 24,
    weight_grams             NUMERIC DEFAULT 0,
    quantity                 NUMERIC DEFAULT 0,
    purchase_price_per_gram  NUMERIC DEFAULT 0,
    purchase_price_per_unit  NUMERIC DEFAULT 0,
    purchase_date            TEXT,
    notes                    TEXT,
    current_value            NUMERIC,
    created_at               TEXT
);

CREATE INDEX IF NOT EXISTS idx_gold_items_user_id ON gold_items (user_id);

-- -----------------------------------------------------------------------------
-- silver_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS silver_items (
    id                       TEXT PRIMARY KEY,
    user_id                  TEXT NOT NULL,
    name                     TEXT NOT NULL,
    type                     TEXT NOT NULL,  -- physical | silver_etf | digital
    purity                   INTEGER DEFAULT 999,
    weight_grams             NUMERIC DEFAULT 0,
    quantity                 NUMERIC DEFAULT 0,
    purchase_price_per_gram  NUMERIC DEFAULT 0,
    purchase_price_per_unit  NUMERIC DEFAULT 0,
    purchase_date            TEXT,
    notes                    TEXT,
    current_value            NUMERIC,
    created_at               TEXT
);

CREATE INDEX IF NOT EXISTS idx_silver_items_user_id ON silver_items (user_id);

-- -----------------------------------------------------------------------------
-- hand_loans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hand_loans (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    type            TEXT NOT NULL,  -- given | taken
    loan_type       TEXT,           -- given | borrowed (alias used in some queries)
    person_name     TEXT NOT NULL,
    person_phone    TEXT,
    person_email    TEXT,
    amount          NUMERIC NOT NULL,
    date            TEXT NOT NULL,
    due_date        TEXT,
    reason          TEXT,
    notes           TEXT,
    status          TEXT DEFAULT 'pending',  -- pending | partial | settled | active
    settled_amount  NUMERIC DEFAULT 0,
    created_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_hand_loans_user_id ON hand_loans (user_id);
CREATE INDEX IF NOT EXISTS idx_hand_loans_status ON hand_loans (status);

-- -----------------------------------------------------------------------------
-- credit_cards
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_cards (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    bank_name           TEXT NOT NULL,
    card_name           TEXT NOT NULL,
    credit_limit        NUMERIC NOT NULL,
    outstanding_balance NUMERIC DEFAULT 0,
    statement_day       INTEGER DEFAULT 1,
    due_day             INTEGER DEFAULT 20,
    minimum_due_pct     NUMERIC DEFAULT 5.0,
    is_active           BOOLEAN DEFAULT TRUE,
    notes               TEXT,
    created_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_user_id ON credit_cards (user_id);

-- -----------------------------------------------------------------------------
-- credit_card_expenses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_card_expenses (
    id          TEXT PRIMARY KEY,
    card_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    amount      NUMERIC NOT NULL,
    description TEXT,
    category    TEXT,
    date        TEXT NOT NULL,
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_credit_card_expenses_card_id ON credit_card_expenses (card_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_expenses_user_id ON credit_card_expenses (user_id);

-- -----------------------------------------------------------------------------
-- credit_scores
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_scores (
    user_id        TEXT PRIMARY KEY,
    score          INTEGER,
    bureau         TEXT,
    last_updated   TEXT,
    notes          TEXT,
    created_at     TEXT
);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    type       TEXT,
    message    TEXT,
    imported   INTEGER,
    duplicates INTEGER,
    read       BOOLEAN DEFAULT FALSE,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);

-- -----------------------------------------------------------------------------
-- chat_messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id     TEXT NOT NULL,
    role        TEXT NOT NULL,  -- user | assistant
    content     TEXT,
    timestamp   TEXT,
    pinned      BOOLEAN DEFAULT FALSE,
    deleted     BOOLEAN DEFAULT FALSE,
    reply_to    TEXT,
    attachment  TEXT  -- JSON string
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id_timestamp ON chat_messages (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON chat_messages (user_id, pinned);

-- -----------------------------------------------------------------------------
-- chat_history  (safety/system messages)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_history (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT,
    timestamp  TEXT,
    source     TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history (user_id);

-- -----------------------------------------------------------------------------
-- ai_usage
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
    id      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    feature TEXT NOT NULL,
    date    TEXT,  -- YYYY-MM-DD for daily quota
    month   TEXT,  -- YYYY-MM for monthly quota
    count   INTEGER DEFAULT 0,
    tokens  INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_feature_date ON ai_usage (user_id, feature, date);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month ON ai_usage (user_id, month);

-- -----------------------------------------------------------------------------
-- net_worth_snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id    TEXT NOT NULL,
    month      TEXT NOT NULL,  -- YYYY-MM
    net_worth  NUMERIC,
    assets     NUMERIC,
    liabilities NUMERIC,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_user_id ON net_worth_snapshots (user_id, month);

-- -----------------------------------------------------------------------------
-- recurring_expenses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    name           TEXT NOT NULL,
    amount         NUMERIC NOT NULL,
    category_id    TEXT,
    category_name  TEXT,
    description    TEXT,
    frequency      TEXT DEFAULT 'monthly',
    day_of_month   INTEGER DEFAULT 1,
    start_date     TEXT,
    end_date       TEXT,
    emoji          TEXT,
    is_active      BOOLEAN DEFAULT TRUE,
    last_run_date  TEXT,
    next_run_date  TEXT,
    created_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_id ON recurring_expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_is_active ON recurring_expenses (is_active);

-- -----------------------------------------------------------------------------
-- calendar_events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_events (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    title      TEXT NOT NULL,
    date       TEXT NOT NULL,
    end_date   TEXT,
    type       TEXT DEFAULT 'custom',
    color      TEXT DEFAULT 'blue',
    amount     NUMERIC,
    notes      TEXT,
    ref_id     TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events (user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events (date);

-- -----------------------------------------------------------------------------
-- calendar_notif_log  (tracks which calendar events have triggered notifications)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_notif_log (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    event_id   TEXT,
    event_type TEXT,
    user_id    TEXT,
    date       TEXT,
    notified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cal_notif_log_event ON calendar_notif_log (event_id, date);

-- -----------------------------------------------------------------------------
-- people_events  (birthdays, anniversaries, etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS people_events (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    person_name TEXT NOT NULL,
    event_type  TEXT DEFAULT 'birthday',
    month       INTEGER NOT NULL,
    day         INTEGER NOT NULL,
    notes       TEXT,
    gift_budget NUMERIC DEFAULT 0,
    emoji       TEXT,
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_people_events_user_id ON people_events (user_id);
CREATE INDEX IF NOT EXISTS idx_people_events_month_day ON people_events (month, day);

-- -----------------------------------------------------------------------------
-- trips
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    name               TEXT,
    destination        TEXT,
    start_date         TEXT,
    end_date           TEXT,
    travelers          INTEGER DEFAULT 1,
    style              TEXT DEFAULT 'mid',
    interests          TEXT,
    budget             NUMERIC,
    estimated_cost_inr NUMERIC DEFAULT 0,
    cost_breakdown     TEXT,  -- JSON
    itinerary          TEXT,  -- JSON
    itinerary_status   TEXT,
    quick_insights     TEXT,  -- JSON
    booking_tips       TEXT,  -- JSON
    affordability      TEXT,  -- JSON
    members            TEXT,  -- JSON array of names
    savings_goal_id    TEXT,
    preferences        TEXT,
    plan               TEXT,  -- JSON
    status             TEXT DEFAULT 'planned',
    share_token        TEXT,
    created_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_share_token ON trips (share_token);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips (status);

-- -----------------------------------------------------------------------------
-- trip_expenses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_expenses (
    id           TEXT PRIMARY KEY,
    trip_id      TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    description  TEXT NOT NULL,
    amount       NUMERIC NOT NULL,
    paid_by      TEXT,
    category     TEXT DEFAULT 'other',
    date         TEXT,
    split_among  TEXT,  -- JSON array of names
    created_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_trip_expenses_trip_id ON trip_expenses (trip_id, date DESC);

-- -----------------------------------------------------------------------------
-- trip_savings  (linked savings for trips)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_savings (
    id         TEXT PRIMARY KEY,
    trip_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    amount     NUMERIC,
    notes      TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_trip_savings_trip_id ON trip_savings (trip_id);

-- -----------------------------------------------------------------------------
-- expense_groups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_groups (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    members     TEXT,  -- JSON array of names
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_expense_groups_user_id ON expense_groups (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- group_expenses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_expenses (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    description  TEXT NOT NULL,
    amount       NUMERIC NOT NULL,
    paid_by      TEXT,
    split_among  TEXT,  -- JSON array of names
    date         TEXT,
    category     TEXT DEFAULT 'General',
    notes        TEXT,
    split_type   TEXT DEFAULT 'equal',
    splits       TEXT,  -- JSON {member: amount}
    created_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_group_expenses_group_id ON group_expenses (group_id);

-- -----------------------------------------------------------------------------
-- group_settlements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_settlements (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    paid_by    TEXT,
    paid_to    TEXT,
    amount     NUMERIC NOT NULL,
    note       TEXT,
    date       TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_group_settlements_group_id ON group_settlements (group_id);

-- -----------------------------------------------------------------------------
-- circles  (family/friend spending circles)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circles (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL,
    name        TEXT DEFAULT 'Our Circle',
    invite_code TEXT UNIQUE,
    members     TEXT,  -- JSON array of {user_id, name, joined_at}
    member_ids  TEXT,  -- JSON array of user_id strings (legacy field)
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_circles_owner_id ON circles (owner_id);
CREATE INDEX IF NOT EXISTS idx_circles_invite_code ON circles (invite_code);

-- -----------------------------------------------------------------------------
-- circle_expenses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_expenses (
    id           TEXT PRIMARY KEY,
    circle_id    TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    description  TEXT NOT NULL,
    amount       NUMERIC NOT NULL,
    paid_by      TEXT,
    split_among  TEXT,  -- JSON array of display names
    date         TEXT,
    category     TEXT DEFAULT 'General',
    settled      BOOLEAN DEFAULT FALSE,
    created_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_circle_expenses_circle_id ON circle_expenses (circle_id, date DESC);

-- -----------------------------------------------------------------------------
-- circle_emis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_emis (
    id          TEXT PRIMARY KEY,
    circle_id   TEXT NOT NULL,
    loan_name   TEXT,
    amount      NUMERIC,
    member_name TEXT,
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_circle_emis_circle_id ON circle_emis (circle_id);

-- -----------------------------------------------------------------------------
-- circle_goals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_goals (
    id             TEXT PRIMARY KEY,
    circle_id      TEXT NOT NULL,
    name           TEXT,
    target_amount  NUMERIC,
    current_amount NUMERIC DEFAULT 0,
    created_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_circle_goals_circle_id ON circle_goals (circle_id);

-- -----------------------------------------------------------------------------
-- circle_messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_messages (
    id            TEXT PRIMARY KEY,
    circle_id     TEXT NOT NULL,
    user_id       TEXT,
    user_name     TEXT,
    content       TEXT,
    type          TEXT DEFAULT 'message',  -- message | system | expense
    seq           INTEGER,
    created_at    TEXT,
    created_at_dt TEXT
);

CREATE INDEX IF NOT EXISTS idx_circle_messages_circle_id ON circle_messages (circle_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_circle_messages_seq ON circle_messages (circle_id, seq);

-- -----------------------------------------------------------------------------
-- paychecks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paychecks (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id             TEXT NOT NULL,
    month               TEXT NOT NULL,  -- YYYY-MM
    employer            TEXT,
    ctc_annual          NUMERIC DEFAULT 0,
    gross_monthly       NUMERIC DEFAULT 0,
    basic               NUMERIC DEFAULT 0,
    hra                 NUMERIC DEFAULT 0,
    tds                 NUMERIC DEFAULT 0,
    pf_employee         NUMERIC DEFAULT 0,
    pf_employer         NUMERIC DEFAULT 0,
    professional_tax    NUMERIC DEFAULT 0,
    other_deductions    NUMERIC DEFAULT 0,
    net_take_home       NUMERIC DEFAULT 0,
    net_pay             NUMERIC DEFAULT 0,  -- alias used in some queries
    payment_date        TEXT,
    notes               TEXT,
    created_at          TEXT,
    UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_paychecks_user_id ON paychecks (user_id, month DESC);

-- -----------------------------------------------------------------------------
-- jobs  (employment history)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    company     TEXT,
    role        TEXT,
    start_month TEXT,  -- YYYY-MM
    end_month   TEXT,  -- YYYY-MM or NULL = current
    salary      NUMERIC,
    notes       TEXT,
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs (user_id, start_month ASC);

-- -----------------------------------------------------------------------------
-- timeline  (life/career timeline events)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timeline (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    title      TEXT,
    date       TEXT,
    type       TEXT,
    notes      TEXT,
    amount     NUMERIC,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_timeline_user_id ON timeline (user_id, date ASC);

-- -----------------------------------------------------------------------------
-- luxury_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS luxury_items (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    category        TEXT,
    purchase_price  NUMERIC,
    purchase_date   TEXT,
    current_value   NUMERIC,
    notes           TEXT,
    created_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_luxury_items_user_id ON luxury_items (user_id, purchase_date DESC);

-- -----------------------------------------------------------------------------
-- children
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS children (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    dob        TEXT,
    notes      TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_children_user_id ON children (user_id);

-- -----------------------------------------------------------------------------
-- child_expenses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS child_expenses (
    id          TEXT PRIMARY KEY,
    child_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    description TEXT,
    amount      NUMERIC NOT NULL,
    category    TEXT,
    date        TEXT,
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_child_expenses_child_id ON child_expenses (child_id);

-- -----------------------------------------------------------------------------
-- gift_people  (people you give gifts to)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gift_people (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    relation   TEXT,
    notes      TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_gift_people_user_id ON gift_people (user_id, name ASC);

-- -----------------------------------------------------------------------------
-- gifts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gifts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    person_name TEXT,
    person_id   TEXT,
    occasion    TEXT,
    amount      NUMERIC,
    description TEXT,
    date        TEXT,
    notes       TEXT,
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_gifts_user_id ON gifts (user_id, date DESC);

-- -----------------------------------------------------------------------------
-- subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    name              TEXT NOT NULL,
    amount            NUMERIC NOT NULL,
    billing_cycle     TEXT,  -- monthly | yearly | weekly
    category          TEXT,
    next_billing_date TEXT,
    is_active         BOOLEAN DEFAULT TRUE,
    notes             TEXT,
    created_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);

-- -----------------------------------------------------------------------------
-- feedback
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    category   TEXT,
    message    TEXT,
    nps_score  INTEGER,
    status     TEXT DEFAULT 'open',
    admin_note TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback (category);

-- -----------------------------------------------------------------------------
-- when_to_buy_history
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS when_to_buy_history (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    item_name   TEXT,
    target_amount NUMERIC,
    result      TEXT,  -- JSON
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_when_to_buy_history_user_id ON when_to_buy_history (user_id);

-- -----------------------------------------------------------------------------
-- fire_goals  (Financial Independence / Retire Early)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fire_goals (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id        TEXT NOT NULL UNIQUE,
    target_corpus  NUMERIC,
    monthly_expense NUMERIC,
    current_savings NUMERIC,
    expected_return NUMERIC,
    inflation_rate  NUMERIC,
    target_year     INTEGER,
    notes           TEXT,
    created_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_fire_goals_user_id ON fire_goals (user_id);

-- -----------------------------------------------------------------------------
-- market_meta  (global investment refresh metadata)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_meta (
    key           TEXT PRIMARY KEY,
    refreshed_at  TEXT,
    updated_count INTEGER,
    error_count   INTEGER
);

-- -----------------------------------------------------------------------------
-- piggy_bank  (savings challenge / piggy bank feature)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS piggy_bank (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id        TEXT NOT NULL UNIQUE,
    balance        NUMERIC DEFAULT 0,
    target         NUMERIC,
    challenge_type TEXT,
    notes          TEXT,
    entries        TEXT,  -- JSON array
    created_at     TEXT,
    updated_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_piggy_bank_user_id ON piggy_bank (user_id);

-- -----------------------------------------------------------------------------
-- events  (Indian festival / life events for event planner)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    event_type  TEXT,
    date        TEXT,
    venue       TEXT,
    budget      NUMERIC,
    guest_count INTEGER,
    notes       TEXT,
    plan        TEXT,  -- JSON AI-generated plan
    created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_user_id ON events (user_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events (date);

-- -----------------------------------------------------------------------------
-- goals  (trip-linked goals, different from savings_goals)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    trip_id    TEXT,
    name       TEXT,
    amount     NUMERIC,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals (user_id);
CREATE INDEX IF NOT EXISTS idx_goals_trip_id ON goals (trip_id);
