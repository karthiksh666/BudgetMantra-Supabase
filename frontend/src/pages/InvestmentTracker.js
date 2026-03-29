import { useState, useCallback, useEffect, useRef } from "react";
import { useStaleData } from "@/hooks/useStaleData";
import axios from "axios";
import { API } from "@/App";
import Navigation from "@/components/Navigation";
import PageLoader from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Plus, Trash2, Edit3, Shield,
  Heart, Umbrella, Landmark, Building2, Coins, BarChart3,
  PiggyBank, AlertTriangle, Lightbulb, Rocket, RefreshCw,
  Info, Calendar, Lock, Search, Loader2, Activity
} from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

// ── Asset config ──────────────────────────────────────────────────────────────
const ASSET = {
  stocks:           { label: "Stocks",          group: "market",     bgColor: "bg-emerald-50",  textColor: "text-emerald-700", barColor: "bg-emerald-500", icon: TrendingUp  },
  mutual_funds:     { label: "Mutual Funds",     group: "market",     bgColor: "bg-blue-50",     textColor: "text-blue-700",    barColor: "bg-blue-500",    icon: BarChart3   },
  gold:             { label: "Gold",             group: "physical",   bgColor: "bg-amber-50",    textColor: "text-amber-700",   barColor: "bg-amber-500",   icon: Coins       },
  ppf:              { label: "PPF",              group: "safe",       bgColor: "bg-indigo-50",   textColor: "text-indigo-700",  barColor: "bg-indigo-500",  icon: Lock        },
  nps:              { label: "NPS",              group: "safe",       bgColor: "bg-purple-50",   textColor: "text-purple-700",  barColor: "bg-purple-500",  icon: PiggyBank   },
  fd:               { label: "Fixed Deposit",    group: "safe",       bgColor: "bg-teal-50",     textColor: "text-teal-700",    barColor: "bg-teal-500",    icon: Landmark    },
  rd:               { label: "Recurring Deposit",group: "safe",       bgColor: "bg-cyan-50",     textColor: "text-cyan-700",    barColor: "bg-cyan-500",    icon: RefreshCw   },
  real_estate:      { label: "Real Estate",      group: "physical",   bgColor: "bg-orange-50",   textColor: "text-orange-700",  barColor: "bg-orange-500",  icon: Building2   },
  health_insurance: { label: "Health Insurance", group: "protection", bgColor: "bg-rose-50",     textColor: "text-rose-700",    barColor: "bg-rose-500",    icon: Heart       },
  term_insurance:   { label: "Term Insurance",   group: "protection", bgColor: "bg-sky-50",      textColor: "text-sky-700",     barColor: "bg-sky-500",     icon: Umbrella    },
};

// ── Type hints shown in the Add form ──────────────────────────────────────────
const TYPE_HINTS = {
  stocks:           "Individual company shares on NSE/BSE. Enter total amount invested and today's portfolio value.",
  mutual_funds:     "SIP or lump-sum MF investments. Enter total invested and current value based on latest NAV.",
  gold:             "Physical gold, digital gold, SGBs, or Gold ETFs. Enter purchase cost and current market value.",
  ppf:              "Public Provident Fund — 15-yr lock-in, fully tax-free. Enter your current account balance.",
  nps:              "National Pension System — retirement corpus. Enter total contributions and current value.",
  fd:               "Bank/NBFC Fixed Deposit. Enter the principal deposited and current value including accrued interest.",
  rd:               "Recurring Deposit — monthly fixed deposits. Enter total deposited so far as 'invested' and current balance as 'value'.",
  real_estate:      "Property investment. Enter purchase price as 'invested' and current market value.",
  health_insurance: "Mediclaim or family floater policy. Enter annual premium and total sum insured (coverage amount).",
  term_insurance:   "Pure life cover — pays your family if something happens to you. Enter annual premium and sum assured.",
};

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { key: "safe",       label: "Safe Returns",  sub: "FD · PPF · NPS",        groups: ["safe"],                         hint: "Capital-protected investments with fixed/guaranteed returns." },
  { key: "market",     label: "Market",        sub: "Stocks · Mutual Funds",  groups: ["market"],                       hint: "Market-linked investments that grow with the economy." },
  { key: "physical",   label: "Physical",      sub: "Gold · Real Estate",     groups: ["physical"],                     hint: "Tangible assets you own — gold or property." },
  { key: "protection", label: "Protection",    sub: "Health · Term Insurance",groups: ["protection"],                   hint: "Not wealth — but shields your wealth when life gets hard." },
  { key: "all",        label: "All",           sub: "Everything",             groups: ["safe","market","physical","protection"], hint: "" },
];

const GROUP_LABEL = { market: "Market", safe: "Safe Returns", physical: "Physical Assets", protection: "Protection" };
const GROUP_COLOR = { market: "bg-emerald-500", safe: "bg-indigo-500", physical: "bg-amber-500", protection: "bg-rose-500" };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtAmt   = (n) => `₹${Math.round(Math.abs(n) || 0).toLocaleString("en-IN")}`;
const fmtShort = (n) => {
  const abs = Math.abs(n || 0);
  const sign = (n || 0) < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(0)}K`;
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;

const Skeleton = ({ className }) => <div className={`animate-pulse bg-stone-200 rounded-lg ${className}`} />;

const EMPTY_FORM = { type: "", name: "", invested_amount: "", current_value: "", monthly_sip: "", goal_amount: "", savings_goal_id: "", start_date: "", maturity_date: "", notes: "" };

// ── Component ─────────────────────────────────────────────────────────────────
const InvestmentTracker = () => {
  const [activeTab, setActiveTab]       = useState("safe");

  const [addOpen, setAddOpen]           = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [selectMode, setSelectMode]     = useState(false);
  const [selected, setSelected]         = useState(new Set());
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [editForm, setEditForm]         = useState({ current_value: "", invested_amount: "", monthly_sip: "", shares_held: "", notes: "" });

  // ── Market Mood Index ─────────────────────────────────────────────────────
  const [mmi, setMmi]           = useState(null);
  const [mmiLoading, setMmiLoading] = useState(false);

  // ── MF fund search ────────────────────────────────────────────────────────
  const [mfQuery, setMfQuery]       = useState("");
  const [mfResults, setMfResults]   = useState([]);
  const [mfSearching, setMfSearching] = useState(false);
  const mfDebounce = useRef(null);

  // ── Stock search + lookup ─────────────────────────────────────────────────
  const [stockQuery,    setStockQuery]    = useState("");
  const [stockResults,  setStockResults]  = useState([]);
  const [stockSearching,setStockSearching]= useState(false);
  const [stockSymbol,   setStockSymbol]   = useState("");   // selected ticker
  const [stockInfo,     setStockInfo]     = useState(null);
  const [stockFetching, setStockFetching] = useState(false);
  const [avgBuyPrice,   setAvgBuyPrice]   = useState("");
  const stockSearchDebounce = useRef(null);

  // ── Market data state ─────────────────────────────────────────────────────
  const [mfNav,            setMfNav]            = useState(null);  // {nav, nav_date, scheme_code}
  const [stockQty,         setStockQty]         = useState("");    // shares held (stocks)
  const [refreshing,       setRefreshing]       = useState(false);
  const [lastRefreshed,    setLastRefreshed]    = useState(null);
  const [refreshStatus,    setRefreshStatus]    = useState(null);  // {refreshed_at, triggered_by}

  const fetchInvestments = useCallback(async () => {
    const [invRes, sumRes, sugRes, goalsRes] = await Promise.all([
      axios.get(`${API}/investments`),
      axios.get(`${API}/investments/summary`),
      axios.get(`${API}/investments/suggestions`),
      axios.get(`${API}/savings-goals`).catch(() => ({ data: [] })),
    ]);
    return {
      investments: invRes.data || [],
      summary: sumRes.data || null,
      suggestions: sugRes.data || [],
      savingsGoals: (goalsRes.data || []).filter(g => g.status === "active"),
    };
  }, []);

  const { data: invData, loading, reload: fetchAll } = useStaleData(
    "bm_investments_cache",
    fetchInvestments,
    { errorMsg: "Failed to load investments", fallback: { investments: [], summary: null, suggestions: [], savingsGoals: [] } }
  );

  useEffect(() => {
    const onLog = () => fetchAll();
    window.addEventListener("chanakya-logged", onLog);
    return () => window.removeEventListener("chanakya-logged", onLog);
  }, [fetchAll]);

  // Fetch MMI + price refresh status on mount
  useEffect(() => {
    setMmiLoading(true);
    axios.get(`${API}/market/mood`)
      .then(r => setMmi(r.data))
      .catch(() => {})
      .finally(() => setMmiLoading(false));
    axios.get(`${API}/investments/refresh-status`)
      .then(r => setRefreshStatus(r.data))
      .catch(() => {});
  }, []);

  // MF fund search — debounced 400ms
  useEffect(() => {
    if (form.type !== "mutual_funds") return;
    clearTimeout(mfDebounce.current);
    if (mfQuery.length < 2) { setMfResults([]); return; }
    mfDebounce.current = setTimeout(async () => {
      setMfSearching(true);
      try {
        const r = await axios.get(`${API}/market/mf-search?q=${encodeURIComponent(mfQuery)}`);
        setMfResults(r.data || []);
      } catch { setMfResults([]); }
      finally { setMfSearching(false); }
    }, 400);
  }, [mfQuery, form.type]);

  // Stock name/ticker search — debounced 350ms
  useEffect(() => {
    if (form.type !== "stocks") return;
    clearTimeout(stockSearchDebounce.current);
    if (stockQuery.length < 2) { setStockResults([]); return; }
    stockSearchDebounce.current = setTimeout(async () => {
      setStockSearching(true);
      try {
        const r = await axios.get(`${API}/market/stock-search?q=${encodeURIComponent(stockQuery)}`);
        setStockResults(r.data || []);
      } catch { setStockResults([]); }
      finally { setStockSearching(false); }
    }, 350);
  }, [stockQuery, form.type]);

  // Fetch price once a ticker is selected
  useEffect(() => {
    if (form.type !== "stocks" || !stockSymbol) return;
    setStockFetching(true);
    setStockInfo(null);
    axios.get(`${API}/market/stock-price/${encodeURIComponent(stockSymbol)}`)
      .then(r => { setStockInfo(r.data); setForm(p => ({ ...p, name: r.data.name || stockSymbol })); })
      .catch(() => toast.error("Could not fetch price — try again"))
      .finally(() => setStockFetching(false));
  }, [stockSymbol, form.type]);

  const investments  = invData?.investments ?? [];
  const summary      = invData?.summary ?? null;
  const suggestions  = invData?.suggestions ?? [];
  const savingsGoals = invData?.savingsGoals ?? [];

  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    // Derive estimated units for MF, and estimated start date
    const mfUnitsEst = (form.type === "mutual_funds" && mfNav && form.current_value)
      ? parseFloat((parseFloat(form.current_value) / mfNav.nav).toFixed(3))
      : null;
    const estStartDate = (form.invested_amount && form.monthly_sip && parseFloat(form.monthly_sip) > 0)
      ? (() => {
          const months = Math.round(parseFloat(form.invested_amount) / parseFloat(form.monthly_sip));
          const d = new Date();
          d.setMonth(d.getMonth() - months);
          return d.toISOString().slice(0, 10);
        })()
      : form.start_date || null;
    const isStockType = form.type === "stocks";
    const sQty = parseFloat(stockQty) || 0;
    const sAvg = parseFloat(avgBuyPrice) || 0;
    // For stocks: derive invested/current from avg×qty and livePrice×qty
    const finalInvested = isStockType ? sAvg * sQty : parseFloat(form.invested_amount);
    const finalCurrent  = isStockType ? (stockInfo ? stockInfo.price * sQty : sAvg * sQty) : parseFloat(form.current_value);
    if (!isStockType && (!form.current_value || isNaN(parseFloat(form.current_value)))) {
      toast.error("Please enter the current value");
      setSubmitting(false);
      return;
    }
    if (isStockType && (!stockSymbol || sQty <= 0 || sAvg <= 0)) {
      toast.error("Please select a stock and enter avg buy price + quantity");
      setSubmitting(false);
      return;
    }
    try {
      await axios.post(`${API}/investments`, {
        type:            form.type,
        name:            form.name,
        invested_amount: finalInvested,
        current_value:   finalCurrent,
        monthly_sip:     form.monthly_sip ? parseFloat(form.monthly_sip) : null,
        symbol:          isStockType ? (stockSymbol || null) : null,
        shares_held:     isStockType && sQty ? sQty : null,
        scheme_code:     form.type === "mutual_funds" && mfNav ? (mfNav.scheme_code || null) : null,
        units_held:      mfUnitsEst,
        goal_amount:     form.goal_amount ? parseFloat(form.goal_amount) : null,
        savings_goal_id: form.savings_goal_id || null,
        start_date:      estStartDate,
        maturity_date:   form.maturity_date || null,
        notes:           form.notes,
      });
      toast.success("Investment added!");
      setAddOpen(false);
      setForm(EMPTY_FORM);
      setMfNav(null); setStockQty(""); setStockSymbol(""); setStockInfo(null); setStockQuery(""); setStockResults([]); setAvgBuyPrice(""); setMfQuery(""); setMfResults([]);
      fetchAll();
    } catch {
      toast.error("Failed to add investment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.put(`${API}/investments/${editTarget.id}`, {
        current_value:   parseFloat(editForm.current_value),
        invested_amount: parseFloat(editForm.invested_amount),
        monthly_sip:     editForm.monthly_sip ? parseFloat(editForm.monthly_sip) : null,
        shares_held:     editForm.shares_held ? parseFloat(editForm.shares_held) : null,
        notes:           editForm.notes,
      });
      toast.success("Updated!");
      setEditTarget(null);
      fetchAll();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await axios.delete(`${API}/investments/${deleteTarget.id}`);
      toast.success("Deleted");
      setDeleteTarget(null);
      fetchAll();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMultiDelete = async () => {
    try {
      await Promise.all([...selected].map(id => axios.delete(`${API}/investments/${id}`)));
      toast.success(`${selected.size} investment${selected.size > 1 ? 's' : ''} removed`);
      setSelectMode(false);
      setSelected(new Set());
      fetchAll();
    } catch {
      toast.error('Failed to delete selected investments');
    }
  };

  const openEdit = (inv) => {
    setEditTarget(inv);
    setEditForm({
      current_value:   inv.current_value,
      invested_amount: inv.invested_amount,
      monthly_sip:     inv.monthly_sip ?? "",
      shares_held:     inv.shares_held ?? "",
      notes:           inv.notes || "",
    });
  };

  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center" style={{ background: "linear-gradient(160deg, #eff6ff 0%, #f5f9ff 50%, #fffaf5 100%)" }}>
        <PageLoader
          message="Loading your portfolio…"
          tips={["Calculating net worth", "Checking asset allocation", "Analysing insurance cover", "Fetching suggestions"]}
        />
      </div>
    </>
  );

  const isProtection   = (type) => ["health_insurance", "term_insurance"].includes(type);
  const activeGroups   = TABS.find(t => t.key === activeTab)?.groups || [];
  const tabInvestments = investments.filter(i => activeGroups.includes(ASSET[i.type]?.group));
  const tabGrouped     = tabInvestments.reduce((acc, inv) => {
    const g = ASSET[inv.type]?.group || "safe";
    if (!acc[g]) acc[g] = [];
    acc[g].push(inv);
    return acc;
  }, {});
  const tabCount = (groups) => investments.filter(i => groups.includes(ASSET[i.type]?.group)).length;
  const nonProtection  = investments.filter(i => ASSET[i.type]?.group !== "protection");

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)]" style={{ background: "linear-gradient(160deg, #eff6ff 0%, #f5f9ff 50%, #fffaf5 100%)" }} data-testid="investment-tracker-page">
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-stone-900 font-['Outfit']">Portfolio</h1>
              <p className="text-stone-400 text-sm mt-0.5">Investments &amp; insurance in one place</p>
            </div>
            <div className="flex items-center gap-2">
              {investments.length > 0 && (
                <Button
                  variant="outline" size="sm"
                  className={`hidden sm:inline-flex text-xs h-9 ${selectMode ? 'bg-blue-50 text-blue-600 border-blue-300' : 'text-stone-500 border-stone-200'}`}
                  onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </Button>
              )}
              <Button
                variant="outline" size="sm"
                className="hidden sm:inline-flex text-xs h-9 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                disabled={refreshing}
                title="Refresh stock and MF prices using latest post-market close data"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    const r = await axios.post(`${API}/investments/refresh-prices`);
                    setLastRefreshed(new Date());
                    setRefreshStatus({ refreshed_at: r.data.refreshed_at, triggered_by: "manual" });
                    toast.success(`${r.data.message}`);
                    fetchAll();
                  } catch { toast.error("Price refresh failed"); }
                  finally { setRefreshing(false); }
                }}
              >
                {refreshing ? <Loader2 size={13} className="animate-spin mr-1" /> : <RefreshCw size={13} className="mr-1" />}
                Refresh Prices
              </Button>
              <Button
                onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm shadow-blue-300/40"
              >
                <Plus size={16} className="mr-1.5" /> Add
              </Button>
            </div>
          </div>

          {/* ── Post-market pricing disclaimer ── */}
          {(() => {
            const ts = lastRefreshed
              ? lastRefreshed.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
              : refreshStatus?.refreshed_at
                ? new Date(refreshStatus.refreshed_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                : null;
            return (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 mb-4 -mt-1">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  <span className="font-semibold">Portfolio values are based on NSE/BSE post-market closing prices — not real-time.</span>
                  {ts
                    ? <> Last updated <span className="font-medium">{ts} IST</span> · Prices auto-refresh daily at 4:00 PM IST (Mon–Fri).</>
                    : <> Prices auto-refresh daily at 4:00 PM IST (Mon–Fri). Use <span className="font-medium">Refresh Prices</span> to update now.</>
                  }
                </p>
              </div>
            );
          })()}

          {/* ── Tabs ── */}
          <div className="flex gap-2 mb-1 overflow-x-auto pb-1 scrollbar-hide">
            {TABS.map(({ key, label, groups }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  activeTab === key
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                {label} ({tabCount(groups)})
              </button>
            ))}
          </div>

          {/* Tab subtitle */}
          {(() => {
            const t = TABS.find(t => t.key === activeTab);
            return t?.hint ? (
              <p className="text-xs text-stone-400 mb-4 pl-1 flex items-center gap-1.5">
                <Info size={11} /> {t.hint}
              </p>
            ) : <div className="mb-4" />;
          })()}

          {/* ── List ── */}
          {loading ? (
            <div className="space-y-3">
              {[0,1,2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : nonProtection.length === 0 && investments.length === 0 ? (
            /* ── First-time empty state ── */
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Rocket size={22} className="text-blue-300" />
              </div>
              <p className="font-semibold text-stone-700">Start building your portfolio</p>
              <p className="text-stone-400 text-sm mt-1.5 max-w-xs mx-auto leading-relaxed">
                Add any investment you have — FD, stocks, gold, mutual funds. Even insurance policies belong here.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {["Fixed Deposit", "Stocks", "Mutual Fund", "Gold", "PPF"].map(t => (
                  <span key={t} className="text-xs bg-stone-50 border border-stone-200 text-stone-500 px-3 py-1 rounded-full">{t}</span>
                ))}
              </div>
              <Button
                onClick={() => setAddOpen(true)}
                className="mt-5 bg-gradient-to-r from-blue-600 to-indigo-600"
              >
                <Plus size={15} className="mr-1.5" /> Add First Asset
              </Button>
            </div>
          ) : tabInvestments.length === 0 ? (
            /* ── Per-tab empty state ── */
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 text-center">
              <p className="font-medium text-stone-500 text-sm">
                No {TABS.find(t => t.key === activeTab)?.label} investments tracked yet
              </p>
              <p className="text-stone-400 text-xs mt-1">
                {activeTab === "safe"       && "Add FD, PPF, or NPS to see them here"}
                {activeTab === "market"     && "Add stocks or mutual funds to see them here"}
                {activeTab === "physical"   && "Add gold or property to see them here"}
                {activeTab === "protection" && "Add your health or term insurance policy to see it here"}
              </p>
              <button
                onClick={() => setAddOpen(true)}
                className="text-blue-500 text-xs font-semibold mt-3 hover:underline flex items-center gap-1 mx-auto"
              >
                <Plus size={12} /> Add now
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {activeGroups.map(group => {
                const items = tabGrouped[group];
                if (!items || items.length === 0) return null;
                return (
                  <div key={group}>
                    {activeTab === "all" && (
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{GROUP_LABEL[group]}</span>
                        <div className="flex-1 h-px bg-stone-100" />
                        <span className="text-xs text-stone-400">{fmtShort(items.reduce((s, i) => s + i.current_value, 0))}</span>
                      </div>
                    )}
                    <div className="space-y-2">
                      {items.map(inv => {
                        const cfg         = ASSET[inv.type] || {};
                        const Icon        = cfg.icon || TrendingUp;
                        const gain        = inv.current_value - inv.invested_amount;
                        const gainPct     = inv.invested_amount > 0 ? ((gain / inv.invested_amount) * 100).toFixed(1) : null;
                        const isProtect   = cfg.group === "protection";
                        const maturityStr = fmtDate(inv.maturity_date);

                        return (
                          <div
                            key={inv.id}
                            className={`bg-white rounded-xl border shadow-sm px-4 py-3.5 hover:shadow-md transition-shadow ${selectMode && selected.has(inv.id) ? 'border-blue-400 ring-2 ring-blue-100' : 'border-stone-100'}`}
                            onClick={selectMode ? () => setSelected(prev => { const next = new Set(prev); next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id); return next; }) : undefined}
                            style={selectMode ? { cursor: 'pointer' } : undefined}
                          >
                            <div className="flex items-start gap-3">
                              {selectMode && (
                                <div className="flex items-center mt-1.5 shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(inv.id)}
                                    onChange={() => {}}
                                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                                  />
                                </div>
                              )}
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.bgColor || "bg-stone-50"}`}>
                                <Icon size={16} className={cfg.textColor || "text-stone-500"} />
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-stone-800 text-sm truncate">{inv.name}</p>
                                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${cfg.bgColor} ${cfg.textColor}`}>
                                    {cfg.label}
                                  </span>
                                  {maturityStr && (
                                    <span className="text-[11px] text-stone-400 flex items-center gap-1">
                                      <Calendar size={10} />
                                      {isProtect ? "Renews" : "Matures"} {maturityStr}
                                    </span>
                                  )}
                                  {inv.savings_goal_id && (() => {
                                    const g = savingsGoals.find(g => g.id === inv.savings_goal_id);
                                    return g ? (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 flex items-center gap-1">
                                        🎯 {g.name}
                                      </span>
                                    ) : null;
                                  })()}
                                  {inv.notes && (
                                    <span className="text-[11px] text-stone-400 truncate max-w-[120px]">{inv.notes}</span>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <p className="font-bold text-stone-800 text-sm font-['Outfit']">
                                  {isProtect ? `${fmtAmt(inv.current_value)} cover` : fmtAmt(inv.current_value)}
                                </p>
                                {!isProtect && gainPct !== null && (
                                  <p className={`text-xs font-medium ${gain >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                    {gain >= 0 ? "▲" : "▼"} {fmtShort(Math.abs(gain))} ({Math.abs(parseFloat(gainPct))}%)
                                  </p>
                                )}
                                {isProtect && (
                                  <p className="text-xs text-stone-400">{fmtAmt(inv.invested_amount)}/yr premium</p>
                                )}
                              </div>
                            </div>

                            {/* Progress toward goal */}
                            {!isProtect && inv.goal_amount > 0 && (
                              <div className="mt-2.5 pl-12">
                                <div className="flex justify-between text-[10px] text-stone-400 mb-1">
                                  <span>Goal: {fmtAmt(inv.goal_amount)}</span>
                                  <span>{Math.min(100, Math.round((inv.current_value / inv.goal_amount) * 100))}%</span>
                                </div>
                                <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${cfg.barColor || "bg-orange-400"}`}
                                    style={{ width: `${Math.min(100, (inv.current_value / inv.goal_amount) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex justify-end gap-1 mt-2">
                              <button
                                onClick={() => openEdit(inv)}
                                className="p-1.5 text-stone-300 hover:text-blue-400 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                              >
                                <Edit3 size={12} /> Update value
                              </button>
                              <button
                                onClick={() => setDeleteTarget(inv)}
                                className="p-1.5 text-stone-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Hero Net Worth ── */}
          {loading ? (
            <Skeleton className="h-44 rounded-2xl mb-5" />
          ) : summary && (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-600 p-4 mt-6 mb-4 text-white shadow-lg" style={{ boxShadow: "0 8px 32px rgba(29,78,216,0.25)" }}>
              <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
              <div className="relative">
                <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-1">Total Portfolio Value</p>
                <div className="flex items-end gap-3 flex-wrap">
                  <p className="text-3xl font-extrabold font-['Outfit'] leading-none text-white">
                    {fmtShort(summary.total_current)}
                  </p>
                  {summary.total_gain >= 0
                    ? <span className="inline-flex items-center gap-1 text-xs bg-white/20 text-white px-2.5 py-1 rounded-full font-medium mb-0.5">
                        <TrendingUp size={11} /> +{fmtShort(summary.total_gain)} · {summary.gain_pct}% overall
                      </span>
                    : <span className="inline-flex items-center gap-1 text-xs bg-red-500/30 text-red-100 px-2.5 py-1 rounded-full font-medium mb-0.5">
                        <TrendingDown size={11} /> {fmtShort(summary.total_gain)} · {summary.gain_pct}%
                      </span>
                  }
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    { label: "Amount Invested", value: fmtShort(summary.total_invested), sub: "your money put in" },
                    { label: "Current Value",   value: fmtShort(summary.total_current),  sub: "market value today" },
                    { label: "No. of Assets",   value: summary.investment_count,          sub: "tracked investments" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white/15 rounded-xl px-3 py-2.5">
                      <p className="font-bold text-sm sm:text-base font-['Outfit'] text-white leading-none">{value}</p>
                      <p className="text-white/70 text-[10px] mt-1 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Insurance Alert Banner ── */}
          {!loading && summary && (!summary.has_health_insurance || !summary.has_term_insurance) && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex gap-3">
              <Shield size={20} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-700 text-sm">
                  {!summary.has_health_insurance && !summary.has_term_insurance
                    ? "⚠ You have no health or term insurance"
                    : !summary.has_health_insurance
                      ? "⚠ No health insurance on record"
                      : "⚠ No term life cover on record"}
                </p>
                <p className="text-red-600 text-xs mt-0.5 leading-relaxed">
                  {!summary.has_health_insurance && !summary.has_term_insurance
                    ? "One medical emergency can wipe out your savings. A ₹10L health cover + ₹1Cr term plan costs under ₹2,000/mo combined."
                    : !summary.has_health_insurance
                      ? "One hospitalisation can erase years of savings. Add a family floater health policy — ₹10L cover starts at ~₹700/mo."
                      : "Your family has no financial protection if something happens to you. A ₹1Cr term plan costs ~₹800–1,200/mo."}
                </p>
                <button
                  onClick={() => {
                    setForm({ ...EMPTY_FORM, type: !summary.has_health_insurance ? "health_insurance" : "term_insurance" });
                    setAddOpen(true);
                  }}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 mt-2 flex items-center gap-1 underline underline-offset-2"
                >
                  <Plus size={11} /> Track my insurance now
                </button>
              </div>
            </div>
          )}

          {/* ── Asset Allocation Bar ── */}
          {!loading && summary && summary.total_current > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-stone-800 font-['Outfit'] text-sm">Asset Mix</p>
                <p className="text-xs text-stone-400">How your money is split</p>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden gap-px mb-3">
                {Object.entries(summary.allocation).map(([key, val]) =>
                  val.pct > 0 ? (
                    <div key={key} className={`h-full ${GROUP_COLOR[key] || "bg-stone-300"} transition-all`}
                      style={{ width: `${val.pct}%` }} title={`${GROUP_LABEL[key]}: ${val.pct}%`} />
                  ) : null
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {Object.entries(summary.allocation).map(([key, val]) =>
                  val.pct > 0 ? (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${GROUP_COLOR[key] || "bg-stone-300"}`} />
                      <span className="text-xs text-stone-700 font-medium">{GROUP_LABEL[key]}</span>
                      <span className="text-xs text-stone-400">{val.pct}% · {fmtShort(val.value)}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* ── Market Mood Index ── */}
          {(mmiLoading || mmi) && (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity size={15} className="text-blue-500" />
                <p className="font-bold text-stone-800 font-['Outfit'] text-sm">Market Mood Index</p>
                {mmi?.updated_at && (
                  <span className="ml-auto text-[10px] text-stone-400">Updated {new Date(mmi.updated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                )}
              </div>
              {mmiLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 size={14} className="animate-spin text-stone-400" />
                  <span className="text-xs text-stone-400">Fetching market data…</span>
                </div>
              ) : mmi && (
                <>
                  {/* Gauge bar */}
                  <div className="relative mb-3">
                    <div className="h-3 rounded-full overflow-hidden flex">
                      <div className="flex-1 bg-indigo-400" title="Extreme Fear" />
                      <div className="flex-1 bg-blue-400" title="Fear" />
                      <div className="flex-1 bg-amber-400" title="Neutral" />
                      <div className="flex-1 bg-orange-400" title="Greed" />
                      <div className="flex-1 bg-red-400" title="Extreme Greed" />
                    </div>
                    {/* Needle */}
                    <div
                      className="absolute top-0 w-1 h-3 bg-stone-900 rounded-full transition-all"
                      style={{ left: `calc(${mmi.mmi}% - 2px)` }}
                    />
                    <div className="flex justify-between text-[9px] text-stone-400 mt-1 px-0.5">
                      <span>Extreme Fear</span><span>Fear</span><span>Neutral</span><span>Greed</span><span>Extreme Greed</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{mmi.emoji}</span>
                      <div>
                        <p className="font-bold text-sm" style={{ color: mmi.color }}>{mmi.zone}</p>
                        <p className="text-xs text-stone-400">MMI Score: <span className="font-bold text-stone-700">{mmi.mmi}</span>/100</p>
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-stone-500 ml-auto">
                      {mmi.nifty && <span>Nifty <span className="font-semibold text-stone-700">{mmi.nifty.toLocaleString("en-IN")}</span></span>}
                      {mmi.vix && <span>VIX <span className="font-semibold text-stone-700">{mmi.vix}</span></span>}
                    </div>
                  </div>
                  <div className="mt-2.5 bg-stone-50 rounded-xl px-3 py-2 text-xs text-stone-600 leading-relaxed border border-stone-100">
                    💡 {mmi.advice}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Smart Suggestions (marquee ticker) ── */}
          {!loading && suggestions.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 mb-5">
              <style>{`
                @keyframes ck-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
                .ck-marquee-track { animation: ck-marquee 28s linear infinite; display: flex; gap: 0; white-space: nowrap; }
                .ck-marquee-track:hover { animation-play-state: paused; }
              `}</style>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={15} className="text-amber-500" />
                <p className="font-bold text-stone-800 font-['Outfit'] text-sm">Advisor Tips</p>
              </div>
              <div style={{ overflow: "hidden" }}>
                <div className="ck-marquee-track">
                  {[...suggestions, ...suggestions].map((s, i) => (
                    <span key={i} className="text-sm text-stone-600 pr-8">
                      ⚠ {s.title} — {s.body}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Multi-select delete bar ── */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-0 right-0 lg:left-64 z-50 flex justify-center px-4">
          <div className="bg-stone-900 text-white rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
            <span className="text-sm font-semibold">{selected.size} selected</span>
            <button onClick={handleMultiDelete} className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-xl transition-colors">Delete</button>
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="text-stone-400 hover:text-white text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Add Dialog ── */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) { setMfQuery(""); setMfResults([]); setMfNav(null); setStockSymbol(""); setStockInfo(null); setStockQty(""); setStockQuery(""); setStockResults([]); setAvgBuyPrice(""); } }}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add to Portfolio</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">

            {/* Type selector — grouped */}
            <div>
              <Label className="text-sm font-medium text-stone-700">What type of asset?</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Choose a category…" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Safe / Fixed Returns</div>
                  <SelectItem value="fd">Fixed Deposit (FD)</SelectItem>
                  <SelectItem value="rd">Recurring Deposit (RD)</SelectItem>
                  <SelectItem value="ppf">PPF — Public Provident Fund</SelectItem>
                  <SelectItem value="nps">NPS — National Pension System</SelectItem>
                  <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-1">Market Investments</div>
                  <SelectItem value="stocks">Stocks (Direct equity)</SelectItem>
                  <SelectItem value="mutual_funds">Mutual Funds / SIP</SelectItem>
                  <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-1">Physical Assets</div>
                  <SelectItem value="gold">Gold (physical / digital / SGB)</SelectItem>
                  <SelectItem value="real_estate">Real Estate / Property</SelectItem>
                  <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-1">Protection</div>
                  <SelectItem value="health_insurance">Health Insurance (Mediclaim)</SelectItem>
                  <SelectItem value="term_insurance">Term Life Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type hint card */}
            {form.type && TYPE_HINTS[form.type] && (
              <div className={`flex gap-2.5 p-3 rounded-xl border ${ASSET[form.type]?.bgColor || "bg-stone-50"} border-stone-200`}>
                <Info size={14} className={`shrink-0 mt-0.5 ${ASSET[form.type]?.textColor || "text-stone-500"}`} />
                <p className="text-xs text-stone-600 leading-relaxed">{TYPE_HINTS[form.type]}</p>
              </div>
            )}

            {/* MF fund search */}
            {form.type === "mutual_funds" ? (
              <div>
                <Label className="text-sm font-medium text-stone-700">Search Fund</Label>
                <div className="relative mt-1.5">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <Input
                    value={mfQuery}
                    onChange={e => setMfQuery(e.target.value)}
                    placeholder="Type fund name e.g. Parag Parikh, HDFC Midcap…"
                    className="pl-8"
                  />
                  {mfSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-stone-400" />}
                </div>
                {mfResults.length > 0 && !form.name && (
                  <div className="mt-1 border border-stone-200 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                    {mfResults.map(f => (
                      <button
                        key={f.scheme_code} type="button"
                        className="w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 border-b border-stone-100 last:border-0 transition-colors"
                        onClick={async () => {
                          setForm(p => ({ ...p, name: f.name }));
                          setMfQuery(f.name);
                          setMfResults([]);
                          setMfNav(null);
                          try {
                            const r = await axios.get(`${API}/market/mf-nav/${f.scheme_code}`);
                            setMfNav({ nav: r.data.nav, nav_date: r.data.nav_date, scheme_code: f.scheme_code });
                            toast.success(`NAV: ₹${r.data.nav} as of ${r.data.nav_date}`);
                          } catch {}
                        }}
                      >
                        <p className="font-medium text-stone-800 leading-tight">{f.name}</p>
                        <p className="text-stone-400 mt-0.5">Code: {f.scheme_code}</p>
                      </button>
                    ))}
                  </div>
                )}
                {form.name && (
                  <div className="flex items-center justify-between mt-1 px-1">
                    <p className="text-xs text-emerald-600 font-medium truncate">✓ {form.name}</p>
                    <button type="button" className="text-xs text-stone-400 hover:text-stone-600 shrink-0 ml-2" onClick={() => { setForm(p => ({ ...p, name: "", current_value: "" })); setMfQuery(""); setMfNav(null); }}>Change</button>
                  </div>
                )}
                {/* MF NAV card — user enters SIP + current value, we derive the rest */}
                {mfNav && (
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-700">NAV (per unit)</span>
                      <span className="text-sm font-bold text-blue-900">₹{mfNav.nav} <span className="text-xs font-normal text-blue-400">as of {mfNav.nav_date}</span></span>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-blue-700 block mb-1">Monthly SIP (₹) <span className="font-normal text-blue-400">— optional, for start date estimate</span></label>
                      <Input
                        type="number"
                        value={form.monthly_sip}
                        onChange={e => setForm(p => ({ ...p, monthly_sip: e.target.value }))}
                        placeholder="e.g. 5000"
                        className="bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-blue-700 block mb-1">Current Value (₹) <span className="font-normal text-blue-400">— from Groww / CAMS</span></label>
                      <Input
                        type="number"
                        value={form.current_value}
                        onChange={e => setForm(p => ({ ...p, current_value: e.target.value }))}
                        placeholder="e.g. 18450"
                        className="bg-white"
                        required
                      />
                    </div>
                    {/* Derived info — estimated units + start date */}
                    {form.current_value && mfNav && (
                      <div className="bg-white rounded-lg px-3 py-2.5 border border-blue-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-blue-500">Estimated units held</span>
                          <span className="text-sm font-bold text-blue-800">{(parseFloat(form.current_value) / mfNav.nav).toFixed(3)}</span>
                        </div>
                        {form.invested_amount && form.monthly_sip && parseFloat(form.monthly_sip) > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-blue-500">Approx. investing since</span>
                            <span className="text-xs font-semibold text-blue-800">{(() => {
                              const months = Math.round(parseFloat(form.invested_amount) / parseFloat(form.monthly_sip));
                              const d = new Date();
                              d.setMonth(d.getMonth() - months);
                              return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
                            })()}</span>
                          </div>
                        )}
                        <p className="text-[10px] text-blue-400 leading-tight">These are estimates — we use them to track value changes automatically after market close.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : form.type === "stocks" ? (
              <div className="space-y-3">
                {/* Stock search */}
                <div>
                  <Label className="text-sm font-medium text-stone-700">Search Stock</Label>
                  {!stockSymbol ? (
                    <div className="relative mt-1.5">
                      <Input
                        value={stockQuery}
                        onChange={e => { setStockQuery(e.target.value); setStockResults([]); }}
                        placeholder="Search by name or ticker — e.g. IDFC, Reliance, TCS"
                        autoComplete="off"
                      />
                      {stockSearching && <Loader2 size={14} className="animate-spin absolute right-3 top-2.5 text-stone-400" />}
                      {stockResults.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
                          {stockResults.map(s => (
                            <button key={s.symbol} type="button"
                              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50 border-b border-stone-100 last:border-0"
                              onClick={() => { setStockSymbol(s.symbol); setStockQuery(""); setStockResults([]); }}
                            >
                              <span className="text-sm font-medium text-stone-800 truncate flex-1">{s.name}</span>
                              <span className="text-xs font-bold text-stone-500 bg-stone-100 rounded px-2 py-0.5 ml-3 shrink-0">{s.symbol}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                        <span className="text-sm font-bold text-emerald-800">{stockSymbol}</span>
                        {stockFetching && <Loader2 size={13} className="animate-spin text-emerald-500" />}
                      </div>
                      <button type="button" onClick={() => { setStockSymbol(""); setStockInfo(null); setAvgBuyPrice(""); setStockQuery(""); }}
                        className="text-stone-400 hover:text-stone-600 text-xs border border-stone-200 rounded-lg px-3 py-2">
                        Change
                      </button>
                    </div>
                  )}
                </div>

                {/* Live price card */}
                {stockInfo && (
                  <div className="bg-white border border-stone-200 rounded-xl p-3 flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-stone-800">{stockInfo.name}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{stockSymbol} · NSE closing price</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-lg font-extrabold text-stone-900">₹{stockInfo.price.toLocaleString("en-IN")}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${stockInfo.change_pct >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {stockInfo.change_pct >= 0 ? "▲" : "▼"} {Math.abs(stockInfo.change_pct)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Avg Buy Price + Qty — always visible once type=stocks */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-stone-600">Avg. Buy Price (₹)</Label>
                    <Input type="number" value={avgBuyPrice} onChange={e => setAvgBuyPrice(e.target.value)}
                      placeholder={stockInfo ? `e.g. ${stockInfo.price.toFixed(0)}` : "e.g. 250"} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-stone-600">Qty (shares)</Label>
                    <Input type="number" value={stockQty} onChange={e => setStockQty(e.target.value)}
                      placeholder="e.g. 10" className="mt-1" />
                  </div>
                </div>

                {/* P&L summary */}
                {(() => {
                  const qty = parseFloat(stockQty) || 0;
                  const avg = parseFloat(avgBuyPrice) || 0;
                  if (!stockInfo || qty <= 0 || avg <= 0) return null;
                  const cur = qty * stockInfo.price;
                  const inv = qty * avg;
                  const pnl = cur - inv;
                  const pct = (pnl / inv) * 100;
                  const gain = pnl >= 0;
                  return (
                    <div className={`rounded-xl border p-3 grid grid-cols-3 divide-x text-center ${gain ? "bg-emerald-50 border-emerald-200 divide-emerald-200" : "bg-red-50 border-red-200 divide-red-200"}`}>
                      {[["Invested", `₹${inv.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`],
                        ["Current",  `₹${cur.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`],
                        ["P&L",      `${gain ? "+" : ""}₹${Math.abs(pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })} (${gain ? "+" : ""}${pct.toFixed(1)}%)`]
                      ].map(([label, val]) => (
                        <div key={label} className="px-2">
                          <p className="text-[10px] text-stone-500 mb-0.5">{label}</p>
                          <p className={`text-xs font-bold ${label === "P&L" ? (gain ? "text-emerald-700" : "text-red-600") : "text-stone-800"}`}>{val}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div>
                <Label className="text-sm font-medium text-stone-700">Name</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder={
                    form.type === "gold"             ? "e.g., Digital Gold — Zerodha, SGB 2024" :
                    form.type === "ppf"              ? "e.g., SBI PPF Account" :
                    form.type === "nps"              ? "e.g., NPS Tier 1 — HDFC Pension" :
                    form.type === "fd"               ? "e.g., HDFC Bank FD — 7.1% p.a." :
                    form.type === "rd"               ? "e.g., SBI RD — ₹5,000/mo · 12 months" :
                    form.type === "real_estate"      ? "e.g., 2BHK Flat, Bengaluru" :
                    form.type === "health_insurance" ? "e.g., Star Health Family Floater" :
                    form.type === "term_insurance"   ? "e.g., LIC Tech Term, HDFC Click2Protect" :
                    "Give it a name you'll recognise"
                  }
                  required
                  className="mt-1.5"
                />
              </div>
            )}

            {form.type && !isProtection(form.type) && (
              <>
                <div className={`grid gap-3 ${(form.type === "mutual_funds" || form.type === "stocks") ? "grid-cols-1" : "grid-cols-2"}`}>
                  <div>
                    <Label className="text-sm font-medium text-stone-700">Amount Invested (₹)</Label>
                    <Input type="number" value={form.invested_amount} onChange={e => setForm(p => ({ ...p, invested_amount: e.target.value }))} placeholder="e.g. 50000" required className="mt-1.5" />
                  </div>
                  {/* Current value handled inside MF / stock cards for those types */}
                  {form.type !== "mutual_funds" && form.type !== "stocks" && (
                    <div>
                      <Label className="text-sm font-medium text-stone-700">Current Value (₹)</Label>
                      <Input type="number" value={form.current_value} onChange={e => setForm(p => ({ ...p, current_value: e.target.value }))} placeholder="e.g. 56500" required className="mt-1.5" />
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium text-stone-700">Goal Amount (₹) <span className="text-stone-400 font-normal">— optional</span></Label>
                  <Input type="number" value={form.goal_amount} onChange={e => setForm(p => ({ ...p, goal_amount: e.target.value }))} placeholder="e.g. 5,00,000 — shows a progress bar" className="mt-1.5" />
                </div>
              </>
            )}

            {isProtection(form.type) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-stone-700">Annual Premium (₹)</Label>
                  <Input type="number" value={form.invested_amount} onChange={e => setForm(p => ({ ...p, invested_amount: e.target.value }))} placeholder="e.g. 12000" required className="mt-1.5" />
                </div>
                <div>
                  <Label className="text-sm font-medium text-stone-700">
                    {form.type === "health_insurance" ? "Sum Insured (Cover)" : "Sum Assured (Cover)"}
                  </Label>
                  <Input type="number" value={form.current_value} onChange={e => setForm(p => ({ ...p, current_value: e.target.value }))} placeholder="e.g. 1000000 (₹10L)" required className="mt-1.5" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-stone-700">Start Date <span className="text-stone-400 font-normal">— optional</span></Label>
                <DatePicker value={form.start_date} onChange={v => setForm(p => ({ ...p, start_date: v }))} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium text-stone-700">
                  {isProtection(form.type) ? "Renewal Date" : "Maturity Date"}
                  <span className="text-stone-400 font-normal"> — optional</span>
                </Label>
                <DatePicker value={form.maturity_date} onChange={v => setForm(p => ({ ...p, maturity_date: v }))} className="mt-1.5" />
              </div>
            </div>

            {/* Link to Savings Goal — only for FD/RD */}
            {(form.type === "fd" || form.type === "rd") && savingsGoals.length > 0 && (
              <div>
                <Label className="text-sm font-medium text-stone-700">Link to Savings Goal <span className="text-stone-400 font-normal">— auto-tracks progress</span></Label>
                <Select value={form.savings_goal_id || "__none__"} onValueChange={v => setForm(p => ({ ...p, savings_goal_id: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="No goal linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No goal linked</SelectItem>
                    {savingsGoals.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} — ₹{Math.round(g.current_amount).toLocaleString("en-IN")} / ₹{Math.round(g.target_amount).toLocaleString("en-IN")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-stone-400 mt-1">When you update this FD/RD's value, the linked goal's progress will auto-update.</p>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-stone-700">Notes <span className="text-stone-400 font-normal">— optional</span></Label>
              <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. joint account, folio number, agent name…" className="mt-1.5" />
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={submitting || !form.type} className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600">
                Add to Portfolio
              </Button>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Update — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-stone-400 -mt-1">
            {isProtection(editTarget?.type)
              ? "Update your annual premium or coverage amount if your policy was renewed."
              : editTarget?.type === "mutual_funds"
                ? "Enter your current portfolio value from Groww / CAMS and total amount invested."
                : editTarget?.type === "stocks"
                  ? "Enter shares held and today's total value from Groww / Zerodha → Holdings."
                  : "Update the current market value — keeps your portfolio accurate."}
          </p>
          <form onSubmit={handleEdit} className="space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-stone-700">
                  {isProtection(editTarget?.type) ? "Annual Premium (₹)" : "Amount Invested (₹)"}
                </Label>
                <Input type="number" value={editForm.invested_amount}
                  onChange={e => setEditForm(p => ({ ...p, invested_amount: e.target.value }))} required className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium text-stone-700">
                  {isProtection(editTarget?.type) ? "Sum Insured / Assured (₹)"
                    : editTarget?.type === "mutual_funds" ? "Current Value (₹) — from Groww"
                    : editTarget?.type === "stocks" ? "Current Value (₹) — from Holdings"
                    : "Current Value (₹)"}
                </Label>
                <Input type="number" value={editForm.current_value}
                  onChange={e => setEditForm(p => ({ ...p, current_value: e.target.value }))} required className="mt-1.5" />
              </div>
            </div>
            {/* MF: monthly SIP */}
            {editTarget?.type === "mutual_funds" && (
              <div>
                <Label className="text-sm font-medium text-stone-700">Monthly SIP (₹) <span className="text-stone-400 font-normal">— optional</span></Label>
                <Input type="number" value={editForm.monthly_sip}
                  onChange={e => setEditForm(p => ({ ...p, monthly_sip: e.target.value }))}
                  placeholder="e.g. 5000" className="mt-1.5" />
              </div>
            )}
            {/* Stocks: shares held */}
            {editTarget?.type === "stocks" && (
              <div>
                <Label className="text-sm font-medium text-stone-700">Shares held <span className="text-stone-400 font-normal">— for auto price refresh</span></Label>
                <Input type="number" value={editForm.shares_held}
                  onChange={e => setEditForm(p => ({ ...p, shares_held: e.target.value }))}
                  placeholder="e.g. 30" className="mt-1.5" />
              </div>
            )}
            <div>
              <Label className="text-sm font-medium text-stone-700">Notes</Label>
              <Input value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes" className="mt-1.5" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={submitting} className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600">
                <RefreshCw size={13} className="mr-1.5" /> Save Update
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Remove from Portfolio?</DialogTitle></DialogHeader>
          <p className="text-stone-500 text-sm mt-2">
            This will remove <span className="font-semibold text-stone-700">{deleteTarget?.name}</span> from your tracked portfolio. Your actual investment is unaffected.
          </p>
          <div className="flex gap-3 mt-5">
            <Button onClick={handleDelete} disabled={submitting} className="flex-1 bg-red-500 hover:bg-red-600 text-white">
              <Trash2 size={13} className="mr-1.5" /> Yes, Remove
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InvestmentTracker;
