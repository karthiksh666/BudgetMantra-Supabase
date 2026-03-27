-- ============================================================
-- Budget Mantra — Remaining Tables (Migration 002)
-- ============================================================

-- ── Gold Items ────────────────────────────────────────────────
create table if not exists gold_items (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  item_name     text not null,
  weight_grams  numeric(10,3) not null,
  purity        text default '24K',
  buy_price_per_gram numeric(10,2) default 0,
  buy_date      date,
  notes         text default '',
  created_at    timestamptz default now()
);

-- ── Silver Items ──────────────────────────────────────────────
create table if not exists silver_items (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  item_name     text not null,
  weight_grams  numeric(10,3) not null,
  purity        text default '999',
  buy_price_per_gram numeric(10,2) default 0,
  buy_date      date,
  notes         text default '',
  created_at    timestamptz default now()
);

-- ── Trips ─────────────────────────────────────────────────────
create table if not exists trips (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  name          text not null,
  destination   text default '',
  start_date    date,
  end_date      date,
  budget        numeric(14,2) default 0,
  members       text[] default '{}',
  status        text default 'planning',
  created_at    timestamptz default now()
);

create table if not exists trip_expenses (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid not null references trips(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null,
  paid_by     text not null,
  split_among text[] not null,
  category    text default 'general',
  date        date default current_date,
  created_at  timestamptz default now()
);

-- ── Nominees ──────────────────────────────────────────────────
create table if not exists nominees (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  name          text not null,
  relationship  text not null,
  phone         text,
  email         text,
  is_verified   boolean default false,
  created_at    timestamptz default now()
);

-- ── Timeline Events ───────────────────────────────────────────
create table if not exists timeline_events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  date        date not null,
  type        text default 'milestone',
  amount      numeric(14,2),
  description text default '',
  icon        text default '📌',
  created_at  timestamptz default now()
);

-- ── Luxury Items ──────────────────────────────────────────────
create table if not exists luxury_items (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  name          text not null,
  brand         text default '',
  purchase_price numeric(14,2) not null,
  current_value  numeric(14,2) default 0,
  purchase_date  date,
  category      text default 'other',
  condition     text default 'good',
  notes         text default '',
  image_url     text default '',
  created_at    timestamptz default now()
);

-- ── Children ──────────────────────────────────────────────────
create table if not exists children (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  birth_date  date,
  school      text default '',
  notes       text default '',
  created_at  timestamptz default now()
);

create table if not exists child_expenses (
  id          uuid primary key default uuid_generate_v4(),
  child_id    uuid not null references children(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null,
  category    text default 'education',
  date        date default current_date,
  created_at  timestamptz default now()
);

-- ── Gift People + Gifts + Events ──────────────────────────────
create table if not exists gift_people (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  relationship text default '',
  birthday    date,
  anniversary date,
  notes       text default '',
  created_at  timestamptz default now()
);

create table if not exists life_events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  date        date not null,
  type        text default 'birthday',
  person_id   uuid references gift_people(id) on delete set null,
  budget      numeric(14,2) default 0,
  notes       text default '',
  created_at  timestamptz default now()
);

create table if not exists gifts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  event_id    uuid references life_events(id) on delete set null,
  person_id   uuid references gift_people(id) on delete set null,
  name        text not null,
  amount      numeric(14,2) not null,
  status      text default 'planned' check (status in ('planned','purchased','given')),
  purchase_date date,
  notes       text default '',
  created_at  timestamptz default now()
);

-- ── Jobs / Career ─────────────────────────────────────────────
create table if not exists jobs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  company     text not null,
  title       text not null,
  start_date  date not null,
  end_date    date,
  salary      numeric(14,2) default 0,
  is_current  boolean default false,
  location    text default '',
  notes       text default '',
  created_at  timestamptz default now()
);

-- ── People Events ─────────────────────────────────────────────
create table if not exists people_events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  person_name text not null,
  event_type  text not null,
  event_date  date not null,
  notes       text default '',
  created_at  timestamptz default now()
);

-- ── Piggy Bank ────────────────────────────────────────────────
create table if not exists piggy_bank (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null unique references profiles(id) on delete cascade,
  balance     numeric(14,2) default 0,
  updated_at  timestamptz default now()
);

-- ── Circles (shared finance groups) ──────────────────────────
create table if not exists circles (
  id          uuid primary key default uuid_generate_v4(),
  created_by  uuid not null references profiles(id) on delete cascade,
  name        text not null,
  invite_code text unique,
  members     jsonb default '[]',
  created_at  timestamptz default now()
);

create table if not exists circle_expenses (
  id          uuid primary key default uuid_generate_v4(),
  circle_id   uuid not null references circles(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null,
  paid_by     uuid references profiles(id),
  split_among uuid[] default '{}',
  date        date default current_date,
  created_at  timestamptz default now()
);

create table if not exists circle_settlements (
  id          uuid primary key default uuid_generate_v4(),
  circle_id   uuid not null references circles(id) on delete cascade,
  from_user   uuid not null references profiles(id),
  to_user     uuid not null references profiles(id),
  amount      numeric(14,2) not null,
  date        date default current_date,
  created_at  timestamptz default now()
);

create table if not exists circle_messages (
  id          uuid primary key default uuid_generate_v4(),
  circle_id   uuid not null references circles(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  content     text not null,
  created_at  timestamptz default now()
);

-- ── When To Buy History ───────────────────────────────────────
create table if not exists when_to_buy_history (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  query       text not null,
  result      jsonb default '{}',
  created_at  timestamptz default now()
);

-- ── Credit Cards ──────────────────────────────────────────────
create table if not exists credit_cards (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  bank            text not null,
  last_four       text,
  credit_limit    numeric(14,2) default 0,
  billing_date    integer,
  due_date        integer,
  current_balance numeric(14,2) default 0,
  created_at      timestamptz default now()
);

create table if not exists credit_card_expenses (
  id          uuid primary key default uuid_generate_v4(),
  card_id     uuid not null references credit_cards(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null,
  category    text default 'general',
  date        date default current_date,
  created_at  timestamptz default now()
);

-- ── RLS for new tables ────────────────────────────────────────
alter table gold_items           enable row level security;
alter table silver_items         enable row level security;
alter table trips                enable row level security;
alter table trip_expenses        enable row level security;
alter table nominees             enable row level security;
alter table timeline_events      enable row level security;
alter table luxury_items         enable row level security;
alter table children             enable row level security;
alter table child_expenses       enable row level security;
alter table gift_people          enable row level security;
alter table life_events          enable row level security;
alter table gifts                enable row level security;
alter table jobs                 enable row level security;
alter table people_events        enable row level security;
alter table piggy_bank           enable row level security;
alter table circles              enable row level security;
alter table circle_expenses      enable row level security;
alter table circle_settlements   enable row level security;
alter table circle_messages      enable row level security;
alter table when_to_buy_history  enable row level security;
alter table credit_cards         enable row level security;
alter table credit_card_expenses enable row level security;

create policy "gold_items_self"           on gold_items           for all using (auth.uid() = user_id);
create policy "silver_items_self"         on silver_items         for all using (auth.uid() = user_id);
create policy "trips_self"                on trips                for all using (auth.uid() = user_id);
create policy "trip_expenses_self"        on trip_expenses        for all using (auth.uid() = user_id);
create policy "nominees_self"             on nominees             for all using (auth.uid() = user_id);
create policy "timeline_events_self"      on timeline_events      for all using (auth.uid() = user_id);
create policy "luxury_items_self"         on luxury_items         for all using (auth.uid() = user_id);
create policy "children_self"             on children             for all using (auth.uid() = user_id);
create policy "child_expenses_self"       on child_expenses       for all using (auth.uid() = user_id);
create policy "gift_people_self"          on gift_people          for all using (auth.uid() = user_id);
create policy "life_events_self"          on life_events          for all using (auth.uid() = user_id);
create policy "gifts_self"                on gifts                for all using (auth.uid() = user_id);
create policy "jobs_self"                 on jobs                 for all using (auth.uid() = user_id);
create policy "people_events_self"        on people_events        for all using (auth.uid() = user_id);
create policy "piggy_bank_self"           on piggy_bank           for all using (auth.uid() = user_id);
create policy "circles_member"            on circles              for all using (auth.uid() = created_by);
create policy "circle_expenses_self"      on circle_expenses      for all using (auth.uid() = user_id);
create policy "circle_settlements_self"   on circle_settlements   for all using (auth.uid() = from_user or auth.uid() = to_user);
create policy "circle_messages_self"      on circle_messages      for all using (auth.uid() = user_id);
create policy "when_to_buy_self"          on when_to_buy_history  for all using (auth.uid() = user_id);
create policy "credit_cards_self"         on credit_cards         for all using (auth.uid() = user_id);
create policy "credit_card_expenses_self" on credit_card_expenses for all using (auth.uid() = user_id);
