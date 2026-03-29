import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Wallet, TrendingUp, MessageSquare, Target, PiggyBank,
  CreditCard, Plane, ChevronRight, Sparkles, IndianRupee,
} from 'lucide-react';

const FEATURES = [
  { icon: MessageSquare, color: 'bg-orange-50 text-orange-500', title: 'Chanakya AI', desc: 'Just say "spent ₹500 on food" — it logs automatically.' },
  { icon: TrendingUp, color: 'bg-emerald-50 text-emerald-500', title: 'Budget Tracking', desc: 'Know exactly where every rupee goes, in real time.' },
  { icon: CreditCard, color: 'bg-blue-50 text-blue-500', title: 'EMI Manager', desc: 'Track all your loans and never miss a payment.' },
  { icon: Target, color: 'bg-purple-50 text-purple-500', title: 'Savings Goals', desc: 'Set targets and watch your goals fill up.' },
  { icon: PiggyBank, color: 'bg-amber-50 text-amber-500', title: 'Investments', desc: 'Stocks, MFs, FDs — all in one place.' },
  { icon: Plane, color: 'bg-rose-50 text-rose-500', title: 'Trip Planner', desc: 'Plan, budget, and track trips with AI highlights.' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(0); // 0=welcome, 1=income, 2=features
  const [income, setIncome] = useState('');
  const [loading, setLoading] = useState(false);

  const firstName = user?.name?.split(' ')[0] || 'there';

  const handleFinish = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/auth/onboarding-complete`, {
        monthly_income: income ? parseFloat(income.replace(/,/g, '')) : null,
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      await refreshUser();
      navigate('/chatbot', { replace: true });
    } catch {
      navigate('/chatbot', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="bg-white rounded-3xl p-8 shadow-2xl shadow-orange-900/20 text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-orange-500/30">
              <Wallet size={36} className="text-white" />
            </div>
            <div>
              <p className="text-orange-500 font-semibold text-sm mb-1">Welcome to Budget Mantra</p>
              <h1 className="text-3xl font-bold text-stone-900 font-['Outfit']">Hey {firstName}! 👋</h1>
              <p className="text-stone-500 mt-3 text-base leading-relaxed">
                Your personal finance command centre is ready.<br />
                Let's get you set up in 2 quick steps.
              </p>
            </div>
            <Button onClick={() => setStep(1)}
              className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2">
              Let's go <ChevronRight size={18} />
            </Button>
          </div>
        )}

        {/* Step 1: Monthly income */}
        {step === 1 && (
          <div className="bg-white rounded-3xl p-8 shadow-2xl shadow-orange-900/20 space-y-6">
            <div>
              <p className="text-orange-500 font-semibold text-sm mb-1">Step 1 of 2</p>
              <h2 className="text-2xl font-bold text-stone-900 font-['Outfit']">What's your monthly income?</h2>
              <p className="text-stone-500 text-sm mt-1">This helps Chanakya give you personalised advice. You can change it anytime.</p>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-semibold">
                <IndianRupee size={18} />
              </span>
              <Input
                type="number" placeholder="e.g. 75000"
                value={income} onChange={e => setIncome(e.target.value)}
                className="h-14 bg-stone-50 border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl pl-10 text-lg font-semibold text-stone-900"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 h-12 border border-stone-200 rounded-xl text-stone-500 hover:text-stone-700 text-sm font-medium transition-colors">
                Back
              </button>
              <Button onClick={() => setStep(2)}
                className="flex-2 h-12 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold flex-1 flex items-center justify-center gap-2">
                {income ? 'Continue' : 'Skip for now'} <ChevronRight size={18} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Feature tour */}
        {step === 2 && (
          <div className="bg-white rounded-3xl p-8 shadow-2xl shadow-orange-900/20 space-y-6">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-orange-500" />
              <div>
                <p className="text-orange-500 font-semibold text-sm">Step 2 of 2</p>
                <h2 className="text-2xl font-bold text-stone-900 font-['Outfit']">Here's what you can do</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="bg-stone-50 rounded-2xl p-4 space-y-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon size={18} />
                  </div>
                  <p className="font-semibold text-stone-800 text-sm">{title}</p>
                  <p className="text-stone-400 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            <div className="bg-orange-50 rounded-2xl p-4 flex items-start gap-3">
              <MessageSquare size={20} className="text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-stone-800 text-sm">Start with Chanakya</p>
                <p className="text-stone-500 text-xs mt-0.5">Just tell it what you spent and it handles the rest. Try: <span className="italic">"spent ₹200 on chai"</span></p>
              </div>
            </div>

            <Button onClick={handleFinish} disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2">
              {loading
                ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Setting up...</span>
                : <><Sparkles size={16} /> Start using Budget Mantra</>
              }
            </Button>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex justify-center gap-2 mt-5">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${step === i ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
