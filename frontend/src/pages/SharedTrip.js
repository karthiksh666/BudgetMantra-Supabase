import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Plane, MapPin, Calendar, Clock, IndianRupee, CheckCircle,
  AlertCircle, ChevronRight, RefreshCw, Sun, CreditCard, Banknote,
  Send, X, Bot, Loader2, Edit3, TrendingDown, Info, Target
} from "lucide-react";

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';
const fmtINR = (n) => `₹${Math.round(Math.abs(n || 0)).toLocaleString("en-IN")}`;
const fmtShort = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000)   return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000)     return `₹${(abs / 1000).toFixed(0)}K`;
  return `₹${abs.toLocaleString("en-IN")}`;
};
const nights = (s, e) => s && e ? Math.max(0, (new Date(e) - new Date(s)) / 86400000) : 0;

export default function SharedTrip() {
  const shareToken = window.location.pathname.split("/trips/shared/")[1];
  const [trip, setTrip]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const [dayForm, setDayForm]     = useState(null);
  const [saving, setSaving]       = useState(false);
  // AI Guide
  const [aiOpen, setAiOpen]   = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!shareToken) { setError("Invalid link"); setLoading(false); return; }
    axios.get(`${API_BASE}/api/trips/shared/${shareToken}`)
      .then(r => {
        setTrip(r.data);
        setMessages([{
          role: "assistant",
          content: `Hey! I'm your AI travel guide for **${r.data.destination}** 🗺️\n\nI know the full itinerary. Ask me anything — activities, food, packing tips, how to save money on any day!`,
        }]);
      })
      .catch(() => setError("Trip not found or link has expired"))
      .finally(() => setLoading(false));
  }, [shareToken]);

  const openDay = (idx) => {
    const day = trip.itinerary?.[idx];
    if (!day) return;
    setDayDetail({ idx, day });
    setDayForm({
      title: day.title || "",
      location: day.location || "",
      estimated_cost_inr: day.estimated_cost_inr || 0,
      activities: Array.isArray(day.activities) ? day.activities.join("\n") : (day.highlights || []).join("\n"),
    });
  };

  const saveDay = async () => {
    setSaving(true);
    try {
      const acts = dayForm.activities.split("\n").map(s => s.trim()).filter(Boolean);
      const updatedDay = { ...dayDetail.day, title: dayForm.title, location: dayForm.location, estimated_cost_inr: parseFloat(dayForm.estimated_cost_inr) || 0, activities: acts };
      const { data } = await axios.patch(`${API_BASE}/api/trips/shared/${shareToken}/itinerary`, { day_idx: dayDetail.idx, day: updatedDay });
      setTrip(prev => ({ ...prev, itinerary: data.itinerary }));
      setDayDetail(null);
      toast.success("Day updated!");
    } catch { toast.error("Could not save"); }
    finally { setSaving(false); }
  };

  const sendAI = async () => {
    if (!input.trim() || aiLoading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setAiLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/api/trips/shared/${shareToken}/chat`, {
        message: userMsg.content,
        history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      });
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, having trouble right now!" }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center">
      <RefreshCw size={28} className="animate-spin text-blue-500" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🗺️</div>
        <h2 className="text-xl font-bold text-stone-800 mb-2">Trip Not Found</h2>
        <p className="text-stone-500 text-sm">{error}</p>
      </div>
    </div>
  );

  const afford = trip.affordability || {};
  const tripNights = nights(trip.start_date, trip.end_date);

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      {/* Header */}
      <div className="bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 px-4 py-5 text-white">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-sky-200 text-xs font-semibold uppercase tracking-widest mb-0.5">✈️ Shared Itinerary</p>
            <h1 className="text-2xl font-extrabold font-['Outfit']">{trip.destination}</h1>
            <p className="text-sky-200 text-sm mt-0.5">
              {trip.start_date} → {trip.end_date} · {tripNights} nights · {trip.travelers} {trip.travelers === 1 ? "person" : "people"}
            </p>
          </div>
          <div className="text-4xl hidden sm:block">🌍</div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Cost", value: fmtShort(trip.estimated_cost_inr) },
            { label: "Per Person", value: fmtShort((trip.estimated_cost_inr || 0) / (trip.travelers || 1)) },
            { label: "Nights", value: tripNights },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-3 text-center">
              <p className="text-[10px] text-stone-400 uppercase tracking-wide">{label}</p>
              <p className="font-bold text-stone-800 text-sm mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Affordability */}
        {afford.suggestion && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-sm font-semibold ${
            afford.can_afford_now ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            {afford.can_afford_now ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {afford.suggestion}
          </div>
        )}

        {/* Itinerary */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
          <p className="font-semibold text-stone-800 text-sm mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-blue-500" /> Day-by-Day Itinerary
            <span className="ml-auto text-[10px] text-stone-400 font-normal">Tap a day to edit</span>
          </p>
          <div className="space-y-3">
            {(trip.itinerary || []).map((day, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-xs font-extrabold text-white cursor-pointer hover:bg-blue-600 transition-colors"
                    onClick={() => openDay(idx)}>
                    {day.day || idx + 1}
                  </div>
                  {idx < (trip.itinerary?.length || 0) - 1 && <div className="w-0.5 bg-blue-100 flex-1 mt-1 min-h-[1rem]" />}
                </div>
                <button className="pb-3 flex-1 min-w-0 text-left group hover:bg-blue-50/50 rounded-xl px-2 -mx-2 transition-colors" onClick={() => openDay(idx)}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-stone-800 text-sm group-hover:text-blue-700 transition-colors">{day.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {day.estimated_cost_inr > 0 && <span className="text-xs text-blue-600 font-semibold">~{fmtShort(day.estimated_cost_inr)}</span>}
                      <Edit3 size={11} className="text-stone-300 group-hover:text-blue-400 transition-colors" />
                    </div>
                  </div>
                  {day.location && <p className="text-[10px] text-stone-400 mb-1">📍 {day.location}</p>}
                  {(day.activities || day.highlights || []).slice(0, 3).map((a, ai) => (
                    <p key={ai} className="text-xs text-stone-500 flex items-start gap-1.5"><span className="text-blue-400 mt-0.5">•</span>{a}</p>
                  ))}
                  {(day.activities || day.highlights || []).length > 3 && (
                    <p className="text-xs text-blue-500 font-medium mt-0.5">+{(day.activities || day.highlights).length - 3} more…</p>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Info cards */}
        {trip.best_months && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <Sun size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div><p className="font-semibold text-amber-800 text-sm">📅 Best Time to Visit</p><p className="text-xs text-amber-700 mt-0.5">{trip.best_months}</p></div>
          </div>
        )}
        {trip.visa_info && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
            <CreditCard size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <div><p className="font-semibold text-blue-800 text-sm">🛂 Visa (Indian Passport)</p><p className="text-xs text-blue-700 mt-0.5">{trip.visa_info}</p></div>
          </div>
        )}
        {trip.currency_tip && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3">
            <Banknote size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div><p className="font-semibold text-emerald-800 text-sm">💱 Currency Tips</p><p className="text-xs text-emerald-700 mt-0.5">{trip.currency_tip}</p></div>
          </div>
        )}
      </div>

      {/* Day Edit Dialog */}
      {dayDetail && dayForm && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-stone-800 font-['Outfit']">📅 Day {dayDetail.idx + 1}</h3>
              <button onClick={() => setDayDetail(null)} className="text-stone-400 hover:text-stone-600"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">Day Title</label>
                <input value={dayForm.title} onChange={e => setDayForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-stone-600 mb-1 block">📍 Location</label>
                  <input value={dayForm.location} onChange={e => setDayForm(f => ({ ...f, location: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600 mb-1 block">💰 Est. Cost (₹)</label>
                  <input type="number" value={dayForm.estimated_cost_inr} onChange={e => setDayForm(f => ({ ...f, estimated_cost_inr: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">Activities (one per line)</label>
                <textarea value={dayForm.activities} rows={6} onChange={e => setDayForm(f => ({ ...f, activities: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDayDetail(null)} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-semibold">Cancel</button>
                <button onClick={saveDay} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating AI Guide */}
      {!aiOpen && (
        <button onClick={() => setAiOpen(true)}
          className="fixed bottom-6 right-4 z-[500] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-95 bg-gradient-to-r from-sky-500 to-indigo-600 text-white">
          <Bot size={16} />
          <span className="text-xs font-bold font-['Outfit']">Ask AI Guide</span>
          <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
        </button>
      )}

      {aiOpen && (
        <div className="fixed bottom-6 right-4 w-[340px] h-[480px] z-[999] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: "linear-gradient(160deg,#0c1b3a,#0a1628,#071020)", border: "1px solid rgba(99,160,255,0.25)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0"
            style={{ borderColor: "rgba(99,160,255,0.2)", background: "rgba(10,22,50,0.95)" }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-sm">🗺️</div>
              <div>
                <p className="text-xs font-bold text-sky-200 font-['Outfit']">AI Travel Guide</p>
                <p className="text-[9px] text-sky-400/60">{trip.destination} · Online</p>
              </div>
            </div>
            <button onClick={() => setAiOpen(false)} className="text-sky-300/50 hover:text-sky-200"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                {m.role === "assistant" && <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-xs shrink-0 mt-0.5">🗺️</div>}
                <div className={`max-w-[85%] px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap rounded-2xl ${m.role === "user" ? "bg-sky-600 text-white rounded-tr-sm" : "text-sky-100 rounded-tl-sm"}`}
                  style={m.role === "assistant" ? { background: "rgba(30,55,100,0.7)", border: "1px solid rgba(99,160,255,0.2)" } : {}}>
                  {m.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-xs shrink-0">🗺️</div>
                <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-xs text-sky-300 flex items-center gap-2"
                  style={{ background: "rgba(30,55,100,0.7)", border: "1px solid rgba(99,160,255,0.2)" }}>
                  <Loader2 size={11} className="animate-spin" /> thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {messages.length <= 2 && (
            <div className="px-3 py-2 shrink-0 flex gap-1.5 flex-wrap" style={{ borderTop: "1px solid rgba(99,160,255,0.15)" }}>
              {["Best food spots?", "What to pack?", "How to save ₹?", "Day 1 tips?"].map(q => (
                <button key={q} onClick={() => setInput(q)} className="text-[10px] px-2 py-1 rounded-lg"
                  style={{ background: "rgba(30,55,100,0.6)", border: "1px solid rgba(99,160,255,0.25)", color: "#93c5fd" }}>{q}</button>
              ))}
            </div>
          )}
          <div className="px-3 py-2.5 shrink-0 flex gap-2" style={{ borderTop: "1px solid rgba(99,160,255,0.15)", background: "rgba(7,16,32,0.95)" }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendAI())}
              placeholder="Ask anything about the trip…"
              className="flex-1 h-8 rounded-xl px-3 text-xs outline-none"
              style={{ background: "rgba(30,55,100,0.6)", border: "1px solid rgba(99,160,255,0.25)", color: "#e0eeff" }}
              disabled={aiLoading} />
            <button onClick={sendAI} disabled={aiLoading || !input.trim()}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#3b82f6,#4f46e5)" }}>
              <Send size={12} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
