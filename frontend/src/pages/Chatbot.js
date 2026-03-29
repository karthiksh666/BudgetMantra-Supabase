import { useState, useRef, useEffect, useCallback } from "react";
import { useDashboard } from "@/context/DashboardContext";
import axios from "axios";
import { API } from "@/App";
import Navigation from "@/components/Navigation";
import {
  Send, Mic, MicOff, Check, X, Sparkles, ShoppingBag, Wallet,
  Target, TrendingUp, Pin, PinOff, Trash2, Reply,
  Search, Bell,
} from "lucide-react";

// ── Chanakya DP — sage with a coin, warm amber gradient ───────────────────────
function ChanakyaDP({ size = 40 }) {
  const r = Math.round(size * 0.28);   // border-radius
  const fs = Math.round(size * 0.42);  // font size for ₹
  return (
    <div
      style={{
        width: size, height: size, borderRadius: r, flexShrink: 0,
        background: "linear-gradient(135deg,#92400e 0%,#b45309 40%,#d97706 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 8px rgba(180,83,9,0.45)",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* subtle ring */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: r,
        border: "1.5px solid rgba(251,191,36,0.35)",
      }} />
      <span style={{ fontSize: fs, fontWeight: 900, color: "#fef3c7", lineHeight: 1, userSelect: "none" }}>
        ₹
      </span>
    </div>
  );
}

// ── Dynamic subtitle — cycles through feature prompts ─────────────────────────
const DYNAMIC_HINTS = [
  "Tell me what you spent today",
  "Log an EMI or loan payment",
  "How much did I save this month?",
  "Set a savings goal",
  "Track a recurring expense",
  "Can I afford a trip this weekend?",
  "Add income — salary, freelance, bonus",
  "Check my financial health score",
  "Log a gift or hand loan",
  "How's my EMI-to-income ratio?",
  "Start a piggy bank for something special",
  "What's my top spend this month?",
  // Income-specific
  "salary 85000",
  "Got freelance payment of 30000",
  "rental income 15000 this month",
  "received bonus 50000",
  "dividend 8000 from mutual funds",
  "How much income did I earn this year?",
  "What's my income vs expenses this month?",
];

function DynamicSubtitle() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % DYNAMIC_HINTS.length);
        setVisible(true);
      }, 350);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <p
      className="text-[11px] text-stone-400 mt-0.5 truncate transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {DYNAMIC_HINTS[idx]}
    </p>
  );
}

// ── Quick action chips — always visible, tap to open inline form ──────────────
const QUICK_ACTIONS = [
  { key: "expense", icon: ShoppingBag, label: "+ Expense", color: "#f97316" },
  { key: "income",  icon: Wallet,      label: "+ Income",  color: "#10b981" },
  { key: "emi",     icon: TrendingUp,  label: "+ EMI",     color: "#6366f1" },
  { key: "goal",    icon: Target,      label: "+ Goal",    color: "#f59e0b" },
];

const EXPENSE_CATS = ["Food", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Travel", "Other"];
const INCOME_TYPES = ["Salary", "Freelance", "Rental", "Bonus", "Dividend", "Other"];

// Inline composer — replaces text input when a quick action chip is tapped
function calcEMI(principal, annualRate, tenureMonths) {
  if (!annualRate) return Math.round(principal / tenureMonths);
  const r = annualRate / 12 / 100;
  return Math.round(principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1));
}

function QuickComposer({ action, onSend, onClose }) {
  const [rows,      setRows]      = useState([{ amount: '', tag: '' }]);
  const [name,      setName]      = useState('');
  const [amount,    setAmount]    = useState('');
  const [principal, setPrincipal] = useState('');
  const [rate,      setRate]      = useState('');
  const [tenure,    setTenure]    = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  });
  const [confirmed, setConfirmed] = useState(false);
  const [sent,      setSent]      = useState(false);
  const amtRef = useRef(null);

  const isMulti = action === 'expense' || action === 'income';
  const cfg  = QUICK_ACTIONS.find(a => a.key === action);
  const cats = action === 'expense' ? EXPENSE_CATS : INCOME_TYPES;

  const resetForm = () => {
    setRows([{ amount: '', tag: '' }]);
    setName(''); setAmount(''); setPrincipal(''); setRate(''); setTenure('');
    setConfirmed(false); setSent(false);
    setTimeout(() => amtRef.current?.focus(), 80);
  };

  useEffect(() => { resetForm(); }, [action]);

  const updateRow = (idx, field, val) => setRows(r => r.map((x, i) => i === idx ? { ...x, [field]: val } : x));
  const addRow    = () => setRows(r => [...r, { amount: '', tag: '' }]);
  const removeRow = (idx) => setRows(r => r.filter((_, i) => i !== idx));

  const validRows = rows.filter(r => r.amount.trim() && r.tag);

  const emiAmt = action === 'emi' && principal && tenure
    ? calcEMI(parseFloat(principal), parseFloat(rate) || 0, parseInt(tenure))
    : 0;

  const canReview = isMulti
    ? validRows.length > 0
    : action === 'emi'  ? (!!name && !!principal && !!tenure)
    : action === 'goal' ? (!!name && !!amount.trim()) : false;

  const buildMsg = () => {
    if (action === 'expense') return validRows.map(r => `spent ${r.amount.trim()} on ${r.tag}`).join('\n');
    if (action === 'income')  return validRows.map(r => r.tag === 'Salary' ? `salary ${r.amount.trim()}` : `${r.tag.toLowerCase()} payment ${r.amount.trim()}`).join('\n');
    if (action === 'emi')     return `add home loan ${name} ${principal} at ${rate || '0'}% ${tenure} months starting ${startDate} monthly payment ${emiAmt}`;
    if (action === 'goal')    return `saving for ${name} ${amount.trim()}`;
    return '';
  };

  const summaryLines = () => {
    if (isMulti) return validRows.map((r, i) => `${i + 1}. ${r.tag} — ₹${parseFloat(r.amount).toLocaleString('en-IN')}`);
    if (action === 'emi') return [
      `Loan: ${name}`,
      `Principal: ₹${parseFloat(principal).toLocaleString('en-IN')}`,
      rate ? `Rate: ${rate}% p.a.` : 'Rate: 0% (interest-free)',
      `Tenure: ${tenure} months`,
      `Monthly EMI: ₹${emiAmt.toLocaleString('en-IN')}`,
      `Starts: ${startDate}`,
    ];
    if (action === 'goal') return [`Goal: ${name}`, `Target: ₹${parseFloat(amount).toLocaleString('en-IN')}`];
    return [];
  };

  const title = sent ? '✓ Done' : confirmed ? 'Confirm' :
    action === 'expense' ? 'Log Expenses' : action === 'income' ? 'Add Income' :
    action === 'emi' ? 'Add EMI' : 'New Goal';

  return (
    <div style={{ background: "rgba(28,25,23,0.97)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "14px 14px 12px", margin: "0 12px 8px" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {cfg && <cfg.icon size={14} style={{ color: cfg.color }} />}
          <span className="text-xs font-semibold text-stone-200">{title}</span>
        </div>
        <button onClick={onClose} className="text-stone-500 hover:text-stone-300"><X size={14} /></button>
      </div>

      {/* ── Success screen ── */}
      {sent ? (
        <>
          <div className="flex flex-col items-center py-4 gap-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: (cfg?.color ?? '#f97316') + '22' }}>
              <span className="text-2xl">✓</span>
            </div>
            <p className="text-sm font-bold text-stone-100">Logged!</p>
            <p className="text-[11px] text-stone-500">Chanakya has recorded your {isMulti && validRows.length > 1 ? `${validRows.length} entries` : 'entry'}.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={resetForm} className="flex-1 py-2 rounded-xl text-xs font-semibold text-stone-400 border border-stone-700 hover:border-stone-500 transition-all">
              + Add more
            </button>
            <button onClick={onClose} className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all" style={{ background: cfg?.color }}>
              Done
            </button>
          </div>
        </>

      ) : confirmed ? (
        /* ── Confirm screen ── */
        <>
          <div className="rounded-2xl border border-white/8 p-3 mb-3" style={{ background: 'rgba(34,20,8,0.85)' }}>
            {summaryLines().map((line, i) => (
              <p key={i} className="text-xs text-stone-200 py-1 border-b border-white/5 last:border-0">{line}</p>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setConfirmed(false)} className="py-2 px-4 rounded-xl text-xs font-semibold text-stone-400 border border-stone-700 hover:border-stone-500 transition-all">
              Edit
            </button>
            <button
              onClick={() => { onSend(buildMsg()); setSent(true); }}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all active:scale-[0.98]"
              style={{ background: cfg?.color }}
            >
              Confirm & Send
            </button>
          </div>
        </>

      ) : (
        /* ── Form screen ── */
        <>
          {isMulti ? (
            <div className="max-h-72 overflow-y-auto pr-0.5 mb-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#44403c transparent' }}>
              {rows.map((row, idx) => (
                <div key={idx} className="mb-2 rounded-2xl border border-white/10 p-3" style={{ background: 'rgba(34,20,8,0.85)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border"
                        style={{ color: cfg?.color, borderColor: (cfg?.color ?? '#f97316') + '66', background: (cfg?.color ?? '#f97316') + '22' }}
                      >{idx + 1}</span>
                      <span className="text-[11px] text-stone-500 font-medium">Entry {idx + 1}</span>
                    </div>
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(idx)} className="text-stone-600 hover:text-red-400 transition-colors"><X size={14} /></button>
                    )}
                  </div>
                  <div className="relative mb-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">₹</span>
                    <input
                      ref={idx === 0 ? amtRef : null}
                      type="number" inputMode="numeric" value={row.amount}
                      onChange={e => updateRow(idx, 'amount', e.target.value)}
                      placeholder="Amount"
                      className="w-full bg-stone-800/80 border border-stone-700/40 text-stone-100 placeholder-stone-500 text-sm rounded-xl pl-7 pr-3 py-2 outline-none focus:border-amber-600/50"
                      onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cats.map(c => (
                      <button key={c} onClick={() => updateRow(idx, 'tag', c)}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all"
                        style={row.tag === c
                          ? { background: cfg?.color, borderColor: cfg?.color, color: '#fff' }
                          : { background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: '#a8a29e' }}
                      >{c}</button>
                    ))}
                  </div>
                  {!row.tag && <p className="text-[10px] text-stone-600 mt-1.5">← Pick a category</p>}
                </div>
              ))}
              <button onClick={addRow}
                className="w-full py-2.5 rounded-2xl border border-dashed border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 hover:border-white/20 mb-1 transition-colors"
                style={{ color: cfg?.color }}
              >+ Add another entry</button>
            </div>
          ) : (
            <>
              <input ref={amtRef} value={name} onChange={e => setName(e.target.value)}
                placeholder={action === 'emi' ? 'Loan name (e.g. Home Loan, Car Loan)' : 'Goal name (e.g. iPhone, Vacation)'}
                className="w-full bg-stone-800/80 border border-stone-700/40 text-stone-100 placeholder-stone-500 text-sm rounded-xl px-3 py-2 outline-none focus:border-amber-600/50 mb-2"
              />
              <div className="relative mb-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">₹</span>
                <input type="number" inputMode="numeric"
                  value={action === 'emi' ? principal : amount}
                  onChange={e => action === 'emi' ? setPrincipal(e.target.value) : setAmount(e.target.value)}
                  placeholder={action === 'emi' ? 'Principal amount' : 'Target amount'}
                  className="w-full bg-stone-800/80 border border-stone-700/40 text-stone-100 placeholder-stone-500 text-sm rounded-xl pl-7 pr-3 py-2 outline-none focus:border-amber-600/50"
                />
              </div>
              {action === 'emi' && (
                <>
                  <div className="flex gap-2 mb-2">
                    <input type="number" value={rate} onChange={e => setRate(e.target.value)}
                      placeholder="Rate % p.a."
                      className="flex-1 bg-stone-800/80 border border-stone-700/40 text-stone-100 placeholder-stone-500 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-600/50" />
                    <input type="number" value={tenure} onChange={e => setTenure(e.target.value)}
                      placeholder="Tenure (months)"
                      className="flex-1 bg-stone-800/80 border border-stone-700/40 text-stone-100 placeholder-stone-500 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-600/50" />
                  </div>
                  <input value={startDate} onChange={e => setStartDate(e.target.value)}
                    placeholder="Start date (YYYY-MM)"
                    className="w-full bg-stone-800/80 border border-stone-700/40 text-stone-100 placeholder-stone-500 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-600/50 mb-2"
                  />
                  {emiAmt > 0 && (
                    <p className="text-xs font-bold text-emerald-400 text-center mb-2">
                      Calculated EMI: ₹{emiAmt.toLocaleString('en-IN')} / month
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {/* Review button */}
          <button
            onClick={() => canReview && setConfirmed(true)}
            disabled={!canReview}
            style={canReview ? { background: cfg?.color } : {}}
            className="w-full py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-30 disabled:bg-stone-700 transition-all active:scale-[0.98]"
          >
            {isMulti && validRows.length > 1 ? `Review ${validRows.length} Entries →` : 'Review →'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Bold/link/line-break renderer ─────────────────────────────────────────────
function renderMessage(text) {
  // Split on bold (**text** or *text*) and markdown links [label](url)
  const TOKEN = /(\*\*?[^*]+\*\*?|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(TOKEN);
  return parts.map((part, i) => {
    // Bold: **text** or *text*
    if (/^\*\*?.+\*\*?$/.test(part)) {
      const inner = part.replace(/^\*+|\*+$/g, "");
      return <strong key={i} className="font-semibold text-amber-300">{inner}</strong>;
    }
    // Markdown link: [label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      const isInternal = url.startsWith("/");
      return (
        <a key={i} href={url}
          target={isInternal ? "_blank" : "_blank"}
          rel="noopener noreferrer"
          className="text-amber-400 underline underline-offset-2 hover:text-amber-300 font-semibold">
          {label}
        </a>
      );
    }
    // Plain text — preserve line breaks
    return part.split("\n").map((line, j, arr) => (
      <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
    ));
  });
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-2 h-2 rounded-full bg-amber-400 opacity-60"
          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
    </div>
  );
}

// ── Client-side sensitive-data guard (fires BEFORE server call) ───────────────
// Mirrors backend patterns — any match blocks the message immediately.
const SENSITIVE_RULES = [
  { re: /\b(?:\d[ \-]?){15}\d\b/,                                              label: "card number"          },
  { re: /\b(?:cvv|cvc|security\s*code)[\s:=]+\d{3,4}\b/i,                      label: "CVV"                  },
  { re: /\b(?:atm\s*pin|upi\s*pin|mpin|m-?pin|transaction\s*pin)[\s:=]+\d{4,6}\b/i, label: "PIN"             },
  { re: /\b(?:otp|one[\s\-]?time\s*(?:password|code))[\s:=]+\d{4,8}\b/i,       label: "OTP"                  },
  { re: /\b(?:password|passwd|net\s*banking\s*pass(?:word)?)[\s:=]+\S+/i,       label: "password"             },
  { re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/,                                            label: "PAN number"           },
  { re: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/,                                   label: "Aadhaar number"       },
  { re: /\b(?:account\s*(?:no|number|num)[\s:#]*)\d{9,18}\b/i,                  label: "bank account number"  },
  { re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/,                                             label: "IFSC code"            },
  { re: /\b(?:user\s*(?:id|name)|customer\s*id|login\s*id)[\s:=]+\S+/i,         label: "net banking username" },
  { re: /\b(?:demat\s*(?:account|no)?[\s:=]*|dp\s*id[\s:=]+)\d{8,16}\b/i,      label: "demat account"        },
  { re: /\b[A-Z][1-9][0-9]{7}\b/,                                               label: "passport number"      },
  { re: /\b(?:secret\s*(?:key|answer)|security\s*question)[\s:=]+\S+/i,         label: "security credential"  },
];

function detectSensitiveData(text) {
  for (const { re, label } of SENSITIVE_RULES) {
    if (re.test(text)) return label;
  }
  return null;
}

// ── Voice hook ────────────────────────────────────────────────────────────────
function useSpeechRecognition(onResult) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-IN"; r.interimResults = false;
    r.onresult = (e) => { onResult(e.results[0][0].transcript); setListening(false); };
    r.onerror  = () => setListening(false);
    r.onend    = () => setListening(false);
    recRef.current = r;
  }, [onResult]);
  const toggle = () => {
    if (!recRef.current) return;
    if (listening) { recRef.current.stop(); setListening(false); }
    else           { recRef.current.start(); setListening(true); }
  };
  return { listening, toggle, supported: !!recRef.current };
}

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

const CHAT_CACHE_KEY = "bm_chat_msgs";

// ── Main component ────────────────────────────────────────────────────────────
const Chatbot = () => {
  const { prefetch } = useDashboard();
  const [messages,       setMessages]       = useState([]);
  const [input,          setInput]          = useState("");
  const [isLoading,      setIsLoading]      = useState(false);
  const [historyLoading, setHistoryLoading] = useState(() => {
    // Start as false if we have cached messages — no loading spinner needed
    try { return !JSON.parse(localStorage.getItem(CHAT_CACHE_KEY) || "[]").length; }
    catch { return true; }
  });
  const [pendingEntries, setPendingEntries] = useState(null);
  const [pendingDelete,  setPendingDelete]  = useState(null);   // {transaction_id, description, amount}
  const [pendingEdit,    setPendingEdit]    = useState(null);   // {transaction_id, proposed: {...}}
  const [replyTo,        setReplyTo]        = useState(null);   // {id, role, content}
  const [activeAction,   setActiveAction]   = useState(null);   // 'expense'|'income'|'emi'|'goal'|null
  const [searchMode,     setSearchMode]     = useState(false);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [searchResults,  setSearchResults]  = useState(null);
  const [pinnedOpen,     setPinnedOpen]     = useState(false);
  const [pinned,         setPinned]         = useState([]);
  const [hasMore,        setHasMore]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  const scrollRef      = useRef(null);
  const oldestIdRef    = useRef(null);

  // ── Prefetch dashboard data in background while chat loads ────────────────
  useEffect(() => { prefetch(); }, [prefetch]);

  // ── Load history — show cache instantly, refresh from server in background ──
  useEffect(() => {
    // Step 1: render cached messages immediately (zero wait)
    try {
      const cached = JSON.parse(localStorage.getItem(CHAT_CACHE_KEY) || "[]");
      if (cached.length) {
        setMessages(cached);
        if (cached[0]?.id) oldestIdRef.current = cached[0].id;
      }
    } catch { /* ignore */ }

    // Step 2: fetch fresh history from server in background
    const loadHistory = async () => {
      try {
        const res = await axios.get(`${API}/chatbot/history?limit=20`, auth());
        const msgs = res.data || [];
        if (msgs.length < 20) setHasMore(false);
        if (msgs.length > 0) oldestIdRef.current = msgs[0].id;

        if (msgs.length === 0) {
          setMessages([onboardingMsg()]);
          localStorage.removeItem(CHAT_CACHE_KEY);
        } else {
          setMessages(msgs);
          try { localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(msgs.slice(-20))); } catch { /* quota */ }
        }
      } catch {
        // Server failed — keep showing whatever is cached; add welcome if nothing
        setMessages(prev => prev.length ? prev : [welcomeMsg()]);
      } finally {
        setHistoryLoading(false);
      }
    };
    loadHistory();
  }, []);

  // ── Load pinned on open ────────────────────────────────────────────────────
  useEffect(() => {
    if (!pinnedOpen) return;
    axios.get(`${API}/chatbot/pinned`, auth()).then(r => setPinned(r.data)).catch(() => {});
  }, [pinnedOpen]);

  const welcomeMsg = () => ({
    id: "welcome",
    role: "assistant",
    content: "Hey! I'm Chanakya — think of me as that one friend who actually understands money.\n\nJust tell me what's on your mind:\n*spent 500 swiggy* · *salary 89000* · *can I afford a trip?*",
    timestamp: new Date().toISOString(),
  });

  const onboardingMsg = () => ({
    id: "onboarding",
    role: "assistant",
    content: "Hey! I'm *Chanakya* — your personal money advisor 👋\n\nTo get you a proper *financial health score* and smart advice, I need to know a few things:\n\n1️⃣ What's your monthly income? *(e.g. salary 85000)*\n2️⃣ Any active EMIs? *(e.g. home loan 18000/month)*\n3️⃣ What do you spend most on?\n\nOnce you share this, I'll give you a real picture of your finances.",
    timestamp: new Date().toISOString(),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Load older messages on scroll up ──────────────────────────────────────
  const handleScroll = useCallback(async () => {
    if (!scrollRef.current || !hasMore || loadingMore) return;
    if (scrollRef.current.scrollTop > 80) return;
    const oldest = oldestIdRef.current;
    if (!oldest || oldest === "welcome") return;
    setLoadingMore(true);
    try {
      const res = await axios.get(`${API}/chatbot/history?limit=20&before=${oldest}`, auth());
      const older = res.data;
      if (older.length < 20) setHasMore(false);
      if (older.length > 0) oldestIdRef.current = older[0].id;
      const prevH = scrollRef.current.scrollHeight;
      setMessages(prev => [...older, ...prev]);
      // Keep scroll position stable
      requestAnimationFrame(() => {
        if (scrollRef.current)
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevH;
      });
    } catch {} finally { setLoadingMore(false); }
  }, [hasMore, loadingMore]);

  // ── Voice ──────────────────────────────────────────────────────────────────
  const [isVoiceInput, setIsVoiceInput] = useState(false);
  const { listening, toggle: toggleVoice, supported: voiceSupported } = useSpeechRecognition(
    useCallback((t) => { setInput(t); setIsVoiceInput(true); setTimeout(() => sendMessage(t), 300); }, [])
  );


  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchMode || !searchQuery.trim()) { setSearchResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/chatbot/search?q=${encodeURIComponent(searchQuery)}`, auth());
        setSearchResults(res.data);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchMode]);

  // ── Pin / Unpin ────────────────────────────────────────────────────────────
  const togglePin = async (msg) => {
    if (!msg.id || msg.id === "welcome") return;
    try {
      const res = await axios.put(`${API}/chatbot/message/${msg.id}/pin`, {}, auth());
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: res.data.pinned } : m));
      setPinned(prev =>
        res.data.pinned ? [{ ...msg, pinned: true }, ...prev] : prev.filter(p => p.id !== msg.id)
      );
    } catch {}
  };

  // ── Delete message ─────────────────────────────────────────────────────────
  const deleteMessage = async (id) => {
    if (!id || id === "welcome") return;
    try {
      await axios.delete(`${API}/chatbot/message/${id}`, auth());
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  // ── Clear chat ─────────────────────────────────────────────────────────────
  const clearChat = async () => {
    const typed = window.prompt('This permanently deletes all your Chanakya messages.\n\nType  DELETE MY CHAT  to confirm:');
    if (!typed || typed.trim().toUpperCase() !== "DELETE MY CHAT") return;
    try {
      await axios.delete(`${API}/chatbot/history`, auth());
      localStorage.removeItem(CHAT_CACHE_KEY);
      setMessages([welcomeMsg()]);
      setPinned([]);
    } catch {}
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMessage = async (text, overridePending = null) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    // ── Client-side sensitive data guard — block BEFORE server call ──────────
    const sensitiveLabel = detectSensitiveData(msg);
    if (sensitiveLabel) {
      const warningMsg = {
        id: `sensitive-${Date.now()}`,
        role: "assistant",
        content: `🔒 Your message appears to contain a **${sensitiveLabel}**.\n\nFor your safety, this message has been blocked and will never reach our AI.\n\nBudget Mantra will **never** need your card numbers, PINs, OTPs, passwords, Aadhaar, PAN, or banking credentials. Please never share these in chat.\n\nIf you want to log something, just describe it in plain words — e.g. *"credit card bill ₹4,500"* — and I'll handle it. 🙏`,
        timestamp: new Date().toISOString(),
        isError: false,
      };
      setMessages(prev => [...prev, warningMsg]);
      setInput("");
      return;
    }

    const userMsg = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: msg,
      timestamp: new Date().toISOString(),
      reply_to: replyTo?.id || null,
      _replyToData: replyTo,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setReplyTo(null); setActiveAction(null);
    setIsLoading(true);

    try {
      const voiceFlag = isVoiceInput;
      setIsVoiceInput(false);
      const res = await axios.post(`${API}/chatbot`, {
        message: msg,
        conversation_history: [],
        pending_entries: overridePending || pendingEntries || [],
        pending_delete: pendingDelete || null,
        pending_edit: pendingEdit || null,
        reply_to: replyTo?.id || null,
        is_voice: voiceFlag,
      }, auth());

      const data = res.data;

      // Replace temp user msg with DB id if returned
      if (data.user_msg_id) {
        setMessages(prev => prev.map(m => m.id === userMsg.id ? { ...m, id: data.user_msg_id } : m));
      }

      const assistantMsg = {
        id: data.asst_msg_id || `tmp-asst-${Date.now()}`,
        role: "assistant",
        content: data.response,
        timestamp: new Date().toISOString(),
        pending_entries: data.pending_entries || null,
        pending_delete: data.pending_delete || null,
        pending_edit: data.pending_edit || null,
        messagesLeft: data.messages_left,
      };
      setMessages(prev => {
        const next = [...prev, assistantMsg];
        try { localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(next.slice(-20))); } catch { /* quota */ }
        return next;
      });

      if (data.pending_entries?.length) {
        setPendingEntries(data.pending_entries);
        setPendingDelete(null); setPendingEdit(null);
      } else if (data.pending_delete) {
        setPendingDelete(data.pending_delete);
        setPendingEntries(null); setPendingEdit(null);
      } else if (data.pending_edit) {
        setPendingEdit(data.pending_edit);
        setPendingEntries(null); setPendingDelete(null);
      } else {
        setPendingEntries(null); setPendingDelete(null); setPendingEdit(null);
        if ((data.layer === 1 && data.status === "success") ||
            data.status === "deleted" || data.status === "updated") {
          // Bust stale caches so pages show fresh data immediately on next mount
          const BUST_KEYS = [
            "bm_budget_cache", "bm_transactions_cache", "bm_income_cache",
            "bm_emis_cache", "bm_goals_cache", "bm_investments_cache",
            "bm_hand_loans_cache", "bm_recurring_cache",
          ];
          BUST_KEYS.forEach(k => localStorage.removeItem(k));
          window.dispatchEvent(new CustomEvent("chanakya-logged"));
        }
      }
    } catch (err) {
      const status = err?.response?.status;
      const content = status === 429
        ? "We've hit today's message limit. Come back tomorrow!"
        : "Something went sideways on my end. Your data is safe — just try again.";
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: "assistant", content, timestamp: new Date().toISOString(), isError: true }]);
      setPendingEntries(null);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const displayMsgs = searchMode && searchResults !== null ? searchResults : messages;
  const pinnedCount = messages.filter(m => m.pinned).length;

  return (
    <>
      <Navigation />
      <div
        className="h-[calc(100dvh-176px)] lg:h-[calc(100dvh-64px)] flex flex-col overflow-hidden"
        style={{ background: "linear-gradient(180deg,#1a0f05 0%,#2a1508 60%,#1a0f05 100%)" }}
      >
        <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto min-h-0">

          {/* ── Top bar ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0">
            {searchMode ? (
              <>
                <button onClick={() => { setSearchMode(false); setSearchQuery(""); setSearchResults(null); }}
                  className="text-stone-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search messages..."
                  className="flex-1 bg-stone-800/80 text-stone-100 placeholder-stone-500 text-sm px-4 py-2 rounded-xl outline-none border border-stone-700/50"
                />
              </>
            ) : (
              <>
                <ChanakyaDP size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-base font-bold text-stone-100 leading-tight">Chanakya</h1>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  </div>
                  <DynamicSubtitle />
                </div>
                <div className="flex items-center gap-1">
                  {pinnedCount > 0 && (
                    <button onClick={() => setPinnedOpen(o => !o)}
                      className="relative w-8 h-8 rounded-xl hover:bg-stone-800 flex items-center justify-center text-amber-400 transition-colors">
                      <Pin size={16} />
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
                        {pinnedCount}
                      </span>
                    </button>
                  )}
                  <button onClick={() => setSearchMode(true)}
                    className="w-8 h-8 rounded-xl hover:bg-stone-800 flex items-center justify-center text-stone-400 hover:text-stone-200 transition-colors">
                    <Search size={16} />
                  </button>
                  <button onClick={clearChat}
                    className="w-8 h-8 rounded-xl hover:bg-stone-800 flex items-center justify-center text-stone-400 hover:text-rose-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Pinned panel ─────────────────────────────────────────────── */}
          {pinnedOpen && pinned.length > 0 && (
            <div className="mx-4 mb-2 bg-amber-950/40 border border-amber-800/40 rounded-2xl p-3 shrink-0 max-h-36 overflow-y-auto">
              <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1">
                <Pin size={11} /> Pinned
              </p>
              {pinned.map(m => (
                <div key={m.id} className="text-xs text-stone-300 py-1 border-b border-stone-700/30 last:border-0 line-clamp-1">
                  {m.content}
                </div>
              ))}
            </div>
          )}

          {/* ── Search label ─────────────────────────────────────────────── */}
          {searchMode && searchResults !== null && (
            <div className="px-4 mb-1 shrink-0">
              <p className="text-xs text-stone-500">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
            </div>
          )}

          {/* ── Messages ─────────────────────────────────────────────────── */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto scrollbar-none space-y-2 px-4 pb-2 min-h-0 scroll-smooth"
          >
            {loadingMore && (
              <div className="text-center py-2">
                <span className="text-xs text-stone-500">Loading older messages…</span>
              </div>
            )}
            {historyLoading ? (
              <div className="flex justify-center pt-8">
                <TypingDots />
              </div>
            ) : (
              displayMsgs.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  allMessages={messages}
                  onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
                  onPin={togglePin}
                  onDelete={deleteMessage}
                  pendingEntries={pendingEntries}
                  onConfirm={() => { const p = pendingEntries; setPendingEntries(null); sendMessage("yes", p); }}
                  onReject={() => { setPendingEntries(null); setMessages(prev => [...prev, { id: `fix-${Date.now()}`, role: "assistant", content: "Sure — tell me what to change and I'll fix it.", timestamp: new Date().toISOString() }]); }}
                  pendingDelete={pendingDelete}
                  onConfirmDelete={() => { setPendingDelete(null); sendMessage("yes, delete it"); }}
                  onCancelDelete={() => { setPendingDelete(null); sendMessage("no, keep it"); }}
                  pendingEdit={pendingEdit}
                  onConfirmEdit={() => { setPendingEdit(null); sendMessage("yes, update it"); }}
                  onCancelEdit={() => { setPendingEdit(null); sendMessage("no, cancel"); }}
                  isLastAsst={msg.role === "assistant" && msg.id === [...displayMsgs].reverse().find(m => m.role === "assistant")?.id}
                />
              ))
            )}
            {isLoading && (
              <div className="flex gap-2.5">
                <ChanakyaDP size={28} />
                <div className="bg-stone-800/90 border border-stone-700/60 rounded-2xl rounded-tl-sm px-4 py-2.5">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Quick action chips — always visible for all users ────────── */}
          {!activeAction && (
            <div className="px-3 pb-1 pt-0.5 shrink-0 flex gap-2 overflow-x-auto scrollbar-none">
              {QUICK_ACTIONS.map(a => (
                <button
                  key={a.key}
                  onClick={() => setActiveAction(a.key)}
                  style={{ borderColor: "rgba(255,255,255,0.1)", color: "#a8a29e" }}
                  className="text-xs px-3 py-1.5 rounded-full border bg-stone-800/70 whitespace-nowrap shrink-0 flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <a.icon size={11} style={{ color: a.color }} />
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Inline composer — replaces input when chip is active ──────── */}
          {activeAction && (
            <QuickComposer
              action={activeAction}
              onSend={(msg) => { sendMessage(msg); }}
              onClose={() => setActiveAction(null)}
            />
          )}

          {/* ── Reply-to preview ─────────────────────────────────────────── */}
          {replyTo && !activeAction && (
            <div className="mx-4 mb-1 px-3 py-2 bg-stone-800/80 border-l-2 border-amber-500 rounded-r-xl flex items-center gap-2 shrink-0">
              <Reply size={12} className="text-amber-400 shrink-0" />
              <p className="text-xs text-stone-400 truncate flex-1">{replyTo.content}</p>
              <button onClick={() => setReplyTo(null)} className="text-stone-500 hover:text-stone-300">
                <X size={14} />
              </button>
            </div>
          )}

          {/* ── Voice waveform (shown while listening) ───────────────────── */}
          {listening && voiceSupported && (
            <div className="px-4 py-3 shrink-0 flex items-center gap-3 border-t border-stone-700/50 bg-stone-900">
              <div className="flex-1 flex items-center justify-center gap-[5px] h-10">
                {[0.3,0.6,1,0.7,0.45,0.9,0.55,0.8,0.4,0.65].map((delay, i) => (
                  <div key={i} className="bm-voice-bar"
                    style={{
                      animationDelay: `${delay * 0.4}s`,
                      backgroundColor: i % 2 === 0 ? '#f97316' : '#fbbf24',
                    }} />
                ))}
              </div>
              <span className="text-xs font-semibold text-orange-400 shrink-0">Listening…</span>
              <button onClick={toggleVoice}
                className="w-9 h-9 rounded-xl border border-orange-500/40 bg-orange-500/10 text-orange-400 flex items-center justify-center hover:bg-orange-500/20 transition-all active:scale-90 shrink-0">
                <MicOff size={15} />
              </button>
            </div>
          )}

          {/* ── Text input bar (for open-ended questions) ────────────────── */}
          {!activeAction && !listening && (
            <div className="px-3 pb-3 pt-1 shrink-0" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
              <div className="flex items-end gap-2 w-full min-w-0">
                <div className="flex-1 min-w-0 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => { setInput(e.target.value.slice(0, 500)); setIsVoiceInput(false); }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Ask Chanakya anything…"
                    rows={1}
                    maxLength={500}
                    className="w-full resize-none bg-stone-800/90 border border-stone-700/50 text-stone-100 placeholder-stone-500 text-sm rounded-2xl px-4 py-2.5 outline-none focus:border-amber-600/50 transition-colors max-h-28"
                    style={{ lineHeight: "1.5" }}
                    onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 112) + "px"; }}
                  />
                  {input.length > 400 && (
                    <span className={`absolute bottom-1 right-3 text-[10px] ${input.length >= 500 ? "text-rose-400" : "text-stone-500"}`}>
                      {input.length}/500
                    </span>
                  )}
                </div>

                {/* Voice — tap to start, waveform bar replaces input while listening */}
                {voiceSupported && (
                  <button onClick={toggleVoice}
                    className="w-10 h-10 rounded-xl border border-stone-700/50 bg-stone-800 text-stone-400 hover:text-stone-200 flex items-center justify-center shrink-0 transition-all active:scale-90">
                    <Mic size={16} />
                  </button>
                )}

                {/* Send */}
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-95 transition-all shadow-md shadow-orange-500/30">
                  <Send size={15} className="text-white" />
                </button>
              </div>
            </div>
          )}

          {/* Safe-area spacer when composer is shown */}
          {activeAction && (
            <div style={{ height: "max(12px, env(safe-area-inset-bottom))", flexShrink: 0 }} />
          )}

        </div>
      </div>
    </>
  );
};

// ── System notification avatar ─────────────────────────────────────────────────
function SystemAvatar({ size = 28 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.28),
        background: "linear-gradient(135deg,#78350f 0%,#b45309 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, boxShadow: "0 2px 6px rgba(180,83,9,0.4)",
      }}
    >
      <Bell size={Math.round(size * 0.44)} color="#fef3c7" />
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, allMessages, onReply, onPin, onDelete, pendingEntries, onConfirm, onReject, pendingDelete, onConfirmDelete, onCancelDelete, pendingEdit, onConfirmEdit, onCancelEdit, isLastAsst }) {
  const isUser   = msg.role === "user";
  const isSystem = msg.source === "system";
  const replyMsg = msg.reply_to ? allMessages.find(m => m.id === msg.reply_to) : null;

  return (
    <div className={`flex gap-2 group ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {isUser
        ? <div className="w-7 h-7 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles size={13} className="text-white" />
          </div>
        : isSystem
          ? <SystemAvatar size={28} />
          : <ChanakyaDP size={28} />
      }

      {/* Bubble + actions */}
      <div className={`flex flex-col max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Replied-to quote */}
        {replyMsg && (
          <div className="mb-1 px-3 py-1.5 bg-stone-900/60 border-l-2 border-amber-500 rounded-r-xl max-w-full">
            <p className="text-xs text-stone-400 truncate">{replyMsg.content}</p>
          </div>
        )}

        {/* Attachment */}
        {msg.attachment && (
          <div className="mb-1">
            {msg.attachment.type === "image" ? (
              <img
                src={`data:${msg.attachment.mime};base64,${msg.attachment.data}`}
                alt={msg.attachment.name}
                className="max-w-[220px] rounded-xl border border-stone-700/50"
              />
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-stone-800 border border-stone-700/50 rounded-xl">
                <FileText size={16} className="text-rose-400 shrink-0" />
                <span className="text-xs text-stone-300 truncate max-w-[150px]">{msg.attachment.name}</span>
              </div>
            )}
          </div>
        )}

        <div className="relative">
          {/* Bubble */}
          <div className={`px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed ${
            isUser
              ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-tr-sm"
              : msg.isError
                ? "bg-red-950/60 text-red-300 border border-red-800/50 rounded-tl-sm"
                : isSystem
                  ? "bg-amber-950/50 text-amber-100 border border-amber-800/40 rounded-tl-sm"
                  : "bg-stone-800/90 text-stone-100 border border-stone-700/60 rounded-tl-sm"
          }`}>
            {renderMessage(msg.content)}
            {/* Pin indicator */}
            {msg.pinned && <Pin size={10} className="inline ml-1.5 text-amber-400 opacity-70" />}
          </div>

          {/* System badge */}
          {isSystem && (
            <div className="absolute -top-2 left-2 flex items-center gap-1 bg-amber-800/80 rounded-full px-1.5 py-0.5">
              <Bell size={8} className="text-amber-200" />
              <span className="text-[9px] text-amber-200 font-semibold tracking-wide uppercase">Auto</span>
            </div>
          )}

          {/* Hover action row — hidden for system messages */}
          {!isSystem && (
            <div className={`absolute ${isUser ? "right-full mr-1" : "left-full ml-1"} top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-stone-900/90 border border-stone-700/50 rounded-xl px-1 py-0.5`}>
              <ActionBtn icon={Reply}    onClick={() => onReply(msg)} title="Reply" />
              <ActionBtn icon={msg.pinned ? PinOff : Pin} onClick={() => onPin(msg)} title={msg.pinned ? "Unpin" : "Pin"} className="text-amber-400" />
              <ActionBtn icon={Trash2}   onClick={() => onDelete(msg.id)} title="Delete" className="text-rose-400" />
            </div>
          )}
        </div>

        {/* Confirm chips — log entries */}
        {isLastAsst && pendingEntries?.length > 0 && (
          <div className="flex gap-2 mt-2">
            <button onClick={onConfirm} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all">
              <Check size={12} /> Yes, log it
            </button>
            <button onClick={onReject} className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-semibold rounded-xl transition-all">
              <X size={12} /> Fix it
            </button>
          </div>
        )}

        {/* Confirm chips — delete */}
        {isLastAsst && pendingDelete && (
          <div className="flex gap-2 mt-2">
            <button onClick={onConfirmDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-all">
              <Trash2 size={12} /> Yes, delete
            </button>
            <button onClick={onCancelDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-semibold rounded-xl transition-all">
              <X size={12} /> No, keep it
            </button>
          </div>
        )}

        {/* Confirm chips — edit */}
        {isLastAsst && pendingEdit && (
          <div className="flex gap-2 mt-2">
            <button onClick={onConfirmEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition-all">
              <Check size={12} /> Yes, update
            </button>
            <button onClick={onCancelEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-semibold rounded-xl transition-all">
              <X size={12} /> Cancel
            </button>
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-stone-600 mt-0.5 px-1">
          {msg.timestamp ? new Date(
            /Z$|[+-]\d{2}:\d{2}$/.test(msg.timestamp) ? msg.timestamp : msg.timestamp + 'Z'
          ).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ""}
        </span>
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, onClick, title, className = "text-stone-400" }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-6 h-6 rounded-lg flex items-center justify-center hover:bg-stone-700 transition-colors ${className}`}>
      <Icon size={12} />
    </button>
  );
}

export default Chatbot;
