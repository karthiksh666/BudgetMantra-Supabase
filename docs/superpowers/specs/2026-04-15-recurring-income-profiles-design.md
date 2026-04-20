# Recurring Income Profiles — Design

## Problem
`income_entries.is_recurring` is a boolean flag on individual rows. This conflates two different concepts:

1. **A rule** — "I get paid ₹3L on the 27th of every month."
2. **An event** — "I received ₹3L on March 27."

With one table, back-filling future months is ambiguous: you can't tell which entry is the template, multiple ad-hoc entries collide on dedupe, amount changes (salary hike) create duplicates, and deleting a single month's entry can't distinguish "stop the stream" from "I deleted by mistake."

## Solution
Introduce a `recurring_income_profiles` table that holds the rule. Entries that came from a profile link back via `profile_id`. Ad-hoc entries (bonus, freelance gigs, one-off) have no `profile_id` and are never touched by the back-fill.

This mirrors the existing `recurring_expenses` table — symmetric design.

## Schema

```sql
create table if not exists recurring_income_profiles (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  source_type   text not null default 'salary',
  source        text default '',
  amount        numeric(14,2) not null,
  day_of_month  integer not null check (day_of_month between 1 and 31),
  start_date    date not null,
  end_date      date,                       -- null = active
  description   text default '',
  created_at    timestamptz default now()
);
alter table recurring_income_profiles enable row level security;
create policy "rip_self" on recurring_income_profiles
  for all using (auth.uid() = user_id);

alter table income_entries
  add column if not exists profile_id uuid references recurring_income_profiles(id) on delete set null;
create index if not exists idx_income_entries_profile on income_entries(profile_id);
```

## Back-fill Algorithm

On `GET /income-entries`:

1. Fetch all active profiles for the user (`end_date IS NULL OR end_date >= today`).
2. For each profile, enumerate months from `start_date.year_month` through `min(today, end_date).year_month`.
3. For each month, check if an entry with matching `profile_id` and same year-month already exists. If not, insert one with:
   - `date = YYYY-MM-<clamped day_of_month>` (clamp to last day of month if day doesn't exist, e.g. day 31 in April → 30).
   - `amount`, `source_type`, `source`, `description` copied from profile.
   - `is_recurring = true`, `profile_id = <profile.id>`.
4. Return all entries (materialized + ad-hoc) sorted by date desc.

Idempotent — running twice produces the same result.

## API

**Profiles (new):**
- `GET    /api/recurring-income-profiles` — list active + ended profiles.
- `POST   /api/recurring-income-profiles` — create. Body: `{ source_type, source?, amount, day_of_month, start_date, description? }`.
- `PUT    /api/recurring-income-profiles/{id}` — update fields. Changing `amount` only affects **future** materializations; past entries untouched.
- `POST   /api/recurring-income-profiles/{id}/stop` — set `end_date = today`. Keeps past entries.
- `DELETE /api/recurring-income-profiles/{id}` — hard delete profile + null out `profile_id` on linked entries (kept as historical ad-hoc).

**Existing endpoints:**
- `GET /api/income-entries` — unchanged shape; now runs back-fill first.
- `POST /api/income-entries` with `is_recurring: true` — compatibility path. Creates a profile from the submitted fields (`day_of_month = date.day`, `start_date = date`), plus a materialized entry linked to it. Lets the current mobile "Recurring monthly" toggle keep working unchanged.
- `DELETE /api/income-entries/{id}` — if the entry has a `profile_id`, only deletes the one entry. User deletes the profile separately to stop the stream.

## Mobile

Phase 1 (ship with backend): current "Add Income" sheet keeps its "Recurring monthly" toggle — backend compatibility path handles profile creation transparently. No mobile code change required to fix the reported bug.

Phase 2 (follow-up): "Manage Recurring Income" screen under More → Income, with list of active profiles, edit amount/day, stop button.

## Migration of existing data

One-shot migration script:
1. For each user, group `income_entries WHERE is_recurring=true` by `(source_type, source, amount)`.
2. For each group, create a profile (`start_date = min(date)`, `day_of_month = min(date).day`).
3. Update the group's entries: `profile_id = <new profile.id>`.
4. No data loss. Existing entries stay exactly as they are.

## Mongo backend parity

Same shape, same endpoints. Mongo uses a `recurring_income_profiles` collection with the same fields. `profile_id` added to `income_entries` documents. Back-fill and compatibility path mirror the Supabase implementation.

## Out of scope

- Weekly/quarterly cadences — monthly only for v1. Add `frequency` later if needed.
- Variable-amount profiles (e.g., salary hike mid-year) — v1 handles hikes by editing `amount` on the profile, which applies going forward. Past months stay.
- Payroll-style tax/deduction breakdown.
