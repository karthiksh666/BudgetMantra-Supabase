import { useState, useEffect, useRef, useCallback } from 'react';
import { useStaleData } from '@/hooks/useStaleData';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import {
  ShoppingBag, Calendar, TrendingUp, Banknote,
  CheckCircle, Clock, AlertTriangle, ArrowRight, Sparkles, History, Target,
} from 'lucide-react';

// ── Quick-pick items ──────────────────────────────────────────────────────────
const QUICK_ITEMS = [
  { name: 'iPhone 16 Pro',         amount: 134900,   emoji: '📱' },
  { name: 'MacBook Air M3',        amount: 114900,   emoji: '💻' },
  { name: 'Royal Enfield',         amount: 185000,   emoji: '🏍️' },
  { name: 'Tata Nexon EV',         amount: 1499000,  emoji: '🚗' },
  { name: 'Home Down Payment',     amount: 500000,   emoji: '🏠' },
  { name: 'International Holiday', amount: 150000,   emoji: '✈️' },
];

// Cycling example items shown in the animated hero
const HERO_EXAMPLES = [
  { emoji: '📱', name: 'iPhone 16 Pro',   months: 3,  status: 'buy_now'     },
  { emoji: '🏍️', name: 'Royal Enfield',  months: 7,  status: 'save_more'   },
  { emoji: '🚗', name: 'Tata Nexon EV',  months: 18, status: 'save_more'   },
  { emoji: '🏠', name: 'Down Payment',   months: 36, status: 'not_advisable'},
  { emoji: '✈️', name: 'Holiday Trip',   months: 2,  status: 'buy_now'     },
  { emoji: '💻', name: 'MacBook Air M3', months: 4,  status: 'buy_now'     },
];

const STATUS_COLORS = {
  buy_now:      { bar: 'bg-emerald-400', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', label: '✅ Buy Soon!' },
  save_more:    { bar: 'bg-amber-400',   text: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700',     label: '⏳ Keep Saving' },
  not_advisable:{ bar: 'bg-red-400',     text: 'text-red-600',     badge: 'bg-red-100 text-red-700',         label: '⚠️ Not Yet' },
};

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  buy_now: {
    icon: CheckCircle,
    label: 'You Can Buy Soon!',
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
  },
  save_more: {
    icon: Clock,
    label: 'Keep Saving',
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
  },
  not_advisable: {
    icon: AlertTriangle,
    label: 'Not Advisable Now',
    gradient: 'from-red-500 to-rose-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
  },
};

const fmtAmt = (n) => {
  if (!n && n !== 0) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000)   return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000)     return `₹${(abs / 1000).toFixed(0)}K`;
  return `₹${abs.toLocaleString('en-IN')}`;
};

// ── Animated cycling demo card ────────────────────────────────────────────────
function HeroDemo() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % HERO_EXAMPLES.length);
        setVisible(true);
      }, 400);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const ex = HERO_EXAMPLES[idx];
  const sc = STATUS_COLORS[ex.status];
  const pct = Math.min(100, Math.round((1 / ex.months) * 100 * 3));

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-lg shadow-stone-200/50 p-5 overflow-hidden">
      {/* "Live demo" badge */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Live Preview</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          Auto-playing
        </span>
      </div>

      {/* Animated item row */}
      <div
        className="transition-all duration-400"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-stone-50 rounded-xl flex items-center justify-center text-xl border border-stone-100">
            {ex.emoji}
          </div>
          <div>
            <p className="font-bold text-stone-800 text-sm font-['Outfit']">{ex.name}</p>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sc.badge}`}>{sc.label}</span>
          </div>
          <div className="ml-auto text-right">
            <p className={`text-xl font-bold font-['Outfit'] ${sc.text}`}>{ex.months}</p>
            <p className="text-[10px] text-stone-400">months away</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${sc.bar} rounded-full transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-stone-400 mt-1">
          <span>Today</span>
          <span>🎯 Goal</span>
        </div>

        {/* Month dots */}
        <div className="flex gap-1 flex-wrap mt-3">
          {Array.from({ length: Math.min(ex.months, 12) }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center
                ${i === 0 ? `${sc.bar} text-white` : 'bg-stone-100 text-stone-400'}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {i + 1}
            </div>
          ))}
          {ex.months > 12 && <div className="w-5 h-5 rounded-full bg-stone-100 text-stone-400 text-[9px] flex items-center justify-center">+{ex.months - 12}</div>}
          <div className={`w-5 h-5 rounded-full ${sc.bar} text-white text-xs flex items-center justify-center`}>🎯</div>
        </div>
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-1 mt-4">
        {HERO_EXAMPLES.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-5 bg-orange-400' : 'w-1.5 bg-stone-200'}`} />
        ))}
      </div>
    </div>
  );
}

// ── Typewriter cycling subtitle ───────────────────────────────────────────────
function TypewriterText() {
  const items = ['iPhone 16 Pro 📱', 'Royal Enfield 🏍️', 'Dream Holiday ✈️', 'Home Down Payment 🏠', 'MacBook Air M3 💻'];
  const [itemIdx, setItemIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    const full = items[itemIdx];
    if (typing) {
      if (displayed.length < full.length) {
        timerRef.current = setTimeout(() => setDisplayed(full.slice(0, displayed.length + 1)), 60);
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

// ── Component ─────────────────────────────────────────────────────────────────
const WhenToBuy = () => {
  const [itemName, setItemName]         = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [result, setResult]             = useState(null);
  const [loading, setLoading]           = useState(false);
  const [mounted, setMounted]           = useState(false);
  const [goalSaved, setGoalSaved]       = useState(false);
  const [goalSaving, setGoalSaving]     = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  const fetchHistory = useCallback(async () => {
    const res = await axios.get(`${API}/when-to-buy/history`);
    return res.data || [];
  }, []);

  const { data: history, reload: reloadHistory } = useStaleData(
    'bm_when_to_buy_cache',
    fetchHistory,
    { errorMsg: 'Failed to load history', fallback: [] }
  );

  const handleCalculate = async () => {
    if (!itemName.trim() || !targetAmount) {
      toast.error('Please enter item name and amount');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/when-to-buy`, {
        item_name: itemName,
        target_amount: parseFloat(targetAmount),
      });
      setResult(res.data);
      reloadHistory();
    } catch (err) {
      console.error(err);
      toast.error('Calculation failed — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGoal = async () => {
    if (!result || !itemName || !targetAmount) return;
    setGoalSaving(true);
    try {
      const months = Math.max(1, result.months_to_save || 6);
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + months);
      const category =
        itemName.toLowerCase().includes('bike') || itemName.toLowerCase().includes('enfield') || itemName.toLowerCase().includes('car') || itemName.toLowerCase().includes('nexon') ? 'vehicle'
        : itemName.toLowerCase().includes('iphone') || itemName.toLowerCase().includes('mac') || itemName.toLowerCase().includes('laptop') ? 'electronics'
        : itemName.toLowerCase().includes('holiday') || itemName.toLowerCase().includes('trip') || itemName.toLowerCase().includes('travel') ? 'travel'
        : itemName.toLowerCase().includes('home') || itemName.toLowerCase().includes('house') || itemName.toLowerCase().includes('flat') ? 'home'
        : 'general';
      await axios.post(`${API}/savings-goals`, {
        name: itemName,
        target_amount: parseFloat(targetAmount),
        target_date: targetDate.toISOString().slice(0, 10),
        category,
        priority: result.status === 'buy_now' ? 'high' : result.status === 'save_more' ? 'medium' : 'low',
        notes: `Created from When To Buy — ${result.months_to_save} months to save at ₹${result.monthly_surplus?.toLocaleString('en-IN')}/month surplus`,
      });
      setGoalSaved(true);
      toast.success('Savings goal created! Track it in Savings Goals.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create goal');
    } finally {
      setGoalSaving(false);
    }
  };

  const cfg = result?.status ? STATUS[result.status] || STATUS.save_more : null;
  const StatusIcon = cfg?.icon;
  const timelineMonths = result?.months_to_save ? Math.min(result.months_to_save, 24) : 0;

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-[#fffaf5]" data-testid="when-to-buy-page">
        <div className="max-w-3xl mx-auto px-4 py-8">

          {/* ── Animated Hero Header ── */}
          <div
            className="mb-8 text-center transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-20px)' }}
          >
            {/* Bouncing icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-300/40 mb-4"
              style={{ animation: 'bm-orb-float 3s ease-in-out infinite' }}>
              <ShoppingBag size={28} className="text-white" />
            </div>

            <h1 className="text-3xl font-bold text-stone-900 font-['Outfit'] mb-1">
              When Should I Buy?
            </h1>

            {/* Typewriter line */}
            <p className="text-stone-500 text-sm mb-1">
              Tell us about your dream — <TypewriterText />
            </p>
            <p className="text-stone-400 text-xs">
              We'll analyse your real finances and tell you exactly when you can afford it.
            </p>
          </div>

          {/* ── Two-col layout on desktop ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

            {/* Input Card */}
            <div
              className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 transition-all duration-500"
              style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(16px)', transitionDelay: '100ms' }}
            >
              <h2 className="font-bold text-stone-800 font-['Outfit'] mb-5 flex items-center gap-2">
                <Sparkles size={16} className="text-orange-500" /> What do you want to buy?
              </h2>

              <div className="space-y-4">
                <div>
                  <Label className="text-stone-700 font-medium text-sm">Item Name</Label>
                  <Input
                    data-testid="item-name-input"
                    value={itemName}
                    onChange={e => setItemName(e.target.value)}
                    placeholder="e.g., iPhone 16 Pro, Royal Enfield..."
                    className="mt-1.5 h-11 border-stone-200 focus:border-orange-400 rounded-xl"
                    onKeyDown={e => e.key === 'Enter' && handleCalculate()}
                  />
                </div>

                <div>
                  <Label className="text-stone-700 font-medium text-sm">Target Amount (₹)</Label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-semibold text-sm">₹</span>
                    <Input
                      data-testid="target-amount-input"
                      type="number"
                      value={targetAmount}
                      onChange={e => setTargetAmount(e.target.value)}
                      placeholder="1,00,000"
                      className="h-11 pl-7 border-stone-200 focus:border-orange-400 rounded-xl"
                      onKeyDown={e => e.key === 'Enter' && handleCalculate()}
                    />
                  </div>
                </div>

                {/* Quick pick */}
                <div>
                  <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-2">Quick Pick</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_ITEMS.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        data-testid={`quick-item-${i}`}
                        onClick={() => { setItemName(item.name); setTargetAmount(item.amount.toString()); }}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-200
                          ${itemName === item.name
                            ? 'bg-orange-100 border-orange-300 text-orange-700 scale-105'
                            : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 hover:scale-105'
                          }`}
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        <span>{item.emoji}</span>
                        {item.name} <span className="text-stone-400">({fmtAmt(item.amount)})</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleCalculate}
                  disabled={loading}
                  data-testid="calculate-btn"
                  className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl shadow-sm shadow-orange-300/40 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Analysing your finances...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Calculate Affordability <ArrowRight size={16} />
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* Right column: demo (no result) or result (with result) */}
            {!result ? (
              <div
                className="transition-all duration-500"
                style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(16px)', transitionDelay: '200ms' }}
              >
                <HeroDemo />
                <div className="mt-4 bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                  <h3 className="font-bold text-stone-800 font-['Outfit'] mb-3 text-sm flex items-center gap-2">
                    🧮 How It Works
                  </h3>
                  <div className="space-y-2.5">
                    {[
                      ['📊', 'We look at your income, expenses & EMIs'],
                      ['💰', 'Calculate your monthly surplus (free cash)'],
                      ['📅', 'Divide target amount by monthly surplus'],
                      ['✅', 'Tell you when you can comfortably buy'],
                    ].map(([icon, text], i) => (
                      <div
                        key={text}
                        className="flex items-center gap-3 text-sm text-stone-600 transition-all duration-500"
                        style={{ opacity: mounted ? 1 : 0, transitionDelay: `${300 + i * 80}ms` }}
                      >
                        <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center text-base shrink-0">
                          {icon}
                        </div>
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-stone-400 mt-3 italic text-center">
                    Make confident decisions — no more buyer's remorse.
                  </p>
                </div>
              </div>
            ) : cfg ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-500">
                {/* Status banner */}
                <div className={`rounded-2xl overflow-hidden border ${cfg.border}`}>
                  <div className={`bg-gradient-to-r ${cfg.gradient} p-5 text-white`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-white/20 rounded-xl">
                        <StatusIcon size={20} />
                      </div>
                      <span className="font-bold text-lg font-['Outfit']">{cfg.label}</span>
                    </div>
                    <p className="text-white/90 text-sm leading-relaxed">{result.message}</p>
                  </div>
                  <div className={`${cfg.bg} grid grid-cols-3 divide-x divide-stone-200/60`}>
                    {[
                      { label: 'Months to Save', value: result.months_to_save > 999 ? '999+' : result.months_to_save, sub: 'months', icon: Calendar, neg: false },
                      { label: 'Monthly Surplus', value: fmtAmt(result.monthly_surplus), sub: result.monthly_surplus < 0 ? 'monthly deficit' : 'free each month', icon: TrendingUp, neg: result.monthly_surplus < 0 },
                      { label: 'Target Amount',   value: fmtAmt(result.savings_needed),  sub: 'total needed',   icon: Banknote, neg: false },
                    ].map(({ label, value, sub, icon: Icon, neg }) => (
                      <div key={label} className="px-4 py-4 text-center">
                        <Icon size={15} className={`${neg ? 'text-red-500' : cfg.text} mx-auto mb-1.5 opacity-70`} />
                        <p className={`font-bold text-xl font-['Outfit'] ${neg ? 'text-red-500' : cfg.text}`}>{neg ? `-${value}` : value}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timeline bar */}
                {result.months_to_save <= 36 && result.months_to_save > 0 && (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                    <p className="text-sm font-semibold text-stone-700 mb-3 font-['Outfit']">Savings Timeline</p>
                    <div className="relative">
                      <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${cfg.gradient} rounded-full transition-all duration-700`}
                          style={{ width: `${Math.min(100, (1 / timelineMonths) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-stone-400 mt-1.5">
                        <span>Today</span>
                        <span className={`font-semibold ${cfg.text}`}>{timelineMonths} month{timelineMonths !== 1 ? 's' : ''} away</span>
                        <span>Goal 🎯</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap mt-4">
                      {Array.from({ length: timelineMonths }, (_, i) => (
                        <div key={i}
                          className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center transition-all
                            ${i === 0 ? `bg-gradient-to-br ${cfg.gradient} text-white shadow-sm` : 'bg-stone-100 text-stone-400'}`}
                        >
                          {i + 1}
                        </div>
                      ))}
                      <div className={`w-6 h-6 rounded-full text-sm flex items-center justify-center bg-gradient-to-br ${cfg.gradient} text-white shadow-sm`}>
                        🎯
                      </div>
                    </div>
                  </div>
                )}

                {/* Advice + down payment */}
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">💡 Chanakya's Advice</p>
                  <p className="text-sm text-stone-700 leading-relaxed">{result.recommendation}</p>
                  {result.down_payment_suggested > 0 && (
                    <div className="mt-3 pt-3 border-t border-stone-100">
                      <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">💳 Suggested Down Payment</p>
                      <p className="text-xl font-bold font-['Outfit'] text-orange-600">{fmtAmt(result.down_payment_suggested)}</p>
                      <p className="text-xs text-stone-500 mt-0.5">20% of target to reduce EMI burden</p>
                    </div>
                  )}
                </div>

                {/* Save as Savings Goal */}
                {!goalSaved ? (
                  <button
                    onClick={handleSaveGoal}
                    disabled={goalSaving}
                    className="w-full flex items-center justify-center gap-2 h-11 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-sm shadow-purple-300/40 transition-all hover:scale-[1.01] active:scale-[0.99] text-sm"
                  >
                    {goalSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creating goal...
                      </>
                    ) : (
                      <>
                        <Target size={15} /> Set as Savings Goal
                      </>
                    )}
                  </button>
                ) : (
                  <div className="w-full flex items-center justify-center gap-2 h-11 bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold rounded-xl text-sm">
                    <CheckCircle size={15} className="text-emerald-500" /> Goal saved! Track in Savings Goals
                  </div>
                )}

                <button
                  onClick={() => { setResult(null); setItemName(''); setTargetAmount(''); setGoalSaved(false); }}
                  className="w-full text-center text-sm text-stone-400 hover:text-orange-500 font-medium transition-colors py-2"
                >
                  ← Try a different item
                </button>
              </div>
            ) : null}
          </div>

          {/* ── History Section ── */}
          {history.length > 0 && (
            <div className="mt-6">
              <h2 className="font-bold text-stone-800 font-['Outfit'] mb-3 flex items-center gap-2">
                <History size={16} className="text-stone-400" /> Recent Checks
              </h2>
              <div className="space-y-2">
                {history.map((item) => {
                  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.save_more;
                  return (
                    <div key={item.id} className="bg-white border border-stone-100 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-800 truncate">{item.item_name}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${sc.badge}`}>{sc.label}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-stone-400">
                          <span>{fmtAmt(item.target_amount)}</span>
                          {item.months_to_save < 999 && <span>{item.months_to_save} months</span>}
                          <span>{new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default WhenToBuy;
