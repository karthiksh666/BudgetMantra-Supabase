-- ============================================================
-- Budget Mantra — Missing Tables (Migration 003)
-- ============================================================

-- ── Income Entries ────────────────────────────────────────────
create table if not exists income_entries (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  amount       numeric(14,2) not null,
  source_type  text not null default 'salary',
  source       text default '',
  description  text default '',
  date         date not null default current_date,
  is_recurring boolean default false,
  created_at   timestamptz default now()
);

alter table income_entries enable row level security;
create policy "income_entries_self" on income_entries for all using (auth.uid() = user_id);

-- ── Recurring Expenses ────────────────────────────────────────
create table if not exists recurring_expenses (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  name         text not null,
  amount       numeric(14,2) not null,
  frequency    text not null default 'monthly',
  day_of_month integer,
  start_date   date,
  emoji        text default '💸',
  description  text default '',
  is_active    boolean default true,
  created_at   timestamptz default now()
);

alter table recurring_expenses enable row level security;
create policy "recurring_expenses_self" on recurring_expenses for all using (auth.uid() = user_id);
