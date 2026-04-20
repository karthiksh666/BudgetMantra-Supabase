import { useState, useMemo, useCallback } from "react";
import Navigation from "@/components/Navigation";
import { Banknote, TrendingUp, Building2, PiggyBank, Share2, ChevronDown, ChevronUp, Info, Sparkles } from "lucide-react";

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

// ── New Regime Tax Calculation (FY 2025-26) ──────────────────────────────────
const calcNewRegimeTax = (annualIncome) => {
  const standardDeduction = 75000;
  let taxable = Math.max(0, annualIncome - standardDeduction);

  // Rebate u/s 87A: no tax if taxable income <= 12,75,000
  if (taxable <= 1275000) return 0;

  let tax = 0;
  const slabs = [
    [400000,  0.05],  // 4L–8L @ 5%
    [400000,  0.10],  // 8L–12L @ 10%
    [400000,  0.15],  // 12L–16L @ 15%
    [400000,  0.20],  // 16L–20L @ 20%
    [400000,  0.25],  // 20L–24L @ 25%
    [Infinity, 0.30], // 24L+ @ 30%
  ];

  let remaining = Math.max(0, taxable - 400000); // first 4L is exempt

  for (const [limit, rate] of slabs) {
    if (remaining <= 0) break;
    const chunk = Math.min(remaining, limit);
    tax += chunk * rate;
    remaining -= chunk;
  }

  // 4% cess
  tax *= 1.04;
  return Math.round(tax);
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

// ── Quick-select chips ───────────────────────────────────────────────────────
const Chips = ({ options, value, onChange, suffix = "" }) => (
  <div className="flex flex-wrap gap-1.5 mt-1.5">
    {options.map(opt => (
      <button key={opt} onClick={() => onChange(opt)}
        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
          value === opt
            ? "bg-orange-500 text-white border-orange-500 shadow-sm"
            : "bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:border-orange-300"
        }`}>
        {opt}{suffix}
      </button>
    ))}
  </div>
);

// ── Input field ──────────────────────────────────────────────────────────────
const Field = ({ label, tip, prefix, suffix, value, onChange, min, max, step = 1, chips, chipSuffix }) => (
  <div>
    <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
      {label} {tip && <Tip text={tip} />}
    </label>
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-3 text-stone-400 dark:text-stone-500 text-sm font-semibold">{prefix}</span>}
      <input
        type="number"
        value={value}
        min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        className={`w-full border border-stone-200 dark:border-stone-700 rounded-xl py-2.5 text-sm text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 font-semibold focus:outline-none focus:border-orange-400 transition-colors ${prefix ? "pl-8" : "pl-4"} ${suffix ? "pr-12" : "pr-4"}`}
      />
      {suffix && <span className="absolute right-3 text-stone-400 dark:text-stone-500 text-xs font-semibold">{suffix}</span>}
    </div>
    {chips && <Chips options={chips} value={value} onChange={onChange} suffix={chipSuffix} />}
  </div>
);

// ── Year-by-year projection ─────────────────────────────────────────────────
const calcProjection = ({ currentAge, retireAge, monthlyCTC, growthRate }) => {
  const years = retireAge - currentAge;
  const projection = [];
  let totalEarnings = 0;
  let totalTax = 0;
  let annualCTC = monthlyCTC * 12;

  for (let i = 0; i < years; i++) {
    const age = currentAge + i;
    const tax = calcNewRegimeTax(annualCTC);
    const netIncome = annualCTC - tax;
    totalEarnings += annualCTC;
    totalTax += tax;

    projection.push({
      year: i + 1,
      age,
      annualCTC,
      tax,
      netIncome,
      cumulativeEarnings: totalEarnings,
      cumulativeTax: totalTax,
      cumulativeNet: totalEarnings - totalTax,
    });

    annualCTC = Math.round(annualCTC * (1 + growthRate / 100));
  }

  return { projection, totalEarnings, totalTax, totalNet: totalEarnings - totalTax };
};

// ── Fun comparison items ────────────────────────────────────────────────────
const getFunComparisons = (totalNet) => [
  {
    emoji: "🏢",
    label: "2BHK apartments in Bangalore",
    value: Math.floor(totalNet / 8000000),
    detail: "at ~₹80L each",
  },
  {
    emoji: "🚗",
    label: "Toyota Fortuners",
    value: Math.floor(totalNet / 5000000),
    detail: "at ~₹50L each",
  },
  {
    emoji: "✈️",
    label: "Round-trip Europe vacations",
    value: Math.floor(totalNet / 300000),
    detail: "at ~₹3L per trip",
  },
  {
    emoji: "📱",
    label: "iPhone Pro Max units",
    value: Math.floor(totalNet / 160000),
    detail: "at ~₹1.6L each",
  },
  {
    emoji: "🎓",
    label: "Years of IIM MBA fees",
    value: Math.floor(totalNet / 2500000),
    detail: "at ~₹25L/year",
  },
  {
    emoji: "☕",
    label: "Starbucks coffees",
    value: Math.floor(totalNet / 500),
    detail: "at ~₹500 each",
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
export default function LifetimeEarnings() {
  const [currentAge,  setCurrentAge]  = useState(25);
  const [retireAge,   setRetireAge]   = useState(60);
  const [monthlyCTC,  setMonthlyCTC]  = useState(100000);
  const [growthRate,  setGrowthRate]  = useState(10);
  const [showTable,   setShowTable]   = useState(false);
  const [mobileTab,   setMobileTab]   = useState("inputs");
  const [shareMsg,    setShareMsg]    = useState("");

  const result = useMemo(() =>
    calcProjection({ currentAge, retireAge, monthlyCTC, growthRate }),
    [currentAge, retireAge, monthlyCTC, growthRate]
  );

  const comparisons = useMemo(() => getFunComparisons(result.totalNet), [result.totalNet]);

  const savingsAt20 = result.totalNet * 0.20;
  const savingsAt30 = result.totalNet * 0.30;
  const savingsAt50 = result.totalNet * 0.50;

  const handleShare = useCallback(() => {
    const text = `My Lifetime Earnings Estimate (age ${currentAge}–${retireAge}):\n` +
      `Total Gross: ${fmtFull(result.totalEarnings)}\n` +
      `Total Tax: ${fmtFull(result.totalTax)}\n` +
      `Net Take-home: ${fmtFull(result.totalNet)}\n` +
      `That's ${Math.floor(result.totalNet / 8000000)} apartments in Bangalore!\n\n` +
      `Calculate yours at BudgetMantra.in`;

    if (navigator.share) {
      navigator.share({ title: "My Lifetime Earnings", text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setShareMsg("Copied to clipboard!");
        setTimeout(() => setShareMsg(""), 2500);
      }).catch(() => {});
    }
  }, [currentAge, retireAge, result]);

  const workingYears = retireAge - currentAge;
  const effectiveTaxRate = result.totalEarnings > 0
    ? ((result.totalTax / result.totalEarnings) * 100).toFixed(1)
    : 0;

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-[#fffaf5] dark:bg-stone-950">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
              <Banknote size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">Lifetime Earnings</h1>
              <p className="text-xs text-stone-400 dark:text-stone-500">How much will you earn in your career?</p>
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40 border border-orange-100 dark:border-orange-900/50 rounded-2xl p-4 mb-6">
            <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
              <span className="font-bold text-orange-600">Ever wondered</span> how much you'll earn across your entire career? Enter your details below to see your gross earnings, tax outgo under the <span className="font-bold">new tax regime</span>, and net take-home — with some fun comparisons to put it in perspective.
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
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-5 space-y-5">
                <p className="text-sm font-bold text-stone-700 dark:text-stone-300">Your Details</p>

                <Field label="Current Age" suffix="years"
                  tip="Your age today"
                  value={currentAge} onChange={v => setCurrentAge(Math.min(v, retireAge - 1))}
                  min={18} max={65}
                  chips={[22, 25, 28, 30, 35, 40]}
                  chipSuffix="" />

                <Field label="Retirement Age" suffix="years"
                  tip="The age you plan to stop working"
                  value={retireAge} onChange={v => setRetireAge(Math.max(v, currentAge + 1))}
                  min={30} max={75}
                  chips={[50, 55, 58, 60, 65]}
                  chipSuffix="" />

                <Field label="Monthly CTC (Cost to Company)" prefix="₹"
                  tip="Your total monthly CTC before tax. Include all components — basic, HRA, bonuses, etc."
                  value={monthlyCTC} onChange={setMonthlyCTC}
                  min={10000} step={5000}
                  chips={[50000, 75000, 100000, 150000, 200000, 300000]}
                  chipSuffix="" />

                <Field label="Annual Salary Growth" suffix="%"
                  tip="Expected yearly increment. 8-12% is typical for Indian IT; 5-8% for other sectors."
                  value={growthRate} onChange={setGrowthRate}
                  min={0} max={30} step={0.5}
                  chips={[5, 8, 10, 12, 15, 20]}
                  chipSuffix="%" />
              </div>

              {/* Quick summary for inputs panel */}
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-5">
                <p className="text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">At a Glance</p>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500 dark:text-stone-400">Working years</span>
                    <span className="font-bold text-stone-800 dark:text-stone-200">{workingYears} years</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500 dark:text-stone-400">Starting annual CTC</span>
                    <span className="font-bold text-stone-800 dark:text-stone-200">{fmtFull(monthlyCTC * 12)}</span>
                  </div>
                  {result.projection.length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500 dark:text-stone-400">Final year CTC</span>
                      <span className="font-bold text-stone-800 dark:text-stone-200">{fmtFull(result.projection[result.projection.length - 1].annualCTC)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500 dark:text-stone-400">Effective tax rate</span>
                    <span className="font-bold text-orange-600">{effectiveTaxRate}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right: Results ── */}
            <div className={`space-y-5 ${mobileTab === "inputs" ? "hidden lg:block" : ""}`}>

              {/* Big numbers */}
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-5 space-y-4">
                <p className="text-sm font-bold text-stone-700 dark:text-stone-300">Lifetime Numbers</p>

                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/50 dark:to-amber-950/50 rounded-xl p-4 border border-orange-100 dark:border-orange-900/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500 mb-1">Total Gross Earnings</p>
                    <p className="text-2xl font-bold font-['Outfit'] text-orange-600">{fmt(result.totalEarnings)}</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{fmtFull(result.totalEarnings)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-50 dark:bg-red-950/50 rounded-xl p-3 border border-red-100 dark:border-red-900/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500 mb-1">Total Tax (New Regime)</p>
                      <p className="text-lg font-bold font-['Outfit'] text-red-600">{fmt(result.totalTax)}</p>
                      <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">{effectiveTaxRate}% effective</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/50 rounded-xl p-3 border border-emerald-100 dark:border-emerald-900/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500 mb-1">Net Take-Home</p>
                      <p className="text-lg font-bold font-['Outfit'] text-emerald-600">{fmt(result.totalNet)}</p>
                      <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">{fmtFull(result.totalNet)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Savings scenarios */}
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <PiggyBank size={16} className="text-orange-500" />
                  <p className="text-sm font-bold text-stone-700 dark:text-stone-300">If You Save...</p>
                </div>

                {[
                  { pct: 20, amt: savingsAt20, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/50 border-blue-100 dark:border-blue-900/50" },
                  { pct: 30, amt: savingsAt30, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-100 dark:border-emerald-900/50" },
                  { pct: 50, amt: savingsAt50, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/50 border-purple-100 dark:border-purple-900/50" },
                ].map(({ pct, amt, color, bg }) => (
                  <div key={pct} className={`${bg} rounded-xl p-3 border flex items-center justify-between`}>
                    <div>
                      <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">Save {pct}% of take-home</p>
                      <p className={`text-base font-bold font-['Outfit'] ${color}`}>{fmt(amt)}</p>
                    </div>
                    <span className={`text-2xl font-bold ${color} opacity-20`}>{pct}%</span>
                  </div>
                ))}
              </div>

              {/* Fun comparisons */}
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={16} className="text-orange-500" />
                  <p className="text-sm font-bold text-stone-700 dark:text-stone-300">That's Equivalent To...</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {comparisons.map(({ emoji, label, value: val, detail }) => (
                    <div key={label} className="bg-stone-50 dark:bg-stone-800 rounded-xl p-3 border border-stone-100 dark:border-stone-700 text-center">
                      <p className="text-2xl mb-1">{emoji}</p>
                      <p className="text-lg font-bold font-['Outfit'] text-stone-800 dark:text-stone-200">{val.toLocaleString("en-IN")}</p>
                      <p className="text-[10px] text-stone-500 dark:text-stone-400 font-semibold leading-tight">{label}</p>
                      <p className="text-[9px] text-stone-400 dark:text-stone-500">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Year-by-year projection (collapsible) */}
              <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowTable(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp size={15} className="text-orange-500" />
                    Year-by-Year Projection
                  </span>
                  {showTable ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showTable && (
                  <div className="border-t border-stone-100 dark:border-stone-800 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-stone-50 dark:bg-stone-800">
                          <th className="text-left px-3 py-2 font-semibold text-stone-500 dark:text-stone-400">Age</th>
                          <th className="text-right px-3 py-2 font-semibold text-stone-500 dark:text-stone-400">Annual CTC</th>
                          <th className="text-right px-3 py-2 font-semibold text-stone-500 dark:text-stone-400">Tax</th>
                          <th className="text-right px-3 py-2 font-semibold text-stone-500 dark:text-stone-400">Net</th>
                          <th className="text-right px-3 py-2 font-semibold text-stone-500 dark:text-stone-400">Cumulative Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.projection.map((row) => (
                          <tr key={row.year} className="border-t border-stone-50 dark:border-stone-800 hover:bg-orange-50/40 dark:hover:bg-stone-800/50 transition-colors">
                            <td className="px-3 py-2 font-semibold text-stone-700 dark:text-stone-300">{row.age}</td>
                            <td className="px-3 py-2 text-right text-stone-600 dark:text-stone-300 font-semibold">{fmt(row.annualCTC)}</td>
                            <td className="px-3 py-2 text-right text-red-500 font-semibold">{fmt(row.tax)}</td>
                            <td className="px-3 py-2 text-right text-emerald-600 font-semibold">{fmt(row.netIncome)}</td>
                            <td className="px-3 py-2 text-right text-orange-600 font-bold">{fmt(row.cumulativeNet)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pro tip */}
              <div className="bg-stone-800 dark:bg-stone-900 dark:border dark:border-stone-700 rounded-2xl p-4 text-white">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-1">Chanakya says</p>
                <p className="text-sm leading-relaxed text-stone-200">
                  {workingYears >= 30
                    ? `You have ${workingYears} years of earning ahead. Even saving 20% consistently and investing at 12% returns could turn ${fmt(savingsAt20)} into ${fmt(savingsAt20 * 3)} through compounding. Start early, stay consistent.`
                    : workingYears >= 15
                    ? `With ${workingYears} working years left, every increment matters. Channel at least 50% of each raise into investments — your future self will thank you.`
                    : `Only ${workingYears} years to go. Focus on maximizing income through skill upgrades and side hustles. Aggressive saving now has a multiplied impact.`}
                </p>
              </div>

              {/* Share button */}
              <div className="pt-1">
                <button
                  onClick={handleShare}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-bold shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Share2 size={15} />
                  Share My Lifetime Earnings
                </button>
                {shareMsg && (
                  <p className="text-center text-xs text-emerald-600 font-semibold mt-2">{shareMsg}</p>
                )}
                <p className="text-center text-[11px] text-stone-400 dark:text-stone-500 mt-2">
                  Share your career earnings estimate with friends
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
