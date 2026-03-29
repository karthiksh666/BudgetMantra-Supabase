# Budget Mantra — Developer Guide for Claude

This file helps Claude Code (and human devs) understand the codebase conventions so new features can be built consistently.

## Project Layout

```
BudgetMantra-main/          ← this repo (web + backend)
  backend/server.py         ← entire FastAPI backend (one file)
  frontend/src/
    pages/                  ← one file per page/feature
    components/
      Navigation.js         ← sidebar + More drawer (web)
      PageLoader.js         ← loading spinner with cycling tips
    hooks/
      useStaleData.js       ← stale-while-revalidate cache hook
    context/AuthContext.js  ← JWT auth + user state

BudgetMantra-Mobile/        ← separate repo (React Native)
  src/
    screens/                ← one file per screen
    hooks/useStaleData.ts   ← AsyncStorage + useFocusEffect TTL
    components/ScreenHeader.tsx
    constants/theme.ts      ← COLORS, RADIUS
    navigation/index.tsx    ← tab + stack navigator
```

## Core Principle: Chat-First

Every feature should be accessible via the Chanakya AI chat at `/chat` (web) or ChatbotScreen (mobile). When adding a new data feature, always add a corresponding chat action in `backend/server.py`.

---

## Web Patterns

### Adding a New Page

1. Create `frontend/src/pages/XxxManager.js`
2. Always use `useStaleData` — never raw `useEffect + useState` for data:

```js
import { useState, useCallback } from "react";
import { useStaleData } from "@/hooks/useStaleData";
import PageLoader from "@/components/PageLoader";

const fetchXxx = useCallback(async () => {
  const res = await axios.get(`${API}/xxx`);
  return res.data || [];
}, [token]); // include token if using auth headers

const { data: items, loading, reload: fetchData } = useStaleData(
  "bm_xxx_cache",           // unique localStorage key
  fetchXxx,
  { errorMsg: "Failed to load XXX", fallback: [] }
);
```

3. Cache key naming: `bm_{feature}_cache`
4. After every mutation (create/update/delete), call `fetchData()` (the `reload` from useStaleData)
5. Loading state uses `PageLoader` component:
```jsx
if (loading) return (
  <>
    <Navigation />
    <div className="min-h-[calc(100vh-80px)] bm-page-bg-xxx flex items-center justify-center">
      <PageLoader message="Loading..." tips={["tip 1", "tip 2", "tip 3"]} />
    </div>
  </>
);
```

### Select / Bulk Delete Pattern (web)

Every list page should have a Select button that toggles bulk delete mode:

```jsx
// State
const [selectMode, setSelectMode] = useState(false);
const [selected,   setSelected]   = useState(new Set());

// Button (in header)
<Button
  variant="outline" size="sm"
  onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
>
  {selectMode ? 'Cancel' : 'Select'}   // ALWAYS "Select", never "Delete"
</Button>

// Bottom bar when items selected
{selectMode && selected.size > 0 && (
  <div className="fixed bottom-20 lg:bottom-6 left-0 right-0 lg:left-64 z-50 flex justify-center px-4">
    <div className="bg-stone-900 text-white rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
      <span className="text-sm font-semibold">{selected.size} selected</span>
      <button onClick={handleMultiDelete} className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-xl">Delete</button>
      <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="text-stone-400 hover:text-white text-sm">Cancel</button>
    </div>
  </div>
)}
```

### Navigation / More Drawer (web)

To add a new page to the web nav, edit `frontend/src/components/Navigation.js`:
- Find `MORE_GROUPS` array
- Add item with `{ label, icon, path, bg, iconBg, iconColor }` to the right group

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
  backgroundColor: COLORS.primary,           // or feature color
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

const deleteSelected = () => {
  Alert.alert('Delete', `Delete ${selected.size} item(s)?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      await Promise.all([...selected].map(id => axios.delete(`${API}/xxx/${id}`, { headers })));
      setSelected(new Set()); setSelectMode(false); fetchData();
    }},
  ]);
};

// Header button (Select / Cancel)
{items.length > 0 && (
  <TouchableOpacity
    style={[s.selectBtn, selectMode && s.selectBtnActive]}
    onPress={() => { setSelectMode(m => !m); setSelected(new Set()); }}
  >
    <Text style={[s.selectBtnTxt, selectMode && s.selectBtnTxtActive]}>
      {selectMode ? 'Cancel' : 'Select'}
    </Text>
  </TouchableOpacity>
)}

// Bulk delete bar (above FAB)
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
- Add item to the right group: `{ icon: 'icon-outline', label: 'Label', screen: 'ScreenName', bg: '#xxx', iconColor: '#xxx' }`
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

## Backend Patterns (`backend/server.py`)

### Adding a New Endpoint

All endpoints follow this pattern:
```python
@app.get("/xxx")
async def get_xxx(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    items = await db.xxx.find({"user_id": user_id}).to_list(500)
    for item in items:
        item["_id"] = str(item["_id"])
    return items

@app.post("/xxx")
async def create_xxx(input: XxxInput, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    doc = { "id": str(uuid.uuid4()), "user_id": user_id, **input.dict(), ... }
    await db.xxx.insert_one(doc)
    invalidate_user_cache(user_id)  # always call this after mutations
    return doc
```

Always call `invalidate_user_cache(user_id)` after any mutation.

### Adding a Chat Action

1. Add the action description to the Claude system prompt in the `/chat` endpoint
2. Add an `elif act == "action_name":` handler after the existing handlers
3. Embed relevant context (e.g. active EMIs, goals) in the system prompt so Claude knows IDs

```python
elif act == "your_action":
    # extract data from the `data` dict (JSON from Claude)
    # perform DB operation
    invalidate_user_cache(user_id)
    reply += f"\n\n✅ Done! {summary_message}"
```

### Current Chat Actions
`add_income`, `add_expense`, `add_emi`, `emi_payment`, `add_goal`, `contribute_goal`, `add_investment`, `add_hand_loan`, `add_transaction`

---

## Theme / Colors

### Web (Tailwind)
- Primary: `orange-500` (#f97316)
- Page backgrounds: `bm-page-bg-{color}` class (defined in index.css)
- Cards: `bg-white rounded-2xl border border-stone-100 shadow-sm`
- Gradients: `bg-gradient-to-r from-orange-500 to-orange-600`

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

## Common Mistakes to Avoid

1. **Don't use `useEffect` for data fetching** — use `useStaleData` instead
2. **Don't call `invalidate_user_cache` in GET endpoints** — only on mutations
3. **Don't add `useFocusEffect` in mobile screens** — `useStaleData` handles it
4. **Select button label must be "Select" not "Delete"** when not in select mode
5. **Don't forget to add items to Navigation.js AND MoreScreen.tsx** when adding a new page
6. **Mobile amounts can overflow** — always use `adjustsFontSizeToFit` + `numberOfLines={1}` + `minimumFontScale={0.7}` for currency values in cards
