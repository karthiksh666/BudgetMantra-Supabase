import { useState, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import Navigation from "@/components/Navigation";
import PageLoader from "@/components/PageLoader";
import { useStaleData } from "@/hooks/useStaleData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Coins, Plus, Trash2, Edit3, RefreshCw, TrendingUp, TrendingDown,
  Clock, Sparkles, Star, Bot,
} from "lucide-react";
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
  physical:   "Physical",
  silver_etf: "ETF",
  digital:    "Digital",
};

const TYPE_STYLE = {
  physical:   "bg-slate-100 text-slate-700 border border-slate-200",
  silver_etf: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  digital:    "bg-gray-100 text-gray-700 border border-gray-200",
};

const isWeightBased = (type) => type === "physical" || type === "digital";

const PURITY_LABEL = { 999: "999 Fine", 925: "925 Sterling", 800: "800 European" };
const PURITY_STYLE = {
  999: "bg-slate-200 text-slate-800 border border-slate-300",
  925: "bg-zinc-100  text-zinc-700  border border-zinc-200",
  800: "bg-gray-100  text-gray-600  border border-gray-200",
};

const EMPTY_FORM = {
  name: "", type: "", purity: "999", weight_grams: "", quantity: "",
  purchase_price_per_gram: "", purchase_price_per_unit: "",
  purchase_date: "", notes: "",
};

// ── CSS animations ─────────────────────────────────────────────────────────────
const shimmerCSS = `
@keyframes silverShimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}
@keyframes floatSilver {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50%       { transform: translateY(-6px) rotate(-3deg); }
}
@keyframes sparkleSilver {
  0%, 100% { opacity: 0; transform: scale(0.5); }
  50%       { opacity: 1; transform: scale(1); }
}
`;

// ── Main Component ────────────────────────────────────────────────────────────
const SilverTracker = () => {
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

  const fetchPrice = useCallback(async () => {
    setPriceLoading(true);
    try {
      const res = await axios.get(`${API}/silver/price`);
      setLivePrice(res.data);
    } catch {
      toast.error("Could not fetch live silver price");
    } finally {
      setPriceLoading(false);
    }
  }, []);

  const fetchSummaryData = useCallback(async () => {
    const res = await axios.get(`${API}/silver/summary`);
    return res.data;
  }, []);

  const { data: summary, loading, reload: fetchData } = useStaleData(
    "bm_silver_cache",
    fetchSummaryData,
    { errorMsg: "Failed to load silver portfolio", fallback: null }
  );

  const fetchAdvice = useCallback(async () => {
    setAdviceLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/silver/buy-advice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAdvice(res.data);
    } catch {
      // silently fail
    } finally {
      setAdviceLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  const handleAdd = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await axios.post(`${API}/silver`, {
        name: form.name, type: form.type,
        purity:                  parseInt(form.purity || 999),
        weight_grams:            parseFloat(form.weight_grams || 0),
        quantity:                parseFloat(form.quantity || 0),
        purchase_price_per_gram: parseFloat(form.purchase_price_per_gram || 0),
        purchase_price_per_unit: parseFloat(form.purchase_price_per_unit || 0),
        purchase_date: form.purchase_date || "", notes: form.notes,
      });
      toast.success("Silver holding added! ✨");
      setAddOpen(false); setForm(EMPTY_FORM); fetchData();
    } catch (err) {
      if (err.response?.status !== 402) toast.error("Failed to add item");
    } finally { setSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await axios.put(`${API}/silver/${editTarget.id}`, {
        name: editForm.name, type: editForm.type,
        purity:                  parseInt(editForm.purity || 999),
        weight_grams:            parseFloat(editForm.weight_grams || 0),
        quantity:                parseFloat(editForm.quantity || 0),
        purchase_price_per_gram: parseFloat(editForm.purchase_price_per_gram || 0),
        purchase_price_per_unit: parseFloat(editForm.purchase_price_per_unit || 0),
        purchase_date: editForm.purchase_date || "", notes: editForm.notes,
      });
      toast.success("Updated!");
      setEditTarget(null); fetchData();
    } catch { toast.error("Failed to update"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await axios.delete(`${API}/silver/${deleteTarget.id}`);
      toast.success("Removed");
      setDeleteTarget(null); fetchData();
    } catch { toast.error("Failed to delete"); }
    finally { setSubmitting(false); }
  };

  const openEdit = (item) => {
    setEditTarget(item);
    setEditForm({
      name: item.name, type: item.type,
      purity: String(item.purity || 999),
      weight_grams: item.weight_grams, quantity: item.quantity,
      purchase_price_per_gram: item.purchase_price_per_gram,
      purchase_price_per_unit: item.purchase_price_per_unit,
      purchase_date: item.purchase_date || "", notes: item.notes || "",
    });
  };

  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-slate-50 flex items-center justify-center">
        <PageLoader message="Loading your silver portfolio…" tips={["Fetching MCX prices", "Calculating P&L", "Summarising holdings"]} />
      </div>
    </>
  );

  const items        = summary?.items || [];
  const totalValue   = summary?.total_current_value || 0;
  const totalCost    = summary?.total_purchase_value || 0;
  const totalPnL     = totalValue - totalCost;
  const pnlPct       = totalCost > 0 ? ((totalPnL / totalCost) * 100).toFixed(1) : null;
  const totalWeight  = items.filter(i => isWeightBased(i.type)).reduce((s, i) => s + (i.weight_grams || 0), 0);
  const price999     = livePrice?.price_999_per_gram || livePrice?.price_per_gram_inr;
  const price925     = livePrice?.price_925_per_gram || (price999 ? Math.round(price999 * 925 / 999) : null);

  return (
    <>
      <style>{shimmerCSS}</style>
      <Navigation />

      {/* Silver-tinted page background */}
      <div className="min-h-[calc(100vh-80px)]" style={{ background: "linear-gradient(160deg, #f1f5f9 0%, #f8fafc 50%, #f5f5f5 100%)" }}>
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg"
                style={{ background: "linear-gradient(135deg, #94a3b8, #64748b)" }}>
                <Coins size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-['Outfit']"
                  style={{ background: "linear-gradient(135deg, #1e293b, #475569, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Silver Tracker
                </h1>
                <p className="text-slate-500 text-sm mt-0.5">Live MCX prices · Track all your silver holdings</p>
              </div>
            </div>
            <Button
              onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
              className="font-semibold shadow-lg border-0"
              style={{ background: "linear-gradient(135deg, #94a3b8, #64748b)", boxShadow: "0 4px 15px rgba(100,116,139,0.35)" }}
            >
              <Plus size={16} className="mr-1.5" /> Add Silver
            </Button>
          </div>

          {/* ── Your Silver Worth Banner ── */}
          {totalValue > 0 && (
            <div className="mb-4 rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, #1e293b15, #94a3b815)", border: "1px solid rgba(148,163,184,0.3)" }}>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Your silver is worth today</p>
                <p className="text-2xl font-extrabold font-['Outfit']"
                  style={{ background: "linear-gradient(135deg, #1e293b, #64748b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {fmtINR(totalValue)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-semibold">{totalWeight.toFixed(2)}g held</p>
                <p className={`text-sm font-bold mt-0.5 ${totalPnL >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {totalPnL >= 0 ? "+" : ""}{fmtINR(totalPnL)} {pnlPct !== null ? `(${totalPnL >= 0 ? "+" : ""}${pnlPct}%)` : ""}
                </p>
              </div>
            </div>
          )}

          {/* ── Live Price Hero Banner ── */}
          <div className="relative overflow-hidden rounded-3xl mb-5 p-6"
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #334155 25%, #475569 55%, #64748b 80%, #94a3b8 100%)",
              boxShadow: "0 8px 32px rgba(30,41,59,0.35)",
            }}>

            {/* Shimmer overlay */}
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
              background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.10) 50%, transparent 60%)",
              backgroundSize: "800px 100%",
              animation: "silverShimmer 3s infinite linear",
            }} />

            {/* Glowing orbs */}
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(203,213,225,0.25) 0%, transparent 70%)" }} />
            <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(148,163,184,0.2) 0%, transparent 70%)" }} />

            {/* Floating sparkle dots */}
            {[
              { top: "15%", right: "18%", delay: "0s",   size: 6 },
              { top: "60%", right: "10%", delay: "0.7s", size: 4 },
              { top: "25%", right: "35%", delay: "1.4s", size: 5 },
              { top: "70%", right: "40%", delay: "0.3s", size: 3 },
            ].map((s, i) => (
              <div key={i} className="absolute pointer-events-none rounded-full"
                style={{ top: s.top, right: s.right, width: s.size, height: s.size,
                  background: "rgba(203,213,225,0.9)", animation: `sparkleSilver 2s ${s.delay} infinite` }} />
            ))}

            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={13} className="text-slate-300" />
                  <p className="text-slate-300 text-xs font-semibold uppercase tracking-widest">Live Silver Prices</p>
                </div>
                <button onClick={fetchPrice} disabled={priceLoading}
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
              ) : price999 ? (
                <>
                  {/* 999 — primary */}
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-300 bg-white/15 px-2 py-0.5 rounded-full border border-white/20">999</span>
                    <span className="text-4xl font-extrabold font-['Outfit'] leading-none text-white tracking-tight">
                      {fmtINR(price999)}
                    </span>
                    <span className="text-sm font-semibold text-slate-300">/gram</span>
                  </div>
                  {/* 925 — secondary */}
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-xs font-bold text-slate-400 bg-white/10 px-2 py-0.5 rounded-full border border-white/15">925</span>
                    <span className="text-2xl font-bold font-['Outfit'] leading-none text-white/80 tracking-tight">
                      {fmtINR(price925)}
                    </span>
                    <span className="text-xs font-medium text-slate-400">/gram</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 bg-white/15 text-white/80 text-xs px-2.5 py-1 rounded-full border border-white/20 backdrop-blur-sm">
                      <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
                      Live MCX price
                    </span>
                    <span className="flex items-center gap-1 text-slate-400 text-xs">
                      <Clock size={10} /> Updated just now
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-slate-300 text-sm mt-3">Price unavailable — tap Refresh</p>
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
                accent: "from-slate-50 to-zinc-50",
                border: "border-slate-200/50",
                textColor: "text-slate-700",
              },
              {
                label: "Portfolio Value",
                value: fmtShort(totalValue),
                sub: "at live MCX price",
                icon: "🪙",
                accent: "from-zinc-50 to-slate-50",
                border: "border-zinc-200/50",
                textColor: "text-zinc-700",
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
            <div className="rounded-3xl border border-slate-200/60 p-12 text-center relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9, #f8fafc)" }}>
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl"
                style={{ background: "linear-gradient(135deg, #94a3b8, #64748b)", animation: "floatSilver 3s ease-in-out infinite", boxShadow: "0 8px 24px rgba(100,116,139,0.4)" }}>
                <Coins size={32} className="text-white" />
              </div>
              <p className="font-bold text-slate-700 text-lg font-['Outfit']">No silver holdings yet</p>
              <p className="text-slate-500 text-sm mt-1.5 max-w-xs mx-auto leading-relaxed">
                Add physical silver, Silver ETFs, or digital silver to track your portfolio with live MCX prices.
              </p>
              <Button
                onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
                className="mt-6 font-semibold shadow-lg border-0"
                style={{ background: "linear-gradient(135deg, #94a3b8, #64748b)", boxShadow: "0 4px 15px rgba(100,116,139,0.4)" }}
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
                  <div key={item.id} className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white hover:shadow-md transition-all group"
                    style={{ boxShadow: "0 2px 12px rgba(100,116,139,0.08)" }}>

                    {/* Silver left accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                      style={{ background: "linear-gradient(to bottom, #94a3b8, #64748b)" }} />

                    {/* Subtle shimmer on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl"
                      style={{ background: "linear-gradient(105deg, transparent 40%, rgba(203,213,225,0.08) 50%, transparent 60%)" }} />

                    <div className="px-5 py-4 pl-6">
                      <div className="flex items-start gap-3">
                        {/* Silver coin icon */}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md"
                          style={{ background: "linear-gradient(135deg, #cbd5e1, #94a3b8)" }}>
                          <Coins size={18} className="text-slate-700" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-stone-800 text-sm">{item.name}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeStyle}`}>
                              {TYPE_LABEL[item.type] || item.type}
                            </span>
                            {isWeightBased(item.type) && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PURITY_STYLE[item.purity || 999]}`}>
                                {PURITY_LABEL[item.purity || 999]}
                              </span>
                            )}
                            {isWeightBased(item.type) && item.weight_grams > 0 && (
                              <span className="text-[11px] text-slate-500 font-medium">{item.weight_grams}g</span>
                            )}
                            {!isWeightBased(item.type) && item.quantity > 0 && (
                              <span className="text-[11px] text-slate-500 font-medium">{item.quantity} units</span>
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
                            style={{ background: "linear-gradient(135deg, #1e293b, #64748b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
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

                      <div className="flex justify-end gap-1 mt-2.5 pt-2.5 border-t border-slate-50">
                        <button onClick={() => openEdit(item)}
                          className="flex items-center gap-1 px-2.5 py-1 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors text-xs font-semibold">
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

          {/* ── Chanakya "Should I buy silver?" advice ── */}
          <div className="rounded-2xl border border-slate-200/60 overflow-hidden mt-5"
            style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #94a3b8, #64748b)" }}>
                  <Bot size={13} className="text-white" />
                </div>
                <p className="text-sm font-bold text-slate-700">Chanakya — Should I buy silver?</p>
              </div>
              {advice && (
                <button onClick={fetchAdvice} disabled={adviceLoading}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 font-semibold px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
                  <RefreshCw size={10} className={adviceLoading ? "animate-spin" : ""} /> Ask again
                </button>
              )}
            </div>
            <div className="px-4 py-4">
              {adviceLoading ? (
                <div className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-full" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-2/3" />
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
                    {advice.silver_portfolio_pct !== undefined && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                        Silver: {advice.silver_portfolio_pct}% of portfolio
                      </span>
                    )}
                    {advice.total_silver_grams > 0 && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700">
                        {advice.total_silver_grams.toFixed(1)}g = {fmtINR(advice.total_silver_value)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{advice.advice}</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-2">
                  <p className="text-sm text-slate-400 text-center">Get Chanakya's personalised advice on whether to buy silver now based on your finances.</p>
                  <button onClick={fetchAdvice} disabled={adviceLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                    style={{ background: "linear-gradient(135deg, #64748B, #475569)" }}>
                    <Bot size={14} /> Ask Chanakya
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-4">
            <Star size={10} className="fill-slate-300 text-slate-300" />
            Indian market price via MCX · 925 = 999 × 925/999 · ETF valued at 999 rate
          </p>

        </div>
      </div>

      {/* ── Add Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins size={16} className="text-slate-500" /> Add Silver Holding
            </DialogTitle>
          </DialogHeader>
          <SilverForm form={form} setForm={setForm} onSubmit={handleAdd} onCancel={() => setAddOpen(false)} submitting={submitting} submitLabel="Add Holding" />
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 size={15} className="text-slate-500" /> Edit — {editTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <SilverForm form={editForm} setForm={setEditForm} onSubmit={handleEdit} onCancel={() => setEditTarget(null)} submitting={submitting} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Remove Holding?</DialogTitle></DialogHeader>
          <p className="text-stone-500 text-sm mt-2">
            Remove <span className="font-semibold text-stone-700">{deleteTarget?.name}</span> from your silver portfolio?
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
const SilverForm = ({ form, setForm, onSubmit, onCancel, submitting, submitLabel }) => {
  const weightBased = isWeightBased(form.type);
  const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) });

  return (
    <form onSubmit={onSubmit} className="space-y-4 mt-2">
      <div>
        <Label className="text-sm font-medium text-stone-700">Name *</Label>
        <Input {...f("name")} placeholder="e.g. Silver Coins, Nippon Silver ETF" required
          className="mt-1.5 focus:border-slate-400" />
      </div>

      <div>
        <Label className="text-sm font-medium text-stone-700">Type *</Label>
        <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
          <SelectTrigger className="mt-1.5 focus:border-slate-400">
            <SelectValue placeholder="Select silver type…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="physical">🪙 Physical Silver</SelectItem>
            <SelectItem value="silver_etf">📊 Silver ETF</SelectItem>
            <SelectItem value="digital">💻 Digital Silver</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {form.type && weightBased && (
        <div>
          <Label className="text-sm font-medium text-stone-700">Purity *</Label>
          <div className="flex gap-2 mt-1.5">
            {[
              ["999", "999 — Fine Silver"],
              ["925", "925 — Sterling"],
              ["800", "800 — European"],
            ].map(([val, label]) => (
              <button
                key={val} type="button"
                onClick={() => setForm(p => ({ ...p, purity: val }))}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                  form.purity === val
                    ? "bg-slate-600 text-white border-slate-600 shadow-md"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:border-slate-400"
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
              placeholder={weightBased ? "e.g. 100" : "e.g. 10"}
              className="mt-1.5 focus:border-slate-400"
            />
          </div>
          <div>
            <Label className="text-sm font-medium text-stone-700">
              {weightBased ? "Buy Price/gram (₹) *" : "Buy Price/unit (₹) *"}
            </Label>
            <Input
              type="number" step="0.01" min="0" required
              {...(weightBased ? f("purchase_price_per_gram") : f("purchase_price_per_unit"))}
              placeholder={weightBased ? "e.g. 85" : "e.g. 950"}
              className="mt-1.5 focus:border-slate-400"
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
        <Input {...f("notes")} placeholder="e.g. silver coins, locker no." className="mt-1.5 focus:border-slate-400" />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={submitting || !form.type || !form.name}
          className="flex-1 border-0 font-semibold shadow-md text-white"
          style={{ background: "linear-gradient(135deg, #94a3b8, #64748b)", boxShadow: "0 4px 12px rgba(100,116,139,0.3)" }}>
          ✨ {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

export default SilverTracker;
