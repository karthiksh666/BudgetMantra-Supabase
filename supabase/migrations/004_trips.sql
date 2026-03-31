-- ============================================================
-- Budget Mantra — Trips Tables (Migration 004)
-- ============================================================

create table if not exists trips (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  name         text not null,
  destination  text not null,
  start_date   date,
  end_date     date,
  budget       numeric(14,2) default 0,
  currency     text default 'INR',
  notes        text default '',
  participants text[] default '{}',
  total_spent  numeric(14,2) default 0,
  itinerary    jsonb default '{}',
  created_at   timestamptz default now()
);

alter table trips enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'trips' and policyname = 'trips_self') then
    create policy "trips_self" on trips for all using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists trip_expenses (
  id             uuid primary key default uuid_generate_v4(),
  trip_id        uuid not null references trips(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  description    text not null,
  amount         numeric(14,2) not null,
  category       text default 'general',
  paid_by        text default '',
  split_between  text[] default '{}',
  date           date not null default current_date,
  notes          text default '',
  created_at     timestamptz default now()
);

alter table trip_expenses enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'trip_expenses' and policyname = 'trip_expenses_self') then
    create policy "trip_expenses_self" on trip_expenses for all using (auth.uid() = user_id);
  end if;
end $$;
