import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { useStaleData } from "@/hooks/useStaleData";
import Navigation from "@/components/Navigation";
import PageLoader from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Coins, Plus, Trash2, Edit3, RefreshCw, TrendingUp, TrendingDown,
  Clock, Info, Sparkles, Star, Bot, ChevronRight,
} from "lucide-react";
import ResetDataButton from '@/components/ResetDataButton';
import { DatePicker } from "@/components/DatePicker";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR = (n) =>
  `₹${Math.round(Math.abs(n) || 0).toLocaleString("en-IN")}`;

const fmtShort = (n) => {
  const abs = Math.abs(n || 0);
  const sign = (n || 0) < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
};

const TYPE_LABEL = {
  physical:  "Physical",
  sgb:       "SGB",
  gold_etf:  "ETF",
  digital:   "Digital",
};

const TYPE_FULL = {
  physical:  "Physical Gold",
  sgb:       "Sovereign Gold Bond",
  gold_etf:  "Gold ETF",
  digital:   "Digital Gold",
};

const TYPE_STYLE = {
  physical:  "bg-amber-100 text-amber-800 border border-amber-200",
  sgb:       "bg-yellow-100 text-yellow-800 border border-yellow-200",
  gold_etf:  "bg-orange-100 text-orange-800 border border-orange-200",
  digital:   "bg-stone-100  text-stone-700  border border-stone-200",
};

const isWeightBased = (type) => type === "physical" || type === "digital";

const EMPTY_FORM = {
  name: "", type: "", karat: "24", weight_grams: "", quantity: "",
  purchase_price_per_gram: "", purchase_price_per_unit: "",
  purchase_date: "", notes: "",
};

const KARAT_LABEL = { 24: "24K", 22: "22K", 18: "18K" };
const KARAT_STYLE = {
  24: "bg-amber-100 text-amber-800 border border-amber-200",
  22: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  18: "bg-orange-100 text-orange-800 border border-orange-200",
};

// ── Shimmer keyframes injected once ──────────────────────────────────────────
const shimmerCSS = `
@keyframes goldShimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}
@keyframes float {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50%       { transform: translateY(-6px) rotate(3deg); }
}
@keyframes sparkle {
  0%, 100% { opacity: 0; transform: scale(0.5); }
  50%       { opacity: 1; transform: scale(1); }
}
`;

// Reverse-geocode lat/lng → city name using OSM Nominatim (no key needed)
async function detectCity() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const d = await r.json();
          const city =
            d.address?.city ||
            d.address?.town ||
            d.address?.village ||
            d.address?.county ||
            null;
          resolve(city);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null),
      { timeout: 6000 }
    );
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
const GoldTracker = () => {
  const [livePrice, setLivePrice]       = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [addOpen, setAddOpen]           = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [editForm, setEditForm]         = useState(EMPTY_FORM);
  const [advice, setAdvice]             = useState(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [userCity, setUserCity]         = useState(() => localStorage.getItem("bm_city") || "");

  const fetchPrice = useCallback(async (city) => {
    setPriceLoading(true);
    try {
      const params = city ? `?city=${encodeURIComponent(city)}` : "";
      const res = await axios.get(`${API}/gold/price${params}`);
      setLivePrice(res.data);
    } catch {
      toast.error("Could not fetch live gold price");
    } finally {
      setPriceLoading(false);
    }
  }, []);

  const fetchSummaryFn = useCallback(async () => {
    const res = await axios.get(`${API}/gold/summary`);
    return res.data || null;
  }, []);

  const { data: summary, loading, reload: fetchGold } = useStaleData(
    "bm_gold_cache",
    fetchSummaryFn,
    { errorMsg: "Failed to load gold portfolio", fallback: null }
  );

  const fetchAdvice = useCallback(async () => {
    setAdviceLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/gold/buy-advice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAdvice(res.data);
    } catch {
      // silently fail — advice is optional
    } finally {
      setAdviceLoading(false);
    }
  }, []);

  // Fetch live price on mount using cached/detected city
  useEffect(() => {
    const cachedCity = localStorage.getItem("bm_city");
    if (cachedCity) {
      fetchPrice(cachedCity);
    } else {
      detectCity().then(city => {
        if (city) {
          localStorage.setItem("bm_city", city);
          setUserCity(city);
          fetchPrice(city);
        } else {
          fetchPrice("");
        }
      });
    }
  }, [fetchPrice]);

  const handleAdd = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await axios.post(`${API}/gold`, {
        name: form.name, type: form.type,
        karat:                   parseInt(form.karat || 24),
        weight_grams:            parseFloat(form.weight_grams || 0),
        quantity:                parseFloat(form.quantity || 0),
        purchase_price_per_gram: parseFloat(form.purchase_price_per_gram || 0),
        purchase_price_per_unit: parseFloat(form.purchase_price_per_unit || 0),
        purchase_date: form.purchase_date || "", notes: form.notes,
      });
      toast.success("Gold holding added! ✨");
      setAddOpen(false); setForm(EMPTY_FORM); fetchGold();
    } catch (err) {
      if (err.response?.status !== 402) toast.error("Failed to add item");
    } finally { setSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await axios.put(`${API}/gold/${editTarget.id}`, {
        name: editForm.name, type: editForm.type,
        karat:                   parseInt(editForm.karat || 24),
        weight_grams:            parseFloat(editForm.weight_grams || 0),
        quantity:                parseFloat(editForm.quantity || 0),
        purchase_price_per_gram: parseFloat(editForm.purchase_price_per_gram || 0),
        purchase_price_per_unit: parseFloat(editForm.purchase_price_per_unit || 0),
        purchase_date: editForm.purchase_date || "", notes: editForm.notes,
      });
      toast.success("Updated!");
      setEditTarget(null); fetchGold();
    } catch { toast.error("Failed to update"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await axios.delete(`${API}/gold/${deleteTarget.id}`);
      toast.success("Removed");
      setDeleteTarget(null); fetchGold();
    } catch { toast.error("Failed to delete"); }
    finally { setSubmitting(false); }
  };

  const openEdit = (item) => {
    setEditTarget(item);
    setEditForm({
      name: item.name, type: item.type,
      karat: String(item.karat || 24),
      weight_grams: item.weight_grams, quantity: item.quantity,
      purchase_price_per_gram: item.purchase_price_per_gram,
      purchase_price_per_unit: item.purchase_price_per_unit,
      purchase_date: item.purchase_date || "", notes: item.notes || "",
    });
  };

  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-[#fffaf5] flex items-center justify-center">
        <PageLoader message="Loading your gold portfolio…" tips={["Fetching live prices", "Calculating P&L", "Summarising holdings"]} />
      </div>
    </>
  );

  const items       = summary?.items || [];
  const totalValue  = summary?.total_current_value || 0;
  const totalCost   = summary?.total_purchase_value || 0;
  const totalPnL    = totalValue - totalCost;
  const pnlPct      = totalCost > 0 ? ((totalPnL / totalCost) * 100).toFixed(1) : null;
  const totalWeight  = items.filter(i => isWeightBased(i.type)).reduce((s, i) => s + (i.weight_grams || 0), 0);
  const price24k     = livePrice?.price_24k_per_gram || livePrice?.price_per_gram_inr;
  const price22k     = livePrice?.price_22k_per_gram || (price24k ? Math.round(price24k * 22 / 24) : null);
  const pricePerGram = price24k; // kept for compat

  return (
    <>
      <style>{shimmerCSS}</style>
      <Navigation />

      {/* Gold-tinted page background */}
      <div className="min-h-[calc(100vh-80px)]" style={{ background: "linear-gradient(160deg, #fffbeb 0%, #fef9ee 50%, #fffaf5 100%)" }}>
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg"
                style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}>
                <Coins size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-['Outfit']" style={{ background: "linear-gradient(135deg, #92400E, #B45309, #D97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Gold Tracker
                </h1>
                <p className="text-amber-700/60 text-sm mt-0.5">Live prices · Track all your gold holdings</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ResetDataButton feature="gold" label="gold holdings" onReset={fetchGold} />
              <Button
                onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
                className="font-semibold shadow-lg border-0"
                style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", boxShadow: "0 4px 15px rgba(245,158,11,0.35)" }}
              >
                <Plus size={16} className="mr-1.5" /> Add Gold
              </Button>
            </div>
          </div>

          {/* ── Your Gold Worth Banner ── */}
          {totalValue > 0 && (
            <div className="mb-4 rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, #92400E15, #F59E0B15)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <div>
                <p className="text-[10px] font-bold text-amber-700/60 uppercase tracking-widest">Your gold is worth today</p>
                <p className="text-2xl font-extrabold font-['Outfit']" style={{ background: "linear-gradient(135deg, #92400E, #D97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {fmtINR(totalValue)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-amber-700/60 font-semibold">{totalWeight.toFixed(2)}g held</p>
                <p className={`text-sm font-bold mt-0.5 ${totalPnL >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {totalPnL >= 0 ? "+" : ""}{fmtINR(totalPnL)} {pnlPct !== null ? `(${totalPnL >= 0 ? "+" : ""}${pnlPct}%)` : ""}
                </p>
              </div>
            </div>
          )}

          {/* ── Live Price Hero Banner ── */}
          <div className="relative overflow-hidden rounded-3xl mb-5 p-6"
            style={{
              background: "linear-gradient(135deg, #78350F 0%, #92400E 20%, #B45309 50%, #D97706 75%, #F59E0B 100%)",
              boxShadow: "0 8px 32px rgba(180,83,9,0.35)",
            }}>

            {/* Shimmer overlay */}
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
              background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
              backgroundSize: "800px 100%",
              animation: "goldShimmer 3s infinite linear",
            }} />

            {/* Glowing orbs */}
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(253,230,138,0.3) 0%, transparent 70%)" }} />
            <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(251,191,36,0.2) 0%, transparent 70%)" }} />

            {/* Floating sparkle dots */}
            {[
              { top: "15%", right: "18%", delay: "0s",   size: 6 },
              { top: "60%", right: "10%", delay: "0.7s", size: 4 },
              { top: "25%", right: "35%", delay: "1.4s", size: 5 },
              { top: "70%", right: "40%", delay: "0.3s", size: 3 },
            ].map((s, i) => (
              <div key={i} className="absolute pointer-events-none rounded-full"
                style={{ top: s.top, right: s.right, width: s.size, height: s.size,
                  background: "rgba(253,230,138,0.8)", animation: `sparkle 2s ${s.delay} infinite` }} />
            ))}

            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={13} className="text-amber-200" />
                  <div>
                    <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Live Gold Prices</p>
                    {userCity && (
                      <p className="text-amber-300/70 text-[10px] font-medium mt-0.5">📍 {userCity}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => fetchPrice(userCity)} disabled={priceLoading}
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white/90 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-all border border-white/20 backdrop-blur-sm">
                  <RefreshCw size={11} className={priceLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>

              {priceLoading ? (
                <div className="space-y-3 mt-2">
                  <div className="h-10 rounded-xl animate-pulse w-64" style={{ background: "rgba(255,255,255,0.15)" }} />
                  <div className="h-8 rounded-xl animate-pulse w-56" style={{ background: "rgba(255,255,255,0.1)" }} />
                </div>
              ) : price24k ? (
                <>
                  {/* 24K — primary */}
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold text-amber-300 bg-white/15 px-2 py-0.5 rounded-full border border-white/20">24K</span>
                    <span className="text-4xl font-extrabold font-['Outfit'] leading-none text-white tracking-tight">
                      {fmtINR(price24k)}
                    </span>
                    <span className="text-sm font-semibold text-amber-200">/gram</span>
                  </div>
                  {/* 22K — secondary */}
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-xs font-bold text-amber-300/80 bg-white/10 px-2 py-0.5 rounded-full border border-white/15">22K</span>
                    <span className="text-2xl font-bold font-['Outfit'] leading-none text-white/80 tracking-tight">
                      {fmtINR(price22k)}
                    </span>
                    <span className="text-xs font-medium text-amber-200/70">/gram</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 bg-white/15 text-white/80 text-xs px-2.5 py-1 rounded-full border border-white/20 backdrop-blur-sm">
                      <span className={`w-1.5 h-1.5 rounded-full ${livePrice?.stale ? "bg-amber-400" : "bg-emerald-300 animate-pulse"}`} />
                      {livePrice?.stale ? "Estimated" : "Live price"}
                    </span>
                    {!livePrice?.stale && (
                      <span className="flex items-center gap-1 text-amber-300/70 text-xs">
                        <Clock size={10} /> Updated just now
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-amber-200 text-sm mt-3">Price unavailable — tap Refresh</p>
              )}
            </div>
          </div>

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              {
                label: "Total Weight",
                value: `${totalWeight.toFixed(2)}g`,
                sub: "physical & digital",
                icon: "⚖️",
                accent: "from-amber-50 to-yellow-50",
                border: "border-amber-200/50",
                textColor: "text-amber-800",
              },
              {
                label: "Portfolio Value",
                value: fmtShort(totalValue),
                sub: "at live price",
                icon: "💰",
                accent: "from-yellow-50 to-amber-50",
                border: "border-yellow-200/50",
                textColor: "text-yellow-800",
              },
              {
                label: "Total P&L",
                value: `${totalPnL >= 0 ? "+" : ""}${fmtShort(totalPnL)}`,
                sub: pnlPct !== null ? `${totalPnL >= 0 ? "+" : ""}${pnlPct}% return` : "no cost basis",
                icon: totalPnL >= 0 ? "📈" : "📉",
                accent: totalPnL >= 0 ? "from-emerald-50 to-green-50" : "from-red-50 to-rose-50",
                border: totalPnL >= 0 ? "border-emerald-200/50" : "border-red-200/50",
                textColor: totalPnL >= 0 ? "text-emerald-700" : "text-red-600",
              },
            ].map(({ label, value, sub, icon, accent, border, textColor }) => (
              <div key={label} className={`bg-gradient-to-br ${accent} rounded-2xl border ${border} shadow-sm p-4 relative overflow-hidden`}>
                <div className="absolute top-2 right-2.5 text-lg opacity-40">{icon}</div>
                <p className={`font-extrabold text-base font-['Outfit'] leading-none ${textColor}`}>{value}</p>
                <p className="text-stone-600 text-[11px] mt-1.5 font-semibold">{label}</p>
                <p className="text-stone-400 text-[10px] mt-0.5 leading-tight">{sub}</p>
              </div>
            ))}
          </div>

          {/* ── Items List ── */}
          {items.length === 0 ? (
            <div className="rounded-3xl border border-amber-200/40 p-12 text-center relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #fffbeb, #fef3c7, #fffbeb)" }}>
              {/* floating coin animation */}
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl"
                style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", animation: "float 3s ease-in-out infinite", boxShadow: "0 8px 24px rgba(245,158,11,0.4)" }}>
                <Coins size={32} className="text-white" />
              </div>
              <p className="font-bold text-amber-900 text-lg font-['Outfit']">No gold holdings yet</p>
              <p className="text-amber-700/60 text-sm mt-1.5 max-w-xs mx-auto leading-relaxed">
                Add physical gold, SGBs, Gold ETFs, or digital gold to track your portfolio with live prices.
              </p>
              <Button
                onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
                className="mt-6 font-semibold shadow-lg border-0"
                style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", boxShadow: "0 4px 15px rgba(245,158,11,0.4)" }}
              >
                <Plus size={15} className="mr-1.5" /> Add First Holding
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const pnl        = (item.current_value || 0) - (item.purchase_value || 0);
                const pnlPctItem = item.purchase_value > 0 ? ((pnl / item.purchase_value) * 100).toFixed(1) : null;
                const typeStyle  = TYPE_STYLE[item.type] || TYPE_STYLE.physical;

                return (
                  <div key={item.id} className="relative overflow-hidden rounded-2xl border border-amber-200/40 bg-white hover:shadow-md transition-all group"
                    style={{ boxShadow: "0 2px 12px rgba(245,158,11,0.08)" }}>

                    {/* Gold left accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                      style={{ background: "linear-gradient(to bottom, #F59E0B, #D97706)" }} />

                    {/* Subtle shimmer on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl"
                      style={{ background: "linear-gradient(105deg, transparent 40%, rgba(253,230,138,0.08) 50%, transparent 60%)" }} />

                    <div className="px-5 py-4 pl-6">
                      <div className="flex items-start gap-3">
                        {/* Gold coin icon */}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md"
                          style={{ background: "linear-gradient(135deg, #FCD34D, #F59E0B)" }}>
                          <Coins size={18} className="text-amber-900" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-stone-800 text-sm">{item.name}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeStyle}`}>
                              {TYPE_LABEL[item.type] || item.type}
                            </span>
                            {isWeightBased(item.type) && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${KARAT_STYLE[item.karat || 24]}`}>
                                {KARAT_LABEL[item.karat || 24]}
                              </span>
                            )}
                            {isWeightBased(item.type) && item.weight_grams > 0 && (
                              <span className="text-[11px] text-amber-700/70 font-medium">{item.weight_grams}g</span>
                            )}
                            {!isWeightBased(item.type) && item.quantity > 0 && (
                              <span className="text-[11px] text-amber-700/70 font-medium">{item.quantity} units</span>
                            )}
                            {item.purchase_date && (
                              <span className="text-[11px] text-stone-400">
                                {new Date(item.purchase_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                            )}
                          </div>
                          {item.notes && (
                            <p className="text-[11px] text-stone-400 mt-0.5 truncate">{item.notes}</p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <p className="font-extrabold text-sm font-['Outfit']"
                            style={{ background: "linear-gradient(135deg, #92400E, #D97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                            {fmtINR(item.current_value || 0)}
                          </p>
                          {item.purchase_value > 0 && (
                            <p className="text-[11px] text-stone-400 mt-0.5">cost {fmtINR(item.purchase_value)}</p>
                          )}
                          {pnlPctItem !== null && (
                            <p className={`text-xs font-bold flex items-center justify-end gap-0.5 mt-0.5 ${pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {pnl >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                              {pnl >= 0 ? "+" : ""}{fmtShort(pnl)} ({Math.abs(parseFloat(pnlPctItem))}%)
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-1 mt-2.5 pt-2.5 border-t border-amber-50">
                        <button onClick={() => openEdit(item)}
                          className="flex items-center gap-1 px-2.5 py-1 text-amber-700/70 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors text-xs font-semibold">
                          <Edit3 size={11} /> Edit
                        </button>
                        <button onClick={() => setDeleteTarget(item)}
                          className="flex items-center gap-1 px-2.5 py-1 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors text-xs font-semibold">
                          <Trash2 size={11} /> Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Chanakya "Should I buy gold?" advice ── */}
          <div className="rounded-2xl border border-amber-200/60 overflow-hidden mt-5"
            style={{ background: "linear-gradient(135deg, #fffbeb 0%, #fef9ee 50%, #fff8e8 100%)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}>
                  <Bot size={13} className="text-white" />
                </div>
                <p className="text-sm font-bold text-amber-900">Chanakya — Should I buy gold?</p>
              </div>
              {advice && (
                <button onClick={fetchAdvice} disabled={adviceLoading}
                  className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-800 font-semibold px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors">
                  <RefreshCw size={10} className={adviceLoading ? "animate-spin" : ""} /> Ask again
                </button>
              )}
            </div>
            <div className="px-4 py-4">
              {adviceLoading ? (
                <div className="space-y-2">
                  <div className="h-3 bg-amber-100 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-amber-100 rounded animate-pulse w-full" />
                  <div className="h-3 bg-amber-100 rounded animate-pulse w-2/3" />
                </div>
              ) : advice ? (
                <div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {advice.monthly_surplus !== undefined && (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        advice.monthly_surplus >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}>
                        Surplus: {advice.monthly_surplus >= 0 ? "+" : ""}₹{Math.round(advice.monthly_surplus).toLocaleString("en-IN")}/mo
                      </span>
                    )}
                    {advice.gold_portfolio_pct !== undefined && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                        Gold: {advice.gold_portfolio_pct}% of portfolio
                      </span>
                    )}
                    {advice.total_gold_grams > 0 && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800">
                        {advice.total_gold_grams.toFixed(1)}g = {fmtINR(advice.total_gold_value)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{advice.advice}</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-2">
                  <p className="text-sm text-amber-700/60 text-center">Get Chanakya's personalised advice on whether to buy gold now based on your finances.</p>
                  <button onClick={fetchAdvice} disabled={adviceLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                    style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}>
                    <Bot size={14} /> Ask Chanakya
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-amber-700/40 mt-4">
            <Star size={10} className="fill-amber-300 text-amber-300" />
            Indian market price via MCX · 22K = 24K × 22/24 · SGB/ETF valued at 24K rate
          </p>

        </div>
      </div>

      {/* ── Add Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins size={16} className="text-amber-500" /> Add Gold Holding
            </DialogTitle>
          </DialogHeader>
          <GoldForm form={form} setForm={setForm} onSubmit={handleAdd} onCancel={() => setAddOpen(false)} submitting={submitting} submitLabel="Add Holding" />
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 size={15} className="text-amber-500" /> Edit — {editTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <GoldForm form={editForm} setForm={setEditForm} onSubmit={handleEdit} onCancel={() => setEditTarget(null)} submitting={submitting} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Remove Holding?</DialogTitle></DialogHeader>
          <p className="text-stone-500 text-sm mt-2">
            Remove <span className="font-semibold text-stone-700">{deleteTarget?.name}</span> from your gold portfolio?
          </p>
          <div className="flex gap-3 mt-5">
            <Button onClick={handleDelete} disabled={submitting} className="flex-1 bg-red-500 hover:bg-red-600">
              <Trash2 size={13} className="mr-1.5" /> Yes, Remove
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Reusable form ─────────────────────────────────────────────────────────────
const GoldForm = ({ form, setForm, onSubmit, onCancel, submitting, submitLabel }) => {
  const weightBased = isWeightBased(form.type);
  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) });

  return (
    <form onSubmit={onSubmit} className="space-y-4 mt-2">
      <div>
        <Label className="text-sm font-medium text-stone-700">Name *</Label>
        <Input {...f("name")} placeholder="e.g. Gold Chain, SGB 2024-I" required className="mt-1.5 focus:border-amber-400" />
      </div>

      <div>
        <Label className="text-sm font-medium text-stone-700">Type *</Label>
        <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
          <SelectTrigger className="mt-1.5 focus:border-amber-400">
            <SelectValue placeholder="Select gold type…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="physical">🪙 Physical Gold</SelectItem>
            <SelectItem value="sgb">📜 Sovereign Gold Bond (SGB)</SelectItem>
            <SelectItem value="gold_etf">📊 Gold ETF</SelectItem>
            <SelectItem value="digital">💻 Digital Gold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {form.type && weightBased && (
        <div>
          <Label className="text-sm font-medium text-stone-700">Karat / Purity *</Label>
          <div className="flex gap-2 mt-1.5">
            {[["24", "24K — Pure / Investment"], ["22", "22K — Most Jewellery"], ["18", "18K — Modern Jewellery"]].map(([val, label]) => (
              <button
                key={val} type="button"
                onClick={() => setForm(p => ({ ...p, karat: val }))}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                  form.karat === val
                    ? "bg-amber-500 text-white border-amber-500 shadow-md"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:border-amber-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {form.type && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium text-stone-700">
              {weightBased ? "Weight (grams) *" : "Quantity (units) *"}
            </Label>
            <Input
              type="number" step="0.001" min="0" required
              {...(weightBased ? f("weight_grams") : f("quantity"))}
              placeholder={weightBased ? "e.g. 10.5" : "e.g. 5"}
              className="mt-1.5 focus:border-amber-400"
            />
          </div>
          <div>
            <Label className="text-sm font-medium text-stone-700">
              {weightBased ? "Buy Price/gram (₹) *" : "Buy Price/unit (₹) *"}
            </Label>
            <Input
              type="number" step="1" min="0" required
              {...(weightBased ? f("purchase_price_per_gram") : f("purchase_price_per_unit"))}
              placeholder={weightBased ? "e.g. 6200" : "e.g. 5800"}
              className="mt-1.5 focus:border-amber-400"
            />
          </div>
        </div>
      )}

      <div>
        <Label className="text-sm font-medium text-stone-700">Purchase Date <span className="text-stone-400 font-normal">— optional</span></Label>
        <DatePicker value={form.purchase_date} onChange={v => setForm(p => ({ ...p, purchase_date: v }))} className="mt-1.5" />
      </div>

      <div>
        <Label className="text-sm font-medium text-stone-700">Notes <span className="text-stone-400 font-normal">— optional</span></Label>
        <Input {...f("notes")} placeholder="e.g. locker #3, certificate no." className="mt-1.5 focus:border-amber-400" />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={submitting || !form.type || !form.name}
          className="flex-1 border-0 font-semibold shadow-md"
          style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", boxShadow: "0 4px 12px rgba(245,158,11,0.3)" }}>
          ✨ {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

export default GoldTracker;
