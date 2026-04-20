import { useState, useMemo, useEffect, useCallback } from "react";
import Navigation from "@/components/Navigation";
import { Flame, TrendingUp, Target, Clock, IndianRupee, Info, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";

// ── Motivational quotes ───────────────────────────────────────────────────────
const FIRE_QUOTES = [
  { q: "Do not save what is left after spending; spend what is left after saving.", a: "Warren Buffett" },
  { q: "Every rupee you save today is a soldier fighting for your future freedom.", a: "Chanakya" },
  { q: "The goal of FIRE isn't to stop working — it's to stop working for money.", a: "Mr. Money Mustache" },
  { q: "Compound interest is the eighth wonder of the world.", a: "Albert Einstein" },
  { q: "Financial freedom is freedom from fear.", a: "Robert Kiyosaki" },
  { q: "A 50% savings rate means one year of work funds one year of freedom.", a: "FIRE Community" },
  { q: "Time in the market beats timing the market.", a: "Ken Fisher" },
  { q: "Wealth is not about having a lot of money; it's about having a lot of options.", a: "Chris Rock" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (!n && n !== 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000)     return `₹${(abs / 1000).toFixed(1)}K`;
  return `₹${Math.round(abs).toLocaleString("en-IN")}`;
};

const fmtFull = (n) => `₹${Math.round(Math.abs(n || 0)).toLocaleString("en-IN")}`;

// Future value of current corpus: FV = PV × (1+r)^n
// Future value of monthly SIP: FV = PMT × [((1+r)^n − 1) / r]
// r = monthly rate, n = months
const calcFire = ({ currentAge, retireAge, monthlyIncome, monthlyExpenses, currentSavings, expectedReturn, inflation, withdrawalRate, baristaIncome }) => {
  const years  = retireAge - currentAge;
  const months = years * 12;
  const r      = expectedReturn / 100 / 12;      // monthly return
  const ri     = inflation / 100 / 12;           // monthly inflation (unused but kept for reference)

  // Annual expenses in today's money → inflate to retirement
  const futureAnnualExpenses = monthlyExpenses * 12 * Math.pow(1 + inflation / 100, years);

  // FIRE number — Lean always 5%, Regular uses selected rate, Fat always 3%
  const leanFireNum    = futureAnnualExpenses / 0.05;   // 5% withdrawal — tighter
  const regularFireNum = futureAnnualExpenses / (withdrawalRate / 100);  // selected rate
  const fatFireNum     = futureAnnualExpenses / 0.03;   // 3% withdrawal — luxury buffer

  // Coast FIRE: corpus needed TODAY that grows to regularFireNum by retireAge without contributions
  const coastFireNum = years > 0
    ? regularFireNum / Math.pow(1 + expectedReturn / 100, years)
    : regularFireNum;

  // Barista FIRE: FIRE number reduced by part-time income
  const baristaAnnualIncome = (baristaIncome || 0) * 12;
  const baristaFireNum = Math.max(0, (futureAnnualExpenses - baristaAnnualIncome) / (withdrawalRate / 100));

  // Corpus at retirement from current savings (compounded)
  const corpusFromSavings = currentSavings * Math.pow(1 + expectedReturn / 100, years);

  // Monthly savings (income - expenses)
  const monthlySavings = monthlyIncome - monthlyExpenses;

  // SIP corpus from monthly savings
  const sipCorpus = monthlySavings > 0 && r > 0
    ? monthlySavings * ((Math.pow(1 + r, months) - 1) / r) * (1 + r)
    : 0;

  const totalCorpus = corpusFromSavings + sipCorpus;

  // Progress toward regular FIRE number
  const fireProgress = Math.min((totalCorpus / regularFireNum) * 100, 100);

  // How many years to reach FIRE if they keep saving (binary search / formula)
  let yearsToFire = null;
  if (monthlySavings > 0 && r > 0) {
    // Total = PV*(1+R)^n + PMT*[((1+R)^n - 1)/R]*(1+R) >= FIRE_NUMBER
    // Solve numerically
    for (let y = 1; y <= 60; y++) {
      const n = y * 12;
      const corp = currentSavings * Math.pow(1 + expectedReturn / 100, y)
        + monthlySavings * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
      const futureExp = monthlyExpenses * 12 * Math.pow(1 + inflation / 100, y);
      if (corp >= futureExp / (withdrawalRate / 100)) { yearsToFire = y; break; }
    }
  }

  const fireAge = yearsToFire != null ? currentAge + yearsToFire : null;

  // Savings rate
  const savingsRate = monthlyIncome > 0 ? ((monthlySavings / monthlyIncome) * 100).toFixed(1) : 0;

  // Monthly SIP needed to hit FIRE by retireAge
  // FIRE_NUMBER = PV*(1+R)^n + PMT*FVA => PMT = (FIRE_NUMBER - PV*(1+R)^n) / FVA
  const fva = r > 0 && months > 0 ? ((Math.pow(1 + r, months) - 1) / r) * (1 + r) : 1;
  const sipNeeded = Math.max(0, (regularFireNum - corpusFromSavings) / fva);

  return {
    years, months, futureAnnualExpenses,
    leanFireNum, regularFireNum, fatFireNum,
    coastFireNum, baristaFireNum,
    corpusFromSavings, sipCorpus, totalCorpus,
    fireProgress, yearsToFire, fireAge,
    savingsRate, sipNeeded, monthlySavings,
  };
};

// ── Tooltip ──────────────────────────────────────────────────────────────────
const Tip = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        className="text-stone-300 hover:text-stone-500 dark:hover:text-stone-300 transition-colors align-middle">
        <Info size={12} />
      </button>
      {show && (
        <span className="absolute z-20 left-4 -top-1 w-52 bg-stone-800 text-white text-xs rounded-xl px-3 py-2 shadow-xl leading-relaxed">
          {text}
        </span>
      )}
    </span>
  );
};

// ── Input field ───────────────────────────────────────────────────────────────
const Field = ({ label, tip, prefix, suffix, value, onChange, min, max, step = 1, type = "number" }) => (
  <div>
    <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
      {label} {tip && <Tip text={tip} />}
    </label>
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-3 text-stone-400 dark:text-stone-500 text-sm font-semibold">{prefix}</span>}
      <input
        type={type}
        value={value}
        min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        className={`w-full border border-stone-200 dark:border-stone-700 rounded-xl py-2.5 text-sm text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 font-semibold focus:outline-none focus:border-orange-400 transition-colors ${prefix ? "pl-8" : "pl-4"} ${suffix ? "pr-12" : "pr-4"}`}
      />
      {suffix && <span className="absolute right-3 text-stone-400 dark:text-stone-500 text-xs font-semibold">{suffix}</span>}
    </div>
  </div>
);

// ── Slider field ──────────────────────────────────────────────────────────────
const SliderField = ({ label, tip, value, onChange, min, max, step = 1, suffix }) => (
  <div>
    <div className="flex justify-between items-center mb-1.5">
      <label className="text-xs font-semibold text-stone-500 dark:text-stone-400">
        {label} {tip && <Tip text={tip} />}
      </label>
      <span className="text-sm font-bold text-orange-600">{value}{suffix}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full accent-orange-500 h-1.5 rounded-full"
    />
    <div className="flex justify-between text-[10px] text-stone-300 dark:text-stone-600 mt-0.5">
      <span>{min}{suffix}</span><span>{max}{suffix}</span>
    </div>
  </div>
);

// ── FIRE Variant Card ──────────────────────────────────────────────────────────
const FireCard = ({ label, emoji, color, lightBg, darkAccent, amount, desc, corpus, highlight }) => {
  const pct = Math.min((corpus / amount) * 100, 100);
  return (
    <div className={`rounded-2xl border p-4 ${lightBg} dark:bg-stone-800 dark:border-stone-700 ${highlight ? "ring-2 ring-orange-400 ring-offset-1 dark:ring-offset-stone-900" : ""}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wide">{emoji} {label}</p>
          <p className={`text-xl font-bold font-['Outfit'] mt-0.5 ${color}`}>{fmt(amount)}</p>
        </div>
        {highlight && <span className={`text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/40 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-700`}>Recommended</span>}
      </div>
      <p className="text-xs text-stone-400 dark:text-stone-400 mb-3">{desc}</p>
      <div className="h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${darkAccent}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">{pct.toFixed(1)}% of goal reached with current plan</p>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FireCalculator() {
  const { token } = useAuth();

  const [currentAge,    setCurrentAge]    = useState(28);
  const [retireAge,     setRetireAge]     = useState(45);
  const [monthlyIncome, setMonthlyIncome] = useState(150000);
  const [monthlyExp,    setMonthlyExp]    = useState(70000);
  const [currentSavings,setCurrentSavings]= useState(500000);
  const [expectedReturn,setExpectedReturn]= useState(12);
  const [inflation,     setInflation]     = useState(6);
  const [withdrawalRate,setWithdrawalRate]= useState(4);
  const [baristaIncome, setBaristaIncome] = useState(0);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [mobileTab,     setMobileTab]     = useState("inputs"); // "inputs" | "results"

  // Quote rotation state
  const [quoteIdx,  setQuoteIdx]  = useState(0);
  const [quoteFade, setQuoteFade] = useState(true);

  // Goal save state
  const [savedGoal, setSavedGoal] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [goalSaved, setGoalSaved] = useState(false);

  // Rotate quotes every 8 seconds with fade transition
  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteFade(false);
      setTimeout(() => {
        setQuoteIdx(i => (i + 1) % FIRE_QUOTES.length);
        setQuoteFade(true);
      }, 400);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Load existing saved FIRE goal on mount
  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/fire-goal`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if (res.data) setSavedGoal(res.data); })
      .catch(() => {});
  }, [token]);

  const r = useMemo(() =>
    calcFire({
      currentAge, retireAge,
      monthlyIncome, monthlyExpenses: monthlyExp,
      currentSavings, expectedReturn, inflation,
      withdrawalRate, baristaIncome,
    }),
    [currentAge, retireAge, monthlyIncome, monthlyExp, currentSavings, expectedReturn, inflation, withdrawalRate, baristaIncome]
  );

  const fireStatus = r.fireAge
    ? r.fireAge < retireAge
      ? { label: `You can FIRE at ${r.fireAge}! 🎉`, color: "text-emerald-600 bg-emerald-50 border-emerald-200" }
      : r.fireAge === retireAge
      ? { label: `On track — FIRE exactly at ${retireAge} ✓`, color: "text-blue-600 bg-blue-50 border-blue-200" }
      : { label: `FIRE at ${r.fireAge} (${r.fireAge - retireAge} yrs after target)`, color: "text-amber-600 bg-amber-50 border-amber-200" }
    : r.monthlySavings <= 0
    ? { label: "Expenses exceed income — cannot FIRE yet ⚠️", color: "text-red-600 bg-red-50 border-red-200" }
    : { label: "Increase savings rate to reach FIRE", color: "text-stone-600 bg-stone-50 border-stone-200" };

  const handleSaveGoal = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      const payload = {
        fire_number: Math.round(r.regularFireNum),
        fire_type: "regular",
        withdrawal_rate: withdrawalRate,
        target_year: new Date().getFullYear() + r.years,
        current_savings: currentSavings,
        monthly_expenses: monthlyExp,
        monthly_savings_needed: Math.round(r.sipNeeded),
        monthly_income: monthlyIncome,
        current_age: currentAge,
        target_age: retireAge,
        coast_fire_number: Math.round(r.coastFireNum),
        barista_monthly_income: baristaIncome,
        notes: "",
      };
      const res = await axios.post(`${API}/fire-goal`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSavedGoal(res.data);
      setGoalSaved(true);
      setTimeout(() => setGoalSaved(false), 5000);
    } catch (e) {
      // silently fail — could show an error toast here
    } finally {
      setSaving(false);
    }
  }, [token, r, withdrawalRate, currentSavings, monthlyExp, monthlyIncome, currentAge, retireAge, baristaIncome]);

  const coastReached = currentSavings >= r.coastFireNum;

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-[#fffaf5] dark:bg-stone-950">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20"
              style={{ background: "linear-gradient(135deg, #f97316, #dc2626)" }}>
              <Flame size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">FIRE Calculator</h1>
              <p className="text-xs text-stone-400 dark:text-stone-500">Financial Independence, Retire Early</p>
            </div>
          </div>

          {/* Motivational quote */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl px-4 py-3 mb-4"
            style={{ transition: "opacity 0.4s ease", opacity: quoteFade ? 1 : 0 }}>
            <p className="text-sm text-amber-800 dark:text-amber-300 italic leading-relaxed">
              "{FIRE_QUOTES[quoteIdx].q}"
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 font-semibold mt-1">— {FIRE_QUOTES[quoteIdx].a}</p>
          </div>

          {/* Saved goal banner */}
          {savedGoal && !goalSaved && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Tracking active</p>
                <p className="text-xs text-blue-500 dark:text-blue-400">
                  Last saved {new Date(savedGoal.updated_at || savedGoal.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <button onClick={handleSaveGoal} disabled={saving}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-60">
                {saving ? "Saving…" : "Update"}
              </button>
            </div>
          )}

          {/* What is FIRE banner */}
          <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/40 dark:to-red-950/40 border border-orange-100 dark:border-orange-900/50 rounded-2xl p-4 mb-6">
            <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="font-bold text-orange-600">FIRE</span> = save &amp; invest aggressively (typically 50–70% of income) until your portfolio generates enough passive income to cover all your expenses — forever. The magic number is <span className="font-bold">25× your annual expenses</span> (the <span className="font-bold">4% rule</span>).
            </p>
          </div>

          {/* Mobile tab switcher */}
          <div className="lg:hidden flex bg-stone-100 dark:bg-stone-800 rounded-xl p-1 mb-5">
            {[["inputs", "⚙️ Inputs"], ["results", "📊 Results"]].map(([key, label]) => (
              <button key={key} onClick={() => setMobileTab(key)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  mobileTab === key
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm"
                    : "text-stone-500 dark:text-stone-400"
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">

            {/* ── Left: Inputs ── */}
            <div className={`space-y-5 ${mobileTab === "results" ? "hidden lg:block" : ""}`}>
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-5 space-y-4">
                <p className="text-sm font-bold text-stone-700 dark:text-stone-300">Your Details</p>

                <div className="grid grid-cols-2 gap-4">
                  <SliderField label="Current Age" value={currentAge} onChange={setCurrentAge} min={18} max={60} suffix=" yrs" />
                  <SliderField label="Target FIRE Age" value={retireAge} onChange={v => setRetireAge(Math.max(currentAge + 1, v))} min={25} max={70} suffix=" yrs" />
                </div>

                <Field label="Monthly Income (take-home)" prefix="₹"
                  tip="Your net salary or business income after tax"
                  value={monthlyIncome} onChange={setMonthlyIncome} min={0} step={5000} />

                <Field label="Monthly Expenses" prefix="₹"
                  tip="All your current monthly expenses including rent, food, EMIs, etc."
                  value={monthlyExp} onChange={setMonthlyExp} min={0} step={5000} />

                <Field label="Current Savings / Investments" prefix="₹"
                  tip="Total corpus you've already built — FDs, MFs, stocks, PF, etc."
                  value={currentSavings} onChange={setCurrentSavings} min={0} step={10000} />

                <Field label="Post-retirement income (₹/mo)" prefix="₹"
                  tip="Part-time work, rent, or pension after FIRE. This reduces how much your corpus needs to generate."
                  value={baristaIncome} onChange={setBaristaIncome} min={0} step={1000} />
              </div>

              {/* Advanced */}
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <span>Advanced Assumptions</span>
                  {showAdvanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showAdvanced && (
                  <div className="px-5 pb-5 space-y-4 border-t border-stone-50 dark:border-stone-800">
                    <SliderField label="Expected Annual Return" value={expectedReturn} onChange={setExpectedReturn} min={4} max={20} step={0.5} suffix="%"
                      tip="Realistic long-term return on a diversified equity portfolio. 12% is a common Indian market assumption." />
                    <SliderField label="Inflation Rate" value={inflation} onChange={setInflation} min={2} max={12} step={0.5} suffix="%"
                      tip="India's long-run CPI inflation averages 5–7%. This inflates your future expenses." />
                    <SliderField label="Withdrawal Rate" value={withdrawalRate} onChange={setWithdrawalRate} min={3} max={5} step={0.5} suffix="%"
                      tip="The % of your corpus you withdraw each year. 4% is the classic safe withdrawal rate. Lower = more conservative and higher corpus needed." />
                  </div>
                )}
              </div>

              {/* Savings rate pill */}
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold ${
                Number(r.savingsRate) >= 50 ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" :
                Number(r.savingsRate) >= 30 ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400" :
                "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
              }`}>
                <TrendingUp size={16} />
                Savings rate: {r.savingsRate}%
                <span className="font-normal text-xs ml-auto">
                  {Number(r.savingsRate) >= 50 ? "Excellent — FIRE territory!" :
                   Number(r.savingsRate) >= 30 ? "Good — push toward 50%" :
                   "Low — try to cut expenses"}
                </span>
              </div>
            </div>

            {/* ── Right: Results ── */}
            <div className={`space-y-5 ${mobileTab === "inputs" ? "hidden lg:block" : ""}`}>

              {/* FIRE status */}
              <div className={`px-4 py-3 rounded-xl border text-sm font-semibold ${fireStatus.color}`}>
                {fireStatus.label}
              </div>

              {/* Key numbers */}
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-5 space-y-4">
                <p className="text-sm font-bold text-stone-700 dark:text-stone-300">Your FIRE Numbers</p>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Annual expenses today", val: fmtFull(r.futureAnnualExpenses / Math.pow(1 + inflation / 100, r.years)), icon: IndianRupee, color: "bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300" },
                    { label: `Inflation-adj. at ${retireAge}`, val: fmtFull(r.futureAnnualExpenses), icon: TrendingUp, color: "bg-orange-50 dark:bg-orange-950/50 text-orange-600" },
                    { label: "Corpus at retirement", val: fmt(r.totalCorpus), icon: Target, color: "bg-blue-50 dark:bg-blue-950/50 text-blue-600" },
                    { label: "Monthly SIP needed", val: fmt(r.sipNeeded), icon: Clock, color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600" },
                  ].map(({ label, val, icon: Icon, color }) => (
                    <div key={label} className={`${color} rounded-xl p-3 border border-stone-100 dark:border-stone-700`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500 mb-1">{label}</p>
                      <p className="text-base font-bold font-['Outfit']">{val}</p>
                    </div>
                  ))}
                </div>

                {/* Progress toward FIRE */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-stone-500 dark:text-stone-400 font-semibold">Progress to Regular FIRE</span>
                    <span className="font-bold text-orange-600">{r.fireProgress.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-700"
                      style={{ width: `${r.fireProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-stone-400 dark:text-stone-500 mt-1">
                    <span>{fmt(r.totalCorpus)} projected</span>
                    <span>{fmt(r.regularFireNum)} target</span>
                  </div>
                </div>
              </div>

              {/* FIRE variants */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wide">FIRE Variants</p>
                <FireCard label="Lean FIRE" emoji="🌿" color="text-teal-600"
                  lightBg="border-teal-100 bg-teal-50/40" darkAccent="bg-teal-500"
                  amount={r.leanFireNum} corpus={r.totalCorpus}
                  desc="5% withdrawal — frugal lifestyle, minimal buffer for surprises" />
                <FireCard label="Regular FIRE" emoji="🔥" color="text-orange-600"
                  lightBg="border-orange-100 bg-orange-50/40" darkAccent="bg-orange-500"
                  amount={r.regularFireNum} corpus={r.totalCorpus}
                  desc={`${withdrawalRate}% withdrawal rule — your selected rate. ${Math.round(100 / withdrawalRate)}× annual expenses`} highlight />
                <FireCard label="Fat FIRE" emoji="👑" color="text-purple-600"
                  lightBg="border-purple-100 bg-purple-50/40" darkAccent="bg-purple-500"
                  amount={r.fatFireNum} corpus={r.totalCorpus}
                  desc="3% withdrawal — luxury buffer, travel, unexpected costs" />

                {/* Coast FIRE card */}
                <div className={`rounded-2xl border p-4 ${coastReached ? "border-emerald-200 bg-emerald-50/60 dark:bg-stone-800 dark:border-emerald-700" : "border-sky-100 bg-sky-50/40 dark:bg-stone-800 dark:border-stone-700"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wide">🏄 Coast FIRE</p>
                      <p className={`text-xl font-bold font-['Outfit'] mt-0.5 ${coastReached ? "text-emerald-600" : "text-sky-600"}`}>
                        {fmt(r.coastFireNum)}
                      </p>
                    </div>
                    {coastReached && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-700">
                        Reached!
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                    {coastReached
                      ? `Your current ${fmt(currentSavings)} will compound to your FIRE number by age ${retireAge} — no more contributions needed!`
                      : `If you stop saving TODAY, your current ${fmt(currentSavings)} will compound to your FIRE number by age ${retireAge}. You need ${fmt(r.coastFireNum - currentSavings)} more to Coast.`}
                  </p>
                </div>

                {/* Barista FIRE card */}
                {baristaIncome > 0 && (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/40 dark:bg-stone-800 dark:border-stone-700 p-4">
                    <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-1">☕ Barista FIRE</p>
                    <p className="text-xl font-bold font-['Outfit'] text-violet-600 mt-0.5">{fmt(r.baristaFireNum)}</p>
                    <p className="text-xs text-stone-400 dark:text-stone-400 mt-2">
                      With ₹{baristaIncome.toLocaleString("en-IN")}/mo part-time income, your corpus only needs to generate the rest. That's {fmt(r.baristaFireNum)} instead of {fmt(r.regularFireNum)}.
                    </p>
                  </div>
                )}
              </div>

              {/* Pro tip */}
              <div className="bg-stone-800 dark:bg-stone-900 dark:border dark:border-stone-700 rounded-2xl p-4 text-white">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-1">Chanakya says</p>
                <p className="text-sm leading-relaxed text-stone-200">
                  {Number(r.savingsRate) >= 50
                    ? `At a ${r.savingsRate}% savings rate, you're on the FIRE fast track. Stay consistent — don't let lifestyle inflation creep in.`
                    : Number(r.savingsRate) >= 30
                    ? `You need ₹${fmt(r.sipNeeded - r.monthlySavings)} more per month to hit your FIRE target by ${retireAge}. Consider cutting discretionary spend or boosting income.`
                    : `Your expenses leave little room for saving. Even small cuts — dining out, subscriptions — compound significantly over ${r.years} years.`}
                </p>
              </div>

              {/* Set as FIRE Goal button */}
              <div className="pt-1">
                {goalSaved ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                    ✓ FIRE Goal saved! Tracking on your Dashboard
                  </div>
                ) : (
                  <button
                    onClick={handleSaveGoal}
                    disabled={saving}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-sm font-bold shadow-lg shadow-orange-500/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <Flame size={15} />
                    {saving ? "Saving…" : savedGoal ? "Update FIRE Goal" : "Set as FIRE Goal"}
                  </button>
                )}
                <p className="text-center text-[11px] text-stone-400 dark:text-stone-500 mt-2">
                  Saves your plan to the Dashboard for ongoing tracking
                </p>
                <Link
                  to={`/savings-goals?prefill=${encodeURIComponent("FIRE Fund")}&amount=${Math.round(r.regularFireNum)}`}
                  className="mt-3 w-full py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Target size={15} />
                  Set as Savings Goal
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
