# Budget Mantra — Developer Guide

Budget Mantra is a full-stack personal finance app built for the Indian market. It combines a React web app, a React Native/Expo mobile app, a FastAPI backend, MongoDB Atlas for storage, and Anthropic Claude as the AI engine powering the Chanakya chat advisor.

**Live app:** https://budgetmantra.in
**Backend API:** https://budgetmantra-production.up.railway.app
**Admin portal:** `admin/index.html` — open locally or deploy standalone (zero JS dependencies)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python 3.11), Motor (async MongoDB), APScheduler, slowapi |
| Database | MongoDB Atlas (Motor async driver) |
| AI | Anthropic Claude API (`claude-3-5-haiku`, `claude-3-5-sonnet`) |
| Frontend | React 19, React Router v7, Tailwind CSS, shadcn/ui |
| Auth | JWT (7-day TTL), Google OAuth (`@react-oauth/google`), Firebase Phone Auth |
| Deployment | Nixpacks (Railway for backend, Vercel for frontend) |
| Mobile | React Native + Expo, TypeScript (separate repo: `BudgetMantra-Mobile`) |
| Notifications | Twilio WhatsApp Sandbox, APScheduler daily jobs |
| Commodity prices | yfinance (`GOLD.MCX`, `SILVER.MCX`) with gold-api.com fallback |

---

## Project Structure

```
BudgetMantra-main/               ← this repo (web + backend)
├── admin/
│   └── index.html               # Standalone admin portal (pure HTML/JS)
├── backend/
│   ├── server.py                # Entire FastAPI backend (~7 000+ lines, one file)
│   ├── requirements.txt
│   └── .env                     # Local env vars (gitignored)
├── frontend/
│   └── src/
│       ├── App.js               # Routes, GoogleOAuthProvider, inactivity guard
│       ├── context/
│       │   ├── AuthContext.js   # JWT auth, axios interceptor, global 402 handler
│       │   ├── ThemeContext.js  # Auto dark/light mode (06:00–18:59 light)
│       │   └── PrivacyContext.js
│       ├── components/
│       │   ├── Navigation.js    # Bottom nav + grouped More drawer
│       │   ├── ChanakyaWidget.js # Floating AI chat panel (Pro/Free gated)
│       │   └── PageLoader.js    # Cycling-tips loading spinner
│       └── pages/               # One file per feature page
├── test_api.py                  # Integration test suite
└── nixpacks.toml                # Deployment config (Python 3.11, uvicorn start cmd)

BudgetMantra-Mobile/             ← separate repo (React Native)
└── src/
    ├── screens/                 # One file per screen
    ├── hooks/useStaleData.ts    # AsyncStorage + useFocusEffect TTL cache
    ├── components/              # ScreenHeader, StatCard
    ├── constants/theme.ts       # COLORS, RADIUS
    └── navigation/index.tsx    # Tab + stack navigator
```

---

## Local Setup

### Prerequisites

- Python 3.11
- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB)
- Anthropic API key

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

Create `backend/.env`:

```env
MONGO_URL="mongodb+srv://<user>:<pass>@cluster0.xxx.mongodb.net/?appName=Cluster0"
DB_NAME="budget_mantra"
JWT_SECRET_KEY="your-secret-key"
CORS_ORIGINS="http://localhost:3000"
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
FIREBASE_PROJECT_ID="your-firebase-project"
MONGO_TLS_ALLOW_INVALID=true    # macOS only — fixes SSL cert verification
TWILIO_ACCOUNT_SID="ACxxx"
TWILIO_AUTH_TOKEN="xxx"
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
REACT_APP_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

```bash
npm start
```

The app runs at `http://localhost:3000` and proxies `/api/*` to the backend.

### Required Environment Variables (summary)

| Variable | Where | Description |
|---|---|---|
| `MONGO_URL` | backend | MongoDB Atlas connection string |
| `DB_NAME` | backend | Database name (`budget_mantra`) |
| `JWT_SECRET_KEY` | backend | Secret for signing JWTs |
| `ANTHROPIC_API_KEY` | backend | Anthropic API key for Chanakya AI |
| `GOOGLE_CLIENT_ID` | backend + frontend | Google OAuth client ID |
| `FIREBASE_PROJECT_ID` | backend | Firebase project for phone OTP auth |
| `CORS_ORIGINS` | backend | Allowed origins (`*` for dev) |
| `MONGO_TLS_ALLOW_INVALID` | backend | `true` on macOS to bypass TLS cert error |
| `TWILIO_ACCOUNT_SID` | backend | Twilio SID for WhatsApp outbound |
| `TWILIO_AUTH_TOKEN` | backend | Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | backend | Twilio sandbox number |
| `REACT_APP_BACKEND_URL` | frontend | Backend URL (empty = use Vercel `/api` proxy) |
| `REACT_APP_GOOGLE_CLIENT_ID` | frontend | Google OAuth client ID |

---

## API Testing

Run the integration test suite against the local server:

```bash
python test_api.py
```

Run against a production URL:

```bash
python test_api.py --url https://budgetmantra-production.up.railway.app
```

Keep test data after the run (skip cleanup):

```bash
python test_api.py --url https://your.app --keep
```

---

## Deployment

### Backend (Railway via Nixpacks)

Nixpacks auto-detects Python from `requirements.txt`. The `nixpacks.toml` at the repo root pins Python 3.11 and sets the start command:

```toml
[variables]
NIXPACKS_PYTHON_VERSION = "3.11"

[start]
cmd = "cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT --log-level info"
```

Set all `.env` variables in the Railway dashboard. Auto-deploys on push to `main`.

### Frontend (Vercel)

- Framework preset: **Create React App**
- Build command: `npm run build`, output directory: `build/`
- `vercel.json` handles SPA routing and proxies `/api/*` to Railway (bypasses ISPs that block Railway's Singapore servers)
- Auto-deploys on push to `main`

Health check endpoint (public, no auth): `GET /health`

---

## Key Features

### Free tier
- **Chanakya AI** — chat-first financial advisor; log transactions, EMIs, goals, and import bank SMS by typing naturally. Floating widget on every page.
- **Dashboard** — monthly income vs expense, category breakdowns, financial health score, spending streaks
- **Income Tracker** — log and categorize all income sources
- **Expense Budgeting** — set monthly category budgets, watch spending in real-time
- **EMI Manager** — all loans in one place; due dates, repayment progress, early foreclosure calculator
- **Savings Goals** — set targets, track contributions, monitor progress
- **Financial Calendar** — upcoming EMIs, goals, salaries, and personal events; birthdays/anniversaries recur yearly
- **FIRE Calculator** — retire-date solver using the 4% rule (3 variants)
- **Statement Hub** — upload PhonePe/GPay/bank PDFs; auto-parses transactions with category inference
- **Data Management** — Excel export, duplicate finder, demo data loader
- **Dark Mode** — auto switches at 19:00/06:00; manual toggle available

### Pro tier
- **Investment Tracker** — mutual funds, stocks, FDs, PPF; total invested vs current value, P&L by type
- **Credit Cards** — spending, limits, billing cycles, outstanding amounts
- **Hand Loans** — track money lent or borrowed; net position, overdue amounts, settlement history
- **Trip Planner** — AI-generated day-by-day itinerary; trip expenses + group splits in one view
- **Group Spend** — split bills with friends, settle balances (Splitwise-style)
- **Family Circle** — real-time collaborative family expense tracker via WebSocket
- **Gold & Silver Tracker** — live MCX prices, 40+ Indian city premiums; physical/SGB/ETF/digital

To test Pro locally: hit any free-tier limit → Upgrade modal → **Simulate Pro (test)**, or use `POST /api/auth/toggle-pro`.

---

## Mobile App

The mobile app lives in the separate `BudgetMantra-Mobile` repository. It is built with React Native and Expo (TypeScript).

### Dev

```bash
cd BudgetMantra-Mobile
npm install
npx expo start --clear
```

Scan the QR code with Expo Go on Android/iOS, or press `a` / `i` for emulator.

### Running on Android Studio (emulator)

1. **Install Android Studio** — download from [developer.android.com/studio](https://developer.android.com/studio)

2. **Create a Virtual Device (AVD)**
   - Open Android Studio → More Actions → Virtual Device Manager
   - Click **Create Device** → pick "Medium Phone" (API 34+) → Finish
   - Hit the ▶ play button to boot the emulator

3. **Set ANDROID_HOME** (add to `~/.zshrc` or `~/.bashrc`):
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk          # macOS
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
   Then `source ~/.zshrc` and confirm with `adb devices` — you should see the emulator listed.

4. **Run the app**
   ```bash
   cd BudgetMantra-Mobile
   npm install
   npx expo start --clear
   # press 'a' in the terminal to open on the Android emulator
   ```
   Or use the direct command:
   ```bash
   npm run android
   ```

5. **Troubleshooting**
   - `adb: command not found` → ANDROID_HOME not set correctly (step 3)
   - Emulator slow → allocate more RAM in AVD settings (2 GB minimum)
   - Metro bundler cache issues → `npx expo start --clear` clears it
   - App crashes on launch → check Metro terminal for the JS error, not the device log

### Production build

```bash
eas build --platform android   # APK / AAB
eas build --platform ios       # IPA
```

### Mobile conventions

- Every screen uses `useStaleData` from `src/hooks/useStaleData.ts` — never raw `useEffect + useState` for data fetching
- Cache key naming: `bm_{feature}` (AsyncStorage)
- `useStaleData` internally runs `useFocusEffect` with a 15-second TTL — do not add your own `useFocusEffect`
- Cycling-tips `ActivityIndicator` loader required on every screen (1800 ms tip rotation)
- FAB (`+` button) for screens with an add action
- Select/Cancel header button for bulk delete mode

---

## Architecture Notes

### Chat-first principle

Every feature must be accessible through the Chanakya AI chat at `/chatbot` (web) or `ChatbotScreen` (mobile). When adding a new data feature, add a corresponding `elif act == "action_name":` handler in the `/api/chatbot` endpoint in `backend/server.py`.

Current chat actions: `add_income`, `add_expense`, `add_emi`, `emi_payment`, `add_goal`, `contribute_goal`, `add_investment`, `add_hand_loan`, `add_transaction`, `add_calendar_event`, `create_circle`, `join_circle`, `add_circle_expense`, `add_gold`, `add_silver`, `log_credit_card_expense`, `add_recurring_expense`, `add_gift`, `update_profile`, `import_sms`, `add_trip`, `add_trip_expense`, `delete_transaction`, `add_category`, `set_notification_preferences`

### Authentication

- JWT stored in `localStorage`, sent as `Authorization: Bearer <token>`. Expires in 7 days.
- `get_current_user()` fetches fresh user from DB on every request — `is_pro` flag takes effect immediately without re-login.
- Google OAuth via `@react-oauth/google`; backend verifies with `google-auth`.
- Phone auth via Firebase on frontend; backend verifies the Firebase ID token.
- Password reset via email token (stored in DB, 1-hour TTL).
- Single-tab session guard: `localStorage` key `bm_active_tab` enforces one active tab.
- Inactivity auto-logout: warn at 25 min, logout at 30 min; hard logout after 24 h since login.

### In-process caching (TTLCache)

| Cache | TTL | Invalidated on |
|---|---|---|
| `budget_summary_cache` | 5 min | Transaction / category write |
| `financial_score_cache` | 5 min | Any write |
| `emi_recommendations_cache` | 10 min | EMI write |
| `savings_summary_cache` | 5 min | Goal / contribution write |
| `categories_cache` | 2 min | Category write |

`invalidate_user_cache(user_id)` clears all five caches. Call it after every mutation — never in GET endpoints.

### Free/Pro gating

`FREE_LIMITS` dict + `check_limit()` helper raises HTTP 402 with structured detail. The global axios interceptor in `AuthContext.js` catches every 402 and opens the `UpgradeModal`.

```python
FREE_LIMITS = {
    "categories":    5,
    "emis":          3,
    "savings_goals": 1,
    "ai_messages":  20,   # per month
}
```

### Scheduled jobs (APScheduler)

- **08:30 IST daily** — `send_milestone_notifications()`: WhatsApp alerts for salary day, EMIs due within 3 days, savings goal deadlines ≤30 days, 1st-of-month budget summary
- **09:00 IST daily** — `auto_debit_emi_payments()`: auto-records EMI payments for entries with a matching `emi_debit_day`

### CORS and proxy

Backend sets `allow_origins=["*"]` with `allow_credentials=False` (JWT travels in headers, not cookies). Vercel `vercel.json` proxies `/api/*` to Railway.

### Gold and silver prices

Primary source: `yfinance` fetches `GOLD.MCX` (INR/10g) and `SILVER.MCX` (INR/kg). Fallback: `api.gold-api.com` + live USD/INR exchange rate. 22K = 24K × 22/24, 18K = 24K × 18/24. City-specific premiums for 40+ Indian cities. Cached 15 minutes.

---

## Web Development Patterns

### Data fetching — always use `useStaleData`

```js
import { useCallback } from "react";
import { useStaleData } from "@/hooks/useStaleData";

const fetchItems = useCallback(async () => {
  const res = await axios.get(`${API}/xxx`, { headers: { Authorization: `Bearer ${token}` } });
  return res.data || [];
}, [token]);

const { data: items, loading, reload: fetchData } = useStaleData(
  "bm_xxx_cache",   // unique localStorage key, always bm_{feature}_cache
  fetchItems,
  { errorMsg: "Failed to load XXX", fallback: [] }
);
```

After every mutation (create / update / delete) call `fetchData()`.

### Adding a page

1. Create `frontend/src/pages/XxxManager.js`
2. Add a route in `frontend/src/App.js`
3. Add a navigation entry in `frontend/src/components/Navigation.js` → `MORE_GROUPS` array: `{ label, icon, path, bg, iconBg, iconColor }`

### Bulk delete pattern

Use a **Select** button (never label it "Delete" in default state) that toggles select mode. Show a fixed bottom bar with a Delete button only when items are selected. See `CLAUDE.md` for the full code snippet.

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Backend changes go in `backend/server.py`
4. Frontend pages go in `frontend/src/pages/`, components in `frontend/src/components/`
5. Always use `useStaleData` — never raw `useEffect + useState` for data fetching
6. Always call `invalidate_user_cache(user_id)` after backend mutations
7. Test locally with both servers running: `uvicorn server:app --reload` + `npm start`
8. Run `python test_api.py` to verify API behaviour before opening a PR
9. Open a PR against `main`

See `CLAUDE.md` for full coding conventions (patterns, naming, mobile patterns, theme colours).

For questions: mantrabudget@gmail.com
