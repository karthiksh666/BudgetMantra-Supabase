# Budget Mantra — Developer Guide for Claude

This file helps Claude Code (and human devs) understand the codebase conventions so new features can be built consistently.

## Project Layout

```
BudgetMantra-Supabase/       ← Supabase backend (the primary backend going forward)
  backend/
    app/
      main.py                ← FastAPI app entry point — registers all routers
      auth.py                ← JWT verification (Supabase JWT)
      database.py            ← Supabase client singleton
      config.py              ← Settings (env vars)
      routers/               ← One file per feature domain
        auth.py              ← Register, login, Google OAuth, profile
        transactions.py      ← Income/expense transactions
        emis.py              ← EMI tracking + payments + foreclose
        goals.py             ← Savings goals (prefix: /savings-goals)
        investments.py       ← Investment portfolio + summary
        chat.py              ← Chanakya AI chatbot + streaming
        hand_loans.py        ← Hand loans (given/taken) + summary
        subscriptions.py     ← Subscriptions
        categories.py        ← Categories, budget-summary, net-worth, spending-breakdown
        gold_silver.py       ← Gold/silver holdings + summaries
        expense_groups.py    ← Group expense splitting
        calendar.py          ← Calendar events + people events
        paychecks.py         ← Paycheck history
        jobs.py              ← Job/career timeline
        luxury_items.py      ← Luxury items tracker
        children.py          ← Children expense tracking
        gifts.py             ← Gift planning
        timeline.py          ← Life events timeline
        nominees.py          ← Nominee management
        piggy_bank.py        ← Piggy bank / savings jars
        market.py            ← Stock/MF price lookups
        sms.py               ← SMS transaction parser
        financial_score.py   ← Financial health score + /history trend (last 6 months)
        fire_goal.py         ← FIRE goal (GET/POST/DELETE /fire-goal)
        income_entries.py    ← Income entries
        recurring_expenses.py← Recurring expenses
        credit_cards.py      ← Credit cards + expenses
        trips.py             ← Trip planner
        notifications.py     ← Push notification prefs + tokens
        circle.py            ← Shared expense circles (friends/family)
        reset.py             ← Data reset endpoints
        feedback.py          ← User feedback
        admin.py             ← Admin tools

BudgetMantra-Mobile/         ← React Native app (separate repo)
  src/
    screens/                 ← one file per screen
    hooks/useStaleData.ts    ← AsyncStorage + useFocusEffect TTL
    components/ScreenHeader.tsx
    constants/
      theme.ts               ← COLORS, RADIUS
      api.ts                 ← ACTIVE_BACKEND switch ('mongo'|'supabase'|'local')
    navigation/index.tsx     ← tab + stack navigator

BudgetMantra-main/           ← Legacy MongoDB backend (production, being phased out)
  backend/server.py          ← Monolithic FastAPI backend
```

## Backend Switch (Mobile)

`BudgetMantra-Mobile/src/constants/api.ts` controls which backend the mobile app uses:

```typescript
const ACTIVE_BACKEND: 'mongo' | 'supabase' | 'local' = 'supabase';
//   'mongo'    → production MongoDB at budgetmantra-production.up.railway.app
//   'supabase' → production Supabase at budgetmantra-supabase-production.up.railway.app
//   'local'    → Supabase running locally at http://{LOCAL_IP}:8001
```

## Core Principle: Chat-First

Every feature should be accessible via the Chanakya AI chat at `/chat` (web) or ChatbotScreen (mobile). When adding a new data feature, always add a corresponding chat action in `backend/app/routers/chat.py`.

---

## Backend Patterns (Supabase)

### Adding a New Endpoint

1. Create or edit the relevant router in `backend/app/routers/`
2. All routers use this pattern:

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.auth import get_current_user
from app.database import get_supabase
import uuid
from datetime import datetime

router = APIRouter(prefix="/xxx", tags=["xxx"])

@router.get("")
async def list_xxx(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("xxx").select("*").eq("user_id", current_user["id"]).execute()
    return res.data or []

@router.post("", status_code=201)
async def create_xxx(body: XxxCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    doc = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **body.model_dump(),
           "created_at": datetime.utcnow().isoformat()}
    res = supabase.table("xxx").insert(doc).execute()
    return res.data[0]
```

3. Register the router in `backend/app/main.py`:
   - Import at the top: `from app.routers import ..., xxx`
   - Add: `app.include_router(xxx.router, prefix=PREFIX)`

### Key Differences from MongoDB Backend

| MongoDB (`server.py`)                     | Supabase (`app/routers/`)                  |
|-------------------------------------------|--------------------------------------------|
| Single 9000-line file                     | One file per feature domain                |
| `await db.collection.find(...)` (Motor)   | `supabase.table(...).select(...).execute()` |
| `invalidate_user_cache(user_id)`          | No cache layer needed (Supabase is fast)   |
| `current_user["_id"]` (ObjectId)          | `current_user["id"]` (UUID string)         |
| `input.dict()`                            | `body.model_dump()`                        |

### Important URL Notes

- **Goals**: router prefix is `/savings-goals` (NOT `/goals`) to match mobile expectations
- **Savings goals summary**: served at `/api/savings-goals-summary` from `categories.py` (no prefix router)
- **Net worth**: served at `/api/net-worth` from `categories.py`
- **Spending breakdown**: served at `/api/spending-breakdown` from `categories.py`
- **Chanakya suggestions**: served at `/api/chanakya/suggestions` from `categories.py`
- **Chatbot**: prefix is `/chatbot` — full route is `/api/chatbot`
- **Financial score history**: `GET /api/financial-score/history?months=6`
- **FIRE goal**: `GET|POST|DELETE /api/fire-goal` (one per user, upsert on POST)
- **Notifications**: no router prefix — routes are `/api/notifications/prefs`, etc.

### Adding a Chat Action

1. Edit `backend/app/routers/chat.py`
2. Add the action to the Claude system prompt string
3. Add an `elif act == "action_name":` handler after existing handlers:

```python
elif act == "your_action":
    # extract from data dict
    supabase.table("xxx").insert({...}).execute()
    reply += f"\n\n✅ Done! {summary}"
```

### Current Chat Actions
`add_income`, `add_expense`, `add_emi`, `emi_payment`, `add_goal`, `contribute_goal`, `add_investment`, `add_hand_loan`, `add_transaction`

### Streaming Chat

The chatbot has two endpoints:
- `POST /api/chatbot` — standard JSON response
- `POST /api/chatbot/stream` — SSE streaming (word-by-word at 22ms/word)

The stream endpoint calls `_chat_core()` then streams words via `StreamingResponse`.

---

## Mobile Patterns

### Adding a New Screen

1. Create `src/screens/XxxScreen.tsx`
2. Always use `useStaleData` from `../hooks/useStaleData`:

```ts
import { useStaleData } from '../hooks/useStaleData';

const fetchXxx = useCallback(async () => {
  const res = await axios.get(`${API}/xxx`, { headers });
  return res.data || [];
}, [token]);

const { data: items, loading, refreshing, reload: fetchData } = useStaleData(
  'bm_xxx',   // AsyncStorage key
  fetchXxx,
  [],          // fallback
);
```

3. **Never add `useFocusEffect` yourself** — `useStaleData` handles it internally with a 15s TTL.
4. Cache key naming: `bm_{feature}` (no `_cache` suffix on mobile)

### Cycling Tips Loader (mobile — required for every screen)

```tsx
const LOADER_TIPS = [
  'Loading your data…',
  'Crunching the numbers…',
  'Almost there…',
];

function XxxLoader() {
  const [tip, setTip] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTip(t => (t + 1) % LOADER_TIPS.length), 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={{ fontSize: 13, color: '#a8a29e', textAlign: 'center', lineHeight: 20 }}>
        {LOADER_TIPS[tip]}
      </Text>
    </View>
  );
}
```

### FAB (mobile — for screens with add action)

```tsx
// After ScrollView, before closing SafeAreaView
<TouchableOpacity style={s.fab} onPress={() => setAddOpen(true)} activeOpacity={0.85}>
  <Ionicons name="add" size={26} color="#fff" />
</TouchableOpacity>

// Style
fab: {
  position: 'absolute', bottom: 28, right: 20,
  width: 56, height: 56, borderRadius: 28,
  backgroundColor: COLORS.primary,
  alignItems: 'center', justifyContent: 'center',
  shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
},
```

### Select Mode + Bulk Delete (mobile)

```tsx
const [selectMode, setSelectMode] = useState(false);
const [selected,   setSelected]   = useState<Set<string>>(new Set());

const toggleSelect = (id: string) => {
  setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
};

// Header button
{items.length > 0 && (
  <TouchableOpacity onPress={() => { setSelectMode(m => !m); setSelected(new Set()); }}>
    <Text>{selectMode ? 'Cancel' : 'Select'}</Text>
  </TouchableOpacity>
)}

// Bulk delete bar
{selectMode && selected.size > 0 && (
  <View style={s.bulkBar}>
    <Text style={s.bulkTxt}>{selected.size} selected</Text>
    <TouchableOpacity style={s.bulkDelBtn} onPress={deleteSelected}>
      <Ionicons name="trash-outline" size={15} color="#fff" />
      <Text style={s.bulkDelTxt}>Delete</Text>
    </TouchableOpacity>
  </View>
)}
```

### More Screen (mobile)

To add a new screen to the More tab, edit `src/screens/MoreScreen.tsx`:
- Find `MENU_GROUPS` array
- Add item: `{ icon: 'icon-outline', label: 'Label', screen: 'ScreenName', bg: '#xxx', iconColor: '#xxx' }`
- Register the screen in `src/navigation/index.tsx`

### Navigation from More Tab

Screens opened from the More tab are on a modal stack — always include a back button:

```tsx
export default function XxxScreen({ navigation }: { navigation: any }) {
  // In header:
  <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
    <Ionicons name="chevron-back" size={20} color="#1c1917" />
  </TouchableOpacity>
```

---

## Theme / Colors

### Mobile
```ts
COLORS.primary   = '#f97316'  // orange
COLORS.success   = '#10b981'  // emerald
COLORS.danger    = '#ef4444'  // red
COLORS.warning   = '#f59e0b'  // amber
COLORS.textMuted = '#a8a29e'  // stone-400
COLORS.bg        = '#fafaf9'  // warm white
```

---

## Running Locally

```bash
# Start Supabase backend
cd BudgetMantra-Supabase/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8001

# Switch mobile to local
# In BudgetMantra-Mobile/src/constants/api.ts:
const ACTIVE_BACKEND = 'local';
const LOCAL_IP = '<your Mac IP>';   # run: ipconfig getifaddr en0
```

---

## Common Mistakes to Avoid

1. **Don't use `useEffect` for data fetching** — use `useStaleData` instead
2. **Don't add `useFocusEffect` in mobile screens** — `useStaleData` handles it
3. **Select button label must be "Select" not "Delete"** when not in select mode
4. **Don't forget to register new routers in `main.py`**
5. **Goals router prefix is `/savings-goals`** — do not change it back to `/goals`
6. **`/savings-goals-summary` and `/net-worth` live in `categories.py`** — they are top-level routes with no router prefix
7. **Mobile amounts can overflow** — always use `adjustsFontSizeToFit` + `numberOfLines={1}` + `minimumFontScale={0.7}` for currency values in cards
8. **Use `body.model_dump()` not `body.dict()`** — Pydantic v2 (used in Supabase backend)
9. **User ID is `current_user["id"]`** (UUID string) — not `current_user["_id"]` like MongoDB
