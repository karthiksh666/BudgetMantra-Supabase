import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet, CreditCard, Target, ArrowRight, CheckCircle,
  MessageSquare, Sparkles, Shield, BarChart3,
  Zap, Send, TrendingUp, Flame, Plane, Users,
} from 'lucide-react';

/* ── Tiny hook: fade-in on scroll ─────────────────────────────────────── */
function useFadeIn(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ── Per-card staggered reveal on scroll ──────────────────────────────── */
function useCardReveal(count) {
  const [revealed, setRevealed] = useState(new Set());
  const refsMap = useRef({});

  const setRef = useCallback((i) => (el) => {
    refsMap.current[i] = el;
  }, []);

  useEffect(() => {
    let batchDelay = 0;
    const observers = [];
    for (let i = 0; i < count; i++) {
      const el = refsMap.current[i];
      if (!el) continue;
      const idx = i;
      const obs = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          const col = idx % 3;
          setTimeout(() => setRevealed(r => new Set([...r, idx])), col * 80);
          obs.disconnect();
        }
      }, { threshold: 0.08 });
      obs.observe(el);
      observers.push(obs);
    }
    return () => observers.forEach(o => o.disconnect());
  }, [count]); // eslint-disable-line

  return [setRef, revealed];
}

const FEATURES = [
  { icon: MessageSquare, color: 'from-purple-100 to-purple-200',   iconColor: 'text-purple-600',  title: 'Chanakya AI',        desc: 'Your personal finance advisor — always on, on every page. Log expenses, set goals, upload statements, ask anything. Just type.',  testId: 'feature-chanakya' },
  { icon: Wallet,        color: 'from-blue-100 to-blue-200',       iconColor: 'text-blue-600',    title: 'Smart Budgeting',    desc: 'Set monthly budgets by category. Watch spending fill up in real-time. Know before you overspend — not after.',  testId: 'feature-budget' },
  { icon: CreditCard,    color: 'from-orange-100 to-orange-200',   iconColor: 'text-orange-600',  title: 'EMI Manager',        desc: 'All your loans in one place. Track balance, due dates, and repayment progress. Foreclose early to save lakhs in interest.',  testId: 'feature-emi' },
  { icon: Target,        color: 'from-amber-100 to-amber-200',     iconColor: 'text-amber-600',   title: 'Savings Goals',      desc: 'Set a goal — vacation, emergency fund, new laptop. Track contributions, deadlines and see exactly how far you are from the finish line.',  testId: 'feature-goals' },
  { icon: TrendingUp,    color: 'from-emerald-100 to-teal-200',    iconColor: 'text-emerald-600', title: 'Investment Tracker', desc: 'Track mutual funds, stocks, FDs, PPF and more. See total invested vs current value and your overall portfolio returns.', pro: true, testId: 'feature-investments' },
  { icon: BarChart3,     color: 'from-violet-100 to-violet-200',   iconColor: 'text-violet-600',  title: 'Statement Hub',      desc: 'Upload PhonePe, GPay, or bank statement PDFs. Chanakya auto-parses every transaction, infers categories, and handles password-protected PDFs.',  testId: 'feature-statement' },
  { icon: Flame,         color: 'from-orange-100 to-red-200',      iconColor: 'text-red-500',     title: 'FIRE Calculator',    desc: 'Find out exactly when you can retire. Based on your savings rate, expenses, and target corpus using the 4% rule.',  testId: 'feature-fire' },
  { icon: Plane,         color: 'from-cyan-100 to-cyan-200',       iconColor: 'text-cyan-600',    title: 'Trip Planner',       desc: 'Plan trips with an AI-generated day-by-day itinerary. Track group expenses and splits — all in one place.', pro: true, testId: 'feature-trips' },
  { icon: Users,         color: 'from-pink-100 to-pink-200',       iconColor: 'text-pink-600',    title: 'Family Circle',      desc: 'Real-time collaborative expense tracker. Share a circle with family or friends, split costs, settle balances — live.', pro: true, testId: 'feature-circle' },
];

const LandingPage = () => {
  const [feedback, setFeedback] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleFeedback = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent(`BudgetMantra Feedback from ${feedback.name}`);
    const body = encodeURIComponent(`Name: ${feedback.name}\nEmail: ${feedback.email}\n\nMessage:\n${feedback.message}`);
    window.open(`mailto:mantrabudget@gmail.com?subject=${subject}&body=${body}`);
    setSubmitted(true);
    setFeedback({ name: '', email: '', message: '' });
    setTimeout(() => setSubmitted(false), 4000);
  };

  const [featRef, featVisible] = useFadeIn();
  const [pricingRef, pricingVisible] = useFadeIn();
  const [heroRef, heroVisible] = useFadeIn(0.05);
  const [setCardRef, revealedCards] = useCardReveal(FEATURES.length);

  return (
    <div className="min-h-screen bg-[#fffaf5] overflow-x-hidden" data-testid="landing-page">

      <style>{`
        @keyframes fadeUp   { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
        @keyframes floatY   { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
        @keyframes shimmer  { 0% { background-position:200% center; } 100% { background-position:-200% center; } }
        @keyframes pulse-ring { 0%,100% { box-shadow:0 0 0 0 rgba(249,115,22,0.4); } 50% { box-shadow:0 0 0 10px rgba(249,115,22,0); } }
        @keyframes ticker { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        @keyframes cardReveal { from { opacity:0; transform:translateY(24px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes iconPop { 0% { transform:scale(1) rotate(0deg); } 40% { transform:scale(1.25) rotate(-6deg); } 70% { transform:scale(0.95) rotate(4deg); } 100% { transform:scale(1.1) rotate(0deg); } }
        .anim-fade-up  { animation: fadeUp  0.6s cubic-bezier(.22,1,.36,1) both; }
        .anim-fade-in  { animation: fadeIn  0.5s ease both; }
        .anim-float    { animation: floatY  4s ease-in-out infinite; }
        .anim-float-slow { animation: floatY 6s ease-in-out infinite; }
        .anim-pulse-ring { animation: pulse-ring 2.5s ease-in-out infinite; }
        .card-hidden { opacity:0; transform:translateY(24px) scale(0.97); }
        .card-revealed { animation: cardReveal 0.55s cubic-bezier(.22,1,.36,1) forwards; }
        .feature-card:hover .feature-icon { animation: iconPop 0.45s ease forwards; }
        .delay-100 { animation-delay:.1s; } .delay-200 { animation-delay:.2s; }
        .delay-300 { animation-delay:.3s; } .delay-400 { animation-delay:.4s; }
        .delay-500 { animation-delay:.5s; } .delay-600 { animation-delay:.6s; }
        .delay-700 { animation-delay:.7s; } .delay-800 { animation-delay:.8s; }
        .shimmer-text { background:linear-gradient(90deg,#f97316,#fbbf24,#f97316,#ea580c); background-size:300% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; animation:shimmer 4s linear infinite; }
        .pro-card-shine::before { content:''; position:absolute; inset:0; border-radius:inherit; background:linear-gradient(135deg,rgba(167,139,250,0.08) 0%,transparent 60%); pointer-events:none; }
      `}</style>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-stone-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/20 group-hover:shadow-orange-500/40 transition-shadow duration-300 anim-pulse-ring">
              <Wallet size={24} className="text-white" />
            </div>
            <span className="text-xl font-bold text-stone-800 font-['Outfit']">Budget Mantra</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-500">
            <a href="#features" className="hover:text-orange-600 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-orange-600 transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-orange-600 transition-colors">Pricing</a>
            <a href="#feedback" className="hover:text-orange-600 transition-colors">Feedback</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="px-4 py-2 text-stone-600 font-medium hover:text-orange-600 transition-colors text-sm">Login</Link>
            <Link to="/signup">
              <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-5 py-2 rounded-xl font-semibold shadow-lg shadow-orange-500/25 transition-all duration-300 hover:-translate-y-0.5 text-sm">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Value strip */}
      <div className="bg-stone-900 border-b border-stone-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {[
            'Free to start — no credit card needed',
            'Chat with Chanakya — your AI financial advisor',
            'Built for India · UPI · bank PDFs · EMIs',
          ].map(label => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-orange-400 shrink-0" />
              <span className="text-stone-300 text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden" data-testid="hero-section">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-amber-50/50 to-stone-50" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-orange-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-amber-200/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28" ref={heroRef}>
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className={`inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-orange-100 anim-fade-up ${heroVisible ? '' : 'opacity-0'}`}>
                <Sparkles size={15} className="text-orange-500" />
                <span className="text-sm font-medium text-stone-600">Chat-first finance — just tell Chanakya 💬</span>
              </div>

              <h1 className={`text-5xl lg:text-6xl font-bold text-stone-900 leading-tight font-['Outfit'] anim-fade-up delay-100 ${heroVisible ? '' : 'opacity-0'}`}>
                Just tell{' '}
                <span className="shimmer-text">Chanakya.</span><br />
                It handles the rest.
              </h1>

              <p className={`text-lg text-stone-800 leading-relaxed max-w-xl anim-fade-up delay-200 ${heroVisible ? '' : 'opacity-0'}`}>
                No spreadsheets. No 47-step onboarding. Just type <span className="font-semibold text-orange-600">"paid SBI EMI ₹12,500"</span> and Chanakya logs it, tracks your balance, and tells you exactly how many months until you're debt-free. Upload your bank PDF and it parses every transaction automatically. Your CA is going to hate us.
              </p>

              <div className={`flex flex-col sm:flex-row gap-4 anim-fade-up delay-300 ${heroVisible ? '' : 'opacity-0'}`}>
                <Link to="/signup" data-testid="hero-cta">
                  <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-8 py-6 rounded-xl font-semibold text-lg shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-300 hover:-translate-y-1">
                    Start Free Today <ArrowRight size={20} className="ml-2" />
                  </Button>
                </Link>
                <a href="#features">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto bg-white/70 border-2 border-stone-400 hover:border-orange-400 px-8 py-6 rounded-xl font-semibold text-lg text-stone-900 hover:text-orange-600 transition-all duration-300">
                    See Features
                  </Button>
                </a>
              </div>

              <div className={`flex flex-wrap gap-2 anim-fade-up delay-400 ${heroVisible ? '' : 'opacity-0'}`}>
                {['No credit card required', 'Free forever plan', 'Secure & private'].map(t => (
                  <span key={t} className="flex items-center gap-1.5 bg-white/80 border border-stone-200 text-stone-800 text-sm font-medium px-3 py-1.5 rounded-full shadow-sm">
                    <CheckCircle size={13} className="text-emerald-600 shrink-0" /> {t}
                  </span>
                ))}
              </div>

              <div className={`flex items-start gap-3 bg-white border border-emerald-200 rounded-2xl px-5 py-4 shadow-sm anim-fade-up delay-500 ${heroVisible ? '' : 'opacity-0'}`}>
                <div className="p-1.5 bg-emerald-100 rounded-lg shrink-0 mt-0.5">
                  <Shield size={16} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">We NEVER ask for your card, UPI, or bank credentials</p>
                  <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">BudgetMantra is a tracking app — you enter numbers manually. We have zero access to your bank account, UPI ID, credit card, or any financial credentials. Ever.</p>
                </div>
              </div>
            </div>

            {/* Chat mockup */}
            <div className={`relative lg:pl-8 anim-fade-up delay-300 ${heroVisible ? '' : 'opacity-0'}`}>
              <div className="relative">
                <div className="bg-white rounded-3xl shadow-2xl shadow-stone-900/10 border border-stone-100 overflow-hidden">
                  {/* Chat header */}
                  <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                      <Sparkles size={16} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-bold text-sm font-['Outfit']">Chanakya</p>
                      <p className="text-white/70 text-[10px]">Your AI · Always on · Never judges you</p>
                    </div>
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                  </div>

                  {/* Chat messages */}
                  <div className="p-4 space-y-3 bg-stone-50 h-[286px] overflow-hidden">
                    <div className="flex justify-end">
                      <div className="bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[210px] text-sm font-medium shadow-sm">
                        Paid SBI home loan ₹28,500 today
                      </div>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                        <Sparkles size={12} className="text-orange-600" />
                      </div>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-stone-100 max-w-[235px]">
                        <p className="text-sm font-semibold text-stone-800">✅ EMI logged!</p>
                        <p className="text-xs text-stone-500 mt-1 leading-snug">Balance: ₹18.4L · 58 months left · You're 38% done 🏠</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="bg-orange-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[210px] text-sm font-medium shadow-sm">
                        How much Zomato this month?
                      </div>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                        <Sparkles size={12} className="text-orange-600" />
                      </div>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-stone-100 max-w-[240px]">
                        <p className="text-sm font-semibold text-stone-800">₹4,820 on food delivery 😅</p>
                        <p className="text-xs text-stone-500 mt-1 leading-snug">That's 3× your grocery spend. You're basically running a cloud kitchen.</p>
                      </div>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                        <Sparkles size={12} className="text-orange-600" />
                      </div>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-3 shadow-sm border border-stone-100">
                        <div className="flex gap-1.5 items-center">
                          {[0,1,2].map(i => (
                            <div key={i} className="w-1.5 h-1.5 bg-stone-300 rounded-full" style={{ animation: `floatY 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input bar */}
                  <div className="px-4 py-3 bg-white border-t border-stone-100 flex items-center gap-2">
                    <div className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-400">
                      Ask anything or log a transaction…
                    </div>
                    <div className="w-8 h-8 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
                      <Send size={13} className="text-white" />
                    </div>
                  </div>
                </div>

                {/* Floating cards */}
                <div className="absolute -bottom-5 -left-5 bg-white rounded-2xl shadow-xl p-3.5 border border-stone-100 max-w-[200px] anim-float">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-emerald-100 rounded-lg shrink-0">
                      <Target size={14} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-[10px] text-stone-400">Goal reached!</p>
                      <p className="text-xs font-semibold text-stone-800 leading-snug">Europe trip fund 100% 🎉</p>
                    </div>
                  </div>
                </div>

                <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-xl p-3.5 border border-stone-100 anim-float-slow">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-purple-100 rounded-lg">
                      <Zap size={14} className="text-purple-600" />
                    </div>
                    <div>
                      <p className="text-[10px] text-stone-400">EMI due in 3 days</p>
                      <p className="text-xs font-bold text-purple-600">HDFC Car Loan</p>
                    </div>
                  </div>
                </div>

                <div className="absolute top-1/2 -right-8 bg-white rounded-2xl shadow-xl p-3 border border-stone-100 anim-float" style={{ animationDelay: '2s' }}>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-100 rounded-lg">
                      <BarChart3 size={14} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-[10px] text-stone-400">Health Score</p>
                      <p className="text-xs font-bold text-emerald-600">84 · Excellent</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Chat-first strip */}
      <section className="py-16 bg-white border-y border-stone-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <p className="text-sm font-bold uppercase tracking-widest text-orange-500 mb-2">Just say it. Chanakya does it.</p>
            <h2 className="text-3xl font-bold text-stone-900 font-['Outfit']">Real things you can actually type</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { user: '"Add goal: Europe trip ₹2L by Dec"', reply: '✅ Goal created! Save ₹16,667/month to hit it.', color: 'from-teal-50 to-emerald-50', border: 'border-teal-100', replyColor: 'text-teal-700' },
              { user: '"How\'s my budget looking?"', reply: '62% used. Food & dining is your leak — ₹8K above target 🍔', color: 'from-orange-50 to-amber-50', border: 'border-orange-100', replyColor: 'text-orange-700' },
              { user: '"I lent Rahul ₹5,000"', reply: '💸 Hand loan tracked. I\'ll remind you when it\'s due.', color: 'from-blue-50 to-indigo-50', border: 'border-blue-100', replyColor: 'text-blue-700' },
              { user: '"Should I foreclose my car loan?"', reply: 'Yes! You save ₹31,420 in interest if you close it now 🚗', color: 'from-purple-50 to-violet-50', border: 'border-purple-100', replyColor: 'text-purple-700' },
            ].map(({ user, reply, color, border, replyColor }, i) => (
              <div key={i} className={`bg-gradient-to-br ${color} border ${border} rounded-2xl p-5 space-y-3`}>
                <div className="flex justify-end">
                  <div className="bg-stone-800 text-white rounded-xl rounded-tr-sm px-3 py-2 text-xs font-medium max-w-[180px] leading-snug">
                    {user}
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={10} className="text-orange-600" />
                  </div>
                  <p className={`text-xs font-semibold leading-snug ${replyColor}`}>{reply}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-white" data-testid="features-section">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-full mb-4">
              <Zap size={14} className="text-orange-500" />
              <span className="text-sm font-medium text-orange-600">Everything you need</span>
            </div>
            <h2 className="text-4xl font-bold text-stone-900 mb-4 font-['Outfit']">
              Everything handled by{' '}
              <span className="shimmer-text">one chat.</span>
            </h2>
            <p className="text-lg text-stone-600">Every feature talks to Chanakya. Log, track, plan, and get advice — all without leaving the chat.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, color, iconColor, title, desc, testId, pro }, i) => (
              <div
                key={title}
                ref={setCardRef(i)}
                className={`feature-card group relative p-6 bg-white rounded-2xl border hover:-translate-y-2 transition-all duration-300 overflow-hidden cursor-default ${
                  pro ? 'border-violet-100/60 bg-gradient-to-br from-white to-violet-50/30 pro-card-shine' : 'border-stone-100 hover:border-stone-200'
                } ${revealedCards.has(i) ? 'card-revealed' : 'card-hidden'}`}
                data-testid={testId}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-40 transition-opacity duration-300 rounded-2xl`} />
                <div className="relative z-10">
                  {pro && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gradient-to-r from-violet-500 to-purple-600 text-white">
                      <Sparkles size={7} /> Pro
                    </span>
                  )}
                  <div className={`feature-icon w-12 h-12 bg-gradient-to-br ${color} rounded-2xl flex items-center justify-center mb-4 shadow-sm`}>
                    <Icon size={22} className={iconColor} />
                  </div>
                  <h3 className="text-base font-bold text-stone-800 mb-1.5 font-['Outfit']">{title}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-12 md:py-24 bg-gradient-to-br from-orange-50 via-amber-50/50 to-stone-50" data-testid="how-it-works-section">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-8 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-stone-900 mb-3 md:mb-4 font-['Outfit']">Three steps. Seriously, just three.</h2>
            <p className="text-base md:text-lg text-stone-600">No spreadsheets were harmed in the making of this app.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-8 lg:gap-12 relative">
            <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-orange-200 to-orange-300" />
            {[
              { n: '1', title: 'Sign Up (30 sec)', desc: 'Email or Google. No credit card. No 47-question onboarding survey. We promise.', icon: Wallet },
              { n: '2', title: 'Just Start Typing', desc: 'Tell Chanakya anything — "paid rent", "got salary", "EMI due". It figures out the rest.', icon: MessageSquare },
              { n: '3', title: 'Watch It Work', desc: 'Real-time health score, smart nudges, and roasts on your Zomato habit. You\'re welcome.', icon: Sparkles },
            ].map(({ n, title, desc, icon: Icon }, i) => (
              <div key={n} className="flex md:flex-col items-center text-left md:text-center gap-4 md:gap-0 group relative bg-white md:bg-transparent rounded-2xl md:rounded-none p-3 md:p-0 border border-stone-100 md:border-none shadow-sm md:shadow-none">
                <div className="w-12 h-12 md:w-20 md:h-20 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl md:rounded-3xl flex items-center justify-center shrink-0 md:mx-auto md:mb-4 shadow-lg shadow-orange-500/30">
                  <span className="text-xl md:text-3xl font-bold text-white font-['Outfit']">{n}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base md:text-xl font-bold text-stone-800 mb-1 md:mb-3 font-['Outfit']">{title}</h3>
                  <p className="text-stone-500 text-xs md:text-base leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-gradient-to-br from-orange-50 via-amber-50/30 to-stone-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-stone-900 font-['Outfit'] mb-4">Simple, honest pricing</h2>
            <p className="text-lg text-stone-600">Start free. Upgrade when you're ready.</p>
          </div>
          <div ref={pricingRef} className="grid md:grid-cols-2 gap-8">
            {/* Free */}
            <div className={`bg-white rounded-3xl p-8 border border-stone-200 shadow-sm ${pricingVisible ? 'anim-fade-up' : 'opacity-0'}`}>
              <div className="mb-6">
                <p className="text-sm font-semibold text-stone-500 uppercase tracking-widest mb-2">Free</p>
                <p className="text-5xl font-bold text-stone-900 font-['Outfit']">₹0<span className="text-lg text-stone-400 font-normal">/mo</span></p>
                <p className="text-stone-500 text-sm mt-2">Forever free, no card needed</p>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Chanakya AI (20 messages/month)',
                  'Budget Manager (5 categories)',
                  'EMI Tracker (up to 3 loans)',
                  '1 Savings Goal',
                  'Financial Health Score',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-stone-600">
                    <CheckCircle size={16} className="text-emerald-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup">
                <Button variant="outline" className="w-full border-2 border-stone-200 hover:border-orange-400 text-stone-700 hover:text-orange-600 rounded-xl py-3 font-semibold transition-all">
                  Get Started Free
                </Button>
              </Link>
            </div>

            {/* Pro */}
            <div className={`bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl p-8 text-white shadow-2xl shadow-orange-500/30 relative overflow-hidden ${pricingVisible ? 'anim-fade-up delay-200' : 'opacity-0'}`}>
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-20 translate-x-20 pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold uppercase tracking-widest opacity-80">Pro</p>
                  <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">Most Popular</span>
                </div>
                <p className="text-5xl font-bold font-['Outfit']">₹199<span className="text-lg font-normal opacity-70">/mo</span></p>
                <p className="text-white/70 text-sm mt-2">or ₹999/year — save 58%</p>
                <ul className="space-y-2.5 my-7">
                  {[
                    'Everything in Free — unlimited',
                    'Chanakya AI — unlimited messages',
                    'Investment Tracker (MFs, Stocks, FDs)',
                    'Credit Card & Hand Loan Tracker',
                    'Trip Planner + Group Expenses',
                    'Paycheck Tracker + PDF upload',
                  ].map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle size={15} className="text-white/90 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/signup">
                  <Button className="w-full bg-white hover:bg-white/90 text-orange-600 rounded-xl py-3 font-bold transition-all shadow-lg hover:-translate-y-0.5">
                    Start Pro Free for 14 days
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-br from-stone-900 to-stone-800 relative overflow-hidden" data-testid="cta-section">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full -translate-y-48 translate-x-48 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full translate-y-32 -translate-x-32 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full mb-6">
            <Sparkles size={14} className="text-orange-400" />
            <span className="text-sm font-medium text-white/80">Join 10,000+ users</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6 font-['Outfit']">
            Start your journey to<br />financial freedom today
          </h2>
          <p className="text-xl text-white/60 mb-10">Free forever. No credit card. Takes 2 minutes.</p>
          <Link to="/signup" data-testid="cta-button">
            <Button size="lg" className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-10 py-7 rounded-xl font-semibold text-xl shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-300 hover:-translate-y-1">
              Get Started Free <ArrowRight size={24} className="ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Feedback */}
      <section id="feedback" className="py-24 bg-white">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-full mb-4">
              <Send size={14} className="text-orange-500" />
              <span className="text-sm font-medium text-orange-600">We'd love to hear from you</span>
            </div>
            <h2 className="text-4xl font-bold text-stone-900 font-['Outfit'] mb-3">Share your feedback</h2>
            <p className="text-stone-500">Help us build a better BudgetMantra. Every message is read by the team.</p>
          </div>

          {submitted ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
              <CheckCircle size={40} className="text-emerald-500 mx-auto mb-3" />
              <p className="text-emerald-700 font-semibold text-lg">Thanks! Your email client should open now.</p>
              <p className="text-emerald-600 text-sm mt-1">If it didn't open, email us directly at <span className="font-medium">mantrabudget@gmail.com</span></p>
            </div>
          ) : (
            <form onSubmit={handleFeedback} className="bg-gradient-to-br from-stone-50 to-white rounded-3xl border border-stone-100 shadow-sm p-8 space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label htmlFor="fb-name" className="text-stone-700 font-medium text-sm">Your Name</Label>
                  <Input id="fb-name" placeholder="Rahul Sharma" required value={feedback.name}
                    onChange={e => setFeedback({ ...feedback, name: e.target.value })}
                    className="h-11 bg-white border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-email" className="text-stone-700 font-medium text-sm">Email Address</Label>
                  <Input id="fb-email" type="email" placeholder="you@example.com" required value={feedback.email}
                    onChange={e => setFeedback({ ...feedback, email: e.target.value })}
                    className="h-11 bg-white border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fb-message" className="text-stone-700 font-medium text-sm">Message</Label>
                <textarea id="fb-message" rows={5} required placeholder="What do you love? What can we improve? Any features you'd like?" value={feedback.message}
                  onChange={e => setFeedback({ ...feedback, message: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-stone-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 outline-none resize-none transition-all" />
              </div>
              <Button type="submit" className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25 transition-all duration-300">
                <Send size={16} className="mr-2" /> Send Feedback
              </Button>
              <p className="text-xs text-stone-400 text-center">Sends to mantrabudget@gmail.com · We reply within 24 hours</p>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-stone-950 text-white" data-testid="footer">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl">
                  <Wallet size={22} className="text-white" />
                </div>
                <span className="text-xl font-bold font-['Outfit']">Budget Mantra</span>
              </div>
              <p className="text-stone-400 max-w-sm text-sm leading-relaxed">
                BudgetMantra is India's smartest personal finance app — built for salaried Indians who want to take control of their money. Budget, track EMIs, monitor your Financial Health Score, and get AI-powered advice from Chanakya. Founded in 2026.
              </p>
              <div className="flex gap-2 mt-4 flex-wrap">
                {['🔒 Secure', '🇮🇳 India-first', '⚡ Free to start', '22+ Features'].map(b => (
                  <span key={b} className="text-xs bg-stone-800 text-stone-400 px-3 py-1 rounded-full">{b}</span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4 font-['Outfit'] text-sm uppercase tracking-widest text-stone-400">Product</h4>
              <ul className="space-y-3 text-stone-500 text-sm">
                <li><a href="#features"    className="hover:text-orange-400 transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-orange-400 transition-colors">How it works</a></li>
                <li><a href="#pricing"     className="hover:text-orange-400 transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 font-['Outfit'] text-sm uppercase tracking-widest text-stone-400">Company</h4>
              <ul className="space-y-3 text-stone-500 text-sm">
                <li><Link to="/privacy"  className="hover:text-orange-400 transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms"    className="hover:text-orange-400 transition-colors">Terms of Service</Link></li>
                <li><a href="#feedback"  className="hover:text-orange-400 transition-colors">Feedback</a></li>
                <li><a href="mailto:mantrabudget@gmail.com" className="hover:text-orange-400 transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4 text-stone-600 text-sm">
            <p>© 2026 Budget Mantra. All rights reserved.</p>
            <p>Made with ❤️ in India</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
