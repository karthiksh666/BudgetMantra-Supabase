-- ============================================================
-- Budget Mantra — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Profiles (extends Supabase auth.users) ───────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  name          text,
  phone         text,
  avatar_url    text,
  currency      text default 'INR',
  monthly_income numeric(14,2) default 0,
  is_pro        boolean default false,
  is_admin      boolean default false,
  streak        integer default 0,
  onboarding_complete boolean default false,
  notification_prefs  jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Transactions ─────────────────────────────────────────────
create table if not exists transactions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  amount        numeric(14,2) not null,
  type          text not null check (type in ('income','expense')),
  category      text not null,
  description   text,
  date          date not null,
  payment_mode  text default 'UPI',
  tags          text[] default '{}',
  is_recurring  boolean default false,
  recurring_id  uuid,
  source        text default 'manual',
  created_at    timestamptz default now()
);
create index if not exists transactions_user_date on transactions(user_id, date desc);

-- ── Budget Categories ─────────────────────────────────────────
create table if not exists budget_categories (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  name          text not null,
  budget_limit  numeric(14,2) default 0,
  color         text default '#f97316',
  icon          text default '📦',
  created_at    timestamptz default now()
);

-- ── EMIs ──────────────────────────────────────────────────────
create table if not exists emis (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  name            text not null,
  principal       numeric(14,2) not null,
  interest_rate   numeric(6,3) not null,
  tenure_months   integer not null,
  emi_amount      numeric(14,2) not null,
  start_date      date not null,
  next_due_date   date,
  bank            text default '',
  category        text default 'personal',
  months_paid     integer default 0,
  status          text default 'active' check (status in ('active','completed','foreclosed')),
  created_at      timestamptz default now()
);

create table if not exists emi_payments (
  id          uuid primary key default uuid_generate_v4(),
  emi_id      uuid not null references emis(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  amount      numeric(14,2) not null,
  paid_date   date not null,
  note        text default '',
  created_at  timestamptz default now()
);

-- ── Savings Goals ─────────────────────────────────────────────
create table if not exists savings_goals (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references profiles(id) on delete cascade,
  name                  text not null,
  target_amount         numeric(14,2) not null,
  current_amount        numeric(14,2) default 0,
  target_date           date,
  icon                  text default '🎯',
  category              text default 'general',
  auto_deduct           boolean default false,
  monthly_contribution  numeric(14,2) default 0,
  created_at            timestamptz default now()
);

create table if not exists goal_contributions (
  id          uuid primary key default uuid_generate_v4(),
  goal_id     uuid not null references savings_goals(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  amount      numeric(14,2) not null,
  note        text default '',
  date        date default current_date,
  created_at  timestamptz default now()
);

-- ── Investments ───────────────────────────────────────────────
create table if not exists investments (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references profiles(id) on delete cascade,
  type             text not null,
  name             text not null,
  ticker           text default '',
  units            numeric(18,6) default 0,
  buy_price        numeric(14,4) default 0,
  current_price    numeric(14,4) default 0,
  invested_amount  numeric(14,2) not null,
  current_value    numeric(14,2) default 0,
  buy_date         date not null,
  notes            text default '',
  created_at       timestamptz default now()
);

-- ── Hand Loans ────────────────────────────────────────────────
create table if not exists hand_loans (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  type          text not null check (type in ('given','taken')),
  person_name   text not null,
  amount        numeric(14,2) not null,
  remaining     numeric(14,2) not null,
  due_date      date,
  description   text default '',
  is_settled    boolean default false,
  created_at    timestamptz default now()
);

-- ── Subscriptions ─────────────────────────────────────────────
create table if not exists subscriptions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  name          text not null,
  amount        numeric(14,2) not null,
  billing_cycle text default 'monthly' check (billing_cycle in ('weekly','monthly','quarterly','yearly')),
  next_due      date,
  category      text default 'entertainment',
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ── Expense Groups (trip / group splits) ─────────────────────
create table if not exists expense_groups (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  description text default '',
  members     jsonb default '[]',
  created_at  timestamptz default now()
);

create table if not exists group_expenses (
  id           uuid primary key default uuid_generate_v4(),
  group_id     uuid not null references expense_groups(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  description  text not null,
  amount       numeric(14,2) not null,
  paid_by      text not null,
  split_among  text[] not null,
  date         date default current_date,
  created_at   timestamptz default now()
);

create table if not exists group_settlements (
  id         uuid primary key default uuid_generate_v4(),
  group_id   uuid not null references expense_groups(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  from_member text not null,
  to_member   text not null,
  amount      numeric(14,2) not null,
  date        date default current_date,
  created_at  timestamptz default now()
);

-- ── Calendar Events ───────────────────────────────────────────
create table if not exists calendar_events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  date        date not null,
  type        text default 'reminder',
  amount      numeric(14,2),
  description text default '',
  is_recurring boolean default false,
  created_at  timestamptz default now()
);

-- ── Paychecks ─────────────────────────────────────────────────
create table if not exists paychecks (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  month         text not null,        -- "2025-03"
  gross_salary  numeric(14,2) not null,
  net_salary    numeric(14,2) not null,
  deductions    jsonb default '{}',
  bonuses       numeric(14,2) default 0,
  created_at    timestamptz default now(),
  unique(user_id, month)
);

-- ── Chat Messages (Chanakya) ──────────────────────────────────
create table if not exists chat_messages (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz default now()
);
create index if not exists chat_messages_user_created on chat_messages(user_id, created_at);

-- ── Feedback ──────────────────────────────────────────────────
create table if not exists feedback (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references profiles(id) on delete set null,
  user_name       text,
  user_email      text,
  category        text default 'general',
  description     text,
  nps_score       integer,
  overall_rating  integer,
  feature_ratings jsonb default '{}',
  page            text,
  status          text default 'new',
  created_at      timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles           enable row level security;
alter table transactions        enable row level security;
alter table budget_categories   enable row level security;
alter table emis                enable row level security;
alter table emi_payments        enable row level security;
alter table savings_goals       enable row level security;
alter table goal_contributions  enable row level security;
alter table investments         enable row level security;
alter table hand_loans          enable row level security;
alter table subscriptions       enable row level security;
alter table expense_groups      enable row level security;
alter table group_expenses      enable row level security;
alter table group_settlements   enable row level security;
alter table calendar_events     enable row level security;
alter table paychecks           enable row level security;
alter table chat_messages       enable row level security;

-- Profiles: users can only read/update their own row
create policy "profiles_self" on profiles for all using (auth.uid() = id);

-- All other tables: user_id must match
create policy "transactions_self"       on transactions       for all using (auth.uid() = user_id);
create policy "budget_categories_self"  on budget_categories  for all using (auth.uid() = user_id);
create policy "emis_self"               on emis               for all using (auth.uid() = user_id);
create policy "emi_payments_self"       on emi_payments       for all using (auth.uid() = user_id);
create policy "savings_goals_self"      on savings_goals      for all using (auth.uid() = user_id);
create policy "goal_contributions_self" on goal_contributions for all using (auth.uid() = user_id);
create policy "investments_self"        on investments        for all using (auth.uid() = user_id);
create policy "hand_loans_self"         on hand_loans         for all using (auth.uid() = user_id);
create policy "subscriptions_self"      on subscriptions      for all using (auth.uid() = user_id);
create policy "expense_groups_self"     on expense_groups     for all using (auth.uid() = user_id);
create policy "group_expenses_self"     on group_expenses     for all using (auth.uid() = user_id);
create policy "group_settlements_self"  on group_settlements  for all using (auth.uid() = user_id);
create policy "calendar_events_self"    on calendar_events    for all using (auth.uid() = user_id);
create policy "paychecks_self"          on paychecks          for all using (auth.uid() = user_id);
create policy "chat_messages_self"      on chat_messages      for all using (auth.uid() = user_id);
