# Budget Mantra — Backend API

FastAPI backend for the Budget Mantra personal finance platform. Backed by Supabase (PostgreSQL), deployed on Railway.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI 0.109+ |
| Database | Supabase (PostgreSQL + Auth) |
| Auth | Supabase JWT (HS256 / ES256) |
| AI | Anthropic Claude (Chanakya chatbot) |
| Scheduler | APScheduler |
| Hosting | Railway |
| Python | 3.11+ |

---

## Project Structure

```
backend/
├── app/
│   ├── main.py              # App entry point, router registration
│   ├── auth.py              # JWT decode + get_current_user dependency
│   ├── database.py          # Supabase client singletons (auth + admin)
│   ├── config.py            # Settings (pydantic-settings, reads .env)
│   ├── scheduler.py         # APScheduler recurring tasks
│   └── routers/
│       ├── auth.py          # Register, login, Google OAuth, profile
│       ├── transactions.py  # Income/expense transactions
│       ├── emis.py          # EMI tracking + payments + foreclose
│       ├── goals.py         # Savings goals (prefix: /savings-goals)
│       ├── investments.py   # Investment portfolio + summaries
│       ├── chat.py          # Chanakya AI chatbot + streaming
│       ├── hand_loans.py    # Hand loans (given/taken) + summary
│       ├── subscriptions.py # Subscriptions
│       ├── categories.py    # Categories, budget-summary, net-worth, spending-breakdown
│       ├── gold_silver.py   # Gold/silver holdings + price lookups
│       ├── expense_groups.py# Group expense splitting
│       ├── calendar.py      # Calendar events + people events
│       ├── paychecks.py     # Paycheck history
│       ├── jobs.py          # Job/career timeline
│       ├── luxury_items.py  # Luxury items tracker
│       ├── children.py      # Children expense tracking
│       ├── gifts.py         # Gift planning
│       ├── timeline.py      # Life events timeline
│       ├── nominees.py      # Nominee management
│       ├── piggy_bank.py    # Piggy bank / savings jars
│       ├── market.py        # Stock/MF price lookups (yfinance)
│       ├── sms.py           # SMS transaction parser
│       ├── financial_score.py # Financial health score + history
│       ├── fire_goal.py     # FIRE goal (GET/POST/DELETE, one per user)
│       ├── income_entries.py# Income entries
│       ├── recurring_expenses.py # Recurring expenses
│       ├── credit_cards.py  # Credit cards + expenses
│       ├── trips.py         # Trip planner
│       ├── notifications.py # Push notification prefs + tokens
│       ├── circle.py        # Shared expense circles
│       ├── feedback.py      # User feedback
│       ├── admin.py         # Admin tools
│       └── reset.py         # Data reset endpoints
└── requirements.txt
```

---

## API Reference

All routes are mounted at `/api`. E.g. `POST /api/auth/login`.

### Authentication (`/api/auth`)

```
POST /api/auth/register            Register new user
POST /api/auth/login               Login with email + password
POST /api/auth/verify-otp          Verify email OTP (signup / magic link)
POST /api/auth/resend-otp          Resend signup OTP
POST /api/auth/forgot-password     Send password reset email
POST /api/auth/reset-password      Set new password via recovery token
POST /api/auth/google              Google ID token → Supabase session
GET  /api/auth/me                  Get current user profile
PUT  /api/auth/profile             Update profile (name, phone, currency…)
PUT  /api/auth/change-password     Change password (requires current password)
POST /api/auth/onboarding-complete Mark onboarding done
DELETE /api/auth/account           Delete account (cascades all data)
POST /api/auth/toggle-pro          Toggle pro status (dev/testing)
```

All protected routes require:
```
Authorization: Bearer <supabase_access_token>
```

### Transactions (`/api/transactions`)
```
GET    /api/transactions           List transactions (filterable by date/type)
POST   /api/transactions           Create transaction
PUT    /api/transactions/{id}      Update transaction
DELETE /api/transactions/{id}      Delete transaction
DELETE /api/transactions/bulk      Bulk delete
```

### EMIs (`/api/emis`)
```
GET    /api/emis                   List EMIs
POST   /api/emis                   Create EMI
PUT    /api/emis/{id}              Update EMI
DELETE /api/emis/{id}              Delete EMI
POST   /api/emis/{id}/payment      Record payment
POST   /api/emis/{id}/foreclose    Foreclose EMI
GET    /api/emis/recommendations   Prepayment recommendations
```

### Savings Goals (`/api/savings-goals`)
```
GET    /api/savings-goals          List goals
POST   /api/savings-goals          Create goal
PUT    /api/savings-goals/{id}     Update goal
DELETE /api/savings-goals/{id}     Delete goal
POST   /api/savings-goals/{id}/contribute  Add contribution
GET    /api/savings-goals-summary  Smart summary + alerts
```

### Investments (`/api/investments`)
```
GET    /api/investments            List investments
POST   /api/investments            Add investment
PUT    /api/investments/{id}       Update investment
DELETE /api/investments/{id}       Delete investment
GET    /api/investments/summary    Portfolio summary
```

### Chanakya AI Chatbot (`/api/chatbot`)
```
POST   /api/chatbot                Standard JSON response
POST   /api/chatbot/stream         SSE word-by-word streaming (22ms/word)
GET    /api/chanakya/suggestions   Proactive spending suggestions
```

**Supported chat actions** (extracted by Claude from message):
`add_income`, `add_expense`, `add_emi`, `emi_payment`, `add_goal`,
`contribute_goal`, `add_investment`, `add_hand_loan`, `add_transaction`

### Financial Score (`/api/financial-score`)
```
GET    /api/financial-score               Current score + breakdown
GET    /api/financial-score/history       6-month trend (default)
```

Response includes: score (0–100), status (red/yellow/green), expense_ratio, emi_ratio, savings_ratio, recommendations.

### Categories & Summaries
```
GET    /api/categories             Budget categories
POST   /api/categories             Create category
PUT    /api/categories/{id}        Update category
DELETE /api/categories/{id}        Delete category
GET    /api/budget-summary         Total income / expenses / remaining
GET    /api/net-worth              Net worth calculation
GET    /api/spending-breakdown     Category-wise breakdown
```

### FIRE Goal (`/api/fire-goal`)
```
GET    /api/fire-goal              Get FIRE goal (one per user)
POST   /api/fire-goal              Create/update FIRE goal (upsert)
DELETE /api/fire-goal              Delete FIRE goal
```

### Other Endpoints

| Router | Prefix | Notable endpoints |
|--------|--------|-------------------|
| Hand Loans | `/api/hand-loans` | CRUD + `/summary` |
| Subscriptions | `/api/subscriptions` | CRUD |
| Gold/Silver | `/api/gold`, `/api/silver` | Holdings + live price lookup |
| Expense Groups | `/api/expense-groups` | Group splitting + settle |
| Calendar | `/api/calendar` | Events + people events |
| Paychecks | `/api/paychecks` | Paycheck history |
| Jobs | `/api/jobs` | Career timeline |
| Luxury Items | `/api/luxury-items` | CRUD |
| Children | `/api/children` | Children expenses |
| Gifts | `/api/gifts` | Gift planning |
| Life Timeline | `/api/timeline` | Life events |
| Nominees | `/api/nominees` | Nominee management |
| Piggy Bank | `/api/piggy-bank` | Savings jars |
| Market | `/api/market` | Stock/MF price lookup |
| SMS Parser | `/api/sms` | Parse SMS transactions |
| Income Entries | `/api/income-entries` | Income records |
| Recurring | `/api/recurring-expenses` | Recurring expenses |
| Credit Cards | `/api/credit-cards` | CC + CC expenses |
| Trips | `/api/trips` | Trip planner |
| Notifications | `/api/notifications` | Push prefs + tokens |
| Circle | `/api/circle` | Shared expense circles |
| Feedback | `/api/feedback` | User feedback |
| Admin | `/api/admin` | Admin tools |
| Reset | `/api/reset` | Clear user data |

---

## Important URL Notes

> These are common sources of bugs — don't rename them.

- Goals prefix is `/savings-goals` — not `/goals`
- `GET /api/savings-goals-summary` lives in `categories.py` (no router prefix)
- `GET /api/net-worth` lives in `categories.py`
- `GET /api/spending-breakdown` lives in `categories.py`
- `GET /api/chanakya/suggestions` lives in `categories.py`
- Chatbot prefix is `/chatbot` → full path `/api/chatbot`
- Financial score history: `GET /api/financial-score/history?months=6`
- FIRE goal is one per user, POST does upsert

---

## Database Architecture

### Two Supabase Clients

`database.py` maintains two separate singleton clients:

```python
get_supabase()    # Auth-only client — use ONLY for supabase.auth.* calls
get_admin_db()    # DB client — use for ALL .table() operations
```

**Why two clients?** `supabase-py` mutates the client's internal session after `sign_up()` / `sign_in_with_password()`. If the same client is used for both auth and table operations, its service-role authorization header gets replaced by the user JWT, causing all subsequent DB queries to fail with RLS errors.

**Rule:** Never call `.table()` on `get_supabase()`. Never call `supabase.auth.*` on `get_admin_db()`.

### Authentication Flow

1. Client calls `POST /api/auth/login` with email + password
2. Backend calls `supabase.auth.sign_in_with_password()` on the auth client
3. Supabase returns a JWT (ES256, signed with ECDSA key)
4. Backend returns `{ access_token, refresh_token, user: <profile row> }`
5. Client stores token and sends it as `Authorization: Bearer <token>` on all subsequent requests
6. `get_current_user` dependency: decodes JWT locally (tries HS256 then ES256 via JWKS), looks up profile in `profiles` table using admin client

---

## Local Development

### Prerequisites
- Python 3.11+
- A Supabase project (free tier is fine)

### Setup

```bash
cd BudgetMantra-Supabase/backend

python -m venv venv
source venv/bin/activate       # Linux/Mac
# or: venv\Scripts\activate    # Windows

pip install -r requirements.txt
```

### Environment Variables

Create a `.env` file:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# From Supabase → Settings → API → JWT Secret
JWT_SECRET=your-jwt-secret

# From Anthropic console
ANTHROPIC_API_KEY=sk-ant-...

# Optional
GOOGLE_CLIENT_ID=
CORS_ORIGINS=http://localhost:3000,http://localhost:8081
APP_URL=http://localhost:3000
```

### Run

```bash
uvicorn app.main:app --reload --port 8001
```

API docs at:
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

---

## Adding a New Endpoint

1. Create or edit the router in `app/routers/`

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.auth import get_current_user
from app.database import get_admin_db
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/xxx", tags=["xxx"])

class XxxCreate(BaseModel):
    name: str
    amount: float

@router.get("")
async def list_xxx(current_user: dict = Depends(get_current_user)):
    res = get_admin_db().table("xxx").select("*").eq("user_id", current_user["id"]).execute()
    return res.data or []

@router.post("", status_code=201)
async def create_xxx(body: XxxCreate, current_user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **body.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = get_admin_db().table("xxx").insert(doc).execute()
    return res.data[0]
```

2. Register in `app/main.py`:
```python
from app.routers import xxx
app.include_router(xxx.router, prefix="/api")
```

3. Add a chat action in `app/routers/chat.py` so Chanakya can use it.

---

## Adding a Chat Action

1. Add the action name + description to the Claude system prompt in `chat.py`
2. Add a handler:

```python
elif act == "your_action":
    amount = float(data.get("amount", 0))
    get_admin_db().table("xxx").insert({...}).execute()
    reply += f"\n\n✅ Done! {summary}"
```

---

## Deployment (Railway)

The backend auto-deploys from the `main` branch of the GitHub repo.

**Environment variables** must be set in the Railway dashboard (same keys as `.env`).

**Important:** The `postgrest` package is **not** pinned in `requirements.txt` — it is managed as a dependency of `supabase`. Do not add an explicit `postgrest` pin; doing so will install an incompatible older version and break all DB operations.

---

## Key Conventions

| Convention | Detail |
|-----------|--------|
| User ID field | `current_user["id"]` (UUID string) — not `_id` |
| Pydantic v2 | Use `body.model_dump()` — not `body.dict()` |
| Timestamps | `datetime.now(timezone.utc).isoformat()` |
| DB client | Always `get_admin_db()` for `.table()` calls |
| Auth client | Always `get_supabase()` for `supabase.auth.*` calls |
| Error format | Raise `HTTPException(status_code, detail=str)` |
| New IDs | `str(uuid.uuid4())` |
