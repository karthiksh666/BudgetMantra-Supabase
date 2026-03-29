import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { Send, X, Sparkles, Paperclip, FileText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

// Render bold / line-breaks from markdown
function renderMsg(text) {
  return text.split("\n").map((line, i, arr) => {
    const parts = line.split(/(\*\*?[^*]+\*\*?)/g).map((p, j) => {
      if (/^\*\*?.+\*\*?$/.test(p)) {
        return <strong key={j} className="font-semibold text-amber-300">{p.replace(/^\*+|\*+$/g, "")}</strong>;
      }
      return <span key={j}>{p}</span>;
    });
    return <span key={i}>{parts}{i < arr.length - 1 && <br />}</span>;
  });
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-2 h-2 rounded-full bg-amber-400 opacity-60"
          style={{ animation: `cw-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      <style>{`@keyframes cw-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}`}</style>
    </div>
  );
}

// Pages where the widget should be hidden (the full chatbot page already covers it)
const HIDDEN_ON = ["/chatbot"];

export default function ChanakyaWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open,       setOpen]       = useState(false);
  const [msgs,       setMsgs]       = useState([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const endRef      = useRef(null);
  const inputRef    = useRef(null);
  const fileRef     = useRef(null);

  const hidden = !user || HIDDEN_ON.some(p => location.pathname.startsWith(p));

  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    setMsgs(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/chatbot`, { message: msg }, auth());
      setMsgs(prev => [...prev, { role: "assistant", content: res.data.response || "Done!" }]);
    } catch {
      setMsgs(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't reach Chanakya. Try again." }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handlePDFUpload = useCallback(async (file) => {
    if (!file || !file.name.endsWith(".pdf")) return;
    setUploading(true);
    setMsgs(prev => [...prev,
      { role: "user", content: `📎 ${file.name}` },
      { role: "assistant", content: "⏳ Parsing your statement… I'll let you know when it's ready to review.", type: "parsing" },
    ]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("pdf_password", "");
      const res = await axios.post(`${API}/upi/parse-pdf`, formData, auth());
      const jobId = res.data?.job_id;
      if (!jobId) throw new Error("no job");

      // Poll
      let attempts = 0;
      const poll = async () => {
        try {
          const r = await axios.get(`${API}/upi/parse-pdf/${jobId}`, auth());
          if (r.data.status === "processing" && attempts++ < 30) { setTimeout(poll, 1500); return; }
          const count = (r.data.result || []).length;
          setMsgs(prev => prev.map(m =>
            m.type === "parsing"
              ? { role: "assistant", content: `✅ Found **${count} transactions** in your statement!`, type: "done", jobId }
              : m
          ));
        } catch (e) {
          const isPwErr = e.response?.status === 422 && e.response?.data?.detail === "password_required";
          setMsgs(prev => prev.map(m =>
            m.type === "parsing"
              ? { role: "assistant", content: isPwErr
                  ? "🔒 This PDF is password-protected. Please open it on the Statements page to enter the password."
                  : "❌ Couldn't parse this PDF. Try uploading on the Statements page for more options.",
                type: "error" }
              : m
          ));
        } finally {
          setUploading(false);
        }
      };
      poll();
    } catch {
      setUploading(false);
      setMsgs(prev => prev.map(m =>
        m.type === "parsing"
          ? { role: "assistant", content: "❌ Upload failed. Try again.", type: "error" }
          : m
      ));
    }
  }, []);

  // Fetch unread import notifications when widget opens
  useEffect(() => {
    if (!open) return;
    axios.get(`${API}/notifications/unread`, auth())
      .then(res => {
        if (res.data?.length > 0) {
          const notifMsgs = res.data.map(n => ({
            role: "assistant",
            content: `🎉 ${n.message}`,
            type: "notification",
          }));
          setMsgs(prev => prev.length === 0 ? notifMsgs : [...notifMsgs, ...prev]);
        }
      })
      .catch(() => {});
  }, [open]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  if (hidden) return null;

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(135deg,#92400e 0%,#b45309 40%,#d97706 100%)" }}
          title="Ask Chanakya"
        >
          <span className="text-2xl font-black text-amber-100 leading-none">₹</span>
        </button>
      )}

      {/* Chat drawer */}
      {open && (
        <div
          className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: 340, height: 480, background: "#1c1917", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#78350f 0%,#92400e 50%,#b45309 100%)" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(0,0,0,0.25)" }}>
              <span className="text-lg font-black text-amber-100 leading-none">₹</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-100 leading-tight">Chanakya</p>
              <p className="text-[10px] text-amber-300 opacity-80">Your money advisor</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setOpen(false)} className="text-amber-200 opacity-70 hover:opacity-100 p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 scrollbar-thin scrollbar-thumb-stone-700">
            {msgs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                <Sparkles size={28} className="text-amber-400 opacity-60" />
                <p className="text-sm text-stone-400 leading-relaxed">
                  Hi! Tell me what you spent, ask about your finances, or set a goal.
                </p>
                <div className="flex flex-col gap-1.5 w-full">
                  {["spent 500 on swiggy", "salary 89000", "how much did I save?"].map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="text-xs text-amber-400 bg-stone-800 hover:bg-stone-700 rounded-xl px-3 py-2 transition-colors text-left">
                      {s}
                    </button>
                  ))}
                  <button onClick={() => fileRef.current?.click()}
                    className="text-xs text-violet-400 bg-stone-800 hover:bg-stone-700 rounded-xl px-3 py-2 transition-colors text-left flex items-center gap-2">
                    <Paperclip size={12} /> Upload bank statement PDF
                  </button>
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-amber-600 text-white rounded-br-sm px-3 py-2"
                    : m.type === "parsing"
                    ? "bg-stone-800 text-stone-300 rounded-bl-sm px-3 py-2 flex items-center gap-2"
                    : "bg-stone-800 text-stone-100 rounded-bl-sm px-3 py-2"
                }`}>
                  {m.type === "parsing"
                    ? <><span className="inline-block animate-spin mr-1">⏳</span>{m.content}</>
                    : m.type === "done"
                    ? <div className="flex flex-col gap-2">
                        <span>{renderMsg(m.content)}</span>
                        <button
                          onClick={() => { setOpen(false); navigate("/data"); }}
                          className="text-xs font-bold text-amber-300 bg-amber-900/40 hover:bg-amber-900/60 rounded-xl px-3 py-1.5 transition-colors text-center">
                          Review on Statements →
                        </button>
                      </div>
                    : m.role === "assistant" ? renderMsg(m.content) : m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-stone-800 rounded-2xl rounded-bl-sm px-3 py-2">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-3 py-2.5 border-t border-stone-800 flex gap-2 items-center">
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handlePDFUpload(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading || loading}
              className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 text-stone-400 hover:text-violet-400 hover:bg-stone-800 transition-colors disabled:opacity-30"
              title="Upload statement PDF">
              {uploading ? <FileText size={15} className="animate-pulse text-violet-400" /> : <Paperclip size={15} />}
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask Chanakya…"
              className="flex-1 bg-stone-800 text-stone-100 placeholder-stone-500 text-sm rounded-xl px-3 py-2 outline-none border border-stone-700 focus:border-amber-600 transition-colors"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#b45309,#d97706)" }}
            >
              <Send size={15} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
