import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import PageLoader from "@/components/PageLoader";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import YearPicker from "@/components/YearPicker";

import { toast } from "sonner";
import {
  Plus, Trash2, Receipt, ChevronLeft, ChevronRight,
  TrendingDown, TrendingUp, PiggyBank,
  RefreshCw, Pencil, Pause, Play, X, CheckCircle,
  IndianRupee, Calendar, RotateCcw, Repeat2, AlertTriangle, Bell,
} from "lucide-react";
import ResetDataButton from "@/components/ResetDataButton";
import { useAuth } from "@/context/AuthContext";
import { useStaleData } from "@/hooks/useStaleData";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtAmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const groupByDate = (txns) => {
  const today     = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const groups    = {};
  txns.forEach((t) => {
    const label =
      t.date === today ? "Today"
      : t.date === yesterday ? "Yesterday"
      : new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  });
  return groups;
};

function nextDueDate(rec) {
  const today = new Date();
  try {
    if (rec.frequency === "monthly") {
      const d = new Date(today.getFullYear(), today.getMonth(), rec.day_of_month);
      if (d <= today) d.setMonth(d.getMonth() + 1);
      return d.toISOString().split("T")[0];
    }
    if (rec.frequency === "yearly") {
      const sd = new Date(rec.start_date);
      const d  = new Date(today.getFullYear(), sd.getMonth(), sd.getDate());
      if (d <= today) d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().split("T")[0];
    }
    if (rec.frequency === "weekly") {
      const sd       = new Date(rec.start_date);
      const daysSince = Math.floor((today - sd) / 86400000);
      const daysUntil = 7 - (daysSince % 7);
      const d         = new Date(today);
      d.setDate(d.getDate() + (daysUntil === 7 ? 0 : daysUntil));
      return d.toISOString().split("T")[0];
    }
  } catch { return "—"; }
  return "—";
}

function daysUntil(dateStr) {
  if (!dateStr || dateStr === "—") return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

const FREQ_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly",  label: "Weekly"  },
  { value: "yearly",  label: "Yearly"  },
];
const FREQ_COLORS = {
  monthly: "bg-blue-100 text-blue-700",
  weekly:  "bg-violet-100 text-violet-700",
  yearly:  "bg-amber-100 text-amber-700",
};
const REC_EMOJIS = ["🏠","💡","💧","📱","🌐","🚗","🎓","🏥","🛒","📺","🎵","🍔","✈️","💳","🔄"];
const EXPENSE_TEMPLATES = [
  "Food & Dining","Transport","Groceries","Rent","Bills & Utilities",
  "Entertainment","Healthcare","Shopping","Personal Care","Education","Travel","Miscellaneous",
];

const Skel = ({ className }) => <div className={`animate-pulse bg-stone-200 rounded-lg ${className}`} />;

// ── Main component ────────────────────────────────────────────────────────────
const BudgetManager = () => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return ["spends","budget"].includes(t) ? t : "spends";
  });

  const fetchBudget = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    const [catRes, txnRes] = await Promise.all([
      axios.get(`${API}/categories`,   { headers: h }),
      axios.get(`${API}/transactions`, { headers: h }),
    ]);
    return { categories: catRes.data, transactions: txnRes.data };
  }, [token]);

  const { data: budgetData, loading, reload: fetchAll } = useStaleData(
    "bm_budget_cache",
    fetchBudget,
    { errorMsg: "Failed to load data", fallback: { categories: [], transactions: [] } }
  );

  // Refresh when Chanakya logs a transaction via chat
  useEffect(() => {
    const onLog = () => fetchAll();
    window.addEventListener("chanakya-logged", onLog);
    return () => window.removeEventListener("chanakya-logged", onLog);
  }, [fetchAll]);

  const categories   = budgetData?.categories   ?? [];
  const transactions = budgetData?.transactions ?? [];

  // ── Budget Alerts ──────────────────────────────────────────────────────────
  const [alerts, setAlerts]           = useState([]);
  const [alertsDismissed, setAlertsDismissed] = useState(false);

  useEffect(() => {
    axios.get(`${API}/budget-alerts`, { headers })
      .then(r => setAlerts(r.data || []))
      .catch(() => {});
  }, [budgetData]); // re-check whenever budget data refreshes

  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bm-page-bg-budget flex items-center justify-center">
        <PageLoader message="Loading your expenses…" tips={["Fetching transactions","Checking budgets","Loading recurring bills"]} />
      </div>
    </>
  );

  const expenseCats = categories.filter((c) => c.type === "expense");

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bm-page-bg-budget">
        <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">

          <div className="mb-5">
            <h1 className="text-2xl font-bold text-stone-900 font-['Outfit']">Expenses</h1>
            <p className="text-stone-400 text-sm mt-0.5">Log transactions · Set monthly budgets · Track recurring bills</p>
          </div>

          {/* ── Budget Alerts Banner ── */}
          {!alertsDismissed && alerts.length > 0 && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Bell size={16} className="text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-700 text-sm mb-2">
                    {alerts.filter(a => a.status === "exceeded").length > 0
                      ? `⚠ ${alerts.filter(a => a.status === "exceeded").length} budget${alerts.filter(a => a.status === "exceeded").length > 1 ? "s" : ""} exceeded this month`
                      : `⚠ ${alerts.length} budget${alerts.length > 1 ? "s" : ""} near the limit`}
                  </p>
                  <div className="space-y-1.5">
                    {alerts.slice(0, 4).map(a => (
                      <div key={a.category_id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-red-700 truncate">{a.category_name}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 shrink-0 ${a.status === "exceeded" ? "bg-red-500 text-white" : "bg-amber-100 text-amber-700"}`}>
                              {a.pct}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-red-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${a.status === "exceeded" ? "bg-red-500" : "bg-amber-400"}`}
                              style={{ width: `${Math.min(100, a.pct)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-red-500 mt-0.5">
                            {fmtAmt(a.spent)} spent of {fmtAmt(a.budget)} budget
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {alerts.length > 4 && (
                    <p className="text-xs text-red-500 mt-1.5">+{alerts.length - 4} more categories over limit</p>
                  )}
                </div>
                <button onClick={() => setAlertsDismissed(true)} className="text-red-400 hover:text-red-600 shrink-0">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex gap-1 mb-6 bg-stone-100 p-1 rounded-2xl">
            {[
              { key: "budget",    label: "Budget"       },
              { key: "spends",    label: "Transactions" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                  tab === key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "spends" && <SpendsTab    transactions={transactions} categories={expenseCats} headers={headers} onRefresh={fetchAll} />}
          {tab === "budget" && <BudgetTab    expenseCats={expenseCats} transactions={transactions} onRefresh={fetchAll} />}

        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — SPENDS
// ═══════════════════════════════════════════════════════════════════════════════
const EMPTY_FORM = {
  category_id: "", amount: "", description: "",
  date: new Date().toISOString().split("T")[0],
  // recurring fields
  is_recurring: false, frequency: "monthly", day_of_month: new Date().getDate(),
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const SpendsTab = ({ transactions, categories, headers, onRefresh }) => {
  const now = new Date();
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12, 0 = All
  const currentYear = now.getFullYear();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const monthPrefix = selectedMonth === 0
    ? String(selectedYear)
    : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  const yearExpenses = transactions.filter(
    (t) => t.type === "expense" && t.date?.startsWith(monthPrefix)
  );
  const totalSpent   = yearExpenses.reduce((s, t) => s + t.amount, 0);
  const largestSpend = yearExpenses.length ? Math.max(...yearExpenses.map((t) => t.amount)) : 0;
  const groups       = groupByDate(yearExpenses);

  // Category-wise breakdown for pie chart
  const PIE_COLORS = ["#8b5cf6","#f97316","#10b981","#3b82f6","#f59e0b","#ef4444","#ec4899","#14b8a6","#6366f1","#84cc16"];
  const catMap = {};
  yearExpenses.forEach((t) => {
    const name = t.category_name || "Other";
    catMap[name] = (catMap[name] || 0) + t.amount;
  });
  const pieData = Object.entries(catMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.category_id) { toast.error("Please select a category"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("Enter a valid amount"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      // Always create the transaction
      await axios.post(`${API}/transactions`, {
        category_id:  form.category_id,
        amount:       parseFloat(form.amount),
        description:  form.description,
        date:         form.date,
      });

      // If marked recurring, also create a recurring expense rule
      if (form.is_recurring) {
        const cat = categories.find((c) => c.id === form.category_id);
        await axios.post(`${API}/recurring-expenses`, {
          name:         form.description || cat?.name || "Recurring expense",
          amount:       parseFloat(form.amount),
          category_id:  form.category_id,
          category_name: cat?.name || "",
          description:  form.description,
          frequency:    form.frequency,
          day_of_month: parseInt(form.day_of_month),
          start_date:   form.date,
          emoji:        "🔄",
        }, { headers });
        toast.success("Expense added and set as recurring!");
      } else {
        toast.success("Expense added!");
      }

      setDialogOpen(false);
      setForm(EMPTY_FORM);
      onRefresh();
    } catch {
      toast.error("Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/transactions/${id}`);
      toast.success("Deleted");
      onRefresh();
    } catch { toast.error("Failed to delete"); }
  };

  const handleMultiDelete = async () => {
    if (selected.size === 0) return;
    try {
      await Promise.all([...selected].map(id => axios.delete(`${API}/transactions/${id}`, { headers })));
      toast.success(`${selected.size} transaction${selected.size > 1 ? "s" : ""} deleted`);
      setSelectMode(false);
      setSelected(new Set());
      onRefresh();
    } catch { toast.error("Failed to delete some transactions"); }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleIds = yearExpenses.map(t => t.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allVisibleIds));
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year + Month pickers — desktop only */}
          <div className="hidden sm:flex items-center gap-1 bg-stone-100 rounded-xl p-1">
            <button onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1.5 rounded-lg hover:bg-white transition-colors">
              <ChevronLeft size={14} className="text-stone-500" />
            </button>
            <span className="font-bold text-sm text-stone-700 w-10 text-center">{selectedYear}</span>
            <button onClick={() => setSelectedYear((y) => y + 1)} disabled={selectedYear >= currentYear}
              className="p-1.5 rounded-lg hover:bg-white transition-colors disabled:opacity-30">
              <ChevronRight size={14} className="text-stone-500" />
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-1 bg-stone-100 rounded-xl p-1">
            <button onClick={() => setSelectedMonth(m => m === 0 ? 12 : m - 1)}
              className="p-1.5 rounded-lg hover:bg-white transition-colors">
              <ChevronLeft size={14} className="text-stone-500" />
            </button>
            <span className="font-bold text-sm text-stone-700 w-8 text-center">
              {selectedMonth === 0 ? "All" : MONTHS[selectedMonth - 1]}
            </span>
            <button onClick={() => setSelectedMonth(m => m === 12 ? 0 : m + 1)}
              className="p-1.5 rounded-lg hover:bg-white transition-colors">
              <ChevronRight size={14} className="text-stone-500" />
            </button>
          </div>
          {/* Select — desktop only */}
          {yearExpenses.length > 0 && (
            <button
              onClick={() => { setSelectMode(m => !m); setSelected(new Set()); }}
              className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                selectMode
                  ? "bg-violet-100 border-violet-300 text-violet-700"
                  : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100"
              }`}>
              <Trash2 size={13} /><span>{selectMode ? "Cancel" : "Select"}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block"><ResetDataButton feature="transactions" label="transactions" onReset={onRefresh} /></div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 shadow-sm shadow-violet-300/40">
                <Plus size={16} className="mr-1.5" /> Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 mt-2">

                {/* Description first — drives intent */}
                <div>
                  <Label className="text-sm font-medium text-stone-700">What did you spend on?</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="e.g. Swiggy dinner, Petrol, Groceries"
                    required className="mt-1.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-stone-700">Amount (₹)</Label>
                    <Input
                      type="number" value={form.amount}
                      onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                      placeholder="500" required className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-stone-700">Date</Label>
                    <div className="mt-1.5">
                      <DatePicker value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} placeholder="Date" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-stone-700">Category</Label>
                  {categories.length === 0 ? (
                    <p className="text-xs text-amber-600 mt-1.5 bg-amber-50 p-3 rounded-xl">
                      No expense categories yet — go to the <strong>Budget</strong> tab to add some first.
                    </p>
                  ) : (
                    <Select value={form.category_id} onValueChange={(v) => setForm((p) => ({ ...p, category_id: v }))}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Pick a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* ── Recurring toggle ── */}
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, is_recurring: !p.is_recurring }))}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    form.is_recurring
                      ? "border-violet-300 bg-violet-50"
                      : "border-stone-200 bg-stone-50 hover:border-stone-300"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    form.is_recurring ? "bg-violet-500" : "bg-stone-200"
                  }`}>
                    <Repeat2 size={16} className={form.is_recurring ? "text-white" : "text-stone-400"} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${form.is_recurring ? "text-violet-700" : "text-stone-600"}`}>
                      This repeats
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {form.is_recurring ? "Will auto-add every cycle" : "Tap to mark as a recurring expense"}
                    </p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-all shrink-0 ${
                    form.is_recurring ? "bg-violet-500" : "bg-stone-300"
                  }`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      form.is_recurring ? "translate-x-5" : "translate-x-0"
                    }`} />
                  </div>
                </button>

                {/* Recurring options — shown inline when toggled */}
                {form.is_recurring && (
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider">Recurring settings</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-stone-600">Repeats</Label>
                        <select
                          value={form.frequency}
                          onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
                          className="mt-1 w-full h-9 bg-white border border-stone-200 rounded-lg px-2.5 text-sm text-stone-800 outline-none"
                        >
                          {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {form.frequency === "monthly" && (
                        <div>
                          <Label className="text-xs text-stone-600">On day</Label>
                          <Input
                            type="number" min={1} max={28}
                            value={form.day_of_month}
                            onChange={(e) => setForm((p) => ({ ...p, day_of_month: parseInt(e.target.value) || 1 }))}
                            className="mt-1 h-9 bg-white border-stone-200 rounded-lg text-sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button type="submit" disabled={submitting || !form.category_id}
                    className="flex-1 bg-gradient-to-r from-violet-500 to-purple-500">
                    {submitting ? "Adding…" : form.is_recurring ? "Add & Set Recurring" : "Add Expense"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Mobile — combined month+year stepper + Select button */}
      <div className="flex sm:hidden items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-stone-100 rounded-2xl p-1">
          <button
            onClick={() => {
              if (selectedMonth <= 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
              else setSelectedMonth(m => m - 1);
            }}
            className="p-1.5 rounded-xl hover:bg-white transition-colors">
            <ChevronLeft size={14} className="text-stone-500" />
          </button>
          <span className="font-bold text-sm text-stone-700 px-2">
            {MONTHS[selectedMonth - 1]} {selectedYear}
          </span>
          <button
            onClick={() => {
              if (selectedMonth >= 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
              else setSelectedMonth(m => m + 1);
            }}
            className="p-1.5 rounded-xl hover:bg-white transition-colors">
            <ChevronRight size={14} className="text-stone-500" />
          </button>
        </div>
        {yearExpenses.length > 0 && (
          <button
            onClick={() => { setSelectMode(m => !m); setSelected(new Set()); }}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              selectMode
                ? "bg-stone-200 border-stone-300 text-stone-700"
                : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
            }`}>
            <Trash2 size={12} />
            {selectMode ? "Cancel" : "Select"}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="bm-hero rounded-2xl bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 p-5 mb-5 text-white shadow-lg"
        style={{ boxShadow: "0 8px 32px rgba(124,58,237,0.25)" }}>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Spent",   value: fmtAmt(totalSpent),         sub: String(selectedYear) },
            { label: "Transactions",  value: yearExpenses.length,         sub: "recorded" },
            { label: "Largest Spend", value: fmtAmt(largestSpend),        sub: "single spend" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white/15 rounded-xl px-3 py-3 backdrop-blur-sm text-center">
              <p className="text-white font-bold text-base sm:text-lg font-['Outfit'] leading-none">{value}</p>
              <p className="text-white/60 text-[10px] mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Category Breakdown Donut Chart */}
      {pieData.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-5">
          <p className="text-sm font-semibold text-stone-700 mb-4">Spending by Category</p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-40 h-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => fmtAmt(val)}
                    contentStyle={{ borderRadius: "10px", border: "1px solid #e7e5e4", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 w-full space-y-2">
              {pieData.map((entry, i) => {
                const pct = totalSpent > 0 ? Math.round((entry.value / totalSpent) * 100) : 0;
                return (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-stone-600 flex-1 truncate">{entry.name}</span>
                    <span className="text-xs font-semibold text-stone-800">{fmtAmt(entry.value)}</span>
                    <span className="text-[10px] text-stone-400 w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Transaction list */}
      {yearExpenses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center">
          <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Receipt size={22} className="text-violet-300" />
          </div>
          <p className="font-semibold text-stone-600">No expenses yet</p>
          <p className="text-stone-400 text-sm mt-1">Tap "Add Expense" to log your first one</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([dateLabel, txns]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{dateLabel}</span>
                <div className="flex-1 h-px bg-stone-100" />
                <span className="text-xs text-stone-400">
                  {fmtAmt(txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0))} spent
                </span>
              </div>
              <div className="space-y-2">
                {txns.map((txn) => (
                  <div key={txn.id}
                    className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-3 hover:shadow-md transition-shadow ${
                      selectMode && selected.has(txn.id)
                        ? "border-violet-300 bg-violet-50"
                        : "border-stone-100 hover:border-violet-100"
                    }`}
                    onClick={selectMode ? () => toggleSelect(txn.id) : undefined}>
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selected.has(txn.id)}
                        onChange={() => toggleSelect(txn.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 accent-violet-500 shrink-0 cursor-pointer"
                      />
                    )}
                    <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                      <TrendingDown size={17} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-800 text-sm truncate">{txn.description}</p>
                      <p className="text-xs text-stone-400">{txn.category_name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-base font-['Outfit'] text-red-500">
                        -{fmtAmt(txn.amount)}
                      </span>
                      {!selectMode && (
                        <button onClick={() => handleDelete(txn.id)}
                          className="p-1.5 text-stone-200 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Multi-select action bar */}
      {selectMode && (
        <div className="fixed bottom-20 lg:bottom-6 left-0 right-0 lg:left-64 z-50 flex justify-center px-4">
          <div className="bg-stone-900 text-white rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-violet-400 cursor-pointer"
            />
            <span className="text-sm font-semibold">{selected.size} selected</span>
            {selected.size > 0 && (
              <button onClick={handleMultiDelete}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-xl transition-colors">
                Delete
              </button>
            )}
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }}
              className="text-stone-400 hover:text-white text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — BUDGET LIMITS (expense categories only)
// ═══════════════════════════════════════════════════════════════════════════════
const BudgetTab = ({ expenseCats, transactions = [], onRefresh }) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", allocated_amount: "" });
  const [saving, setSaving]         = useState(false);
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12, 0=All
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected]     = useState(new Set());
  const [deleting, setDeleting]     = useState(false);

  const monthPrefix = selectedMonth === 0
    ? String(selectedYear)
    : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  const yearExpenses = transactions.filter(
    (t) => t.type === "expense" && t.date?.startsWith(monthPrefix)
  );

  // Compute per-category spend from transactions filtered by selected month/year
  const catSpent = {};
  yearExpenses.forEach(t => {
    if (t.category_id) catSpent[t.category_id] = (catSpent[t.category_id] || 0) + (t.amount || 0);
  });

  const totalSpent    = yearExpenses.reduce((s, t) => s + (t.amount || 0), 0);
  const totalBudgeted = expenseCats.reduce((s, c) => s + (c.allocated_amount || 0), 0);
  const remaining     = totalBudgeted - totalSpent;
  const overallPct    = totalBudgeted > 0 ? Math.min(100, Math.round((totalSpent / totalBudgeted) * 100)) : 0;

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    toast.loading("Setting up your category…", { id: "cat-add" });
    try {
      await axios.post(`${API}/categories`, {
        name:             form.name,
        type:             "expense",
        allocated_amount: parseFloat(form.allocated_amount),
      });
      toast.success(`"${form.name}" added!`, { id: "cat-add" });
      setDialogOpen(false);
      setForm({ name: "", allocated_amount: "" });
      onRefresh();
    } catch {
      toast.error("Failed to add category", { id: "cat-add" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/categories/${id}`);
      toast.success("Deleted");
      onRefresh();
    } catch { toast.error("Failed to delete"); }
  };

  const handleMultiDelete = async () => {
    if (!selected.size) return;
    setDeleting(true);
    try {
      await Promise.all([...selected].map(id => axios.delete(`${API}/categories/${id}`)));
      toast.success(`Deleted ${selected.size} categor${selected.size > 1 ? 'ies' : 'y'}`);
      setSelected(new Set()); setSelectMode(false); onRefresh();
    } catch { toast.error("Some deletes failed"); }
    finally { setDeleting(false); }
  };

  return (
    <div>
      {/* Header row 1: title + actions */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm text-stone-500">Monthly budget per category</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-colors ${selectMode ? 'bg-red-50 text-red-600 border-red-200' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'}`}>
            <Trash2 size={13} /><span className="hidden sm:inline">{selectMode ? 'Cancel' : 'Select'}</span>
          </button>
          {/* Month + Year pickers — desktop inline */}
          <div className="hidden sm:flex items-center gap-1 bg-stone-100 rounded-xl p-1">
            <button onClick={() => setSelectedMonth(m => m === 0 ? 12 : m - 1)}
              className="p-1.5 rounded-lg hover:bg-white transition-colors">
              <ChevronLeft size={14} className="text-stone-500" />
            </button>
            <span className="font-bold text-sm text-stone-700 w-8 text-center">
              {selectedMonth === 0 ? "All" : MONTHS[selectedMonth - 1]}
            </span>
            <button onClick={() => setSelectedMonth(m => m === 12 ? 0 : m + 1)}
              className="p-1.5 rounded-lg hover:bg-white transition-colors">
              <ChevronRight size={14} className="text-stone-500" />
            </button>
          </div>
          <div className="hidden sm:block"><YearPicker year={selectedYear} onChange={setSelectedYear} /></div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-sm shadow-emerald-300/40">
                <Plus size={16} className="mr-1.5" /> Add Budget
              </Button>
            </DialogTrigger>
          <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader><DialogTitle>Add Budget Limit</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-2">
              <div>
                <Label className="text-sm font-medium text-stone-700">Category</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Groceries, Transport" required className="mt-1.5" />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {EXPENSE_TEMPLATES.map((t) => (
                    <button key={t} type="button" onClick={() => setForm((p) => ({ ...p, name: t }))}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        form.name === t
                          ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                          : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                      }`}>{t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-stone-700">Monthly limit (₹)</Label>
                <Input type="number" value={form.allocated_amount}
                  onChange={(e) => setForm((p) => ({ ...p, allocated_amount: e.target.value }))}
                  placeholder="e.g. 5000" required className="mt-1.5" />
                <p className="text-xs text-stone-400 mt-1">
                  You'll get a warning when spending approaches this limit.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={saving} className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600">
                  {saving ? "Setting up…" : "Set Limit"}
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Combined month+year stepper — mobile only */}
      <div className="flex sm:hidden items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-stone-100 rounded-2xl p-1">
          <button
            onClick={() => {
              if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
              else setSelectedMonth(m => m - 1);
            }}
            className="p-1.5 rounded-xl hover:bg-white transition-colors">
            <ChevronLeft size={15} className="text-stone-500" />
          </button>
          <span className="font-bold text-sm text-stone-700 px-2">
            {MONTHS[selectedMonth - 1]} {selectedYear}
          </span>
          <button
            onClick={() => {
              if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
              else setSelectedMonth(m => m + 1);
            }}
            disabled={selectedMonth === now.getMonth() + 1 && selectedYear === currentYear}
            className="p-1.5 rounded-xl hover:bg-white transition-colors disabled:opacity-30">
            <ChevronRight size={15} className="text-stone-500" />
          </button>
        </div>
        {yearExpenses.length > 0 && (
          <button
            onClick={() => { setSelectMode(m => !m); setSelected(new Set()); }}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-semibold transition-colors ${
              selectMode ? "bg-red-50 text-red-600 border border-red-200" : "bg-stone-100 text-stone-500"
            }`}>
            <Trash2 size={13} />{selectMode ? "Cancel" : "Select"}
          </button>
        )}
      </div>

      {/* Summary hero */}
      {totalBudgeted > 0 && (
        <div className="bm-hero rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 p-5 mb-5 text-white shadow-lg"
          style={{ boxShadow: "0 8px 32px rgba(5,150,105,0.3)" }}>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
            {[
              { label: "Total Budgeted", value: fmtAmt(totalBudgeted) },
              { label: `Expenses · ${selectedMonth === 0 ? selectedYear : MONTHS[selectedMonth-1]}`, value: fmtAmt(totalSpent) },
              { label: remaining >= 0 ? "Balance Left" : "Over budget",
                value: fmtAmt(Math.abs(remaining)), red: remaining < 0 },
            ].map(({ label, value, red }) => (
              <div key={label} className="bg-white/15 rounded-xl px-3 py-3">
                <p className={`font-bold text-sm sm:text-lg font-['Outfit'] leading-none ${red ? "text-red-200" : "text-white"}`}>{value}</p>
                <p className="text-white/60 text-[11px] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-xs text-white/70 mb-1.5">
              <span>Used {fmtAmt(totalSpent)} of {fmtAmt(totalBudgeted)} budget</span>
              <span>{overallPct}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${overallPct >= 100 ? "bg-red-300" : "bg-white"}`}
                style={{ width: `${overallPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Category list */}
      {expenseCats.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <PiggyBank size={22} className="text-emerald-300" />
          </div>
          <p className="font-semibold text-stone-600">No budget limits yet</p>
          <p className="text-stone-400 text-sm mt-1 max-w-xs mx-auto">
            Add categories like Food, Transport, Rent — then set a monthly limit so you know when you're overspending.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {expenseCats.map((cat) => {
            const spent     = catSpent[cat.id] || 0;
            const pct       = cat.allocated_amount > 0
              ? Math.min(100, Math.round((spent / cat.allocated_amount) * 100)) : 0;
            const isOver    = spent > cat.allocated_amount && cat.allocated_amount > 0;
            const remaining = cat.allocated_amount - spent;
            const isChecked = selected.has(cat.id);
            return (
              <div key={cat.id}
                onClick={() => selectMode && setSelected(s => { const n = new Set(s); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })}
                className={`bg-white rounded-xl border shadow-sm p-4 transition-all ${selectMode ? 'cursor-pointer' : ''} ${isChecked ? 'border-red-400 bg-red-50/30' : isOver ? "border-red-200" : "border-stone-100"}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {selectMode && (
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isChecked ? 'bg-red-500 border-red-500' : 'border-stone-300'}`}>
                        {isChecked && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-800">{cat.name}</span>
                        {isOver && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">Over limit</span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {cat.allocated_amount > 0
                          ? `${fmtAmt(spent)} spent · ${remaining >= 0 ? `${fmtAmt(remaining)} left` : `${fmtAmt(Math.abs(remaining))} over`}`
                          : `${fmtAmt(spent)} spent · no limit set`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-lg font-['Outfit'] text-stone-800">
                      {cat.allocated_amount > 0 ? fmtAmt(cat.allocated_amount) : "—"}
                    </span>
                    {!selectMode && <button onClick={() => handleDelete(cat.id)}
                      className="p-1.5 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={15} />
                    </button>}
                  </div>
                </div>
                {cat.allocated_amount > 0 && (
                  <div>
                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${
                        isOver ? "bg-gradient-to-r from-red-400 to-red-500" : pct >= 80 ? "bg-gradient-to-r from-amber-400 to-orange-400" : "bg-gradient-to-r from-emerald-400 to-teal-400"
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-stone-400 mt-1">{pct}% of budget used</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Multi-delete action bar */}
      {selectMode && (
        <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 z-50 flex items-center justify-between bg-stone-900 text-white rounded-2xl px-4 py-3 shadow-xl max-w-2xl mx-auto">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }}
              className="px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
              Cancel
            </button>
            <button onClick={handleMultiDelete} disabled={!selected.size || deleting}
              className="px-3 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-1.5">
              <Trash2 size={13} /> {deleting ? 'Deleting…' : `Delete ${selected.size || ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


export default BudgetManager;
