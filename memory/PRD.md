---
name: PRD — Budget Mantra
description: Full product requirements, feature list, API surface, and architecture decisions. Updated Mar 2026.
type: project
---

# Budget Mantra — Product Requirements Document

**Live:** https://budget-mantra-nine.vercel.app
**Backend API:** https://budgetmantra-production.up.railway.app
**Admin Portal:** `admin/index.html` (standalone, zero dependencies)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (CRA), Tailwind CSS, shadcn/ui, React Router v6 |
| Backend | FastAPI (Python), Motor (async MongoDB), JWT auth |
| Database | MongoDB Atlas |
| AI | Anthropic Claude (`claude-sonnet-4-6` for chatbot/WhatsApp, `claude-haiku-4-5` for cheaper ops) |
| Hosting | Vercel (frontend) + Railway (backend) |
| Auth | JWT + Google OAuth + Firebase Phone Auth |
| WhatsApp | Twilio WhatsApp Sandbox |
| Gold/Silver | yfinance (`GOLD.MCX`, `SILVER.MCX`) + gold-api.com fallback |
| Scheduler | APScheduler — EMI auto-debit 09:00 IST, milestone notifications 08:30 IST |
| Caching | cachetools TTLCache (in-process, per-user) |
| Email | SMTP (Gmail app password) |
| PWA | manifest.json + Apple PWA meta tags — "Add to Home Screen" enabled |

---

## Navigation (current)

Bottom nav — **3 primary items**: Income · Expenses · EMIs
Everything else lives in the **More drawer** (grouped): Overview, Savings & Investments, Metals & Assets, Credit & Loans, Life & Family, AI & Tools.

---

## Features — Complete List

### Free Tier
| Feature | File | Notes |
|---|---|---|
| Smart Budgeting | BudgetManager.js | Category budgets, spent vs allocated, real-time |
| EMI Manager | EMIManager.js | CRUD, foreclose (interest saved), merge loans |
| Transactions | Transactions.js | Multi-select bulk delete, voice input |
| Savings Goals | SavingsGoals.js | Progress bars, contributions, Chanakya alerts |
| Chanakya AI | Chatbot.js | Claude-powered, full financial context |
| Financial Health Score | FinancialHealthScore.js | 0–100 score, EMI/savings/expense ratios |
| When to Buy? | WhenToBuy.js | Affordability timeline with history |
| Family Sharing | FamilyManagement.js | Shared budgets, category dedup by (type, name) |
| UPI SMS Importer | UPIParser.js | Bulk parse GPay/PhonePe/Paytm, investment auto-flag, confirm-before-import |
| Income Tracker | (BudgetManager.js income tab) | Income categories |
| Financial Calendar | FinancialCalendar.js | EMIs, goals, salary, personal events |
| FIRE Calculator | FireCalculator.js | 4% rule, time-to-FIRE solver |
| SMS Parser | SMSParser.js | Bank SMS → transaction |
| Recurring Expenses | RecurringExpenses.js | Auto-add monthly |
| Dashboard | Dashboard.js | Monthly snapshot, health score, sharing |

### Pro Tier
| Feature | Notes |
|---|---|
| Gold & Silver Tracker | Live MCX prices, 40+ city premiums, SGB/ETF/physical |
| Hand Loan Tracker | Given/borrowed/net/overdue |
| WhatsApp with Chanakya | YES/NO confirmation before logging, dashboard query, advice |
| AI Trip Planner | Full itinerary + cost breakdown, shareable |
| Group Expenses | Split bills, settle balances |
| Investment Tracker | Stocks, MF, FD, PPF, NPS, real estate |
| Credit Card Tracker | Spend, limits, billing cycles |
| Life Timeline | Personal milestones |
| Luxury Tracker | Watches, bags, jewellery — appreciation tracking |
| Children Cost Tracker | Birth → wedding lifecycle |
| Gift Tracker + AI | AI gift ideas by person/occasion/budget |
| Financial Calendar | Celebrations, birthdays |
| Paycheck Tracker | PDF payslip upload, AI auto-fill |
| Selective Dashboard Share | Choose which sections to share via link |
| Nominee Login | Two-step access (email + WhatsApp OTP) |

---

## Key Backend Endpoints

### Auth
- `POST /api/auth/register` — register + seed default categories + send onboarding email
- `POST /api/auth/login`
- `GET  /api/auth/me`
- `POST /api/auth/google`
- `POST /api/auth/toggle-pro` (testing)

### Core
- `GET/POST /api/categories` — $or query fetches own + family, deduplicated
- `GET/POST/DELETE /api/transactions`
- `GET/POST/PUT/DELETE /api/emis`
- `POST /api/emis/{id}/foreclose` — early payoff, returns amount_paid + interest_saved
- `GET/POST /api/savings-goals`
- `GET /api/budget-summary`
- `GET /api/financial-score`

### Gold/Silver
- `GET /api/gold/price?city=bangalore` — live MCX + city premium
- `GET /api/gold/summary`, `GET /api/gold/advice`
- `GET /api/silver/price`

### AI
- `POST /api/chatbot` — Chanakya full-page chat
- `POST /api/upi/parse-bulk` — parse UPI SMS, flag investments
- `POST /api/upi/import` — bulk import confirmed transactions

### WhatsApp
- `POST /webhook/whatsapp` — Twilio webhook; YES/NO confirmation flow; 5-min TTL pending store

### Admin (requires `is_admin: true` on user)
- `GET /api/admin/stats` — total/pro users, NPS, signups chart, counts
- `GET /api/admin/users` — paginated user list
- `GET /api/admin/feedback` — paginated feedback with category filter
- `POST /api/admin/make-admin` — grant admin by email

---

## Architecture Decisions

### Category deduplication (family sharing)
`GET /categories` uses `$or [{user_id: uid}, {family_group_id: fgid}]`, then deduplicates in Python by `(type, name.lower())` key, preferring the current user's own copy. This means no duplicate "Groceries" rows, and User B sees User A's full category list.

### WhatsApp YES/NO confirmation
In-memory `_wa_pending` dict maps `user_id → {txn_data, matched_cat, ts}`. TTL = 5 minutes. On YES/haan → insert transaction. On NO/nahi → discard. Supports Hindi confirmations.

### Category seeding
New users get 8 default expense categories on registration. Uses `allocated_amount: 0.0` (not `budget_limit`).

### Onboarding email
Fired via `asyncio.create_task(_send_onboarding_email(...))` on registration — non-blocking. Requires `SMTP_USER` / `SMTP_PASSWORD` env vars.

### Gold price
Sanity check: `9000 <= price <= 25000`. City premiums: 40+ cities in `_CITY_GOLD_PREMIUM` dict. Passed as `?city=` query param from frontend (detected via Geolocation + OSM Nominatim).

### EMI foreclose
`POST /emis/{id}/foreclose` sets `status=closed`, `paid_months=tenure_months`, `remaining_balance=0`. Returns `interest_saved = max(0, monthly_payment * remaining_months - remaining_balance)`.

### PWA
`manifest.json` in `public/` with `display: standalone`, shortcuts to Dashboard/Expense/EMIs/Chanakya. Apple PWA meta tags in `index.html` for iOS "Add to Home Screen".

### Admin portal
Standalone `admin/index.html` — zero React build needed. Login with admin JWT, fetches `/admin/stats`, `/admin/users`, `/admin/feedback`. Sidebar nav, stat cards, bar charts, paginated tables with search.

---

## Env Vars Required

```env
MONGO_URL=mongodb+srv://...
DB_NAME=budget_mantra
JWT_SECRET_KEY=...
CORS_ORIGINS=https://budget-mantra-nine.vercel.app
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
FIREBASE_PROJECT_ID=...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=<gmail-app-password>
SMTP_FROM=your@gmail.com
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

---

## Changelog

| Date | Change |
|---|---|
| Mar 2026 | MVP stabilisation — WhatsApp YES/NO confirm, EMI foreclose+merge, UPI importer investment guard + confirm-before-import, Gold city premiums, category dedup, admin portal, onboarding email, PWA manifest |
| Early 2026 | EMI Manager foreclose/merge UI, navigation 3-item streamline, animated icons |
| Late 2025 | Gold/silver tracker, hand loans, trip planner, group expenses, luxury/children/gift trackers, financial calendar, paycheck tracker |
| Mid 2025 | Chanakya AI, WhatsApp integration, family sharing, financial health score, savings goals |
| Feb 2024 | Initial launch — budgeting, EMIs, transactions, when-to-buy |
