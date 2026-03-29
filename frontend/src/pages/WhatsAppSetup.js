import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { MessageCircle, UserCheck, Send, Sparkles, ExternalLink, Phone, Copy, CheckCheck } from "lucide-react";
import { toast } from "sonner";

const TWILIO_NUMBER    = "+1 (415) 523-8886";
const JOIN_CODE        = "join spring-branch";
const WA_JOIN_LINK     = `https://wa.me/14155238886?text=${encodeURIComponent(JOIN_CODE)}`;
const WA_CHAT_LINK     = `https://wa.me/14155238886?text=${encodeURIComponent("Hi Chanakya")}`;

const COMMANDS = [
  { emoji: "💸", cmd: "add 500 swiggy",         desc: "Log an expense — Chanakya picks the right category automatically" },
  { emoji: "📊", cmd: "dashboard",               desc: "See your monthly income, spending, and free cash" },
  { emoji: "🎯", cmd: "goals",                   desc: "Check your savings goals progress" },
  { emoji: "📅", cmd: "upcoming bills",          desc: "See recurring bills due this week" },
  { emoji: "✏️", cmd: "update 450",              desc: "Fix the last expense you added" },
  { emoji: "💬", cmd: "how am I doing?",         desc: "Get personalised financial advice from Chanakya" },
];

const WhatsAppSetup = () => {
  const { user } = useAuth();
  const phone     = user?.phone;
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(JOIN_CODE).then(() => {
      setCopied(true);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-[#fffaf5]">
        <div className="max-w-2xl mx-auto px-4 lg:px-6 py-8 space-y-5">

          {/* ── Header ── */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-500 rounded-2xl flex items-center justify-center shadow-md shadow-green-300/40">
              <MessageCircle size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900 font-['Outfit']">WhatsApp with Chanakya</h1>
              <p className="text-stone-400 text-sm mt-0.5">Manage your finances without opening the app</p>
            </div>
          </div>

          {/* ── Phone status ── */}
          <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
            phone ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
          }`}>
            <div className={`p-2.5 rounded-xl shrink-0 ${phone ? "bg-green-100" : "bg-amber-100"}`}>
              <Phone size={18} className={phone ? "text-green-600" : "text-amber-600"} />
            </div>
            <div className="flex-1 min-w-0">
              {phone ? (
                <>
                  <p className="font-semibold text-green-700 text-sm">Phone number linked</p>
                  <p className="text-green-600 text-xs mt-0.5">{phone}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-amber-700 text-sm">No phone number saved</p>
                  <p className="text-amber-600 text-xs mt-0.5">Add your number in Profile to receive Chanakya's replies.</p>
                </>
              )}
            </div>
            <Link to="/profile"
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                phone ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-amber-500 text-white hover:bg-amber-600"
              }`}>
              {phone ? "Update" : "Add now"}
            </Link>
          </div>

          {/* ── Step 1 — Join sandbox ── */}
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</div>
              <p className="font-bold text-stone-800">Activate the WhatsApp sandbox</p>
            </div>
            <p className="text-stone-500 text-sm mb-4 leading-relaxed">
              Send the message below to <span className="font-semibold text-stone-700">{TWILIO_NUMBER}</span> on WhatsApp.
              You only need to do this once — it unlocks the sandbox so Chanakya can reply to you.
            </p>

            {/* Join code block */}
            <div className="bg-stone-900 rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-stone-400 text-[10px] uppercase tracking-widest mb-1">Send this exact message</p>
                <p className="text-green-400 font-mono font-bold text-lg">{JOIN_CODE}</p>
              </div>
              <button onClick={copyCode}
                className="flex items-center gap-1.5 bg-stone-700 hover:bg-stone-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors shrink-0">
                {copied ? <CheckCheck size={14} className="text-green-400" /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <a href={WA_JOIN_LINK} target="_blank" rel="noopener noreferrer">
              <Button className="w-full h-11 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-md shadow-green-300/40 text-white font-semibold">
                <MessageCircle size={16} className="mr-2" />
                Send "join spring-branch" on WhatsApp
                <ExternalLink size={12} className="ml-2 opacity-70" />
              </Button>
            </a>
            <p className="text-center text-stone-400 text-xs mt-2">Opens WhatsApp with the message pre-filled</p>
          </div>

          {/* ── Step 2 — Start chatting ── */}
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-stone-800 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</div>
              <p className="font-bold text-stone-800">Start chatting with Chanakya</p>
            </div>
            <p className="text-stone-500 text-sm mb-4">
              Once the sandbox is active, send any of these messages to {TWILIO_NUMBER}:
            </p>
            <div className="space-y-2 mb-4">
              {COMMANDS.map(({ emoji, cmd, desc }) => (
                <div key={cmd} className="flex items-start gap-3 bg-stone-50 rounded-xl px-3 py-2.5">
                  <span className="text-lg shrink-0 mt-0.5">{emoji}</span>
                  <div>
                    <p className="font-mono text-sm font-semibold text-stone-800">{cmd}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <a href={WA_CHAT_LINK} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full h-11 border-green-300 text-green-700 hover:bg-green-50">
                <MessageCircle size={16} className="mr-2" />
                Open WhatsApp chat
                <ExternalLink size={12} className="ml-2 opacity-70" />
              </Button>
            </a>
          </div>

          {/* ── Pro note ── */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={15} className="text-amber-600" />
              <p className="font-semibold text-amber-700 text-sm">Premium feature</p>
            </div>
            <p className="text-amber-600 text-xs leading-relaxed">
              WhatsApp integration is available on Budget Mantra Pro. Upgrade to unlock expense logging,
              dashboard summaries, goal tracking and personalised AI advice — all without opening the app.
            </p>
          </div>

        </div>
      </div>
    </>
  );
};

export default WhatsAppSetup;
