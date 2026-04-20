import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import Navigation from "@/components/Navigation";
import PageLoader from "@/components/PageLoader";
import { useStaleData } from "@/hooks/useStaleData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Target, Plus, Trash2, PiggyBank,
  AlertTriangle, CheckCircle, Clock, Sparkles, Gift,
  Home, Car, Plane, GraduationCap, Shield, Smartphone
} from "lucide-react";
import ResetDataButton from '@/components/ResetDataButton';
import { DatePicker } from "@/components/DatePicker";

// ── Config maps ───────────────────────────────────────────────────────────────
const CAT_ICONS = {
  general:     PiggyBank,
  electronics: Smartphone,
  travel:      Plane,
  home:        Home,
  vehicle:     Car,
  education:   GraduationCap,
  emergency:   Shield,
  other:       Gift,
};

const CAT_COLORS = {
  general:     "bg-blue-50 text-blue-600",
  electronics: "bg-purple-50 text-purple-600",
  travel:      "bg-cyan-50 text-cyan-600",
  home:        "bg-amber-50 text-amber-600",
  vehicle:     "bg-rose-50 text-rose-600",
  education:   "bg-indigo-50 text-indigo-600",
  emergency:   "bg-red-50 text-red-600",
  other:       "bg-stone-50 text-stone-600",
};

const PROGRESS_GRADIENT = (pct) => {
  if (pct >= 75) return "from-emerald-400 to-emerald-500";
  if (pct >= 40) return "from-teal-400 to-teal-500";
  return "from-teal-500 to-cyan-500";
};

const PRIORITY_BADGE = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-stone-100 text-stone-600",
};

const fmtAmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const fmtShort = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000)   return `₹${(abs / 1000).toFixed(0)}K`;
  return fmtAmt(n);
};

const Skeleton = ({ className }) => <div className={`animate-pulse bg-stone-200 rounded-lg ${className}`} />;

const emptyForm = { name: "", target_amount: "", target_date: "", category: "general", priority: "medium", notes: "" };

// ── Component ─────────────────────────────────────────────────────────────────
const SavingsGoals = () => {
  // dialogs
  const [showCreate, setShowCreate]         = useState(false);
  const [showContribute, setShowContribute] = useState(false);
  const [showDelete, setShowDelete]         = useState(false);
  const [selectedGoal, setSelectedGoal]     = useState(null);

  const [formData, setFormData]             = useState(emptyForm);
  const [contribution, setContribution]     = useState("");
  const [submitting, setSubmitting]         = useState(false);

  const [selectMode, setSelectMode]         = useState(false);
  const [selected, setSelected]             = useState(new Set());

  // Tab switcher: "active" | "overdue"
  const [activeTab, setActiveTab]           = useState("active");

  // Financial score for Chanakya's Check
  const [finScore, setFinScore]             = useState(null);

  // Prefill from query params (e.g. /savings-goals?prefill=FIRE+Fund&amount=5000000)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const prefillName = searchParams.get("prefill");
    const prefillAmount = searchParams.get("amount");
    if (prefillName || prefillAmount) {
      setFormData(prev => ({
        ...prev,
        name: prefillName || prev.name,
        target_amount: prefillAmount || prev.target_amount,
      }));
      setShowCreate(true);
      // Clear the params so a refresh doesn't re-trigger
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    axios.get(`${API}/financial-score`)
      .then(res => setFinScore(res.data))
      .catch(() => {});
  }, []);

  const fetchGoals = useCallback(async () => {
    const [goalsRes, summaryRes] = await Promise.all([
      axios.get(`${API}/savings-goals`),
      axios.get(`${API}/savings-goals-summary`),
    ]);
    const activeGoals = goalsRes.data.filter(g => g.status !== "completed");
    const linkedResults = await Promise.all(
      activeGoals.map(g =>
        axios.get(`${API}/savings-goals/${g.id}/linked-investments`)
          .then(r => [g.id, r.data])
          .catch(() => [g.id, []])
      )
    );
    return {
      goals: goalsRes.data || [],
      summary: summaryRes.data,
      linkedInvMap: Object.fromEntries(linkedResults),
    };
  }, []);

  const { data: goalsData, loading, reload: fetchData } = useStaleData(
    "bm_goals_cache",
    fetchGoals,
    { errorMsg: "Failed to load goals", fallback: { goals: [], summary: null, linkedInvMap: {} } }
  );

  useEffect(() => {
    const onLog = () => fetchData();
    window.addEventListener("chanakya-logged", onLog);
    return () => window.removeEventListener("chanakya-logged", onLog);
  }, [fetchData]);

  const goals = goalsData?.goals ?? [];
  const summary = goalsData?.summary ?? null;
  const linkedInvMap = goalsData?.linkedInvMap ?? {};

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API}/savings-goals`, { ...formData, target_amount: parseFloat(formData.target_amount) });
      toast.success("Goal created!");
      setShowCreate(false);
      setFormData(emptyForm);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create goal");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContribute = async (e) => {
    e.preventDefault();
    if (!selectedGoal) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/savings-goals/${selectedGoal.id}/contribute`, {
        amount: parseFloat(contribution),
      });
      if (res.data.goal_completed) toast.success(`🎉 "${selectedGoal.name}" goal completed!`);
      else toast.success("Contribution added!");
      setShowContribute(false);
      setContribution("");
      setSelectedGoal(null);
      fetchData();
    } catch {
      toast.error("Failed to add contribution");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedGoal) return;
    try {
      await axios.delete(`${API}/savings-goals/${selectedGoal.id}`);
      toast.success("Goal deleted");
      setShowDelete(false);
      setSelectedGoal(null);
      fetchData();
    } catch {
      toast.error("Failed to delete goal");
    }
  };

  const handleMultiDelete = async () => {
    try {
      await Promise.all([...selected].map(id => axios.delete(`${API}/savings-goals/${id}`)));
      toast.success(`${selected.size} goal${selected.size > 1 ? 's' : ''} deleted`);
      setSelectMode(false);
      setSelected(new Set());
      fetchData();
    } catch {
      toast.error('Failed to delete selected goals');
    }
  };

  const openContribute = (goal) => { setSelectedGoal(goal); setContribution(""); setShowContribute(true); };
  const openDelete     = (goal) => { setSelectedGoal(goal); setShowDelete(true); };

  const now = new Date();

  // "Active" tab: incomplete goals whose target_date is still in the future, OR goals already at 100%+
  const tabActiveGoals = goals.filter(g => {
    if (g.status === "completed") return false;
    const pct = Math.round((g.current_amount / g.target_amount) * 100) || 0;
    if (pct >= 100) return true;
    return new Date(g.target_date) >= now;
  });

  // "Overdue & Done" tab: overdue (past target_date + <100%) + completed
  const overdueGoals = goals.filter(g => {
    if (g.status === "completed") return false;
    const pct = Math.round((g.current_amount / g.target_amount) * 100) || 0;
    return pct < 100 && new Date(g.target_date) < now;
  });
  const completedGoals = goals.filter(g => g.status === "completed");
  const tabOverdueAndDone = [...overdueGoals, ...completedGoals];

  // For rendering logic — keep backward compat
  const activeGoals = goals.filter(g => g.status !== "completed");

  // Chanakya's Check helper
  const getChanakyaCheck = () => {
    if (!finScore || !formData.target_amount) return null;
    const income = finScore.monthly_income || 0;
    if (!income) return null;
    const amt = parseFloat(formData.target_amount) || 0;
    if (!amt) return null;

    const emiPct = finScore.emi_burden_pct ?? 0;
    const savingsRate = finScore.savings_rate ?? 0;
    const monthsOfIncome = income > 0 ? (amt / income) : 0;
    const freePerMonth = income - (finScore.total_expenses || 0) - (finScore.total_emis || 0);

    if (emiPct > 40 && amt > income)
      return { type: "warn", msg: `\u26A0\uFE0F EMIs already eat ${Math.round(emiPct)}% of income. This goal may stretch you thin.` };
    if (savingsRate < 10)
      return { type: "danger", msg: `\uD83D\uDD34 Savings rate is only ${Math.round(savingsRate)}%. Build emergency fund first.` };
    if (monthsOfIncome > 12)
      return { type: "info", msg: `\u23F3 This is ${Math.round(monthsOfIncome)} months of income. Is this the right priority?` };
    return { type: "ok", msg: `\u2705 Looks good! You have ${fmtAmt(Math.max(0, freePerMonth))}/mo free \u2014 this goal is realistic.` };
  };

  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bm-page-bg-teal flex items-center justify-center">
        <PageLoader
          message="Loading your goals…"
          tips={["Tracking your progress", "Checking timelines", "Calculating monthly targets"]}
        />
      </div>
    </>
  );

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bm-page-bg-teal" data-testid="savings-goals-page">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']" data-testid="page-title">
                Savings Goals
              </h1>
              <p className="text-stone-400 dark:text-stone-400 text-sm mt-0.5">Build towards your financial milestones</p>
            </div>
            <div className="flex items-center gap-2">
              <ResetDataButton feature="savings-goals" label="savings goals" onReset={fetchData} className="hidden sm:inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-rose-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20" />
              {goals.length > 0 && (
                <Button
                  variant="outline" size="sm"
                  className={`hidden sm:inline-flex text-xs h-9 ${selectMode ? 'bg-teal-50 text-teal-600 border-teal-300' : 'text-stone-500 border-stone-200'}`}
                  onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </Button>
              )}
              <Button
                onClick={() => setShowCreate(true)}
                data-testid="create-goal-btn"
                className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 shadow-sm shadow-teal-300/40"
              >
                <Plus size={16} className="mr-1.5" /> New Goal
              </Button>
            </div>
          </div>

          {/* ── Summary hero ── */}
          {loading ? (
            <Skeleton className="h-32 rounded-2xl mb-6" />
          ) : summary && (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 p-5 mb-6 text-white shadow-lg" style={{ boxShadow: "0 8px 32px rgba(13,148,136,0.3)" }}>
              <div className="absolute -top-8 -right-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
              <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Active Goals",   value: summary.total_goals,                  sub: "in progress"  },
                  { label: "Total Saved",    value: fmtShort(summary.total_saved),        sub: "contributed"  },
                  { label: "Total Target",   value: fmtShort(summary.total_target),       sub: "to reach"     },
                  { label: "Overall Progress",value: `${summary.overall_progress || 0}%`, sub: "complete"     },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/15 rounded-xl px-3 py-3 backdrop-blur-sm">
                    <p className="text-white font-bold text-xl font-['Outfit'] leading-none">{value}</p>
                    <p className="text-white/60 text-[11px] mt-1">{label}</p>
                  </div>
                ))}
              </div>
              {summary.overall_progress > 0 && (
                <div className="relative mt-4">
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, summary.overall_progress)}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Smart Alerts ── */}
          {summary?.alerts?.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 mb-6" data-testid="alerts-section">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={15} className="text-teal-500" />
                <h2 className="font-bold text-stone-800 font-['Outfit'] text-sm">Chanakya's Alerts</h2>
              </div>
              <div className="space-y-2">
                {summary.alerts.slice(0, 3).map((alert, idx) => {
                  const Icon = alert.severity === "high" ? AlertTriangle
                    : alert.severity === "medium" ? Clock : CheckCircle;
                  const styles = alert.severity === "high" ? "bg-red-50 border-red-100 text-red-700"
                    : alert.severity === "medium" ? "bg-amber-50 border-amber-100 text-amber-700"
                    : "bg-emerald-50 border-emerald-100 text-emerald-700";
                  return (
                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border ${styles}`} data-testid={`alert-${idx}`}>
                      <Icon size={15} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm">{alert.goal_name}</p>
                        <p className="text-xs opacity-80">{alert.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Tab Switcher ── */}
          {goals.length > 0 && (
            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={() => setActiveTab("active")}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  activeTab === "active"
                    ? "bg-orange-500 text-white shadow-sm shadow-orange-300/40"
                    : "bg-white text-stone-500 border border-stone-200 hover:bg-stone-50"
                }`}
              >
                Active ({tabActiveGoals.length})
              </button>
              <button
                onClick={() => setActiveTab("overdue")}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  activeTab === "overdue"
                    ? "bg-orange-500 text-white shadow-sm shadow-orange-300/40"
                    : "bg-white text-stone-500 border border-stone-200 hover:bg-stone-50"
                }`}
              >
                Overdue & Done ({tabOverdueAndDone.length})
              </button>
            </div>
          )}

          {/* ── Goals grid ── */}
          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0,1,2].map(i => <Skeleton key={i} className="h-52 rounded-2xl" />)}
            </div>
          ) : goals.length === 0 ? (
            <div className="bm-hero relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-400 p-10 text-center shadow-lg" style={{ boxShadow: "0 12px 40px rgba(13,148,136,0.28)" }}>
              <div className="bm-orb bm-orb-1" style={{ width: 180, height: 180, background: "rgba(255,255,255,0.08)", top: -50, right: -40 }} />
              <div className="bm-orb bm-orb-2" style={{ width: 120, height: 120, background: "rgba(6,182,212,0.2)", bottom: -30, left: -20 }} />
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                  <Target size={32} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white font-['Outfit'] mb-1">No savings goals yet</h3>
                <p className="text-teal-100 text-sm mb-6 max-w-xs">Create your first goal — an emergency fund, holiday, or gadget.</p>
                <Button onClick={() => setShowCreate(true)}
                  style={{ background: "white", color: "#0f766e" }}
                  className="font-semibold shadow-md rounded-xl hover:opacity-90">
                  <Plus size={16} className="mr-1.5" /> Create First Goal
                </Button>
              </div>
            </div>
          ) : activeTab === "active" ? (
            <>
              {/* Active tab */}
              {tabActiveGoals.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-sm">No active goals right now.</div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {tabActiveGoals.map(goal => {
                    const pct  = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) || 0;
                    const Icon = CAT_ICONS[goal.category] || PiggyBank;
                    const remaining = goal.target_amount - goal.current_amount;
                    const daysLeft  = Math.max(0, Math.ceil((new Date(goal.target_date) - new Date()) / 86400000));

                    return (
                      <div
                        key={goal.id}
                        className={`relative bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${selectMode && selected.has(goal.id) ? 'border-teal-400 ring-2 ring-teal-200' : 'border-stone-100'}`}
                        data-testid={`goal-card-${goal.id}`}
                        onClick={selectMode ? () => setSelected(prev => { const next = new Set(prev); next.has(goal.id) ? next.delete(goal.id) : next.add(goal.id); return next; }) : undefined}
                        style={selectMode ? { cursor: 'pointer' } : undefined}
                      >
                        {selectMode && (
                          <div className="absolute top-3 left-3 z-10">
                            <input
                              type="checkbox"
                              checked={selected.has(goal.id)}
                              onChange={() => {}}
                              className="w-4 h-4 accent-teal-500 cursor-pointer"
                            />
                          </div>
                        )}
                        {/* Coloured header band */}
                        <div className={`h-1.5 bg-gradient-to-r ${PROGRESS_GRADIENT(pct)}`} style={{ width: `${pct}%` }} />

                        <div className="p-5">
                          {/* Top row */}
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`p-2.5 rounded-xl ${CAT_COLORS[goal.category] || CAT_COLORS.general}`}>
                                <Icon size={18} />
                              </div>
                              <div>
                                <p className="font-bold text-stone-800 text-sm leading-tight">{goal.name}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_BADGE[goal.priority]}`}>
                                  {goal.priority}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => openDelete(goal)}
                              data-testid={`delete-goal-${goal.id}`}
                              className="p-1.5 text-stone-200 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {/* Amounts */}
                          <div className="flex justify-between items-end mb-2">
                            <div>
                              <p className="text-[10px] text-stone-400 uppercase tracking-wide">Saved</p>
                              <p className="font-bold text-xl text-stone-900 font-['Outfit']">{fmtAmt(goal.current_amount)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-stone-400 uppercase tracking-wide">Target</p>
                              <p className="font-semibold text-stone-500 text-sm">{fmtAmt(goal.target_amount)}</p>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="mb-3">
                            <div className="h-2 bg-stone-100 rounded-full overflow-hidden mb-1">
                              <div
                                className={`h-full bg-gradient-to-r ${PROGRESS_GRADIENT(pct)} rounded-full transition-all duration-500`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-stone-400">
                              <span>{pct}% · {fmtShort(remaining)} left</span>
                              <span>{daysLeft}d left</span>
                            </div>
                          </div>

                          {/* Linked FD/RD instruments */}
                          {linkedInvMap[goal.id]?.length > 0 && (
                            <div className="mb-3 bg-teal-50 rounded-xl px-3 py-2 space-y-1">
                              <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                🔗 Auto-tracked instruments
                              </p>
                              {linkedInvMap[goal.id].map(inv => (
                                <div key={inv.id} className="flex justify-between items-center text-xs">
                                  <span className="text-stone-600 truncate max-w-[130px]">{inv.name}</span>
                                  <span className="font-semibold text-teal-700">{fmtAmt(inv.current_value)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* CTA */}
                          <Button
                            onClick={() => openContribute(goal)}
                            size="sm"
                            className="w-full h-8 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-xs font-semibold"
                            data-testid={`contribute-btn-${goal.id}`}
                          >
                            <Plus size={13} className="mr-1" /> Add Money
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Overdue & Done tab */}
              {tabOverdueAndDone.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-sm">No overdue or completed goals.</div>
              ) : (
                <div className="space-y-6">
                  {/* Overdue goals */}
                  {overdueGoals.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Overdue ({overdueGoals.length})
                      </p>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {overdueGoals.map(goal => {
                          const pct  = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) || 0;
                          const Icon = CAT_ICONS[goal.category] || PiggyBank;
                          const daysOverdue = Math.ceil((new Date() - new Date(goal.target_date)) / 86400000);

                          return (
                            <div
                              key={goal.id}
                              className={`relative bg-white rounded-2xl border shadow-sm overflow-hidden ${selectMode && selected.has(goal.id) ? 'border-teal-400 ring-2 ring-teal-200' : 'border-red-100'}`}
                              data-testid={`goal-card-${goal.id}`}
                              onClick={selectMode ? () => setSelected(prev => { const next = new Set(prev); next.has(goal.id) ? next.delete(goal.id) : next.add(goal.id); return next; }) : undefined}
                              style={selectMode ? { cursor: 'pointer' } : undefined}
                            >
                              {selectMode && (
                                <div className="absolute top-3 left-3 z-10">
                                  <input type="checkbox" checked={selected.has(goal.id)} onChange={() => {}} className="w-4 h-4 accent-teal-500 cursor-pointer" />
                                </div>
                              )}
                              {/* Red overdue band */}
                              <div className="h-1.5 bg-gradient-to-r from-red-400 to-red-500" style={{ width: `${pct}%` }} />

                              <div className="p-5">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-2.5 rounded-xl ${CAT_COLORS[goal.category] || CAT_COLORS.general}`}>
                                      <Icon size={18} />
                                    </div>
                                    <div>
                                      <p className="font-bold text-stone-800 text-sm leading-tight">{goal.name}</p>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">
                                        {daysOverdue}d overdue
                                      </span>
                                    </div>
                                  </div>
                                  {/* Red delete button for overdue goals */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openDelete(goal); }}
                                    data-testid={`delete-overdue-${goal.id}`}
                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete overdue goal"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>

                                {/* Amounts */}
                                <div className="flex justify-between items-end mb-2">
                                  <div>
                                    <p className="text-[10px] text-stone-400 uppercase tracking-wide">Saved</p>
                                    <p className="font-bold text-xl text-stone-900 font-['Outfit']">{fmtAmt(goal.current_amount)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] text-stone-400 uppercase tracking-wide">Target</p>
                                    <p className="font-semibold text-stone-500 text-sm">{fmtAmt(goal.target_amount)}</p>
                                  </div>
                                </div>

                                {/* Progress bar */}
                                <div className="mb-3">
                                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden mb-1">
                                    <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all duration-500"
                                      style={{ width: `${pct}%` }} />
                                  </div>
                                  <div className="flex justify-between text-[10px] text-stone-400">
                                    <span>{pct}% complete</span>
                                    <span>{fmtShort(goal.target_amount - goal.current_amount)} left</span>
                                  </div>
                                </div>

                                {/* CTA — still allow contributions */}
                                <Button
                                  onClick={() => openContribute(goal)}
                                  size="sm"
                                  className="w-full h-8 bg-gradient-to-r from-stone-400 to-stone-500 hover:from-stone-500 hover:to-stone-600 text-xs font-semibold"
                                >
                                  <Plus size={13} className="mr-1" /> Add Money
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Completed goals */}
                  {completedGoals.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Completed 🎉</p>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {completedGoals.map(goal => {
                          return (
                            <div
                              key={goal.id}
                              className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-4 ${selectMode && selected.has(goal.id) ? 'border-teal-400 ring-2 ring-teal-200' : 'border-emerald-100'}`}
                              onClick={selectMode ? () => setSelected(prev => { const next = new Set(prev); next.has(goal.id) ? next.delete(goal.id) : next.add(goal.id); return next; }) : undefined}
                              style={selectMode ? { cursor: 'pointer' } : undefined}
                            >
                              {selectMode && (
                                <input
                                  type="checkbox"
                                  checked={selected.has(goal.id)}
                                  onChange={() => {}}
                                  className="w-4 h-4 accent-teal-500 cursor-pointer shrink-0"
                                />
                              )}
                              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <CheckCircle size={20} className="text-emerald-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-stone-800 truncate">{goal.name}</p>
                                <p className="text-xs text-emerald-600 font-medium">{fmtAmt(goal.target_amount)} · Fully saved</p>
                              </div>
                              {!selectMode && (
                                <button onClick={() => openDelete(goal)} className="p-1.5 text-stone-200 hover:text-red-400 rounded-lg transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
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

      {/* ── Create Goal Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md" onOpenAutoFocus={e => e.preventDefault()} data-testid="create-goal-modal">
          <DialogHeader>
            <DialogTitle>Create Savings Goal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-1">
            <div>
              <Label className="text-sm font-medium text-stone-700">Goal Name</Label>
              <Input data-testid="goal-name-input" placeholder="e.g., Emergency Fund, Holiday"
                value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                required className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-stone-700">Target Amount (₹)</Label>
                <Input data-testid="goal-amount-input" type="number" placeholder="50000"
                  value={formData.target_amount} onChange={e => setFormData(p => ({ ...p, target_amount: e.target.value }))}
                  required min="1" className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium text-stone-700">Target Date</Label>
                <DatePicker value={formData.target_date}
                  onChange={v => setFormData(p => ({ ...p, target_date: v }))}
                  min={new Date().toISOString().split("T")[0]}
                  className="mt-1.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-stone-700">Category</Label>
                <select data-testid="goal-category-select"
                  value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                  className="mt-1.5 w-full h-10 px-3 border border-stone-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/20 focus:border-teal-400">
                  {Object.keys(CAT_ICONS).map(k => (
                    <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium text-stone-700">Priority</Label>
                <select data-testid="goal-priority-select"
                  value={formData.priority} onChange={e => setFormData(p => ({ ...p, priority: e.target.value }))}
                  className="mt-1.5 w-full h-10 px-3 border border-stone-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/20 focus:border-teal-400">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-stone-700">Notes <span className="text-stone-400 font-normal">(optional)</span></Label>
              <Input placeholder="Any notes..." value={formData.notes}
                onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="mt-1.5" />
            </div>
            {/* Chanakya's Check — smart goal validation */}
            {(() => {
              const check = getChanakyaCheck();
              if (!check) return null;
              const styles = {
                warn:   "bg-amber-50 border-amber-200 text-amber-800",
                danger: "bg-red-50 border-red-200 text-red-800",
                info:   "bg-blue-50 border-blue-200 text-blue-800",
                ok:     "bg-emerald-50 border-emerald-200 text-emerald-800",
              };
              return (
                <div className={`rounded-xl border p-3 text-sm ${styles[check.type]}`} data-testid="chanakya-check">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={13} />
                    <span className="font-semibold text-xs uppercase tracking-wide">Chanakya's Check</span>
                  </div>
                  <p className="text-sm leading-snug">{check.msg}</p>
                </div>
              );
            })()}

            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={submitting} data-testid="create-goal-submit"
                className="flex-1 bg-gradient-to-r from-teal-500 to-teal-600">
                {submitting ? "Creating..." : "Create Goal"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Contribute Dialog ── */}
      <Dialog open={showContribute} onOpenChange={setShowContribute}>
        <DialogContent className="max-w-sm" onOpenAutoFocus={e => e.preventDefault()} data-testid="contribute-modal">
          <DialogHeader>
            <DialogTitle>Add Money</DialogTitle>
          </DialogHeader>
          {selectedGoal && (
            <form onSubmit={handleContribute} className="space-y-4 mt-1">
              {/* Goal summary */}
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                <p className="font-bold text-stone-800">{selectedGoal.name}</p>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-stone-500">Saved so far</span>
                  <span className="font-semibold text-emerald-600">{fmtAmt(selectedGoal.current_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Still needed</span>
                  <span className="font-semibold text-stone-800">
                    {fmtAmt(selectedGoal.target_amount - selectedGoal.current_amount)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full"
                    style={{ width: `${Math.min(100, Math.round((selectedGoal.current_amount / selectedGoal.target_amount) * 100))}%` }} />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-stone-700">Amount (₹)</Label>
                <Input data-testid="contribution-amount-input" type="number" placeholder="5000"
                  value={contribution} onChange={e => setContribution(e.target.value)}
                  required min="1" className="mt-1.5" />
                {/* Quick amounts */}
                <div className="flex gap-2 mt-2 flex-wrap">
                  {[500, 1000, 2000, 5000].map(amt => (
                    <button key={amt} type="button"
                      onClick={() => setContribution(amt.toString())}
                      className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                        contribution === amt.toString()
                          ? "bg-teal-100 border-teal-300 text-teal-700"
                          : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600"
                      }`}>
                      ₹{amt.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={submitting} data-testid="contribute-submit"
                  className="flex-1 bg-gradient-to-r from-teal-500 to-teal-600">
                  {submitting ? "Adding..." : `Add ${contribution ? fmtAmt(parseFloat(contribution)) : "₹0"}`}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowContribute(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="max-w-sm" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Delete Goal?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-sm text-stone-700">
                Are you sure you want to delete <span className="font-bold">{selectedGoal?.name}</span>?
                All contribution history will be lost.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowDelete(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={handleDelete}
                data-testid={`delete-goal-${selectedGoal?.id}`}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SavingsGoals;
