import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Send, X, Sparkles, TrendingUp, PiggyBank, Lightbulb, CreditCard, Target, Loader2, Minimize2, Maximize2, ChevronRight } from "lucide-react";

const DEFAULT_SUGGESTIONS = [
  { icon: TrendingUp, text: "How can I reduce my EMI burden?" },
  { icon: PiggyBank,  text: "What's the best way to save money?" },
  { icon: Lightbulb, text: "Should I prepay my home loan?" },
  { icon: CreditCard,text: "How do I get out of debt faster?" },
  { icon: Target,    text: "Help me plan for a big purchase" },
];

// Page-specific suggestion chips — mirrors the phone AskChanakya suggestions
const PAGE_SUGGESTIONS = {
  "/budget":       ["How much have I spent this month?", "Which category am I over budget on?", "What is my biggest spending category?"],
  "/transactions": ["What did I spend the most on this month?", "How much did I spend on food?", "What is my average daily spend?"],
  "/income":       ["What is my total income this month?", "How does my income compare to last month?", "How much salary have I received this year?"],
  "/emi":          ["What is my total EMI burden per month?", "Which EMI ends soonest?", "Am I over the 40% EMI-to-income threshold?"],
  "/goals":        ["How many goals do I have?", "Which goal am I closest to completing?", "At my current pace, when will I reach my goals?"],
  "/investments":  ["What is my total portfolio value?", "Which investment has grown the most?", "What percentage of my wealth is in equity?"],
  "/recurring":    ["How many subscriptions do I have?", "What is my total monthly recurring cost?", "Which subscription is most expensive?"],
  "/trips":        ["How much have I spent on trips total?", "Which trip was most expensive?", "What is my trip budget vs actual spend?"],
  "/loans":        ["How much do people owe me in total?", "How much do I owe others?", "Am I net lender or borrower?"],
  "/credit-cards": ["What is my total credit card outstanding?", "Which card has the highest utilization?", "When is my next payment due?"],
  "/group":        ["How many group expenses do I have?", "Who owes me the most across groups?", "What is my total share in group expenses?"],
  "/dashboard":    ["Give me a summary of my finances", "Am I saving enough this month?", "What is my net worth?"],
};

function buildSuggestions(score) {
  if (!score) return DEFAULT_SUGGESTIONS;
  const tips = [];
  if (score.emi_ratio > 50)
    tips.push({ icon: CreditCard, text: `My EMI is ${score.emi_ratio}% of income — how do I fix this?` });
  if (score.savings_rate < 20)
    tips.push({ icon: PiggyBank, text: `I'm only saving ${score.savings_rate}% — how can I do better?` });
  if (score.expense_ratio > 40)
    tips.push({ icon: TrendingUp, text: `My spending is ${score.expense_ratio}% of income — where can I cut?` });
  if (score.free_cash > 0)
    tips.push({ icon: Target, text: `I have ₹${Math.round(score.free_cash / 1000)}K free each month — where should I put it?` });
  if (score.emi_ratio <= 50 && score.savings_rate >= 20)
    tips.push({ icon: Lightbulb, text: "My finances look healthy — what's the next step to grow wealth?" });
  return [...tips, ...DEFAULT_SUGGESTIONS].slice(0, 4);
}

const SEVERITY_COLORS = {
  alert:   { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    dot: "bg-red-500"    },
  warning: { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-500"  },
  info:    { bg: "bg-emerald-50",border: "border-emerald-200",text: "text-emerald-700",dot: "bg-emerald-500" },
};

export default function ChanakyaOverlay() {
  const { user } = useAuth();
  const location = useLocation();
  const isPro = user?.is_pro;
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Namaste! I'm Chanakya 🪙\n\nI'm your AI financial advisor, connected to your actual budget, EMIs, and goals.\n\nWhat would you like help with today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [messagesLeft, setMessagesLeft] = useState(null);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);

  // Proactive nudges
  const [nudges, setNudges] = useState([]);
  const [nudgeIdx, setNudgeIdx] = useState(0);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const nudgeDismissed = useRef(false);
  const nudgeTimer = useRef(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const fetchNudges = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/chanakya/suggestions`);
      if (res.data.suggestions?.length > 0) {
        setNudges(res.data.suggestions);
        setUnread(res.data.suggestions.length);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    axios.get(`${API}/chatbot/usage`).then(res => {
      setMessagesLeft(res.data.remaining);
    }).catch(() => {});
    axios.get(`${API}/financial-score`).then(res => {
      setSuggestions(buildSuggestions(res.data));
    }).catch(() => {});
    fetchNudges();
  }, [user, fetchNudges]);

  // Nudge card only shows when user explicitly clicks the badge — never auto-pops

  // Auto-dismiss nudge after 12s
  useEffect(() => {
    if (!nudgeVisible) return;
    nudgeTimer.current = setTimeout(() => setNudgeVisible(false), 12000);
    return () => clearTimeout(nudgeTimer.current);
  }, [nudgeVisible, nudgeIdx]);

  // Hide nudge when chat opens
  useEffect(() => {
    if (open) setNudgeVisible(false);
  }, [open]);

  // Allow external triggers
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("chanakya:open", handler);
    return () => window.removeEventListener("chanakya:open", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [open, messages]);

  const dismissNudge = () => {
    setNudgeVisible(false);
    nudgeDismissed.current = true;
    clearTimeout(nudgeTimer.current);
  };

  const askNudge = (nudge) => {
    dismissNudge();
    setInput(nudge.chat_query);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const nextNudge = () => {
    setNudgeIdx(i => (i + 1) % nudges.length);
    clearTimeout(nudgeTimer.current);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = { role: "user", content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    try {
      const res = await axios.post(`${API}/chatbot`, {
        message: userMsg.content,
        conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
      });
      const reply = { role: "assistant", content: res.data.response, timestamp: new Date() };
      setMessages(prev => [...prev, reply]);
      if (res.data.messages_left !== null && res.data.messages_left !== undefined) {
        setMessagesLeft(res.data.messages_left);
      }
      if (!open) setUnread(n => n + 1);
    } catch (err) {
      const detail = err.response?.data?.detail || "";
      const errMsg = err.response?.status === 429 && detail.includes("Daily")
        ? "You've used all 10 free messages today. Upgrade to Pro for unlimited access."
        : "I'm having trouble connecting right now. Please try again.";
      setMessages(prev => [...prev, {
        role: "assistant",
        content: errMsg,
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!user) return null;

  const panelW = expanded ? "w-[480px]" : "w-[360px]";
  const panelH = expanded ? "h-[600px]" : "h-[480px]";
  const currentNudge = nudges[nudgeIdx];
  const sev = currentNudge ? (SEVERITY_COLORS[currentNudge.severity] || SEVERITY_COLORS.info) : null;

  return (
    <>
      <style>{`
        @keyframes ck-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ck-pulse {
          0%,100% { box-shadow: 0 4px 20px rgba(249,115,22,0.4); }
          50%      { box-shadow: 0 4px 32px rgba(249,115,22,0.65); }
        }
        @keyframes ck-nudge-in {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ck-panel  { animation: ck-slide-up 0.2s cubic-bezier(0.34,1.56,0.64,1) both; }
        .ck-bubble { animation: ck-pulse 3s ease-in-out infinite; }
        .ck-nudge  { animation: ck-nudge-in 0.25s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>

      {/* ── Proactive nudge card ── */}
      {nudgeVisible && currentNudge && !open && (
        <div className={`ck-nudge fixed bottom-[88px] right-4 lg:bottom-28 lg:right-5 z-[998] w-72 rounded-2xl border shadow-xl p-3.5 ${sev.bg} ${sev.border}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${sev.dot}`} />
              <p className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Chanakya Insight</p>
            </div>
            <button onClick={dismissNudge} className="text-stone-400 hover:text-stone-600 shrink-0">
              <X size={13} />
            </button>
          </div>
          <p className={`text-[13px] font-semibold leading-snug mb-3 ${sev.text}`}>
            {currentNudge.icon} {currentNudge.text}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => askNudge(currentNudge)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-stone-900 text-white text-[11px] font-bold hover:bg-stone-800 transition-colors">
              Ask Chanakya <ChevronRight size={11} />
            </button>
            {nudges.length > 1 && (
              <button
                onClick={nextNudge}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors ${sev.border} ${sev.text} hover:opacity-80`}>
                {nudgeIdx + 1}/{nudges.length}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setUnread(0); }}
          className="ck-bubble fixed bottom-20 right-4 lg:bottom-6 lg:right-5 z-[999] w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95">
          <span className="text-white text-xl font-bold font-['Outfit']">C</span>
          {unread > 0 && nudges.length > 0 && (
            <span
              onClick={e => { e.stopPropagation(); setNudgeVisible(v => !v); }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white cursor-pointer"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div className={`ck-panel fixed bottom-20 right-4 lg:bottom-6 lg:right-5 ${panelW} ${panelH} z-[999] rounded-2xl overflow-hidden shadow-2xl flex flex-col bg-white border border-stone-200`}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0 bg-gradient-to-r from-stone-900 to-stone-800 border-b border-stone-700">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-bold font-['Outfit']">C</span>
              </div>
              <div>
                <p className="text-sm font-bold text-white font-['Outfit']">Chanakya</p>
                <p className="text-[10px] text-stone-400">AI Financial Advisor · Online</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setExpanded(v => !v)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-700 transition-colors">
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-700 transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 p-4 min-h-0 bg-[#fffaf5]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-white text-[10px] font-bold">C</span>
                  </div>
                )}
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-xl bg-stone-700 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] text-white font-bold">{user?.name?.[0]?.toUpperCase() || "U"}</span>
                  </div>
                )}
                <div className={`max-w-[80%] flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className="px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap rounded-2xl"
                    style={msg.role === "user"
                      ? { background: "linear-gradient(135deg, #f97316, #ea6c0a)", color: "#fff", borderRadius: "16px 4px 16px 16px" }
                      : msg.isError
                        ? { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "4px 16px 16px 16px" }
                        : { background: "#fff", color: "#1c1917", border: "1px solid #e7e5e4", borderRadius: "4px 16px 16px 16px" }
                    }>
                    {msg.content}
                  </div>
                  <p className="text-[9px] mt-0.5 text-stone-400">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">C</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-2 text-xs bg-white border border-stone-200 text-stone-500">
                  <Loader2 size={12} className="animate-spin text-orange-500" /> thinking…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 2 && (() => {
            const pageSugs = PAGE_SUGGESTIONS[location.pathname];
            return (
              <div className="px-4 py-2 shrink-0 bg-white border-t border-stone-100">
                <p className="text-[10px] mb-1.5 flex items-center gap-1 text-stone-400 font-medium">
                  <Sparkles size={10} className="text-orange-400" /> Try asking
                </p>
                <div className="flex flex-wrap gap-1">
                  {pageSugs
                    ? pageSugs.slice(0, 3).map((q, idx) => (
                        <button key={idx} onClick={() => { setInput(q); inputRef.current?.focus(); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-orange-50 border border-orange-100 text-stone-700 hover:bg-orange-100 hover:border-orange-200 transition-all">
                          {q}
                        </button>
                      ))
                    : suggestions.slice(0, 3).map((q, idx) => (
                        <button key={idx} onClick={() => { setInput(q.text); inputRef.current?.focus(); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-orange-50 border border-orange-100 text-stone-700 hover:bg-orange-100 hover:border-orange-200 transition-all">
                          <q.icon size={10} className="text-orange-500" /> {q.text}
                        </button>
                      ))
                  }
                </div>
              </div>
            );
          })()}

          {/* Input */}
          <div className="px-3 py-3 shrink-0 bg-white border-t border-stone-100">
            {!isPro && messagesLeft === 0 ? (
              <p className="text-center text-[11px] py-1 text-stone-400">
                Daily limit reached · Resets at midnight
              </p>
            ) : (
              <div className="flex gap-2 items-center">
                <Input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                  placeholder="Ask anything about your finances…"
                  className="flex-1 h-9 rounded-xl text-sm border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 bg-stone-50"
                  disabled={isLoading} />
                <button onClick={handleSend} disabled={isLoading || !input.trim()}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-40 bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-sm shadow-orange-500/25">
                  <Send size={14} className="text-white" />
                </button>
              </div>
            )}
            {!isPro && messagesLeft !== null && messagesLeft > 0 && (
              <p className="text-[10px] text-stone-400 text-right mt-1">{messagesLeft} messages left today</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
