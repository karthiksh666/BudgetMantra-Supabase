import { useState, useCallback, useEffect } from "react";
import Navigation from "@/components/Navigation";
import PageLoader from "@/components/PageLoader";
import { useStaleData } from "@/hooks/useStaleData";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil,
  IndianRupee, Wallet, Briefcase, Home, Coins, ArrowDownLeft, BarChart2,
  TrendingUp, Repeat2, CheckCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import YearPicker from "@/components/YearPicker";

const fmtAmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const SOURCE_TYPES = [
  { key: "salary",    label: "Salary",         icon: Briefcase,      color: "bg-blue-100 text-blue-700",      dot: "bg-blue-400"    },
  { key: "freelance", label: "Freelance",       icon: Wallet,         color: "bg-violet-100 text-violet-700",  dot: "bg-violet-400"  },
  { key: "rental",    label: "Rent Received",   icon: Home,           color: "bg-amber-100 text-amber-700",    dot: "bg-amber-400"   },
  { key: "business",  label: "Business",        icon: BarChart2,      color: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-400" },
  { key: "dividend",  label: "Dividend / Int.", icon: Coins,          color: "bg-yellow-100 text-yellow-700",  dot: "bg-yellow-400"  },
  { key: "other",     label: "Other",           icon: ArrowDownLeft,  color: "bg-stone-100 text-stone-600",    dot: "bg-stone-400"   },
];

const getSrcMeta = (key) => SOURCE_TYPES.find(s => s.key === key) || SOURCE_TYPES[SOURCE_TYPES.length - 1];

const EMPTY_FORM = {
  amount: "",
  source_type: "salary",
  source: "",
  description: "",
  date: new Date().toISOString().slice(0, 10),
  is_recurring: false,
};

// For a given YYYY-MM-DD and salary_day, return the YYYY-MM label of the cycle
// the entry belongs to. Cycle runs salary_day..(salary_day-1 next month); we
// label it by the month in which the cycle ENDS (where most days fall).
function cycleMonthKey(isoDate, salaryDay) {
  if (!isoDate) return "Unknown";
  if (!salaryDay) return isoDate.slice(0, 7);
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const sd = Math.max(1, Math.min(28, Number(salaryDay)));
  // If day >= salary_day → cycle starts this month, ends next month → label = next month
  // Else → cycle started last month, ends this month → label = this month
  let ly = y, lm = m;
  if (d >= sd) {
    lm = m + 1;
    if (lm > 12) { lm = 1; ly = y + 1; }
  }
  return `${ly}-${String(lm).padStart(2, "0")}`;
}

export default function IncomePage() {
  const { token, user } = useAuth();
  const salaryDay = user?.salary_day;
  const headers = { Authorization: `Bearer ${token}` };

  const fetchIncome = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    const [listRes, sumRes] = await Promise.all([
      axios.get(`${API}/income-entries`,               { headers: h }),
      axios.get(`${API}/income-entries/month-summary`, { headers: h }).catch(() => ({ data: null })),
    ]);
    return { entries: listRes.data || [], summary: sumRes.data || null };
  }, [token]);

  const { data: incomeData, loading, reload: loadAll } = useStaleData(
    "bm_income_cache",
    fetchIncome,
    { errorMsg: "Failed to load income data", fallback: { entries: [], summary: null } }
  );

  useEffect(() => {
    const onLog = () => loadAll();
    window.addEventListener("chanakya-logged", onLog);
    return () => window.removeEventListener("chanakya-logged", onLog);
  }, [loadAll]);

  const entries = incomeData?.entries ?? [];
  const summary = incomeData?.summary ?? null;

  const [addOpen,    setAddOpen]    = useState(false);
  const [editEntry,  setEditEntry]  = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [year,       setYear]       = useState(new Date().getFullYear());

  // Auto-switch to the year of the most recent entry if current year has none
  const latestYear = entries.length > 0
    ? Math.max(...entries.map(e => parseInt(e.date?.slice(0, 4) || "0")).filter(Boolean))
    : new Date().getFullYear();
  const effectiveYear = entries.some(e => e.date?.startsWith(String(year))) ? year : latestYear;
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState(new Set());

  // ── Add / Edit ─────────────────────────────────────────────────────────────
  const openAdd = () => { setForm(EMPTY_FORM); setEditEntry(null); setAddOpen(true); };
  const openEdit = (e) => {
    setForm({
      amount:       String(e.amount),
      source_type:  e.source_type,
      source:       e.source || "",
      description:  e.description || "",
      date:         e.date,
      is_recurring: !!e.is_recurring,
    });
    setEditEntry(e);
    setAddOpen(true);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editEntry) {
        await axios.put(`${API}/income-entries/${editEntry.id}`, payload, { headers });
        toast.success("Entry updated");
      } else {
        await axios.post(`${API}/income-entries`, payload, { headers });
        toast.success("Income recorded!");
      }
      setAddOpen(false);
      setForm(EMPTY_FORM);
      setEditEntry(null);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await axios.delete(`${API}/income-entries/${id}`, { headers });
      toast.success("Deleted");
      loadAll();
    } catch { toast.error("Failed to delete"); }
  };

  const handleMultiDelete = async () => {
    if (selected.size === 0) return;
    try {
      await Promise.all([...selected].map(id => axios.delete(`${API}/income-entries/${id}`, { headers })));
      toast.success(`${selected.size} entr${selected.size > 1 ? "ies" : "y"} deleted`);
      setSelectMode(false);
      setSelected(new Set());
      loadAll();
    } catch { toast.error("Failed to delete some entries"); }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalThisMonth = (summary?.total || 0) + (summary?.paycheck_salary || 0);
  const byType         = summary?.by_type || {};

  // Filter entries by selected year (by the cycle-label year, so a Mar 27
  // entry labeled as April stays grouped with the other April cycle rows).
  const yearEntries = entries.filter(e => {
    const key = cycleMonthKey(e.date, salaryDay);
    return key.startsWith(String(effectiveYear));
  });

  // Group entries by salary cycle (labeled by the month the cycle ends in).
  const grouped = yearEntries.reduce((acc, e) => {
    const key = cycleMonthKey(e.date, salaryDay) || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const allVisibleIds = yearEntries.map(e => e.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allVisibleIds));
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg,#f0f7ff 0%,#e8f4fd 50%,#edf6ff 100%)" }}>
      <Navigation />

      {/* Hero */}
      <div className="relative overflow-hidden px-4 pt-8 pb-6 lg:pt-12 lg:pb-8"
        style={{ background: "linear-gradient(135deg,#1d4ed8 0%,#2563eb 40%,#3b82f6 70%,#60a5fa 100%)" }}>
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-8 w-32 h-32 bg-blue-300/20 rounded-full blur-2xl pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10 flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">💰 Income Tracker</p>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white font-['Outfit'] mb-1">
              All money coming in
            </h1>
            <p className="text-blue-100 text-sm max-w-md leading-relaxed">
              Salary, freelance, rent, dividends — log every income source and see your monthly picture.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <YearPicker year={year} onChange={setYear} />
            </div>
            {yearEntries.length > 0 && (
              <button
                onClick={() => { setSelectMode(m => !m); setSelected(new Set()); }}
                className={`hidden sm:inline-flex text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  selectMode
                    ? "bg-white/20 border-white/30 text-white"
                    : "bg-white/10 border-white/20 text-white/80 hover:bg-white/20"
                }`}>
                {selectMode ? "Cancel" : "Select"}
              </button>
            )}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAdd}
                className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-lg shadow-blue-900/20">
                <Plus size={16} className="mr-1.5" /> Add Income
              </Button>
            </DialogTrigger>

            {/* ── Form Dialog ─────────────────────────────────────────────── */}
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>{editEntry ? "Edit Income Entry" : "Record Income"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-2">

                {/* Source type chips */}
                <div>
                  <Label className="text-sm font-medium text-stone-700 mb-2 block">Source type</Label>
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_TYPES.map(({ key, label }) => (
                      <button key={key} type="button"
                        onClick={() => setForm(f => ({ ...f, source_type: key }))}
                        className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                          form.source_type === key
                            ? "bg-blue-100 border-blue-300 text-blue-700"
                            : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-blue-50 hover:border-blue-200"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <Label className="text-sm font-medium text-stone-700">Amount (₹)</Label>
                  <Input
                    type="number" min="0" step="0.01" placeholder="e.g. 85000"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="mt-1" required
                  />
                </div>

                {/* Source name */}
                <div>
                  <Label className="text-sm font-medium text-stone-700">Source name <span className="text-stone-400 font-normal">(optional)</span></Label>
                  <Input
                    placeholder="e.g. Acme Corp, Flat 3B tenant"
                    value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="mt-1"
                  />
                </div>

                {/* Description */}
                <div>
                  <Label className="text-sm font-medium text-stone-700">Note <span className="text-stone-400 font-normal">(optional)</span></Label>
                  <Input
                    placeholder="e.g. March salary, Q1 dividend"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="mt-1"
                  />
                </div>

                {/* Date */}
                <div>
                  <Label className="text-sm font-medium text-stone-700 mb-1 block">Date</Label>
                  <DatePicker
                    value={form.date}
                    onChange={(d) => setForm(f => ({ ...f, date: d }))}
                  />
                </div>

                {/* Recurring toggle */}
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, is_recurring: !f.is_recurring }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors w-full ${
                    form.is_recurring
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-blue-50 hover:border-blue-200"
                  }`}>
                  {form.is_recurring
                    ? <><CheckCircle size={15} className="text-blue-500" /> Recurring monthly income</>
                    : <><Repeat2 size={15} /> Mark as recurring?</>}
                </button>

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setEditEntry(null); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                    {saving ? "Saving…" : editEntry ? "Save Changes" : "Add Income"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 pb-28 lg:pb-10 space-y-6">

        {/* Mobile-only controls row */}
        <div className="flex sm:hidden items-center justify-between">
          <YearPicker year={year} onChange={setYear} />
          {yearEntries.length > 0 && (
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

        {/* This month summary */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
            <TrendingUp size={15} className="text-blue-500" />
            <p className="text-sm font-bold text-stone-700">This month</p>
          </div>
          <div className="p-4">
            <p className="text-3xl font-extrabold text-blue-600 mb-3">{fmtAmt(totalThisMonth)}</p>
            {/* Breakdown chips */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(byType).map(([type, amt]) => {
                const meta = getSrcMeta(type);
                const Icon = meta.icon;
                return (
                  <span key={type} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${meta.color}`}>
                    <Icon size={11} />
                    {meta.label}: {fmtAmt(amt)}
                  </span>
                );
              })}
              {summary?.paycheck_salary > 0 && !byType.salary && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                  <Briefcase size={11} /> Salary (paycheck): {fmtAmt(summary.paycheck_salary)}
                </span>
              )}
              {totalThisMonth === 0 && !loading && (
                <p className="text-sm text-stone-400">No income recorded this month yet.</p>
              )}
            </div>
            {summary?.paycheck_salary > 0 && !byType.salary && (
              <p className="text-xs text-stone-400 mt-2">
                Salary shown from latest paycheck — <Link to="/paycheck" className="text-blue-500 hover:underline font-medium">manage in Paycheck →</Link>
              </p>
            )}
          </div>
        </div>

        {/* All entries */}
        {loading ? (
          <PageLoader message="Loading your income…" tips={["Counting every rupee that came in 💰", "Fetching salary, freelance & more…", "Building your income picture 📊"]} />
        ) : yearEntries.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-stone-200 shadow-sm">
            <p className="text-4xl mb-3">💰</p>
            <p className="font-semibold text-stone-600 mb-1">No income entries for {effectiveYear}</p>
            <p className="text-sm text-stone-400 mb-4">Start by adding your salary, freelance income or any other source.</p>
            <Button onClick={openAdd}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
              <Plus size={15} className="mr-1.5" /> Add first entry
            </Button>
          </div>
        ) : (
          months.map(month => {
            const monthEntries = grouped[month] || [];
            const monthTotal   = monthEntries.reduce((s, e) => s + e.amount, 0);
            const [yr, mo]     = month.split("-");
            const monthLabel   = new Date(parseInt(yr), parseInt(mo) - 1, 1)
              .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
            return (
              <div key={month} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-stone-700">{monthLabel}</p>
                  <p className="text-sm font-bold text-blue-600">{fmtAmt(monthTotal)}</p>
                </div>
                <div className="divide-y divide-stone-50">
                  {monthEntries.map(entry => {
                    const meta = getSrcMeta(entry.source_type);
                    const Icon = meta.icon;
                    return (
                      <div key={entry.id}
                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                          selectMode && selected.has(entry.id)
                            ? "bg-blue-50"
                            : "hover:bg-stone-50"
                        }`}
                        onClick={selectMode ? () => toggleSelect(entry.id) : undefined}>
                        {selectMode && (
                          <input
                            type="checkbox"
                            checked={selected.has(entry.id)}
                            onChange={() => toggleSelect(entry.id)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 accent-blue-500 shrink-0 cursor-pointer"
                          />
                        )}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-800 truncate">
                            {entry.source || meta.label}
                            {entry.is_recurring && (
                              <span className="ml-1.5 text-[9px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase">recurring</span>
                            )}
                          </p>
                          <p className="text-xs text-stone-400 truncate">
                            {entry.description && `${entry.description} · `}
                            {new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-blue-700 shrink-0">{fmtAmt(entry.amount)}</p>
                        {!selectMode && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEdit(entry)}
                              className="p-1.5 rounded-lg text-stone-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDelete(entry.id)}
                              className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* Link to Paycheck */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-800">Track salary slips & job history</p>
            <p className="text-xs text-blue-500">Detailed paycheck breakdown with deductions, PF, tax.</p>
          </div>
          <Link to="/paycheck"
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shrink-0">
            <IndianRupee size={13} /> Paycheck →
          </Link>
        </div>

      </div>

      {/* Multi-select action bar */}
      {selectMode && (
        <div className="fixed bottom-20 lg:bottom-6 left-0 right-0 lg:left-64 z-50 flex justify-center px-4">
          <div className="bg-stone-900 text-white rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-blue-400 cursor-pointer"
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
}
