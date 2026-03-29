import { useState, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import Navigation from "@/components/Navigation";
import { useStaleData } from "@/hooks/useStaleData";
import { DatePicker } from "@/components/DatePicker";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, RefreshCw, AlertCircle, X, Check,
  Tv, Music, Gamepad2, Newspaper, Dumbbell, Laptop, Package,
  IndianRupee, Calendar, TrendingDown, Bell
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: "OTT",      label: "OTT / Streaming", emoji: "📺", color: "bg-red-50 text-red-600 border-red-100",     icon: Tv },
  { key: "Music",    label: "Music",            emoji: "🎵", color: "bg-purple-50 text-purple-600 border-purple-100", icon: Music },
  { key: "Software", label: "Software / Apps",  emoji: "💻", color: "bg-blue-50 text-blue-600 border-blue-100",  icon: Laptop },
  { key: "Gaming",   label: "Gaming",           emoji: "🎮", color: "bg-emerald-50 text-emerald-600 border-emerald-100", icon: Gamepad2 },
  { key: "News",     label: "News / Magazine",  emoji: "📰", color: "bg-amber-50 text-amber-600 border-amber-100", icon: Newspaper },
  { key: "Fitness",  label: "Fitness / Health", emoji: "💪", color: "bg-orange-50 text-orange-600 border-orange-100", icon: Dumbbell },
  { key: "Other",    label: "Other",            emoji: "📦", color: "bg-stone-50 text-stone-600 border-stone-100", icon: Package },
];

const CYCLES = [
  { key: "weekly",    label: "Weekly"    },
  { key: "monthly",   label: "Monthly"   },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly",    label: "Yearly"    },
];

const POPULAR = [
  { name: "Netflix",         logo_emoji: "🎬", category: "OTT",      amount: 649,  billing_cycle: "monthly",  color: "#e50914" },
  { name: "Amazon Prime",    logo_emoji: "📦", category: "OTT",      amount: 299,  billing_cycle: "monthly",  color: "#00a8e0" },
  { name: "Hotstar",         logo_emoji: "⭐", category: "OTT",      amount: 299,  billing_cycle: "monthly",  color: "#1f80e0" },
  { name: "Spotify",         logo_emoji: "🎵", category: "Music",    amount: 119,  billing_cycle: "monthly",  color: "#1db954" },
  { name: "YouTube Premium", logo_emoji: "▶️", category: "OTT",      amount: 139,  billing_cycle: "monthly",  color: "#ff0000" },
  { name: "Apple TV+",       logo_emoji: "🍎", category: "OTT",      amount: 99,   billing_cycle: "monthly",  color: "#555555" },
  { name: "Sony LIV",        logo_emoji: "📺", category: "OTT",      amount: 299,  billing_cycle: "monthly",  color: "#0057a8" },
  { name: "Zee5",            logo_emoji: "🎭", category: "OTT",      amount: 199,  billing_cycle: "monthly",  color: "#6c2dc7" },
  { name: "Xbox Game Pass",  logo_emoji: "🎮", category: "Gaming",   amount: 699,  billing_cycle: "monthly",  color: "#107c10" },
  { name: "PlayStation Plus",logo_emoji: "🎮", category: "Gaming",   amount: 2999, billing_cycle: "yearly",   color: "#003087" },
  { name: "iCloud+",         logo_emoji: "☁️", category: "Software", amount: 75,   billing_cycle: "monthly",  color: "#3478f6" },
  { name: "Google One",      logo_emoji: "🔵", category: "Software", amount: 130,  billing_cycle: "monthly",  color: "#4285f4" },
];

const EMPTY_FORM = {
  name: "", amount: "", billing_cycle: "monthly", category: "OTT",
  next_billing_date: new Date().toISOString().split("T")[0],
  auto_debit: true, notes: "", color: "#f97316", logo_emoji: "📺",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const daysUntil = (dateStr) => {
  const diff = new Date(dateStr) - new Date(new Date().toDateString());
  return Math.ceil(diff / 86400000);
};

const cycleLabel = (cycle, amount) => {
  const map = { weekly: "/ wk", monthly: "/ mo", quarterly: "/ qtr", yearly: "/ yr" };
  return `${fmt(amount)} ${map[cycle] || ""}`;
};

const monthlyEq = (amount, cycle) => {
  if (cycle === "weekly")    return amount * 52 / 12;
  if (cycle === "monthly")   return amount;
  if (cycle === "quarterly") return amount / 3;
  if (cycle === "yearly")    return amount / 12;
  return amount;
};

const catMeta = (key) => CATEGORIES.find(c => c.key === key) || CATEGORIES[6];

// ── Sub Card ──────────────────────────────────────────────────────────────────
const SubCard = ({ sub, onEdit, onDelete, onRenew }) => {
  const days  = daysUntil(sub.next_billing_date);
  const meta  = catMeta(sub.category);
  const urgent = days <= 3;
  const soon   = days <= 7;

  return (
    <div className={`bg-white dark:bg-stone-900 rounded-2xl border shadow-sm p-4 transition-all hover:shadow-md ${
      urgent ? "border-red-200 dark:border-red-900" : soon ? "border-amber-200 dark:border-amber-900" : "border-stone-100 dark:border-stone-800"
    }`}>
      <div className="flex items-start gap-3">
        {/* Logo */}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0"
          style={{ background: sub.color + "22", border: `1.5px solid ${sub.color}44` }}>
          {sub.logo_emoji}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="font-bold text-stone-800 dark:text-stone-100 truncate">{sub.name}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
              {meta.emoji} {meta.key}
            </span>
          </div>
          <p className="text-sm font-bold" style={{ color: sub.color }}>
            {cycleLabel(sub.billing_cycle, sub.amount)}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className={`flex items-center gap-1 text-xs font-semibold ${urgent ? "text-red-500" : soon ? "text-amber-500" : "text-stone-400 dark:text-stone-500"}`}>
              {(urgent || soon) && <Bell size={10} />}
              {days < 0 ? "Overdue!" : days === 0 ? "Due today!" : `Due in ${days}d`}
            </span>
            <span className="text-xs text-stone-300 dark:text-stone-600">·</span>
            <span className="text-xs text-stone-400 dark:text-stone-500">
              {new Date(sub.next_billing_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
            {sub.auto_debit && (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full font-semibold">Auto</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => onEdit(sub)} className="p-1.5 text-stone-300 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"><Pencil size={13} /></button>
          <button onClick={() => onRenew(sub)} className="p-1.5 text-stone-300 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors" title="Mark renewed"><RefreshCw size={13} /></button>
          <button onClick={() => onDelete(sub.id)} className="p-1.5 text-stone-300 hover:text-red-500 dark:hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SubscriptionTracker() {
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [filterCat, setFilterCat]   = useState("All");
  const [showPopular, setShowPopular] = useState(false);

  const fetchSubsData = useCallback(async () => {
    const { data } = await axios.get(`${API}/subscriptions`);
    return data;
  }, []);

  const { data: subsData, loading, reload: fetchData } = useStaleData(
    'bm_subscriptions_cache',
    fetchSubsData,
    { errorMsg: 'Failed to load subscriptions', fallback: { items: [], total_monthly: 0, due_soon: [] } }
  );

  const subs    = subsData?.items || [];
  const summary = { total_monthly: subsData?.total_monthly || 0, due_soon: subsData?.due_soon || [] };

  const openAdd = (prefill = {}) => {
    setForm({ ...EMPTY_FORM, ...prefill });
    setEditId(null);
    setShowForm(true);
    setShowPopular(false);
  };

  const openEdit = (sub) => {
    setForm({ ...sub });
    setEditId(sub.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.amount || !form.next_billing_date) {
      toast.error("Name, amount and billing date are required"); return;
    }
    setSaving(true);
    try {
      if (editId) {
        await axios.put(`${API}/subscriptions/${editId}`, { ...form, amount: Number(form.amount) });
        toast.success("Updated");
      } else {
        await axios.post(`${API}/subscriptions`, { ...form, amount: Number(form.amount) });
        toast.success("Subscription added");
      }
      setShowForm(false);
      fetchData();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this subscription?")) return;
    await axios.delete(`${API}/subscriptions/${id}`);
    toast.success("Deleted");
    fetchData();
  };

  const handleRenew = async (sub) => {
    await axios.post(`${API}/subscriptions/${sub.id}/renew`);
    toast.success(`${sub.name} renewed — next billing date updated`);
    fetchData();
  };

  const filtered = filterCat === "All" ? subs : subs.filter(s => s.category === filterCat);
  const totalYearly = summary.total_monthly * 12;

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-[#fffaf5] dark:bg-stone-950">
        <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg shadow-violet-500/20 shrink-0">
                <Tv size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">Subscriptions</h1>
                <p className="text-xs text-stone-400 dark:text-stone-500">Track your recurring payments</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowPopular(v => !v)}
                className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950 transition-colors">
                ⚡ <span className="hidden sm:inline">Quick Add</span>
              </button>
              <button onClick={() => openAdd()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white rounded-xl transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
                <Plus size={14} /> <span className="hidden sm:inline">Add</span><span className="sm:hidden">Add</span>
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 p-3 sm:p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
                <IndianRupee size={13} className="text-violet-500 shrink-0" />
                <span className="text-[10px] sm:text-xs font-semibold text-stone-500 dark:text-stone-400 leading-tight">Monthly</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">{fmt(summary.total_monthly)}</p>
              <p className="text-[10px] sm:text-xs text-stone-400 dark:text-stone-500 mt-0.5 hidden sm:block">{fmt(totalYearly)} / year</p>
            </div>
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 p-3 sm:p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
                <TrendingDown size={13} className="text-orange-500 shrink-0" />
                <span className="text-[10px] sm:text-xs font-semibold text-stone-500 dark:text-stone-400 leading-tight">Active</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">{subs.length}</p>
              <p className="text-[10px] sm:text-xs text-stone-400 dark:text-stone-500 mt-0.5 hidden sm:block">plans</p>
            </div>
            <div className={`rounded-2xl border p-3 sm:p-4 shadow-sm ${
              summary.due_soon.length > 0
                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900"
                : "bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800"
            }`}>
              <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
                <Bell size={13} className={summary.due_soon.length > 0 ? "text-amber-500 shrink-0" : "text-stone-400 dark:text-stone-500 shrink-0"} />
                <span className="text-[10px] sm:text-xs font-semibold text-stone-500 dark:text-stone-400 leading-tight">Due Soon</span>
              </div>
              <p className={`text-base sm:text-xl font-bold font-['Outfit'] ${summary.due_soon.length > 0 ? "text-amber-600" : "text-stone-900 dark:text-stone-100"}`}>
                {summary.due_soon.length}
              </p>
              <p className="text-[10px] sm:text-xs text-stone-400 dark:text-stone-500 mt-0.5 hidden sm:block">within 7 days</p>
            </div>
          </div>

          {/* Quick Add popular */}
          {showPopular && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-violet-100 dark:border-violet-900 p-4 mb-5 shadow-sm">
              <p className="text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">Popular Subscriptions — tap to add</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {POPULAR.map(p => (
                  <button key={p.name} onClick={() => openAdd({ ...p, next_billing_date: new Date().toISOString().split("T")[0] })}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-100 dark:border-stone-700 hover:border-violet-200 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-all text-left">
                    <span className="text-xl">{p.logo_emoji}</span>
                    <div>
                      <p className="text-xs font-bold text-stone-800 dark:text-stone-200 leading-tight">{p.name}</p>
                      <p className="text-[10px] text-stone-400 dark:text-stone-500">{fmt(p.amount)}/{p.billing_cycle === "monthly" ? "mo" : "yr"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category filter */}
          {subs.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {["All", ...CATEGORIES.map(c => c.key)].map(cat => (
                <button key={cat}
                  onClick={() => setFilterCat(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    filterCat === cat
                      ? "bg-violet-500 text-white border-violet-500"
                      : "bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:border-violet-300 dark:hover:border-violet-700"
                  }`}>
                  {cat === "All" ? "All" : `${catMeta(cat).emoji} ${cat}`}
                </button>
              ))}
            </div>
          )}

          {/* Due soon alert */}
          {summary.due_soon.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={15} className="text-amber-500" />
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Due within 7 days</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.due_soon.map(s => (
                  <span key={s.id} className="flex items-center gap-1.5 bg-white dark:bg-stone-900 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-xl">
                    {s.logo_emoji} {s.name} — {fmt(s.amount)} on {new Date(s.next_billing_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="text-center py-12 text-stone-400 text-sm animate-pulse">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">📺</p>
              <p className="font-bold text-stone-700 dark:text-stone-300 mb-1">No subscriptions yet</p>
              <p className="text-sm text-stone-400 dark:text-stone-500 mb-4">Add Netflix, Spotify, Amazon — anything you pay for regularly</p>
              <button onClick={() => setShowPopular(true)}
                className="px-4 py-2 text-sm font-semibold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950 transition-colors">
                ⚡ Quick Add Popular
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {filtered.map(s => (
                <SubCard key={s.id} sub={s} onEdit={openEdit} onDelete={handleDelete} onRenew={handleRenew} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Dialog ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100 dark:border-stone-800">
              <h2 className="font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">{editId ? "Edit" : "Add"} Subscription</h2>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* Name + emoji */}
              <div className="flex gap-3">
                <div className="w-16">
                  <label className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1.5">Icon</label>
                  <input value={form.logo_emoji} onChange={e => setForm(f => ({ ...f, logo_emoji: e.target.value }))}
                    className="w-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-xl px-2 py-2.5 text-center text-xl focus:outline-none focus:border-violet-400" maxLength={2} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1.5">Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Netflix"
                    className="w-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-400 placeholder:text-stone-300 dark:placeholder:text-stone-600" />
                </div>
              </div>

              {/* Amount + cycle */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1.5">Amount (₹) *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="649"
                    className="w-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-400 placeholder:text-stone-300 dark:placeholder:text-stone-600" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1.5">Billing Cycle</label>
                  <select value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value }))}
                    className="w-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400">
                    {CYCLES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1.5">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c.key} type="button"
                      onClick={() => setForm(f => ({ ...f, category: c.key }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        form.category === c.key
                          ? "border-violet-400 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300"
                          : "border-stone-100 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-200 dark:hover:border-stone-600"
                      }`}>
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Next billing date */}
              <div>
                <label className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1.5">Next Billing Date *</label>
                <DatePicker
                  value={form.next_billing_date}
                  onChange={v => setForm(f => ({ ...f, next_billing_date: v }))}
                  placeholder="Select billing date"
                />
              </div>

              {/* Auto debit */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-stone-100 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                <div onClick={() => setForm(f => ({ ...f, auto_debit: !f.auto_debit }))}
                  className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${form.auto_debit ? "bg-violet-500" : "bg-stone-200 dark:bg-stone-700"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.auto_debit ? "left-5" : "left-0.5"}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">Auto Debit</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500">Payment is auto-charged to your card</p>
                </div>
              </label>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1.5">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Family plan, shared with 4 people"
                  className="w-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-400 placeholder:text-stone-300 dark:placeholder:text-stone-600" />
              </div>
            </div>

            <div className="px-5 pb-6 pt-3 border-t border-stone-50 dark:border-stone-800">
              {/* Monthly equiv preview */}
              {form.amount && form.billing_cycle !== "monthly" && (
                <p className="text-xs text-stone-400 dark:text-stone-500 text-center mb-3">
                  ≈ {fmt(monthlyEq(Number(form.amount), form.billing_cycle))} / month
                </p>
              )}
              <button onClick={handleSave} disabled={saving}
                className="w-full h-11 text-white font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
                {saving ? "Saving..." : <><Check size={15} /> {editId ? "Update" : "Add Subscription"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
