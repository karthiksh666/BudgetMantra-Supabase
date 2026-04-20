import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";

// ── Questions ───────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    id: "goal",
    title: "What are you investing for?",
    choices: [
      { key: "emergency",  emoji: "\u{1F6E1}\uFE0F", label: "Emergency Fund",      sub: "Safety net for 3-6 months" },
      { key: "gadget",     emoji: "\u{1F4F1}",       label: "Buy Something",        sub: "Phone, laptop, bike" },
      { key: "wedding",    emoji: "\u{1F48D}",       label: "Wedding / Big Event",  sub: "3-5 years away" },
      { key: "home",       emoji: "\u{1F3E0}",       label: "Home / Down Payment",  sub: "5-10 years away" },
      { key: "child",      emoji: "\u{1F476}",       label: "Child Education",      sub: "10-20 years away" },
      { key: "retirement", emoji: "\u{1F3D6}\uFE0F", label: "Retirement / FIRE",    sub: "Long-term wealth" },
      { key: "general",    emoji: "\u{1F4B0}",       label: "Just Grow Money",      sub: "No specific goal" },
    ],
  },
  {
    id: "timeline",
    title: "When do you need the money?",
    choices: [
      { key: "now",     emoji: "\u23F1\uFE0F", label: "Within 1 year",  sub: "Very short term" },
      { key: "short",   emoji: "\u{1F4C5}",    label: "1-3 years",      sub: "Short term" },
      { key: "medium",  emoji: "\u{1F3D7}\uFE0F", label: "3-7 years",   sub: "Medium term" },
      { key: "long",    emoji: "\u{1F680}",    label: "7+ years",       sub: "Long term" },
      { key: "forever", emoji: "\u267E\uFE0F", label: "No deadline",    sub: "Grow forever" },
    ],
  },
  {
    id: "risk",
    title: "How much risk are you comfortable with?",
    choices: [
      { key: "none",     emoji: "\u{1F512}", label: "Zero risk",     sub: "Capital must be 100% safe" },
      { key: "low",      emoji: "\u{1F6E1}\uFE0F", label: "Low risk",      sub: "Small fluctuations OK" },
      { key: "moderate", emoji: "\u2696\uFE0F", label: "Moderate risk", sub: "OK with ups and downs" },
      { key: "high",     emoji: "\u{1F3A2}", label: "High risk",     sub: "Comfortable with volatility" },
    ],
  },
  {
    id: "amount",
    title: "How much can you invest monthly?",
    choices: [
      { key: "tiny",   emoji: "\u{1FA99}", label: "Under \u20B95,000",     sub: "Starting small" },
      { key: "small",  emoji: "\u{1F4B5}", label: "\u20B95K - \u20B915K",  sub: "Building habit" },
      { key: "medium", emoji: "\u{1F4B0}", label: "\u20B915K - \u20B950K", sub: "Serious investing" },
      { key: "large",  emoji: "\u{1F3E6}", label: "\u20B950K+",            sub: "Wealth building" },
    ],
  },
];

// ── Recommendation Engine (ported from mobile InvestAdvisor.tsx) ─────────────

const SCREEN_ROUTES = {
  FDCalculator:       null,
  PPFCalculator:      null,
  SGBCalculator:      null,
  SIPCalculator:      null,
  FundBrowser:        null,
  StockAnalysis:      null,
  Commodities:        null,
  RDCalculator:       null,
  BuyVsRent:          null,
  RealEstate:         null,
  Fire:               "/fire",
  NPSCalculator:      null,
  EPFCalculator:      null,
  SSYCalculator:      null,
  Goals:              "/savings-goals",
  IncomeTax:          null,
  InHandSalary:       null,
  InvestmentPlanner:  "/investments",
};

function getRecommendations(answers) {
  const { goal, timeline, risk, amount } = answers;
  const recs = [];

  // Always-relevant based on risk
  if (risk === "none" || risk === "low") {
    recs.push({ emoji: "\u{1F512}", title: "Fixed Deposit", why: "Guaranteed returns, zero risk. Start here for safety.", screen: "FDCalculator", color: "#6366f1" });
    recs.push({ emoji: "\u{1F6E1}\uFE0F", title: "PPF Account", why: "Govt-backed 7.1% returns, tax-free. 15-year lock-in but solid.", screen: "PPFCalculator", color: "#0d9959" });
    if (timeline !== "now" && timeline !== "short") {
      recs.push({ emoji: "\u{1F947}", title: "Gold Bond (SGB)", why: "Gold returns + 2.5% interest. Better than physical gold.", screen: "SGBCalculator", color: "#d97706" });
    }
  }

  if (risk === "moderate" || risk === "high") {
    recs.push({ emoji: "\u{1F4C8}", title: "SIP Calculator", why: "Monthly SIP in equity funds. \u20B910K/mo at 12% = \u20B91Cr in 20 years.", screen: "SIPCalculator", color: "#10b981", primary: true });
    recs.push({ emoji: "\u{1F4CA}", title: "Browse Mutual Funds", why: "Compare funds by category \u2014 equity, debt, index, ELSS.", screen: "FundBrowser", color: "#0ea5e9" });
    if (risk === "high") {
      recs.push({ emoji: "\u{1F4CA}", title: "Stock Analyzer", why: "Research individual stocks with Chanakya's analysis.", screen: "StockAnalysis", color: "#3b82f6" });
      recs.push({ emoji: "\u{1F947}", title: "Commodities & Crypto", why: "Gold, Silver, Bitcoin \u2014 higher risk, higher potential.", screen: "Commodities", color: "#d97706" });
    }
  }

  // Goal-specific
  if (goal === "emergency") {
    recs.unshift({ emoji: "\u{1F4A7}", title: "Liquid Fund / RD", why: "Park 3-6 months' expenses where you can withdraw anytime.", screen: "RDCalculator", color: "#0891b2", primary: true });
  }
  if (goal === "home") {
    recs.push({ emoji: "\u{1F3E0}", title: "Buy vs Rent", why: "Is buying right for you? Run the numbers.", screen: "BuyVsRent", color: "#3b82f6" });
    recs.push({ emoji: "\u{1F3D8}\uFE0F", title: "Real Estate Check", why: "Evaluate property investment returns.", screen: "RealEstate", color: "#0891b2" });
  }
  if (goal === "retirement") {
    recs.unshift({ emoji: "\u{1F525}", title: "FIRE Calculator", why: "Find your FIRE number \u2014 how much you need to retire.", screen: "Fire", color: "#f43f5e", primary: true });
    recs.push({ emoji: "\u{1F9D3}", title: "NPS Calculator", why: "Pension fund with tax benefits. Good for long-term.", screen: "NPSCalculator", color: "#7c3aed" });
    recs.push({ emoji: "\u{1F3ED}", title: "EPF Check", why: "See how much your PF corpus will grow by retirement.", screen: "EPFCalculator", color: "#0891b2" });
  }
  if (goal === "child") {
    recs.push({ emoji: "\u{1F467}", title: "SSY Calculator", why: "Sukanya Samriddhi for daughters \u2014 8%+ guaranteed.", screen: "SSYCalculator", color: "#ec4899" });
  }
  if (goal === "gadget" || goal === "wedding") {
    recs.unshift({ emoji: "\u{1F3AF}", title: "Set a Goal", why: "Track your savings progress towards this purchase.", screen: "Goals", color: "#10b981", primary: true });
  }

  // Tax planning for everyone earning decent
  if (amount === "medium" || amount === "large") {
    recs.push({ emoji: "\u{1F9FE}", title: "Income Tax Planner", why: "Old vs New regime \u2014 find which saves you more.", screen: "IncomeTax", color: "#be123c" });
    recs.push({ emoji: "\u{1F4B0}", title: "In-Hand Salary", why: "Know your exact take-home after all deductions.", screen: "InHandSalary", color: "#16b96e" });
  }

  // Investment Planner for everyone
  recs.push({ emoji: "\u{1F967}", title: "Invest \u20B9X Planner", why: "Enter any amount \u2014 get a complete split across asset classes.", screen: "InvestmentPlanner", color: "#059669" });

  // Deduplicate by screen
  const seen = new Set();
  return recs.filter((r) => {
    if (seen.has(r.screen)) return false;
    seen.add(r.screen);
    return true;
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export default function InvestmentAdvisor() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});

  const currentQ = step < QUESTIONS.length ? QUESTIONS[step] : null;
  const done = step >= QUESTIONS.length;
  const recommendations = done ? getRecommendations(answers) : [];
  const progress = ((step) / QUESTIONS.length) * 100;

  const pick = (questionId, choiceKey) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceKey }));
    setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const reset = () => {
    setStep(0);
    setAnswers({});
  };

  const handleNavigate = (screen) => {
    const route = SCREEN_ROUTES[screen];
    if (route) navigate(route);
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-[#fffaf5] dark:bg-stone-950">
        <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
            >
              <span className="text-xl">&#129504;</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">
                Investment Advisor
              </h1>
              <p className="text-xs text-stone-400 dark:text-stone-500">
                4 quick questions &rarr; personalized plan
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                {done ? "Done!" : `Question ${step + 1} of ${QUESTIONS.length}`}
              </span>
              <span className="text-xs font-bold text-orange-600">
                {done ? "100" : Math.round(progress)}%
              </span>
            </div>
            <div className="h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500 ease-out"
                style={{ width: `${done ? 100 : progress}%` }}
              />
            </div>
          </div>

          {/* Question card */}
          {currentQ && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm p-5">
              <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-4">
                {currentQ.title}
              </h2>

              <div className="space-y-2">
                {currentQ.choices.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => pick(currentQ.id, c.key)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-stone-100 dark:border-stone-700 hover:border-orange-300 dark:hover:border-orange-600 hover:bg-orange-50/50 dark:hover:bg-orange-950/30 transition-all text-left group"
                  >
                    <span className="text-xl w-8 text-center shrink-0">{c.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 group-hover:text-orange-700 dark:group-hover:text-orange-400 transition-colors">
                        {c.label}
                      </p>
                      <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{c.sub}</p>
                    </div>
                    <ArrowRight size={14} className="text-stone-300 dark:text-stone-600 group-hover:text-orange-500 transition-colors shrink-0" />
                  </button>
                ))}
              </div>

              {step > 0 && (
                <button
                  onClick={goBack}
                  className="flex items-center gap-1.5 mt-4 text-xs font-semibold text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                >
                  <ArrowLeft size={13} />
                  Back
                </button>
              )}
            </div>
          )}

          {/* Results */}
          {done && (
            <div className="space-y-4">
              {/* Result header */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/30 border border-orange-100 dark:border-orange-900/50 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">&#129504;</span>
                  <div>
                    <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">
                      Chanakya's Recipe for You
                    </h2>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Based on your answers, here's your personalized plan
                    </p>
                  </div>
                </div>
              </div>

              {/* Recommendation cards */}
              <div className="space-y-3">
                {recommendations.map((rec, i) => {
                  const hasRoute = !!SCREEN_ROUTES[rec.screen];
                  return (
                    <div
                      key={rec.screen}
                      className={`bg-white dark:bg-stone-900 rounded-2xl border shadow-sm p-4 transition-all ${
                        rec.primary
                          ? "border-emerald-200 dark:border-emerald-800 ring-1 ring-emerald-100 dark:ring-emerald-900/50"
                          : "border-stone-100 dark:border-stone-800"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon circle */}
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: rec.color + "15" }}
                        >
                          <span className="text-lg">{rec.emoji}</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className="text-sm font-bold"
                              style={{ color: rec.primary ? rec.color : undefined }}
                            >
                              <span className={rec.primary ? "" : "text-stone-800 dark:text-stone-100"}>
                                {rec.title}
                              </span>
                            </p>
                            {rec.primary && (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-700">
                                Top Pick
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                            {rec.why}
                          </p>

                          {hasRoute && (
                            <button
                              onClick={() => handleNavigate(rec.screen)}
                              className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                              style={{
                                backgroundColor: rec.color + "12",
                                color: rec.color,
                              }}
                            >
                              Open
                              <ArrowRight size={12} />
                            </button>
                          )}
                          {!hasRoute && (
                            <span className="mt-2.5 inline-block text-[11px] text-stone-300 dark:text-stone-600 font-medium">
                              Coming soon
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Start over */}
              <button
                onClick={reset}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-sm font-semibold text-stone-600 dark:text-stone-300 transition-colors"
              >
                <RefreshCw size={14} />
                Start Over
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
