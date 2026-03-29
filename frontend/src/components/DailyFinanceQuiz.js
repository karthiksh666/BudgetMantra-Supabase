import { useState, useEffect } from 'react';
import { Zap, X, ChevronRight, Trophy, Flame, RotateCcw, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ALL_QUESTIONS = [
  { q: "What does EMI stand for?", options: ["Easy Money Income", "Equated Monthly Instalment", "Extra Monthly Interest", "Earned Monthly Income"], answer: 1 },
  { q: "What is CIBIL score range in India?", options: ["0–500", "300–900", "100–1000", "200–800"], answer: 1 },
  { q: "What is the RBI's recommended maximum EMI-to-income ratio?", options: ["30%", "40%", "50%", "60%"], answer: 2 },
  { q: "Compound interest is calculated on?", options: ["Principal only", "Interest only", "Principal + accumulated interest", "None of the above"], answer: 2 },
  { q: "What does SIP stand for in mutual funds?", options: ["Systematic Investment Plan", "Simple Interest Plan", "Savings Investment Portfolio", "Secure Income Plan"], answer: 0 },
  { q: "Which of these is NOT a type of mutual fund?", options: ["Equity fund", "Debt fund", "Real estate fund", "Hybrid fund"], answer: 2 },
  { q: "What does FOIR stand for?", options: ["Fixed Obligation to Income Ratio", "Financial Output Index Rating", "Flexible Option Interest Rate", "Fund Outflow Interest Ratio"], answer: 0 },
  { q: "A higher credit score means?", options: ["Higher interest rates", "Lower loan eligibility", "Better loan terms", "More EMIs"], answer: 2 },
  { q: "What is the '50-30-20' budgeting rule?", options: ["50% savings, 30% needs, 20% wants", "50% needs, 30% wants, 20% savings", "50% wants, 30% savings, 20% needs", "50% investments, 30% needs, 20% wants"], answer: 1 },
  { q: "What is a 'bull market'?", options: ["Market falling sharply", "Market rising steadily", "Market with high volatility", "Market with low trading volume"], answer: 1 },
  { q: "Gold price in India is quoted per?", options: ["Kilogram", "Pound", "10 grams", "Ounce"], answer: 2 },
  { q: "What does PPF stand for?", options: ["Personal Provident Fund", "Public Provident Fund", "Private Portfolio Fund", "Pension Protection Fund"], answer: 1 },
  { q: "Which section allows tax deduction for home loan interest?", options: ["Section 80C", "Section 24(b)", "Section 10(14)", "Section 80D"], answer: 1 },
  { q: "What is 'liquid fund' in mutual funds?", options: ["A fund investing in stocks", "A fund investing in real estate", "A fund investing in short-term debt", "A fund investing in commodities"], answer: 2 },
  { q: "Inflation means?", options: ["Decrease in money supply", "Rise in general price levels", "Increase in employment", "Fall in interest rates"], answer: 1 },
  { q: "What is the full form of NPS?", options: ["National Pension Scheme", "New Payment System", "National Provident Savings", "Net Profit Score"], answer: 0 },
  { q: "Which investment typically has the highest long-term return in India?", options: ["Fixed Deposit", "Gold", "Equity Mutual Funds", "Savings Account"], answer: 2 },
  { q: "What does 'diversification' mean in investing?", options: ["Putting all money in one stock", "Spreading investments across assets", "Investing only in government bonds", "Keeping money in savings"], answer: 1 },
  { q: "What is 'term insurance'?", options: ["Insurance with maturity benefit", "Pure life cover with no maturity benefit", "Health insurance", "Vehicle insurance"], answer: 1 },
  { q: "ELSS stands for?", options: ["Equity Linked Savings Scheme", "Exchange Linked Saving System", "Equity Loan Savings Structure", "Earnings Linked Security Scheme"], answer: 0 },
  { q: "What is the lock-in period for PPF?", options: ["3 years", "5 years", "10 years", "15 years"], answer: 3 },
  { q: "A savings rate of ___% is generally recommended by financial advisors.", options: ["5%", "10%", "20%", "30%"], answer: 2 },
  { q: "What does 'repo rate' mean?", options: ["Rate at which banks lend to public", "Rate at which RBI lends to banks", "Rate at which government borrows", "Rate of inflation"], answer: 1 },
  { q: "Which is safer — secured or unsecured loan?", options: ["Unsecured loan", "Secured loan", "Both are equally safe", "Depends on the bank"], answer: 1 },
  { q: "What is 'net worth'?", options: ["Total income per year", "Total assets minus total liabilities", "Total savings in a year", "Monthly take-home salary"], answer: 1 },
  { q: "Prepaying a home loan early reduces?", options: ["Principal amount only", "Interest paid over loan tenure", "EMI amount only", "Loan tenure only"], answer: 1 },
  { q: "What is an 'emergency fund'?", options: ["Fund for luxury purchases", "3–6 months of expenses saved for emergencies", "Government disaster relief fund", "Insurance claim money"], answer: 1 },
  { q: "Which of these has the highest liquidity?", options: ["Real estate", "Fixed Deposit", "Savings account", "Gold jewellery"], answer: 2 },
  { q: "What does 'bear market' mean?", options: ["Market rising 20%+", "Market falling 20%+", "Market with low trading", "Stable market"], answer: 1 },
  { q: "NACH in banking stands for?", options: ["National Automated Clearing House", "Net Account Credit Holding", "National Asset Clearing Hub", "New Account Credit Header"], answer: 0 },
];

const QUESTIONS_PER_DAY = 5;
const STORAGE_KEY = 'bm_quiz_state';

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getDailyQuestions = () => {
  const seed = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let hash = parseInt(seed) % ALL_QUESTIONS.length;
  const picked = [];
  const used = new Set();
  for (let i = 0; i < QUESTIONS_PER_DAY; i++) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    const idx = hash % ALL_QUESTIONS.length;
    if (!used.has(idx)) { picked.push(idx); used.add(idx); }
    else { picked.push((idx + 1) % ALL_QUESTIONS.length); used.add((idx + 1) % ALL_QUESTIONS.length); }
  }
  return picked.map(i => ALL_QUESTIONS[i]);
};

const Confetti = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
    {[...Array(20)].map((_, i) => (
      <div key={i} className="absolute w-2 h-2 rounded-sm"
        style={{
          left: `${Math.random() * 100}%`,
          top: `-10%`,
          background: ['#f97316','#fbbf24','#34d399','#60a5fa','#a78bfa','#f472b6'][i % 6],
          animation: `confettiFall ${1.2 + Math.random()}s ease-in forwards`,
          animationDelay: `${Math.random() * 0.5}s`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }}
      />
    ))}
    <style>{`
      @keyframes confettiFall {
        0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
      }
    `}</style>
  </div>
);

const DailyFinanceQuiz = () => {
  const [open, setOpen] = useState(false);
  const [questions] = useState(getDailyQuestions);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | playing | result
  const [streak, setStreak] = useState(0);
  const [todayDone, setTodayDone] = useState(false);
  const [todayScore, setTodayScore] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.lastPlayed === getTodayKey()) {
        setTodayDone(true);
        setTodayScore(state.lastScore);
      }
      setStreak(state.streak || 0);
    }
  }, []);

  const startQuiz = () => {
    setCurrent(0);
    setSelected(null);
    setAnswers([]);
    setPhase('playing');
    setOpen(true);
  };

  const handleSelect = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
  };

  const handleNext = () => {
    const newAnswers = [...answers, selected];
    if (current < questions.length - 1) {
      setAnswers(newAnswers);
      setCurrent(c => c + 1);
      setSelected(null);
    } else {
      const score = newAnswers.filter((a, i) => a === questions[i].answer).length;
      setAnswers(newAnswers);
      setPhase('result');

      const raw = localStorage.getItem(STORAGE_KEY);
      const state = raw ? JSON.parse(raw) : { streak: 0, lastPlayed: null };
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yKey = yesterday.toISOString().slice(0, 10);
      const newStreak = state.lastPlayed === yKey ? state.streak + 1 : 1;

      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lastPlayed: getTodayKey(),
        lastScore: score,
        streak: newStreak,
      }));
      setStreak(newStreak);
      setTodayDone(true);
      setTodayScore(score);
      if (score >= 4) setShowConfetti(true);
    }
  };

  const score = answers.filter((a, i) => a === questions[i].answer).length;
  const q = questions[current];
  const resultEmoji = score === 5 ? '🏆' : score >= 3 ? '🎯' : score >= 2 ? '📚' : '💪';
  const resultMsg = score === 5 ? 'Perfect score! Finance genius!' : score >= 3 ? 'Great job! Keep learning!' : score >= 2 ? 'Good effort — keep going!' : 'Every expert was once a beginner!';

  return (
    <>
      {/* Widget card */}
      <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-5 relative overflow-hidden cursor-pointer group"
        onClick={todayDone ? () => setOpen(true) : startQuiz}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-12 translate-x-12" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/10 rounded-full translate-y-8 -translate-x-8" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl backdrop-blur-sm">
              🧠
            </div>
            <div>
              <p className="text-white font-bold text-sm font-['Outfit']">Daily Finance Quiz</p>
              <p className="text-white/70 text-xs">{todayDone ? `You scored ${todayScore}/5 today` : '5 questions · 2 min'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {streak > 0 && (
              <div className="flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1 backdrop-blur-sm">
                <Flame size={12} className="text-orange-300" />
                <span className="text-white text-xs font-bold">{streak}</span>
              </div>
            )}
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors backdrop-blur-sm">
              {todayDone ? <Star size={16} className="text-yellow-300" fill="currentColor" /> : <Zap size={16} className="text-white" />}
            </div>
          </div>
        </div>
        {!todayDone && (
          <div className="relative mt-3 flex gap-1">
            {questions.map((_, i) => (
              <div key={i} className="flex-1 h-1 bg-white/20 rounded-full" />
            ))}
          </div>
        )}
        {todayDone && (
          <div className="relative mt-3 flex gap-1">
            {questions.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full ${i < todayScore ? 'bg-emerald-400' : 'bg-white/20'}`} />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
            {showConfetti && phase === 'result' && <Confetti />}

            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <span className="text-white font-bold font-['Outfit']">Daily Finance Quiz</span>
              </div>
              <div className="flex items-center gap-3">
                {streak > 0 && (
                  <div className="flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1">
                    <Flame size={12} className="text-orange-300" />
                    <span className="text-white text-xs font-bold">{streak} day streak</span>
                  </div>
                )}
                <button onClick={() => setOpen(false)} className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                  <X size={14} className="text-white" />
                </button>
              </div>
            </div>

            {/* Playing phase */}
            {phase === 'playing' && (
              <div className="p-6">
                {/* Progress */}
                <div className="flex items-center gap-2 mb-5">
                  {questions.map((_, i) => (
                    <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                      i < current ? 'bg-violet-500' : i === current ? 'bg-violet-300' : 'bg-stone-100'
                    }`} />
                  ))}
                  <span className="text-xs text-stone-400 font-medium ml-1">{current + 1}/{questions.length}</span>
                </div>

                {/* Question */}
                <p className="text-stone-800 font-semibold text-base leading-snug mb-5 font-['Outfit']">{q.q}</p>

                {/* Options */}
                <div className="space-y-2.5 mb-6">
                  {q.options.map((opt, i) => {
                    let style = 'border-stone-200 bg-stone-50 text-stone-700 hover:border-violet-300 hover:bg-violet-50';
                    if (selected !== null) {
                      if (i === q.answer) style = 'border-emerald-400 bg-emerald-50 text-emerald-800';
                      else if (i === selected && selected !== q.answer) style = 'border-red-400 bg-red-50 text-red-700';
                      else style = 'border-stone-100 bg-stone-50 text-stone-400';
                    }
                    return (
                      <button key={i} onClick={() => handleSelect(i)}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${style}`}>
                        <span className="inline-flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-white border border-current/20 flex items-center justify-center text-xs font-bold shrink-0">
                            {['A','B','C','D'][i]}
                          </span>
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <Button onClick={handleNext} disabled={selected === null}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl h-11 font-semibold disabled:opacity-40">
                  {current < questions.length - 1 ? <span className="flex items-center gap-2">Next <ChevronRight size={16} /></span> : 'See Results'}
                </Button>
              </div>
            )}

            {/* Result phase */}
            {phase === 'result' && (
              <div className="p-6 text-center">
                <div className="text-5xl mb-3">{resultEmoji}</div>
                <p className="text-2xl font-bold text-stone-900 font-['Outfit'] mb-1">{score} / {questions.length}</p>
                <p className="text-stone-500 text-sm mb-5">{resultMsg}</p>

                {/* Score bar */}
                <div className="flex gap-2 mb-6 justify-center">
                  {questions.map((q, i) => (
                    <div key={i} className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border-2 ${
                      answers[i] === q.answer
                        ? 'bg-emerald-50 border-emerald-300'
                        : 'bg-red-50 border-red-200'
                    }`}>
                      {answers[i] === q.answer ? '✓' : '✗'}
                    </div>
                  ))}
                </div>

                {streak > 0 && (
                  <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-2 mb-5">
                    <Flame size={14} className="text-orange-500" />
                    <span className="text-sm font-semibold text-orange-700">{streak} day streak! Keep it up 🔥</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Button onClick={() => setOpen(false)}
                    className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl h-11 font-semibold">
                    <Trophy size={16} className="mr-2" /> Done
                  </Button>
                  <button onClick={() => { setPhase('playing'); setCurrent(0); setSelected(null); setAnswers([]); setShowConfetti(false); }}
                    className="w-full text-sm text-stone-400 hover:text-violet-600 flex items-center justify-center gap-1.5 py-2 transition-colors">
                    <RotateCcw size={13} /> Review answers
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DailyFinanceQuiz;
