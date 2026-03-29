import { useState, useEffect, useCallback, useRef } from "react";
import { useStaleData } from "@/hooks/useStaleData";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { DatePicker } from "@/components/DatePicker";
import {
  Plus, Trash2, Edit3, Sparkles, Loader2, PartyPopper,
  MapPin, Users, IndianRupee, Calendar, Copy, CheckCircle, X
} from "lucide-react";
import YearPicker from "@/components/YearPicker";

const EVENT_TYPES = ["Wedding", "Birthday", "Anniversary", "Pooja", "Festival", "Corporate", "Other"];

const TYPE_EMOJI = {
  Wedding: "💍",
  Birthday: "🎂",
  Anniversary: "🎊",
  Pooja: "🙏",
  Festival: "🎉",
  Corporate: "💼",
  Other: "✨",
};

const EVENT_EXPENSE_ITEMS = {
  Wedding:    ["Venue & Hall", "Catering & Food", "Photography & Video", "Decoration & Flowers", "Mehendi & Beauty", "DJ & Music", "Invitations & Cards", "Attire & Jewellery", "Honeymoon", "Miscellaneous"],
  Birthday:   ["Venue", "Cake & Desserts", "Food & Snacks", "Decoration", "Return Gifts", "Entertainment", "Miscellaneous"],
  Anniversary:["Venue / Dinner", "Gifts & Jewellery", "Travel & Stay", "Decoration", "Miscellaneous"],
  Pooja:      ["Pandit & Dakshina", "Flowers & Garlands", "Prasad & Offerings", "Food & Langar", "Decoration", "Miscellaneous"],
  Festival:   ["Decoration", "Food & Sweets", "Gifts & Purchases", "Clothing & Accessories", "Miscellaneous"],
  Corporate:  ["Venue & AV", "Catering", "Logistics & Travel", "Marketing & Banners", "Gifts & Tokens", "Miscellaneous"],
  Other:      ["Venue", "Food & Drinks", "Miscellaneous"],
};

const emptyBreakdown = (type) =>
  Object.fromEntries((EVENT_EXPENSE_ITEMS[type] || EVENT_EXPENSE_ITEMS.Other).map(k => [k, { budget: "", actual: "" }]));

const fmtINR = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 10000000) return `₹${(a / 10000000).toFixed(1)}Cr`;
  if (a >= 100000) return `₹${(a / 100000).toFixed(1)}L`;
  if (a >= 1000) return `₹${(a / 1000).toFixed(1)}K`;
  return `₹${Math.round(a).toLocaleString("en-IN")}`;
};

const fmt = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  title: "",
  event_type: "Wedding",
  date: TODAY,
  venue: "",
  guest_count: "",
  notes: "",
  status: "upcoming",
  breakdown: {},
};

const AI_FOCUS_OPTIONS = [
  { id: "full plan", label: "Full Plan", emoji: "✨" },
  { id: "menu & food", label: "Menu & Food", emoji: "🍽️" },
  { id: "invites", label: "Invites", emoji: "💌" },
  { id: "catering", label: "Catering", emoji: "🍱" },
  { id: "budget breakdown", label: "Budget Breakdown", emoji: "💰" },
];

// ── Hero demo examples for animated preview ───────────────────────────────────
const HERO_EVENT_EXAMPLES = [
  { emoji: "💍", name: "Rahul & Priya Wedding", type: "Wedding", budget: 500000, spent: 180000, date: "Dec 2026" },
  { emoji: "🎂", name: "Aarav's 5th Birthday", type: "Birthday", budget: 25000, spent: 18000, date: "Apr 2026" },
  { emoji: "🎊", name: "25th Anniversary Dinner", type: "Anniversary", budget: 80000, spent: 60000, date: "Jun 2026" },
  { emoji: "🙏", name: "Griha Pravesh Pooja", type: "Pooja", budget: 40000, spent: 38000, date: "May 2026" },
  { emoji: "💼", name: "Annual Team Offsite", type: "Corporate", budget: 200000, spent: 45000, date: "Aug 2026" },
];

const fmtK = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 100000) return `₹${(a / 100000).toFixed(1)}L`;
  if (a >= 1000) return `₹${(a / 1000).toFixed(0)}K`;
  return `₹${Math.round(a)}`;
};

function EventHeroDemo() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % HERO_EVENT_EXAMPLES.length); setVisible(true); }, 400);
    }, 2800);
    return () => clearInterval(iv);
  }, []);

  const ex = HERO_EVENT_EXAMPLES[idx];
  const pct = Math.min(100, Math.round((ex.spent / ex.budget) * 100));
  const over = ex.spent > ex.budget;
  const barColor = over ? "bg-red-400" : pct > 75 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-lg shadow-stone-200/50 p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Live Preview</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          Auto-playing
        </span>
      </div>
      <div
        className="transition-all duration-400"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-xl border border-orange-100 shrink-0">
            {ex.emoji}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-stone-800 text-sm font-['Outfit'] truncate">{ex.name}</p>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{ex.type}</span>
          </div>
          <div className="ml-auto text-right shrink-0">
            <p className="text-sm font-bold font-['Outfit'] text-stone-700">{fmtK(ex.budget)}</p>
            <p className="text-[10px] text-stone-400">{ex.date}</p>
          </div>
        </div>

        <div className="h-2 bg-stone-100 rounded-full overflow-hidden mb-1">
          <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-stone-400">
          <span>Spent {fmtK(ex.spent)}</span>
          <span className={`font-semibold ${over ? "text-red-500" : "text-emerald-600"}`}>{pct}% of budget</span>
        </div>
      </div>
      <div className="flex justify-center gap-1 mt-4">
        {HERO_EVENT_EXAMPLES.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-5 bg-orange-400" : "w-1.5 bg-stone-200"}`} />
        ))}
      </div>
    </div>
  );
}

function EventTypewriterText() {
  const items = ["Your Wedding 💍", "Birthday Bash 🎂", "Anniversary Dinner 🎊", "Family Pooja 🙏", "Office Party 💼"];
  const [itemIdx, setItemIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [typing, setTyping] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    const full = items[itemIdx];
    if (typing) {
      if (displayed.length < full.length) {
        timerRef.current = setTimeout(() => setDisplayed(full.slice(0, displayed.length + 1)), 65);
      } else {
        timerRef.current = setTimeout(() => setTyping(false), 1400);
      }
    } else {
      if (displayed.length > 0) {
        timerRef.current = setTimeout(() => setDisplayed(d => d.slice(0, -1)), 35);
      } else {
        setItemIdx(i => (i + 1) % items.length);
        setTyping(true);
      }
    }
    return () => clearTimeout(timerRef.current);
  }, [displayed, typing, itemIdx]); // eslint-disable-line

  return (
    <span className="text-orange-500 font-semibold">
      {displayed}
      <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse align-middle" />
    </span>
  );
}

export default function EventPlanner() {
  const [tab, setTab] = useState("upcoming");
  const [addOpen, setAddOpen] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [logToBudget, setLogToBudget] = useState(false);
  const [logCategory, setLogCategory] = useState("Entertainment");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const [eventGifts, setEventGifts] = useState({}); // { eventId: [gifts] }
  const [expandedGifts, setExpandedGifts] = useState(new Set());

  // AI panel state
  const [aiEvent, setAiEvent] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiFocus, setAiFocus] = useState("full plan");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchEvents = useCallback(async () => {
    const r = await axios.get(`${API}/events`);
    return Array.isArray(r.data) ? r.data : [];
  }, []);

  const { data: events, loading, reload: fetchData } = useStaleData(
    "bm_events_cache",
    fetchEvents,
    { errorMsg: "Failed to load events", fallback: [] }
  );

  const openAdd = () => {
    setEditEvent(null);
    setForm({ ...EMPTY_FORM, breakdown: emptyBreakdown("Wedding") });
    setAddOpen(true);
  };

  const openEdit = (ev) => {
    setEditEvent(ev);
    const type = ev.event_type || "Wedding";
    const storedBreakdown = ev.breakdown || {};
    const items = EVENT_EXPENSE_ITEMS[type] || EVENT_EXPENSE_ITEMS.Other;
    const breakdown = Object.fromEntries(items.map(k => [k, {
      budget: storedBreakdown[k]?.budget != null ? String(storedBreakdown[k].budget) : "",
      actual: storedBreakdown[k]?.actual != null ? String(storedBreakdown[k].actual) : "",
    }]));
    setForm({
      title: ev.title || "",
      event_type: type,
      date: ev.date || TODAY,
      venue: ev.venue || "",
      guest_count: ev.guest_count ? String(ev.guest_count) : "",
      notes: ev.notes || "",
      status: ev.status || "upcoming",
      breakdown,
    });
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Event title is required"); return; }
    if (!form.date) { toast.error("Date is required"); return; }
    setSaving(true);
    try {
      const budgetTotal   = Object.values(form.breakdown).reduce((s, v) => s + (parseFloat(v.budget) || 0), 0);
      const actualTotal   = Object.values(form.breakdown).reduce((s, v) => s + (parseFloat(v.actual) || 0), 0);
      const cleanBreakdown = Object.fromEntries(
        Object.entries(form.breakdown).map(([k, v]) => [k, { budget: parseFloat(v.budget) || 0, actual: parseFloat(v.actual) || 0 }])
      );
      const payload = {
        ...form,
        budget: budgetTotal,
        actual_cost: actualTotal,
        breakdown: cleanBreakdown,
        guest_count: parseInt(form.guest_count) || 0,
      };
      if (editEvent) {
        await axios.put(`${API}/events/${editEvent.id}`, payload);
        toast.success("Event updated!");
        if (logToBudget) {
          const totalAmt = Object.values(payload.breakdown || {}).reduce((s, v) => s + (v.budget || 0), 0) || payload.budget || 0;
          if (totalAmt > 0) {
            try {
              await axios.post(`${API}/transactions`, {
                description: `Event: ${payload.title}`,
                amount: totalAmt,
                type: "expense",
                category: logCategory,
                date: payload.date || new Date().toISOString().slice(0, 10),
                notes: `Auto-logged from Event Planner`,
              });
            } catch { /* silently skip if transaction logging fails */ }
          }
        }
      } else {
        await axios.post(`${API}/events`, payload);
        toast.success("Event added!");
        if (logToBudget) {
          const totalAmt = Object.values(payload.breakdown || {}).reduce((s, v) => s + (v.budget || 0), 0) || payload.budget || 0;
          if (totalAmt > 0) {
            try {
              await axios.post(`${API}/transactions`, {
                description: `Event: ${payload.title}`,
                amount: totalAmt,
                type: "expense",
                category: logCategory,
                date: payload.date || new Date().toISOString().slice(0, 10),
                notes: `Auto-logged from Event Planner`,
              });
            } catch { /* silently skip if transaction logging fails */ }
          }
        }
      }
      setAddOpen(false);
      setForm(EMPTY_FORM);
      setEditEvent(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/events/${id}`);
      toast.success("Event deleted");
      setDeleteConfirm(null);
      fetchData();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleMultiDelete = async () => {
    try {
      await Promise.all([...selected].map(id => axios.delete(`${API}/events/${id}`)));
      toast.success(`${selected.size} event${selected.size > 1 ? "s" : ""} deleted`);
      setSelectMode(false);
      setSelected(new Set());
      fetchData();
    } catch {
      toast.error("Failed to delete selected events");
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const markCompleted = async (ev) => {
    try {
      await axios.put(`${API}/events/${ev.id}`, { status: "completed" });
      toast.success("Marked as completed!");
      fetchData();
    } catch {
      toast.error("Failed to update");
    }
  };

  const openAiPanel = (ev) => {
    setAiEvent(ev);
    setAiFocus("full plan");
    setAiResult(null);
    setAiOpen(true);
  };

  const loadEventGifts = async (eventId) => {
    if (eventGifts[eventId]) return; // already loaded
    try {
      const r = await axios.get(`${API}/events/${eventId}/gifts`);
      setEventGifts(prev => ({ ...prev, [eventId]: r.data || [] }));
    } catch {}
  };

  const runAiPlan = async () => {
    if (!aiEvent) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const r = await axios.post(`${API}/events/${aiEvent.id}/ai-plan`, { focus: aiFocus });
      setAiResult(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI planning failed");
    } finally {
      setAiLoading(false);
    }
  };

  const copyInvite = () => {
    if (!aiResult?.whatsapp_invite) return;
    navigator.clipboard.writeText(aiResult.whatsapp_invite).then(() => {
      setCopied(true);
      toast.success("Invite copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const today = new Date().toISOString().slice(0, 10);

  const filtered = events.filter((ev) => {
    if (tab === "upcoming") return ev.status === "upcoming" && ev.date >= today;
    if (!ev.date?.startsWith(String(year))) return false;
    if (tab === "completed") return ev.status === "completed";
    return true;
  });

  const totalBudget = events.reduce((s, e) => s + (e.budget || 0), 0);
  const upcomingCount = events.filter((e) => e.status === "upcoming" && e.date >= today).length;

  const typeCounts = events.reduce((acc, ev) => {
    acc[ev.event_type] = (acc[ev.event_type] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf5]">
        <Navigation />
        <div className="lg:pl-64 pb-24 lg:pb-8 flex items-center justify-center min-h-screen">
          <Loader2 className="animate-spin text-orange-500" size={32} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffaf5] dark:bg-stone-950">
      <Navigation />
      <div className="lg:pl-64 pb-24 lg:pb-8">
        <div className="max-w-2xl mx-auto px-4 pt-6">

          {/* ── WhenToBuy-style hero header ── */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-300/40 mb-4"
              style={{ animation: 'bm-orb-float 3s ease-in-out infinite' }}>
              <PartyPopper size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900 font-['Outfit'] mb-1">Plan Every Celebration</h1>
            <p className="text-stone-500 text-sm">
              From <EventTypewriterText /> — we've got you covered.
            </p>
          </div>

          {/* ── Two-col: quick picks + demo ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Quick pick event types */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3 flex items-center gap-1.5">
                <Sparkles size={12} className="text-orange-400" /> Quick Plan
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { type: "Wedding",     emoji: "💍" },
                  { type: "Birthday",    emoji: "🎂" },
                  { type: "Anniversary", emoji: "🎊" },
                  { type: "Pooja",       emoji: "🙏" },
                  { type: "Festival",    emoji: "🎉" },
                  { type: "Corporate",   emoji: "💼" },
                  { type: "Other",       emoji: "✨" },
                ].map(({ type, emoji }) => (
                  <button
                    key={type}
                    onClick={() => {
                      setForm({ ...EMPTY_FORM, event_type: type, breakdown: emptyBreakdown(type) });
                      setEditEvent(null);
                      setAddOpen(true);
                    }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-200 bg-stone-50 border-stone-200 text-stone-600 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 hover:scale-105"
                  >
                    <span>{emoji}</span> {type}
                  </button>
                ))}
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-stone-100">
                {[
                  { label: "Total", val: events.length },
                  { label: "Upcoming", val: upcomingCount },
                  { label: "Budget", val: fmtINR(totalBudget) },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center">
                    <p className="font-bold text-stone-800 text-sm font-['Outfit']">{val}</p>
                    <p className="text-[10px] text-stone-400">{label}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Animated demo */}
            <EventHeroDemo />
          </div>

          {/* Type summary chips */}
          {Object.keys(typeCounts).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(typeCounts).map(([type, count]) => (
                <span key={type} className="inline-flex items-center gap-1 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400 text-xs font-semibold px-3 py-1 rounded-full">
                  {TYPE_EMOJI[type]} {type}: {count}
                </span>
              ))}
            </div>
          )}

          {/* Tabs + Year picker + Add button */}
          <div className="flex items-center justify-between flex-wrap gap-y-2 mb-4">
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-white dark:bg-stone-900 rounded-xl p-1 shadow-sm border border-stone-100 dark:border-stone-800">
                {[["upcoming", "Upcoming"], ["completed", "Completed"], ["all", "All"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === id ? "bg-orange-500 text-white shadow" : "text-stone-500 dark:text-stone-400"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="hidden sm:block">
                <YearPicker year={year} onChange={setYear} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {filtered.length > 0 && (
                <button
                  onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
                  className={`hidden sm:inline-flex text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${selectMode ? "bg-orange-100 border-orange-300 text-orange-700" : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"}`}
                >
                  {selectMode ? "Cancel" : "Delete"}
                </button>
              )}
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl gap-1.5"
                onClick={openAdd}
              >
                <Plus size={14} /> Add Event
              </Button>
            </div>
          </div>

          {/* Event cards */}
          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 p-10 text-center">
              <PartyPopper size={36} className="mx-auto mb-3 text-orange-300" />
              <p className="text-stone-500 dark:text-stone-400 font-medium">No {tab} events yet</p>
              <p className="text-xs text-stone-400 mt-1">Tap "Add Event" to plan your first celebration</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((ev) => {
                const costPct = ev.budget > 0 ? Math.min(100, Math.round((ev.actual_cost / ev.budget) * 100)) : 0;
                const isOver = ev.actual_cost > ev.budget && ev.budget > 0;
                const isPast = ev.date < today;
                return (
                  <div
                    key={ev.id}
                    className={`bg-white dark:bg-stone-900 rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all relative ${selected.has(ev.id) ? "border-orange-400 ring-2 ring-orange-200" : "border-stone-100 dark:border-stone-800"}`}
                    onClick={selectMode ? () => toggleSelect(ev.id) : undefined}
                  >
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selected.has(ev.id)}
                        onChange={() => toggleSelect(ev.id)}
                        onClick={e => e.stopPropagation()}
                        className="absolute top-3 left-3 w-4 h-4 accent-orange-500 cursor-pointer z-10"
                      />
                    )}
                    <div className={`flex items-start justify-between gap-3 mb-3 ${selectMode ? "pl-6" : ""}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center text-xl flex-shrink-0">
                          {TYPE_EMOJI[ev.event_type] || "✨"}
                        </div>
                        <div>
                          <p className="font-semibold text-stone-800 dark:text-stone-100 text-sm leading-tight">{ev.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ev.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : isPast ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"}`}>
                              {ev.status === "completed" ? "Completed" : isPast ? "Past" : "Upcoming"}
                            </span>
                            <span className="text-xs text-stone-400">{ev.event_type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {ev.status === "upcoming" && (
                          <button
                            onClick={() => markCompleted(ev)}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-stone-400 hover:text-emerald-600 transition-colors"
                            title="Mark as completed"
                          >
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {ev.status === "upcoming" && !isPast && (
                          <button
                            onClick={() => openAiPanel(ev)}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
                          >
                            <Sparkles size={12} /> AI Plan
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(ev)}
                          className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-600 transition-colors"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(ev.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-stone-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {ev.date && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                          <Calendar size={12} className="text-orange-400 flex-shrink-0" />
                          <span>{fmt(ev.date)}</span>
                        </div>
                      )}
                      {ev.venue && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 col-span-2">
                          <MapPin size={12} className="text-orange-400 flex-shrink-0" />
                          <span className="truncate">{ev.venue}</span>
                        </div>
                      )}
                      {ev.guest_count > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                          <Users size={12} className="text-orange-400 flex-shrink-0" />
                          <span>{ev.guest_count} guests</span>
                        </div>
                      )}
                    </div>

                    {ev.budget > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                            <IndianRupee size={11} />
                            <span>Budget: <span className="font-semibold text-stone-700 dark:text-stone-300">{fmtINR(ev.budget)}</span></span>
                          </div>
                          {ev.actual_cost > 0 && (
                            <span className={`text-xs font-semibold ${isOver ? "text-red-500" : "text-emerald-600"}`}>
                              Spent: {fmtINR(ev.actual_cost)} ({costPct}%)
                            </span>
                          )}
                        </div>
                        {ev.actual_cost > 0 && (
                          <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isOver ? "bg-red-500" : costPct > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(100, costPct)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Gifts linked to this event */}
                    <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                      <button
                        onClick={() => {
                          setExpandedGifts(prev => {
                            const next = new Set(prev);
                            if (next.has(ev.id)) { next.delete(ev.id); } else { next.add(ev.id); loadEventGifts(ev.id); }
                            return next;
                          });
                        }}
                        className="flex items-center gap-2 text-xs font-semibold text-stone-500 hover:text-fuchsia-600 transition-colors w-full text-left"
                      >
                        <span>🎁</span>
                        <span>Gifts</span>
                        {eventGifts[ev.id]?.length > 0 && (
                          <span className="bg-fuchsia-100 text-fuchsia-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {eventGifts[ev.id].length}
                          </span>
                        )}
                        <span className="ml-auto text-stone-300">{expandedGifts.has(ev.id) ? '▲' : '▼'}</span>
                      </button>

                      {expandedGifts.has(ev.id) && (
                        <div className="mt-2 space-y-1.5">
                          {!eventGifts[ev.id] ? (
                            <p className="text-xs text-stone-400 py-2">Loading…</p>
                          ) : eventGifts[ev.id].length === 0 ? (
                            <p className="text-xs text-stone-400 py-2">No gifts linked yet. Add from <strong>Celebrations & Gifts</strong> → Link to Event.</p>
                          ) : (
                            <>
                              {eventGifts[ev.id].map(g => (
                                <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-800">
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${g.direction === 'given' ? 'bg-rose-100 text-rose-500' : 'bg-emerald-100 text-emerald-500'}`}>
                                    {g.direction === 'given' ? '↑' : '↓'}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-stone-700 dark:text-stone-200 truncate">{g.gift_description || g.occasion}</p>
                                    <p className="text-[10px] text-stone-400">{g.person_name} · {g.occasion}</p>
                                  </div>
                                  <p className={`text-xs font-semibold shrink-0 ${g.direction === 'given' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {g.direction === 'given' ? '-' : '+'}₹{(g.amount || 0).toLocaleString('en-IN')}
                                  </p>
                                </div>
                              ))}
                              <div className="flex justify-between text-[10px] text-stone-400 px-1 pt-1">
                                <span>Given: ₹{eventGifts[ev.id].filter(g=>g.direction==='given').reduce((s,g)=>s+g.amount,0).toLocaleString('en-IN')}</span>
                                <span>Received: ₹{eventGifts[ev.id].filter(g=>g.direction==='received').reduce((s,g)=>s+g.amount,0).toLocaleString('en-IN')}</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Multi-select action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-0 right-0 lg:left-64 z-50 flex justify-center px-4">
          <div className="bg-stone-900 text-white rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
            <span className="text-sm font-semibold">{selected.size} selected</span>
            <button onClick={handleMultiDelete} className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-xl transition-colors">Delete</button>
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="text-stone-400 hover:text-white text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEvent ? "Edit Event" : "Add Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Event Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Aarav's Birthday Party"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Event Type</Label>
                <select
                  value={form.event_type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setForm((f) => ({ ...f, event_type: newType, breakdown: emptyBreakdown(newType) }));
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_EMOJI[t]} {t}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Date *</Label>
                <div className="mt-1">
                  <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v, status: v < TODAY ? "completed" : f.status }))} />
                </div>
                {form.date && form.date < TODAY && (
                  <p className="text-[10px] text-amber-600 mt-1">📝 Past date — recording previous event</p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Venue</Label>
              <Input
                value={form.venue}
                onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
                placeholder="e.g. Taj Banquet Hall, Mumbai"
                className="mt-1"
              />
            </div>
            {/* Dynamic expense breakdown */}
            <div>
              <div className="flex items-center mb-2">
                <Label className="text-xs font-semibold text-stone-700 flex-1">Expense Breakdown</Label>
                <span className="w-20 text-center text-[10px] font-bold text-stone-400 uppercase tracking-wide">Budget</span>
                <span className="w-20 text-center text-[10px] font-bold text-stone-400 uppercase tracking-wide ml-2">Actual</span>
              </div>
              <div className="space-y-1.5 bg-stone-50 rounded-xl p-3 border border-stone-100">
                {(EVENT_EXPENSE_ITEMS[form.event_type] || EVENT_EXPENSE_ITEMS.Other).map(item => (
                  <div key={item} className="flex items-center">
                    <span className="flex-1 text-xs text-stone-600 truncate pr-2">{item}</span>
                    <input
                      type="number"
                      value={form.breakdown[item]?.budget ?? ""}
                      onChange={e => setForm(f => ({ ...f, breakdown: { ...f.breakdown, [item]: { ...f.breakdown[item], budget: e.target.value } } }))}
                      placeholder="0"
                      className="w-20 h-8 border border-stone-200 rounded-lg px-2 text-xs text-right bg-white focus:outline-none focus:border-orange-400"
                    />
                    <input
                      type="number"
                      value={form.breakdown[item]?.actual ?? ""}
                      onChange={e => setForm(f => ({ ...f, breakdown: { ...f.breakdown, [item]: { ...f.breakdown[item], actual: e.target.value } } }))}
                      placeholder="0"
                      className="w-20 h-8 border border-stone-200 rounded-lg px-2 text-xs text-right bg-white focus:outline-none focus:border-orange-400 ml-2"
                    />
                  </div>
                ))}
                {/* Totals row */}
                <div className="flex items-center border-t border-stone-200 pt-2 mt-1">
                  <span className="flex-1 text-xs font-bold text-stone-700">Total</span>
                  <span className="w-20 text-right text-xs font-bold text-orange-600">
                    {fmtINR(Object.values(form.breakdown).reduce((s,v) => s + (parseFloat(v?.budget)||0), 0))}
                  </span>
                  <span className="w-20 text-right text-xs font-bold text-emerald-600 ml-2">
                    {fmtINR(Object.values(form.breakdown).reduce((s,v) => s + (parseFloat(v?.actual)||0), 0))}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Guest Count</Label>
                <Input
                  type="number"
                  value={form.guest_count}
                  onChange={(e) => setForm((f) => ({ ...f, guest_count: e.target.value }))}
                  placeholder="200"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Theme, special requirements, etc."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            {/* Log to budget */}
            <div className={`rounded-xl border p-3 space-y-2 transition-colors ${logToBudget ? 'border-orange-200 bg-orange-50' : 'border-stone-100 bg-stone-50'}`}>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={logToBudget} onChange={e => setLogToBudget(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-500" />
                <div>
                  <p className="text-xs font-semibold text-stone-700">Log total cost to Budget</p>
                  <p className="text-[10px] text-stone-400">Add the event budget as an expense in your budget tracker</p>
                </div>
              </label>
              {logToBudget && (
                <select value={logCategory} onChange={e => setLogCategory(e.target.value)}
                  className="w-full h-9 bg-white border border-stone-200 rounded-xl px-3 text-sm focus:outline-none focus:border-orange-400">
                  {["Entertainment", "Food & Dining", "Shopping", "Travel", "Health", "Education", "Utilities", "Other"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {saving ? "Saving…" : editEvent ? "Update Event" : "Add Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete Event?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-stone-500 mb-4">This cannot be undone.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white" onClick={() => handleDelete(deleteConfirm)}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Panel */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAiOpen(false)} />
          <div className="relative bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-stone-100 dark:border-stone-800 sticky top-0 bg-white dark:bg-stone-900 z-10 rounded-t-3xl sm:rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center">
                  <Sparkles size={16} className="text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-stone-800 dark:text-stone-100">AI Event Plan</p>
                  {aiEvent && (
                    <p className="text-xs text-stone-400">{TYPE_EMOJI[aiEvent.event_type]} {aiEvent.title}</p>
                  )}
                </div>
              </div>
              <button onClick={() => setAiOpen(false)} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Focus selector */}
              <div>
                <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-2 uppercase tracking-wider">What to plan</p>
                <div className="flex flex-wrap gap-2">
                  {AI_FOCUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setAiFocus(opt.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${aiFocus === opt.id ? "bg-orange-500 text-white border-orange-500 shadow-sm" : "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-orange-300"}`}
                    >
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full bg-orange-500 hover:bg-orange-600 text-white gap-2"
                onClick={runAiPlan}
                disabled={aiLoading}
              >
                {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {aiLoading ? "Planning…" : "Generate Plan"}
              </Button>

              {aiLoading && (
                <div className="text-center py-6">
                  <Loader2 size={28} className="animate-spin text-orange-500 mx-auto mb-2" />
                  <p className="text-sm text-stone-500">Chanakya is crafting your event plan…</p>
                </div>
              )}

              {aiResult && !aiLoading && (
                <div className="space-y-4">
                  {/* AI tip */}
                  {aiResult.ai_tip && (
                    <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
                      <p className="text-xs font-bold text-orange-600 dark:text-orange-400 mb-1">Chanakya's Tip</p>
                      <p className="text-sm text-stone-700 dark:text-stone-300">{aiResult.ai_tip}</p>
                    </div>
                  )}

                  {/* WhatsApp invite */}
                  {aiResult.whatsapp_invite && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">WhatsApp Invite</p>
                        <button
                          onClick={copyInvite}
                          className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 transition-colors"
                        >
                          {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-xs text-stone-600 dark:text-stone-400 whitespace-pre-wrap leading-relaxed">{aiResult.whatsapp_invite}</p>
                    </div>
                  )}

                  {/* Reminder timeline */}
                  {aiResult.reminder_timeline && aiResult.reminder_timeline.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">Reminder Timeline</p>
                      <div className="space-y-2">
                        {aiResult.reminder_timeline.map((r, i) => (
                          <div key={i} className="flex gap-3 items-start">
                            <div className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                            <div>
                              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">{r.when}</span>
                              <p className="text-xs text-stone-600 dark:text-stone-400">{r.task}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Menu */}
                  {aiResult.menu && (
                    <div>
                      <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">Menu Suggestions</p>
                      <div className="space-y-2">
                        {aiResult.menu.veg && aiResult.menu.veg.length > 0 && (
                          <div className="bg-stone-50 dark:bg-stone-800 rounded-xl p-3">
                            <p className="text-xs font-semibold text-emerald-600 mb-1.5">Vegetarian</p>
                            <div className="flex flex-wrap gap-1">
                              {aiResult.menu.veg.map((d, i) => (
                                <span key={i} className="text-xs bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">{d}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiResult.menu.non_veg && aiResult.menu.non_veg.length > 0 && (
                          <div className="bg-stone-50 dark:bg-stone-800 rounded-xl p-3">
                            <p className="text-xs font-semibold text-red-500 mb-1.5">Non-Vegetarian</p>
                            <div className="flex flex-wrap gap-1">
                              {aiResult.menu.non_veg.map((d, i) => (
                                <span key={i} className="text-xs bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">{d}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiResult.menu.desserts && aiResult.menu.desserts.length > 0 && (
                          <div className="bg-stone-50 dark:bg-stone-800 rounded-xl p-3">
                            <p className="text-xs font-semibold text-amber-600 mb-1.5">Desserts</p>
                            <div className="flex flex-wrap gap-1">
                              {aiResult.menu.desserts.map((d, i) => (
                                <span key={i} className="text-xs bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">{d}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiResult.menu.notes && (
                          <p className="text-xs text-stone-500 dark:text-stone-400 italic px-1">{aiResult.menu.notes}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Catering checklist */}
                  {aiResult.catering_checklist && aiResult.catering_checklist.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">Catering Checklist</p>
                      <div className="space-y-2">
                        {aiResult.catering_checklist.map((item, i) => (
                          <div key={i} className="flex gap-2 items-start bg-stone-50 dark:bg-stone-800 rounded-xl p-2.5">
                            <div className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
                            <div>
                              <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">{item.item}</p>
                              {item.timing && <p className="text-xs text-orange-500 dark:text-orange-400">{item.timing}</p>}
                              {item.notes && <p className="text-xs text-stone-400">{item.notes}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Budget breakdown */}
                  {aiResult.budget_breakdown && aiResult.budget_breakdown.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">Budget Breakdown</p>
                      <div className="space-y-2">
                        {aiResult.budget_breakdown.map((item, i) => (
                          <div key={i} className="bg-stone-50 dark:bg-stone-800 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">{item.category}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{fmtINR(item.estimated_cost)}</span>
                                {item.percentage && (
                                  <span className="text-xs text-stone-400">({item.percentage}%)</span>
                                )}
                              </div>
                            </div>
                            {item.percentage && (
                              <div className="h-1 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden mb-1">
                                <div className="h-full bg-orange-400 rounded-full" style={{ width: `${item.percentage}%` }} />
                              </div>
                            )}
                            {item.tips && <p className="text-xs text-stone-400">{item.tips}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
