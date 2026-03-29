import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Shield, TrendingUp, AlertTriangle, CheckCircle, Sparkles, Info } from 'lucide-react';

const QUOTES = [
  { text: "Do not save what is left after spending; instead spend what is left after saving.", author: "Warren Buffett" },
  { text: "Financial freedom is available to those who learn about it and work for it.", author: "Robert Kiyosaki" },
  { text: "It's not how much money you make, but how much money you keep.", author: "Robert Kiyosaki" },
  { text: "Wealth is not about having a lot of money; it's about having a lot of options.", author: "Chris Rock" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Every rupee saved today is a rupee working for you tomorrow.", author: "BudgetMantra" },
  { text: "Small steps every day lead to financial freedom.", author: "BudgetMantra" },
  { text: "Budget: telling your money where to go instead of wondering where it went.", author: "Dave Ramsey" },
  { text: "A budget is telling your money where to go instead of wondering where it went.", author: "John C. Maxwell" },
  { text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett" },
  { text: "Never spend your money before you have it.", author: "Thomas Jefferson" },
  { text: "Beware of little expenses; a small leak will sink a great ship.", author: "Benjamin Franklin" },
  { text: "The art is not in making money, but in keeping it.", author: "Proverb" },
  { text: "Financial peace isn't the acquisition of stuff. It's learning to live on less than you make.", author: "Dave Ramsey" },
  { text: "Money is a terrible master but an excellent servant.", author: "P.T. Barnum" },
  { text: "Rich people have small TVs and big libraries. Poor people have small libraries and big TVs.", author: "Zig Ziglar" },
  { text: "Opportunity is missed by most people because it is dressed in overalls and looks like work.", author: "Thomas Edison" },
  { text: "The goal isn't more money. The goal is living life on your own terms.", author: "Chris Brogan" },
  { text: "Invest in yourself. Your career is the engine of your wealth.", author: "Paul Clitheroe" },
  { text: "You must gain control over your money or the lack of it will forever control you.", author: "Dave Ramsey" },
  { text: "A penny saved is a penny earned.", author: "Benjamin Franklin" },
  { text: "The habit of saving is itself an education; it fosters every virtue, teaches self-denial.", author: "T.T. Munger" },
  { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
  { text: "Compound interest is the eighth wonder of the world. He who understands it, earns it.", author: "Albert Einstein" },
  { text: "Don't work for money — make money work for you.", author: "BudgetMantra" },
  { text: "Track every rupee today so you can spend freely tomorrow.", author: "BudgetMantra" },
  { text: "Your future self will thank you for every rupee you save today.", author: "BudgetMantra" },
];

export const FinancialQuotesBanner = () => {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % QUOTES.length);
        setVisible(true);
      }, 400);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const quote = QUOTES[index];

  return (
    <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-2xl px-5 py-4 flex items-start gap-3">
      <Sparkles size={18} className="text-orange-400 mt-0.5 shrink-0" />
      <div
        style={{
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(6px)',
        }}
      >
        <p className="text-sm text-stone-700 font-medium leading-snug">"{quote.text}"</p>
        <p className="text-xs text-orange-500 font-semibold mt-1">— {quote.author}</p>
      </div>
    </div>
  );
};

const ScoreRing = ({ score, color, size = 72 }) => {
  const radius = size * 0.417;
  const stroke = size * 0.07;
  const normalised = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalised;
  const offset = circumference - (score / 100) * circumference;

  const ringColor = color === 'emerald' ? '#10b981' : color === 'amber' ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size/2} cy={size/2} r={normalised}
        fill="none"
        stroke="#f1f5f9"
        strokeWidth={stroke}
      />
      <circle
        cx={size/2} cy={size/2} r={normalised}
        fill="none"
        stroke={ringColor}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
      />
    </svg>
  );
};

const FinancialHealthScore = () => {
  const [scoreData, setScoreData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayScore, setDisplayScore] = useState(0);
  const [barsVisible, setBarsVisible] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  useEffect(() => {
    fetchScore();
  }, []);

  useEffect(() => {
    if (!scoreData || scoreData.score === 0) return;

    setBarsVisible(false);
    setDisplayScore(0);

    const barTimer = setTimeout(() => setBarsVisible(true), 400);

    const target = scoreData.score;
    const duration = 1200;
    const steps = 60;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const current = Math.min(Math.round((target / steps) * step), target);
      setDisplayScore(current);
      if (current >= target) clearInterval(timer);
    }, duration / steps);

    return () => { clearInterval(timer); clearTimeout(barTimer); };
  }, [scoreData]);

  const fetchScore = async () => {
    try {
      const response = await axios.get(`${API}/financial-score`);
      setScoreData(response.data);
    } catch (error) {
      console.error('Error fetching score:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 animate-pulse">
        <div className="h-8 bg-stone-100 rounded w-2/3 mb-4"></div>
        <div className="h-24 bg-stone-100 rounded mb-4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-stone-100 rounded"></div>
          <div className="h-4 bg-stone-100 rounded w-4/5"></div>
        </div>
      </div>
    );
  }

  if (!scoreData) return null;

  if (scoreData.score === 0) {
    return (
      <div className="rounded-2xl overflow-hidden shadow-sm border border-stone-100" data-testid="financial-health-score"
        style={{ background: 'linear-gradient(135deg, #1c1917 0%, #292524 60%, #1c1917 100%)' }}>
        <style>{`
          @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
          @keyframes spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        `}</style>

        {/* Decorative blobs */}
        <div className="relative p-6 pb-5">
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #f97316, transparent)', filter: 'blur(30px)' }} />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #fb923c, transparent)', filter: 'blur(20px)' }} />

          {/* Header */}
          <div className="flex items-center gap-2 mb-5 relative">
            <Shield size={15} className="text-orange-400 opacity-80" />
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest font-['Outfit']">Financial Health</span>
          </div>

          {/* Animated ring placeholder */}
          <div className="flex flex-col items-center relative">
            <div className="relative w-28 h-28 mb-4" style={{ animation: 'float 3s ease-in-out infinite' }}>
              {/* Outer spinning dashed ring */}
              <svg className="absolute inset-0 w-full h-full" style={{ animation: 'spin-slow 8s linear infinite' }} viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="50" fill="none" stroke="#f97316" strokeWidth="1.5"
                  strokeDasharray="8 6" strokeLinecap="round" opacity="0.4" />
              </svg>
              {/* Static base ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="44" fill="none" stroke="#292524" strokeWidth="8" />
                <circle cx="56" cy="56" r="44" fill="none" stroke="#f97316" strokeWidth="8"
                  strokeLinecap="round" strokeDasharray="276" strokeDashoffset="276"
                  opacity="0.25" />
              </svg>
              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl" style={{ animation: 'blink 2s ease-in-out infinite' }}>🧮</span>
              </div>
            </div>

            <p className="text-white font-bold text-lg font-['Outfit'] mb-1">Score Awaits You</p>
            <p className="text-stone-400 text-xs text-center max-w-[220px] leading-relaxed">
              Add your <span className="text-orange-400 font-semibold">income + budget</span> in Budget Manager to unlock your personalised Financial Health Score.
            </p>
          </div>
        </div>

        {/* Bottom steps strip */}
        <div className="border-t border-stone-700/50 px-6 py-4 grid grid-cols-3 gap-3">
          {[
            { emoji: '💰', label: 'Add income' },
            { emoji: '📊', label: 'Set budget' },
            { emoji: '🏆', label: 'Get score' },
          ].map(({ emoji, label }, i) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.2)' }}>
                {emoji}
              </div>
              <span className="text-[10px] text-stone-500 font-medium">{label}</span>
              {i < 2 && (
                <div className="absolute" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statusConfig = {
    green: {
      gradient: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
      ringTrack: 'rgba(255,255,255,0.15)',
      ringFill: '#6ee7b7',
      ringColor: 'emerald',
      label: 'Excellent',
      emoji: '🏆',
      labelColor: 'text-emerald-300',
      icon: CheckCircle,
    },
    amber: {
      gradient: 'linear-gradient(135deg, #431407 0%, #7c2d12 50%, #9a3412 100%)',
      ringTrack: 'rgba(255,255,255,0.15)',
      ringFill: '#fcd34d',
      ringColor: 'amber',
      label: 'Good',
      emoji: '📈',
      labelColor: 'text-amber-300',
      icon: TrendingUp,
    },
    red: {
      gradient: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #991b1b 100%)',
      ringTrack: 'rgba(255,255,255,0.15)',
      ringFill: '#fca5a5',
      ringColor: 'red',
      label: 'Needs Attention',
      emoji: '⚠️',
      labelColor: 'text-red-300',
      icon: AlertTriangle,
    },
  };

  const config = statusConfig[scoreData.status] || statusConfig.amber;

  const amt = scoreData.amounts || {};
  const fmtAmt = (v) => v >= 100000
    ? `₹${(v / 100000).toFixed(1)}L`
    : v >= 1000
      ? `₹${(v / 1000).toFixed(1)}K`
      : `₹${v}`;

  const METRICS = [
    {
      label: 'EMI Burden',
      help: 'Monthly loan EMIs as % of your income. RBI recommends staying below 50%.',
      value: scoreData.emi_ratio,
      amount: amt.total_emi != null ? fmtAmt(amt.total_emi) + '/mo' : null,
      thresholdMarkers: [{ at: 30, label: 'Ideal' }, { at: 50, label: 'RBI max' }],
      good: v => v <= 30,
      ok:   v => v <= 50,
    },
    {
      label: 'Monthly Spend',
      help: 'Monthly spending (excluding EMIs) vs income. Keeping this below 40% leaves room to save.',
      value: scoreData.expense_ratio,
      amount: amt.monthly_expenses != null ? fmtAmt(amt.monthly_expenses) + '/mo' : null,
      thresholdMarkers: [{ at: 40, label: 'Ideal' }, { at: 60, label: 'High' }],
      good: v => v <= 40,
      ok:   v => v <= 60,
    },
    {
      label: 'Net Savings',
      help: 'What you actually keep after all outflows. Target ≥ 20% — the golden rule of personal finance.',
      value: scoreData.savings_ratio,
      amount: amt.net_savings != null ? fmtAmt(amt.net_savings) + '/mo' : null,
      thresholdMarkers: [{ at: 10, label: 'Min' }, { at: 20, label: 'Target' }],
      good: v => v >= 20,
      ok:   v => v >= 10,
      reverse: true,
    },
  ];

  // Custom ring that uses hex directly (for dark background)
  const DarkScoreRing = ({ score, fillHex, size = 100 }) => {
    const radius = size * 0.4;
    const stroke = size * 0.075;
    const norm = radius - stroke / 2;
    const circ = 2 * Math.PI * norm;
    const offset = circ - (score / 100) * circ;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={norm} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={norm} fill="none" stroke={fillHex} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 6px ${fillHex}80)` }} />
      </svg>
    );
  };

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg" data-testid="financial-health-score">
      <style>{`
        @keyframes fhs-float-a { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-12px) rotate(8deg)} }
        @keyframes fhs-float-b { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-8px) rotate(-6deg)} }
        @keyframes fhs-float-c { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes fhs-ring-glow { 0%,100%{filter:drop-shadow(0 0 6px ${config.ringFill}80)} 50%{filter:drop-shadow(0 0 18px ${config.ringFill}cc)} }
        @keyframes fhs-score-pop { 0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
        @keyframes fhs-slide-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .fhs-ring-animated { animation: fhs-ring-glow 2.5s ease-in-out infinite; }
        .fhs-score-pop { animation: fhs-score-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) 1.3s both; }
        .fhs-slide-up-1 { animation: fhs-slide-up 0.5s ease 0.1s both; }
        .fhs-slide-up-2 { animation: fhs-slide-up 0.5s ease 0.3s both; }
        .fhs-slide-up-3 { animation: fhs-slide-up 0.5s ease 0.5s both; }
      `}</style>

      {/* ── Dark hero header ── */}
      <div className="relative px-6 pt-6 pb-7 overflow-hidden" style={{ background: config.gradient }}>
        {/* Animated decorative orbs */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-25"
          style={{ background: config.ringFill, filter: 'blur(40px)', animation: 'fhs-float-a 6s ease-in-out infinite' }} />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-15"
          style={{ background: config.ringFill, filter: 'blur(30px)', animation: 'fhs-float-b 4.5s ease-in-out infinite' }} />
        <div className="absolute top-1/2 left-1/2 w-20 h-20 rounded-full opacity-10"
          style={{ background: config.ringFill, filter: 'blur(20px)', animation: 'fhs-float-c 5s ease-in-out infinite 1s' }} />

        {/* Floating sparkle dots */}
        {[[8, 35, 1.8], [16, 75, 2.4], [60, 15, 2.2], [72, 88, 1.6]].map(([top, left, dur], i) => (
          <div key={i} className="absolute w-1.5 h-1.5 rounded-full opacity-40 pointer-events-none"
            style={{ top: `${top}%`, left: `${left}%`, background: config.ringFill,
              animation: `fhs-float-${['a','b','c','a'][i]} ${dur}s ease-in-out infinite ${i * 0.5}s` }} />
        ))}

        <div className="relative flex items-center justify-between">
          {/* Left: label + score number */}
          <div>
            <div className="fhs-slide-up-1 flex items-center gap-1.5 mb-3">
              <Shield size={13} className="text-white/50" />
              <span className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Financial Health</span>
            </div>
            <div className="fhs-score-pop flex items-end gap-2 mb-1">
              <span className="text-6xl font-black text-white font-['Outfit'] leading-none"
                style={{ textShadow: `0 2px 20px rgba(0,0,0,0.4), 0 0 40px ${config.ringFill}40` }}>
                {displayScore}
              </span>
            </div>
            <div className={`fhs-slide-up-2 flex items-center gap-1.5 font-bold text-sm ${config.labelColor}`}>
              <span>{config.emoji}</span>
              <span>{config.label}</span>
            </div>
            <p className="fhs-slide-up-3 text-white/55 text-xs mt-2 max-w-[180px] leading-relaxed">
              {scoreData.message}
            </p>
          </div>

          {/* Right: animated glowing ring */}
          <div className="fhs-ring-animated relative shrink-0">
            <DarkScoreRing score={barsVisible ? scoreData.score : 0} fillHex={config.ringFill} size={110} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl" style={{ animation: 'fhs-float-b 3s ease-in-out infinite' }}>{config.emoji}</span>
            </div>
          </div>
        </div>

        {/* Top tip */}
        {scoreData.recommendations?.[0] && (
          <div className="relative mt-4 flex items-start gap-2 bg-white/10 rounded-xl px-3 py-2.5 border border-white/10">
            <Sparkles size={12} className="text-white/60 mt-0.5 shrink-0" />
            <p className="text-white/70 text-[11px] leading-relaxed">{scoreData.recommendations[0]}</p>
          </div>
        )}

        {/* Score breakdown bars */}
        {scoreData?.breakdown && (
          <div className="relative mt-4 space-y-2">
            {[
              { label: "Momentum", key: "momentum", max: 35, color: "bg-blue-400", desc: "vs last 3 months" },
              { label: "Discipline", key: "discipline", max: 35, color: "bg-emerald-400", desc: "budget adherence" },
              { label: "Fundamentals", key: "fundamentals", max: 30, color: "bg-orange-400", desc: "EMI + savings rate" },
            ].map(({ label, key, max, color, desc }) => {
              const val = scoreData.breakdown[key] || 0;
              const pct = Math.round((val / max) * 100);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-white/70">{label}</span>
                    <span className="text-xs text-white/40">{val}/{max} · {desc}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full transition-all duration-700`}
                      style={{ width: barsVisible ? `${pct}%` : '0%' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Metrics ── */}
      <div className="bg-white divide-y divide-stone-50 dark:bg-stone-900">
        {METRICS.map(({ label, help, value, amount, thresholdMarkers, good, ok }, i) => {
          const isGood = good(value);
          const isOk  = !isGood && ok(value);
          const status = isGood ? 'good' : isOk ? 'ok' : 'bad';
          const barColor  = status === 'good' ? '#10b981' : status === 'ok' ? '#f59e0b' : '#ef4444';
          const textColor = status === 'good' ? 'text-emerald-600' : status === 'ok' ? 'text-amber-500' : 'text-red-500';
          const statusIcon = status === 'good' ? '✓' : status === 'ok' ? '~' : '!';
          const statusBg   = status === 'good' ? 'bg-emerald-100 text-emerald-700' : status === 'ok' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

          return (
            <div key={label} className="px-5 py-4">
              {/* Row 1: label + help + value + status badge */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-semibold text-stone-800">{label}</span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-snug">{help}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    {amount
                      ? <span className={`text-base font-black font-['Outfit'] ${textColor}`}>{amount}</span>
                      : <span className={`text-lg font-black font-['Outfit'] ${textColor}`}>{value}%</span>
                    }
                    {amount && <div className={`text-[10px] font-semibold ${textColor} opacity-70`}>{value}% of income</div>}
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusBg}`}>{statusIcon}</span>
                </div>
              </div>

              {/* Bar with threshold markers */}
              <div className="relative h-2 bg-stone-100 rounded-full overflow-visible mt-3">
                {/* Filled bar */}
                <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                  style={{
                    width: barsVisible ? `${Math.min(value, 100)}%` : '0%',
                    background: barColor,
                    transitionDelay: `${i * 120}ms`,
                    boxShadow: `0 0 6px ${barColor}60`,
                  }} />
                {/* Threshold markers */}
                {thresholdMarkers.map(m => (
                  <div key={m.at} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
                    style={{ left: `${m.at}%` }}>
                    <div className="w-0.5 h-3 bg-stone-300 rounded-full" />
                    <span className="absolute -bottom-4 text-[9px] text-stone-400 font-medium whitespace-nowrap -translate-x-1/2">{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="h-4" /> {/* spacer for threshold labels */}
            </div>
          );
        })}
      </div>

      {/* ── How is my score calculated? ── */}
      <div className="bg-white border-t border-stone-100">
        <button
          onClick={() => setShowHowTo(s => !s)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-stone-600 hover:text-orange-500 transition-colors group"
        >
          <span className="flex items-center gap-2">
            <span className="text-base">🧮</span>
            How is my score calculated?
          </span>
          <span className={`text-stone-400 transition-transform duration-300 ${showHowTo ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {showHowTo && (
          <div className="px-5 pb-5 space-y-3">
            {[
              {
                emoji: '🏦',
                label: 'EMI Burden',
                weight: 35,
                tip: 'Keep your monthly EMIs below 30% of income. RBI recommends never crossing 50%.',
                current: scoreData.emi_ratio,
                good: scoreData.emi_ratio <= 30,
                ok: scoreData.emi_ratio <= 50,
                action: scoreData.emi_ratio > 50
                  ? 'Prepay high-interest loans first. Even ₹500 extra/month helps.'
                  : scoreData.emi_ratio > 30
                  ? 'You\'re above the ideal 30% — avoid taking new loans.'
                  : '✨ You\'re in the green zone. Keep it up!',
              },
              {
                emoji: '💸',
                label: 'Monthly Spend',
                weight: 25,
                tip: 'Spending (excluding EMIs) should stay below 40% of income to leave room for savings.',
                current: scoreData.expense_ratio,
                good: scoreData.expense_ratio <= 40,
                ok: scoreData.expense_ratio <= 60,
                action: scoreData.expense_ratio > 60
                  ? 'Track every expense in the Expenses tab — awareness alone cuts spending 10-15%.'
                  : scoreData.expense_ratio > 40
                  ? 'Close to the ideal. Cut one discretionary category to get there.'
                  : '✨ Excellent spending discipline!',
              },
              {
                emoji: '💰',
                label: 'Net Savings',
                weight: 25,
                tip: 'The golden rule: save at least 20% of your income. Even 10% is a great start.',
                current: scoreData.savings_ratio,
                good: scoreData.savings_ratio >= 20,
                ok: scoreData.savings_ratio >= 10,
                action: scoreData.savings_ratio < 10
                  ? 'Set up auto-debit to savings on salary day — pay yourself first!'
                  : scoreData.savings_ratio < 20
                  ? 'You\'re saving but can do more. Target 20% with a SIP.'
                  : '✨ You\'re saving like a pro!',
              },
              {
                emoji: '🛡️',
                label: 'Momentum',
                weight: 15,
                tip: 'Staying consistent — tracking expenses, meeting budget goals — builds your score over time.',
                current: null,
                good: scoreData.score >= 70,
                ok: scoreData.score >= 50,
                action: 'Log expenses regularly in the Expenses tab. Consistency is rewarded!',
              },
            ].map(({ emoji, label, weight, tip, current, good, ok, action }) => {
              const statusColor = good ? 'border-emerald-200 bg-emerald-50' : ok ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50';
              const badgeColor = good ? 'bg-emerald-500' : ok ? 'bg-amber-500' : 'bg-red-500';
              return (
                <div key={label} className={`rounded-2xl border p-3.5 ${statusColor}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{emoji}</span>
                      <span className="font-bold text-stone-800 text-sm">{label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {current !== null && (
                        <span className="text-xs font-bold text-stone-500">{current}%</span>
                      )}
                      <span className={`text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ${badgeColor}`}>
                        {weight}pts
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-snug mb-2">{tip}</p>
                  <p className="text-[11px] font-semibold text-stone-700 leading-snug">👉 {action}</p>
                </div>
              );
            })}

            <div className="rounded-2xl bg-orange-50 border border-orange-200 p-3.5 text-center">
              <p className="text-xs text-orange-700 font-semibold">🎯 Total: 100 points</p>
              <p className="text-[11px] text-orange-600 mt-0.5">Score updates every time you open the app based on your latest data.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialHealthScore;
