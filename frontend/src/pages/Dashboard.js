import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { useAuth } from "@/context/AuthContext";
import { useDashboard } from "@/context/DashboardContext";
import { useStaleData } from "@/hooks/useStaleData";
import Navigation from "@/components/Navigation";
import { Link } from "react-router-dom";
import PageLoader from "@/components/PageLoader";
import { Target, ArrowRight, ChevronDown, Wallet, Settings2, Eye, EyeOff, ChevronUp, X, CalendarDays, Flame } from "lucide-react";
import { PrivacyAmount } from "@/context/PrivacyContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => {
  const abs = Math.abs(n || 0);
  const sign = (n || 0) < 0 ? "-" : "";
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000)   return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
};
const fmtFull = (n) => {
  if (!n && n !== 0) return "₹0";
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN")}`;
};
const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};
const monthLabel = () => new Date().toLocaleDateString("en-IN", { month: "long" });

// ── Health level ──────────────────────────────────────────────────────────────
const healthLevel = (s) => {
  if (s >= 70) return { label: "Healthy",          color: "emerald", segs: 5 };
  if (s >= 50) return { label: "On Track",         color: "amber",   segs: 3 };
  return        { label: "Needs Attention",        color: "rose",    segs: 1 };
};

const healthTip = (score, overBudget, emiRatio, savingsRate, topCat) => {
  if (!score) return null;
  if (overBudget) return { why: `You've spent more than your income this month`, fix: "Review your top categories and cut back where possible" };
  if (emiRatio > 40) return { why: "EMIs are consuming a large chunk of your income", fix: "Consider prepaying a loan to reduce your monthly EMI burden" };
  if (savingsRate < 5) return { why: "You're saving less than 5% of your income", fix: "Try to set aside at least 10–20% before spending" };
  if (score < 50 && topCat) return { why: `High spending in ${topCat} is stretching your budget`, fix: "Set a budget limit for this category and track it weekly" };
  if (score < 70) return { why: "Your spending habits have room to improve", fix: "Log expenses daily and review your category budgets" };
  return null;
};

const CAT_COLORS = [
  "#f97316","#10b981","#3b82f6","#8b5cf6","#f43f5e",
  "#eab308","#06b6d4","#ec4899",
];

// ── Calendar event colors ──────────────────────────────────────────────────────
const CAL_COLORS = {
  emi:      { dot: "bg-blue-500",    text: "text-blue-600",    bg: "bg-blue-50"    },
  trip:     { dot: "bg-orange-500",  text: "text-orange-600",  bg: "bg-orange-50"  },
  goal:     { dot: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
  custom:   { dot: "bg-purple-500",  text: "text-purple-600",  bg: "bg-purple-50"  },
  paycheck: { dot: "bg-amber-500",   text: "text-amber-600",   bg: "bg-amber-50"   },
  people:   { dot: "bg-rose-500",    text: "text-rose-600",    bg: "bg-rose-50"    },
};
const relDay = (dateStr) => {
  const d    = new Date(dateStr + "T00:00:00");
  const diff = Math.round((d - new Date(new Date().toDateString())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `in ${diff}d`;
};

// ── Dashboard card config ──────────────────────────────────────────────────────
const ALL_CARDS = [
  { key: "metrics",    label: "EMI / Loans / Portfolio" },
  { key: "health",     label: "Financial Health"        },
  { key: "categories", label: "Category Spends"         },
  { key: "chart",      label: "Monthly Chart"           },
  { key: "goals",      label: "Goals"                   },
  { key: "fire",       label: "FIRE Goal"               },
  { key: "calendar",   label: "Upcoming Events"         },
  { key: "recent",     label: "Recent Transactions"     },
];
const PREF_KEY = "dashboard_card_prefs";
const loadPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || null; } catch { return null; }
};
const savePrefs = (order, visible) =>
  localStorage.setItem(PREF_KEY, JSON.stringify({ order, visible }));

// ── Bar tooltip ───────────────────────────────────────────────────────────────
const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-stone-700 dark:text-stone-200">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
};

// ── XP / Level system ─────────────────────────────────────────────────────────
const XP_LEVELS = [
  { level: 1, name: "Budget Padawan",   minXP: 0    },
  { level: 2, name: "Bachat Warrior",   minXP: 100  },
  { level: 3, name: "Paisa Samajhdar",  minXP: 300  },
  { level: 4, name: "Nivesh Ninja",     minXP: 600  },
  { level: 5, name: "Dhan Shilpi",      minXP: 1000 },
];
const getXPLevel = (xp) => {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= XP_LEVELS[i].minXP) return XP_LEVELS[i];
  }
  return XP_LEVELS[0];
};
const getXPProgress = (xp) => {
  const curr = getXPLevel(xp);
  const nextIdx = XP_LEVELS.findIndex(l => l.level === curr.level) + 1;
  if (nextIdx >= XP_LEVELS.length) return 100;
  const next = XP_LEVELS[nextIdx];
  return Math.round(((xp - curr.minXP) / (next.minXP - curr.minXP)) * 100);
};

// ── Static fallback market signals ────────────────────────────────────────────
const FALLBACK_SIGNALS = [
  { emoji: "📈", text: "Nifty up 0.4% today" },
  { emoji: "🏦", text: "RBI policy unchanged" },
  { emoji: "💰", text: "Gold near all-time high" },
  { emoji: "🛢️", text: "Crude oil steady at $82" },
  { emoji: "📊", text: "FD rates at 7.5%" },
];

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, token } = useAuth();
  const { data, loading, prefetch } = useDashboard();

  // ── XP state ──────────────────────────────────────────────────────────────
  const [userXP] = useState(() => {
    try { return parseInt(localStorage.getItem("bm_web_xp")) || 0; } catch { return 0; }
  });

  // ── Market signals ────────────────────────────────────────────────────────
  const [marketSignals, setMarketSignals] = useState(FALLBACK_SIGNALS);
  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/market/signals`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) setMarketSignals(res.data);
      })
      .catch(() => {});
  }, [token]);

  // ── Upcoming calendar events (next 7 days) ──────────────────────────────
  const todayDate   = new Date();
  const thisMonthStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDate = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1);
  const nextMonthStr  = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const fetchUpcoming = useCallback(async () => {
    const hdrs = { Authorization: `Bearer ${token}` };
    const [r1, r2] = await Promise.allSettled([
      axios.get(`${API}/calendar?month=${thisMonthStr}`, { headers: hdrs }),
      axios.get(`${API}/calendar?month=${nextMonthStr}`, { headers: hdrs }),
    ]);
    const all = [
      ...((r1.status === "fulfilled" ? r1.value.data : []) || []),
      ...((r2.status === "fulfilled" ? r2.value.data : []) || []),
    ];
    const cutoff = new Date(todayDate); cutoff.setDate(cutoff.getDate() + 7);
    const todayStr = todayDate.toISOString().split("T")[0];
    return all
      .filter(e => e.date && e.date >= todayStr && e.date <= cutoff.toISOString().split("T")[0])
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [token, thisMonthStr, nextMonthStr]);

  const { data: upcomingEvents } = useStaleData(
    `bm_dashboard_cal_${thisMonthStr}`,
    fetchUpcoming,
    { fallback: [] },
  );

  // ── FIRE Goal ────────────────────────────────────────────────────────────
  const fetchFireGoal = useCallback(async () => {
    const res = await axios.get(`${API}/fire-goal`, { headers: { Authorization: `Bearer ${token}` } });
    return res.data;
  }, [token]);
  const { data: fireGoal } = useStaleData("bm_fire_goal", fetchFireGoal, { fallback: null });

  const [catFilter, setCatFilter] = useState("All");

  // Card order / visibility prefs (persisted in localStorage)
  const initPrefs = () => {
    const p = loadPrefs();
    return p
      ? { order: p.order, visible: p.visible }
      : {
          order:   ALL_CARDS.map(c => c.key),
          visible: Object.fromEntries(ALL_CARDS.map(c => [c.key, true])),
        };
  };
  const [cardOrder,    setCardOrder]    = useState(() => initPrefs().order);
  const [cardVisible,  setCardVisible]  = useState(() => initPrefs().visible);
  const [showCustomize, setShowCustomize] = useState(false);

  // Temporary state while customize modal is open
  const [draftOrder,   setDraftOrder]   = useState(cardOrder);
  const [draftVisible, setDraftVisible] = useState(cardVisible);

  const openCustomize = () => {
    setDraftOrder([...cardOrder]);
    setDraftVisible({ ...cardVisible });
    setShowCustomize(true);
  };
  const saveCustomize = () => {
    setCardOrder(draftOrder);
    setCardVisible(draftVisible);
    savePrefs(draftOrder, draftVisible);
    setShowCustomize(false);
  };
  const moveCard = (idx, dir) => {
    const next = [...draftOrder];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setDraftOrder(next);
  };
  const toggleCard = (key) =>
    setDraftVisible(v => ({ ...v, [key]: !v[key] }));

  const isVisible = (key) => cardVisible[key] !== false;

  useEffect(() => { prefetch(); }, [prefetch]);

  if (loading || !data) return (
    <PageLoader
      message="Fetching your financial picture…"
      tips={[
        "Counting every paisa you spent 🪙",
        "Peeking into your wallet… 👛",
        "Checking if you overspent on Swiggy 🍕",
        "Your EMIs are being tallied 📋",
        "Asking Chanakya for the numbers… 🤖",
        "Seeing how your savings are doing 🎯",
        "Almost ready — just one more sec ₹",
        "Calculating your financial health 📊",
      ]}
    />
  );

  const { summary, recent, score, goals, emis = [], loans = [], investments = [], creditCards = [] } = data;

  const income     = summary?.income || summary?.total_income || 0;
  const spent      = summary?.total_spent || 0;
  const left       = income - spent;
  const pct        = income > 0 ? Math.min(100, Math.round((spent / income) * 100)) : 0;
  const overBudget = left < 0;

  const activeGoals = goals?.goals?.slice(0, 3) || [];

  // Categories — sorted by spend
  const cats       = summary?.categories || [];
  const sortedCats = [...cats].sort((a, b) => b.spent - a.spent).filter((c) => c.spent > 0);
  const totalSpend = sortedCats.reduce((s, c) => s + c.spent, 0) || 1;

  // Metrics — EMI, Hand Loans, Investments
  const activeEmis  = emis.filter(e => e.status === "active");
  const totalEmi    = activeEmis.reduce((s, e) => s + (e.monthly_payment || 0), 0);
  const topEmi      = activeEmis.length > 0
    ? activeEmis.reduce((best, e) => (e.monthly_payment || 0) > (best.monthly_payment || 0) ? e : best, activeEmis[0])
    : null;
  const owedLoans   = loans.filter(l => l.type === "borrowed");
  const lentLoans   = loans.filter(l => l.type === "lent");
  const owed        = owedLoans.reduce((s, l) => s + (l.amount || 0), 0);
  const lent        = lentLoans.reduce((s, l) => s + (l.amount || 0), 0);
  const ccOutstanding = creditCards.reduce((s, c) => s + (c.outstanding_balance || 0), 0);
  const totalOwed   = owed + ccOutstanding;   // combined: hand loans + CC
  const invVal      = (i) => i.current_value || i.invested_amount || i.amount || 0;
  const portfolio   = investments.reduce((s, i) => s + invVal(i), 0);
  const topInv      = investments.length > 0
    ? investments.reduce((best, i) => invVal(i) > invVal(best) ? i : best, investments[0])
    : null;
  const showMetrics = totalEmi > 0 || totalOwed > 0 || lent > 0 || portfolio > 0;

  // Health
  const health    = score?.score != null ? healthLevel(score.score) : null;
  const healthHint = health ? healthTip(
    score.score, overBudget,
    score?.details?.emi_ratio || 0,
    score?.details?.savings_rate || 0,
    sortedCats[0]?.name || null,
  ) : null;

  // Bar chart — only months with actual spend > 0
  const allMonthly = score?.monthly_data || [];
  const barData = allMonthly
    .filter((m) => (m.expense || 0) > 0)
    .slice(-6)
    .map((m) => ({ month: m.label, Spend: Math.round(m.expense) }));

  // Monthly spends filter tabs
  const catTabs = ["All", ...sortedCats.slice(0, 4).map((c) => c.name)];

  // Per-category monthly bar data
  const catBarData = allMonthly
    .filter((m) => (m.expense || 0) > 0)
    .slice(-6)
    .map((m) => {
      const catBreakdown = m.categories || {};
      return {
        month: m.label,
        Spend: catFilter === "All"
          ? Math.round(m.expense)
          : Math.round(catBreakdown[catFilter] || 0),
      };
    });


  // ── Section renderers keyed by card key ──────────────────────────────────
  const sections = {
    metrics: showMetrics && (
      <div className="flex gap-3">
        {totalEmi > 0 && (
          <Link to="/emis" className="flex-1 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-2xl shadow-sm p-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">EMI</span>
            <span className="text-base font-extrabold text-stone-800 dark:text-stone-100 leading-tight">
              {fmt(totalEmi)}<span className="text-xs font-medium text-stone-400">/mo</span>
            </span>
            {topEmi && (
              <span className="text-[10px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                Top: {topEmi.name || topEmi.loan_name || "—"}
              </span>
            )}
            <span className="text-[10px] text-orange-400 font-semibold">{activeEmis.length} active loan{activeEmis.length !== 1 ? "s" : ""}</span>
          </Link>
        )}
        {(totalOwed > 0 || lent > 0) && (
          <Link to="/hand-loans" className={`flex-1 rounded-2xl shadow-sm p-3 flex flex-col gap-0.5 border ${
            totalOwed > 0
              ? "bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30"
              : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30"
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${totalOwed > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {totalOwed > 0 ? "You Owe" : "Lent Out"}
            </span>
            <span className={`text-base font-extrabold leading-tight ${totalOwed > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {fmt(totalOwed > 0 ? totalOwed : lent)}
            </span>
            {totalOwed > 0 ? (
              <span className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                {owedLoans.length > 0 && `${owedLoans.length} loan${owedLoans.length !== 1 ? "s" : ""}`}
                {owedLoans.length > 0 && creditCards.length > 0 && " · "}
                {ccOutstanding > 0 && `${creditCards.filter(c => c.outstanding_balance > 0).length} card${creditCards.filter(c => c.outstanding_balance > 0).length !== 1 ? "s" : ""}`}
              </span>
            ) : (
              <span className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                {lentLoans.length} person{lentLoans.length !== 1 ? "s" : ""}
              </span>
            )}
          </Link>
        )}
        {portfolio > 0 && (
          <Link to="/investments" className="flex-1 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl shadow-sm p-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Portfolio</span>
            <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 leading-tight">{fmt(portfolio)}</span>
            {topInv && (
              <span className="text-[10px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                Top: {topInv.name || topInv.asset_name || "—"}
              </span>
            )}
            <span className="text-[10px] text-emerald-500 font-semibold">{investments.length} holding{investments.length !== 1 ? "s" : ""}</span>
          </Link>
        )}
      </div>
    ),

    health: health && (
      <div className={`rounded-2xl shadow-sm px-4 py-3 ${
        healthHint
          ? health.color === "rose"   ? "bg-rose-50 dark:bg-rose-950/20"
          : health.color === "amber"  ? "bg-amber-50 dark:bg-amber-950/20"
          :                             "bg-white dark:bg-stone-900"
          : "bg-white dark:bg-stone-900"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            health.color === "emerald" ? "bg-emerald-100 dark:bg-emerald-900/40" :
            health.color === "amber"   ? "bg-amber-100 dark:bg-amber-900/40" :
                                         "bg-rose-100 dark:bg-rose-900/40"
          }`}>
            <Wallet size={17} className={
              health.color === "emerald" ? "text-emerald-500" :
              health.color === "amber"   ? "text-amber-500" :
                                           "text-rose-500"
            } />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-stone-400 dark:text-stone-500">Financial Health</p>
            <p className={`text-sm font-bold ${
              health.color === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
              health.color === "amber"   ? "text-amber-600 dark:text-amber-400" :
                                           "text-rose-600 dark:text-rose-400"
            }`}>{health.label}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            {[1,2,3,4,5].map(i => (
              <div key={i} className={`w-2 h-5 rounded-sm ${
                i <= health.segs
                  ? health.color === "emerald" ? "bg-emerald-400" :
                    health.color === "amber"   ? "bg-amber-400" : "bg-rose-400"
                  : "bg-stone-100 dark:bg-stone-800"
              }`} />
            ))}
          </div>
        </div>
        {healthHint && (
          <div className={`mt-3 pt-3 border-t ${
            health.color === "rose"  ? "border-rose-100 dark:border-rose-900/30" :
                                       "border-amber-100 dark:border-amber-900/30"
          }`}>
            <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
              <span className="font-semibold text-stone-700 dark:text-stone-200">Why: </span>
              {healthHint.why}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed mt-1">
              <span className="font-semibold text-stone-700 dark:text-stone-200">Fix: </span>
              {healthHint.fix}
            </p>
            <Link
              to={`/chat?prefill=${encodeURIComponent(healthHint.why + " — " + healthHint.fix + ". What should I do?")}`}
              className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-orange-500 hover:text-orange-600 transition-colors"
            >
              Ask Chanakya <ArrowRight size={10} />
            </Link>
          </div>
        )}
      </div>
    ),

    categories: sortedCats.length > 0 ? (
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <p className="text-sm font-bold text-stone-800 dark:text-stone-100">Category Spends</p>
          <button className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 font-medium">
            {monthLabel()} <ChevronDown size={12} />
          </button>
        </div>
        <div className="px-4 pb-2">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Top Categories</p>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px mb-4">
            {sortedCats.slice(0, 7).map((c, i) => {
              const w = Math.max(2, Math.round((c.spent / totalSpend) * 100));
              return <div key={c.name} style={{ width: `${w}%`, backgroundColor: CAT_COLORS[i] }} />;
            })}
            {sortedCats.length > 7 && <div style={{ flex: 1, backgroundColor: "#d6d3d1" }} />}
          </div>
          <div className="space-y-3 mb-4">
            {sortedCats.slice(0, 5).map((c, i) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[i] }} />
                <span className="text-sm text-stone-600 dark:text-stone-300 flex-1 truncate">{c.name}</span>
                <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">
                  <PrivacyAmount amount={c.spent} format={fmtFull} />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pb-4">
          <Link to="/budget"
            className="block w-full text-center py-2.5 rounded-2xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-semibold hover:bg-stone-800 dark:hover:bg-white transition-colors">
            View all categories
          </Link>
        </div>
      </div>
    ) : (
      <div className="bg-white dark:bg-stone-900 rounded-2xl p-8 shadow-sm text-center">
        <p className="text-stone-400 text-sm">No spending yet this month</p>
        <p className="text-xs text-stone-300 dark:text-stone-600 mt-1">Tell Chanakya what you spent today</p>
      </div>
    ),

    chart: barData.length > 0 && (
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-stone-800 dark:text-stone-100 mb-3">Monthly Spends</p>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
            {catTabs.map((t) => (
              <button key={t} onClick={() => setCatFilter(t)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  catFilter === t
                    ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900"
                    : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="px-2 pb-4" style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={catBarData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 9, fill: "#a8a29e" }} axisLine={false} tickLine={false} width={36} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: "#fafaf920", radius: 4 }} />
              <Bar dataKey="Spend" fill="#f97316" radius={[5, 5, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    ),

    goals: activeGoals.length > 0 && (
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-50 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-orange-500" />
            <p className="text-sm font-bold text-stone-800 dark:text-stone-100">Goals</p>
          </div>
          <Link to="/savings-goals" className="text-xs text-orange-500 flex items-center gap-0.5 font-medium">
            All <ArrowRight size={12} />
          </Link>
        </div>
        <div className="px-4 py-3 space-y-4">
          {activeGoals.map((g) => {
            const gPct = g.target_amount > 0
              ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
            return (
              <div key={g.id || g._id}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <p className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate flex-1">{g.name}</p>
                  <span className="text-xs font-bold text-orange-500 ml-2">{gPct}%</span>
                </div>
                <div className="bg-stone-100 dark:bg-stone-800 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-gradient-to-r from-orange-400 to-orange-500"
                    style={{ width: `${gPct}%` }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] text-stone-400">
                    <PrivacyAmount amount={g.current_amount} format={fmt} /> saved
                  </span>
                  <span className="text-[10px] text-stone-400">
                    of <PrivacyAmount amount={g.target_amount} format={fmt} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),

    fire: (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #f97316, #dc2626)" }}>
            <Flame size={15} className="text-white" />
          </div>
          <p className="text-sm font-bold text-stone-800 dark:text-stone-100">FIRE Goal</p>
        </div>
        {!fireGoal ? (
          <div className="text-center py-4">
            <p className="text-sm text-stone-400 dark:text-stone-500 mb-2">No FIRE target set yet</p>
            <Link to="/fire"
              className="inline-block text-xs font-semibold text-orange-500 hover:text-orange-600 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 rounded-xl transition-colors">
              Set your FIRE target →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">FIRE Number</p>
                <p className="text-xl font-extrabold text-stone-800 dark:text-stone-100 font-['Outfit']">
                  {fireGoal.fire_number >= 10000000
                    ? `₹${(fireGoal.fire_number / 10000000).toFixed(2)}Cr`
                    : fireGoal.fire_number >= 100000
                    ? `₹${(fireGoal.fire_number / 100000).toFixed(1)}L`
                    : `₹${Math.round(fireGoal.fire_number).toLocaleString("en-IN")}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">Target Year</p>
                <p className="text-base font-bold text-orange-500">{fireGoal.target_year}</p>
              </div>
            </div>
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-[10px] text-stone-400 mb-1">
                <span>Progress</span>
                <span className="font-semibold text-orange-500">
                  {Math.min(100, Math.round((fireGoal.current_savings / fireGoal.fire_number) * 100))}%
                </span>
              </div>
              <div className="h-2 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, (fireGoal.current_savings / fireGoal.fire_number) * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-stone-400">Monthly SIP needed</p>
                <p className="text-sm font-bold text-stone-700 dark:text-stone-200">
                  {fireGoal.monthly_savings_needed >= 100000
                    ? `₹${(fireGoal.monthly_savings_needed / 100000).toFixed(1)}L`
                    : fireGoal.monthly_savings_needed >= 1000
                    ? `₹${(fireGoal.monthly_savings_needed / 1000).toFixed(1)}K`
                    : `₹${Math.round(fireGoal.monthly_savings_needed).toLocaleString("en-IN")}`}
                </p>
              </div>
              <Link to="/fire" className="text-xs font-semibold text-orange-500 hover:text-orange-600 flex items-center gap-0.5 transition-colors">
                Update plan <ArrowRight size={11} />
              </Link>
            </div>
          </div>
        )}
      </div>
    ),

    calendar: (upcomingEvents || []).length > 0 && (
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-50 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-orange-500" />
            <p className="text-sm font-bold text-stone-800 dark:text-stone-100">Upcoming</p>
          </div>
          <Link to="/calendar" className="text-xs text-orange-500 flex items-center gap-0.5 font-medium">
            All <ArrowRight size={12} />
          </Link>
        </div>
        <div className="divide-y divide-stone-50 dark:divide-stone-800">
          {(upcomingEvents || []).map(ev => {
            const c = CAL_COLORS[ev.type] || CAL_COLORS.custom;
            return (
              <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">{ev.title}</p>
                  {ev.amount && <p className="text-xs text-stone-400">{fmt(ev.amount)}</p>}
                </div>
                <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-lg ${c.bg} ${c.text}`}>
                  {relDay(ev.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    ),

    recent: recent.length > 0 && (
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-50 dark:border-stone-800">
          <p className="text-sm font-bold text-stone-700 dark:text-stone-200">Recent</p>
          <Link to="/budget" className="text-xs text-orange-500 flex items-center gap-0.5 font-medium">
            See all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="divide-y divide-stone-50 dark:divide-stone-800">
          {recent.map((t, i) => (
            <div key={t._id || i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }}>
                {t.category?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">
                  {t.description || t.category}
                </p>
                <p className="text-xs text-stone-400">
                  {t.category} · {new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
              </div>
              <p className={`text-sm font-bold shrink-0 ${t.type === "income" ? "text-emerald-500" : "text-stone-700 dark:text-stone-200"}`}>
                {t.type === "income" ? "+" : "-"}<PrivacyAmount amount={t.amount} format={fmt} />
              </p>
            </div>
          ))}
        </div>
      </div>
    ),
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-10">
        <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">

          {/* ── Greeting ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-stone-400 dark:text-stone-500 text-xs">{greeting()}</p>
              <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">
                {user?.name?.split(" ")[0] || "there"} 👋
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={openCustomize}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-800 shadow-sm text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors text-xs font-semibold">
                <Settings2 size={13} />
                Customise
              </button>
              <p className="text-xs text-stone-400 dark:text-stone-500">
                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
              </p>
            </div>
          </div>

          {/* ── Customize modal ───────────────────────────────────────────── */}
          {showCustomize && (
            <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30 backdrop-blur-sm"
              onClick={(e) => e.target === e.currentTarget && setShowCustomize(false)}>
              <div className="w-80 h-full bg-white dark:bg-stone-900 rounded-l-3xl p-5 pb-8 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-base font-bold text-stone-800 dark:text-stone-100">Customize Dashboard</p>
                  <button onClick={() => setShowCustomize(false)}
                    className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-500">
                    <X size={15} />
                  </button>
                </div>
                <p className="text-xs text-stone-400 mb-4">Reorder and toggle sections to personalise your dashboard.</p>
                <div className="space-y-2">
                  {draftOrder.map((key, idx) => {
                    const card = ALL_CARDS.find(c => c.key === key);
                    if (!card) return null;
                    const on = draftVisible[key] !== false;
                    return (
                      <div key={key}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                          on ? "bg-stone-50 dark:bg-stone-800 border-stone-100 dark:border-stone-700"
                             : "bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800 opacity-50"
                        }`}>
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button onClick={() => moveCard(idx, -1)} disabled={idx === 0}
                            className="text-stone-300 dark:text-stone-600 hover:text-stone-500 disabled:opacity-30 transition-colors">
                            <ChevronUp size={13} />
                          </button>
                          <button onClick={() => moveCard(idx, 1)} disabled={idx === draftOrder.length - 1}
                            className="text-stone-300 dark:text-stone-600 hover:text-stone-500 disabled:opacity-30 transition-colors">
                            <ChevronDown size={13} />
                          </button>
                        </div>
                        <p className="flex-1 text-sm font-medium text-stone-700 dark:text-stone-200">{card.label}</p>
                        <button onClick={() => toggleCard(key)}
                          className={`transition-colors ${on ? "text-orange-500" : "text-stone-300 dark:text-stone-600"}`}>
                          {on ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button onClick={saveCustomize}
                  className="mt-5 w-full py-3 rounded-2xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-bold hover:bg-stone-800 dark:hover:bg-white transition-colors">
                  Save
                </button>
              </div>
            </div>
          )}

          {/* ── XP / Level bar ──────────────────────────────────────────── */}
          {(() => {
            const lvl = getXPLevel(userXP);
            const pctXP = getXPProgress(userXP);
            return (
              <div className="flex items-center gap-3 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm px-4 py-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-sm font-bold text-orange-600 dark:text-orange-400 shrink-0">
                  {lvl.level}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-xs font-bold text-stone-700 dark:text-stone-200 truncate">{lvl.name}</p>
                    <span className="text-[10px] font-semibold text-stone-400 ml-2 shrink-0">{userXP} XP</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500" style={{ width: `${pctXP}%` }} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Market Signals ────────────────────────────────────────────── */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
            {marketSignals.map((sig, i) => (
              <span key={i} className="shrink-0 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs font-medium text-stone-700 dark:text-stone-300 whitespace-nowrap">
                {sig.emoji} {sig.text}
              </span>
            ))}
          </div>

          {/* ── Feature Ticker ────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm py-2">
            <div className="flex whitespace-nowrap" style={{ animation: "featureTicker 28s linear infinite", width: "max-content" }}>
              {[
                { emoji: "📊", text: "X-ray any stock",    to: "/stock-analysis" },
                { emoji: "🎯", text: "Dream it, goal it",  to: "/savings-goals" },
                { emoji: "🧮", text: "SIP karo",           to: "/sip-calculator" },
                { emoji: "🥇", text: "Gold rush?",         to: "/gold" },
                { emoji: "🔥", text: "Retire early?",      to: "/fire" },
                { emoji: "🏠", text: "Buy ya rent?",       to: "/buy-vs-rent" },
                { emoji: "📈", text: "Fund shopping",      to: "/mutual-funds" },
                { emoji: "💍", text: "Shaadi budget",      to: "/event-planner" },
                { emoji: "💼", text: "Lifetime earnings",  to: "/lifetime-earnings" },
              ].concat([
                { emoji: "📊", text: "X-ray any stock",    to: "/stock-analysis" },
                { emoji: "🎯", text: "Dream it, goal it",  to: "/savings-goals" },
                { emoji: "🧮", text: "SIP karo",           to: "/sip-calculator" },
                { emoji: "🥇", text: "Gold rush?",         to: "/gold" },
                { emoji: "🔥", text: "Retire early?",      to: "/fire" },
                { emoji: "🏠", text: "Buy ya rent?",       to: "/buy-vs-rent" },
                { emoji: "📈", text: "Fund shopping",      to: "/mutual-funds" },
                { emoji: "💍", text: "Shaadi budget",      to: "/event-planner" },
                { emoji: "💼", text: "Lifetime earnings",  to: "/lifetime-earnings" },
              ]).map((f, i) => (
                <Link key={i} to={f.to}
                  className="inline-flex items-center gap-1.5 mx-1.5 px-3 py-1.5 rounded-full bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-200 dark:hover:border-orange-800 hover:text-orange-600 dark:hover:text-orange-400 transition-colors">
                  <span>{f.emoji}</span> {f.text}
                </Link>
              ))}
            </div>
            <style>{`@keyframes featureTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
          </div>

          {/* ── Spend hero ────────────────────────────────────────────────── */}
          <div className={`rounded-3xl p-5 shadow-sm ${
            overBudget
              ? "bg-gradient-to-br from-red-500 to-rose-600"
              : "bg-gradient-to-br from-stone-900 to-stone-800 dark:from-stone-800 dark:to-stone-900"
          } text-white`}>
            <div className="flex items-start justify-between mb-1">
              <p className="text-stone-400 text-xs font-medium">Spends this month</p>
              <Link to="/budget"
                className="text-xs font-semibold bg-orange-500 hover:bg-orange-600 transition-colors px-3 py-1.5 rounded-full text-white">
                Manage
              </Link>
            </div>
            <p className="text-4xl font-extrabold tracking-tight text-white leading-none mb-1">
              <PrivacyAmount amount={spent} format={fmtFull} />
            </p>
            {income > 0 && (
              <p className="text-sm text-stone-400 mb-4">
                {overBudget
                  ? `Over by ${fmt(Math.abs(left))}`
                  : `${fmt(left)} remaining`}
              </p>
            )}

            {income > 0 && (
              <>
                <div className="bg-white/10 rounded-full h-1.5 mb-2">
                  <div className="h-1.5 rounded-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-stone-500">
                  <span>₹0</span>
                  <span><PrivacyAmount amount={income} format={fmt} /></span>
                </div>
              </>
            )}
          </div>

          {/* ── Spending Insights strip ───────────────────────────────────── */}
          {sortedCats.length > 0 && (() => {
            const savingsRate = income > 0 ? Math.round(((income - spent) / income) * 100) : 0;
            const topCat      = sortedCats[0];
            const topPct      = Math.round((topCat.spent / (spent || 1)) * 100);
            const prevMonth   = allMonthly.length >= 2 ? allMonthly[allMonthly.length - 2] : null;
            const prevSpend   = prevMonth?.expense || 0;
            const momChange   = prevSpend > 0 ? Math.round(((spent - prevSpend) / prevSpend) * 100) : null;
            return (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 p-3 flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Top Spend</p>
                  <p className="text-sm font-bold text-stone-800 dark:text-stone-100 truncate">{topCat.name}</p>
                  <p className="text-xs text-stone-500">{topPct}% of total</p>
                </div>
                <div className={`rounded-2xl border p-3 flex flex-col gap-1 ${
                  savingsRate >= 20 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30"
                  : savingsRate >= 0 ? "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30"
                  : "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30"
                }`}>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Savings Rate</p>
                  <p className={`text-sm font-bold ${savingsRate >= 20 ? "text-emerald-600" : savingsRate >= 0 ? "text-amber-600" : "text-red-600"}`}>
                    {savingsRate}%
                  </p>
                  <p className="text-xs text-stone-500">{savingsRate >= 20 ? "Great!" : savingsRate >= 0 ? "Low" : "Over budget"}</p>
                </div>
                <div className={`rounded-2xl border p-3 flex flex-col gap-1 ${
                  momChange === null ? "bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800"
                  : momChange <= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30"
                  : "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30"
                }`}>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">vs Last Month</p>
                  <p className={`text-sm font-bold ${momChange === null ? "text-stone-500" : momChange <= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {momChange === null ? "—" : `${momChange > 0 ? "+" : ""}${momChange}%`}
                  </p>
                  <p className="text-xs text-stone-500">{momChange === null ? "No data" : momChange <= 0 ? "Less spend" : "More spend"}</p>
                </div>
              </div>
            );
          })()}

          {/* ── Dynamic sections (order + visibility controlled by user) ──── */}
          {cardOrder.map(key => isVisible(key) && sections[key]
            ? <div key={key}>{sections[key]}</div>
            : null
          )}

        </div>
      </div>
    </>
  );
};

export default Dashboard;
