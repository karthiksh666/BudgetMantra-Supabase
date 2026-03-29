import { useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { X, ChevronRight, ChevronLeft, Star, CheckCircle } from "lucide-react";

const FEATURES = [
  "Dashboard",
  "Transactions",
  "Budget Manager",
  "EMI Manager",
  "Gold & Silver Tracker",
  "Savings Goals",
  "Trip Planner",
  "Chanakya AI",
  "Hand Loans",
  "Gift Tracker",
  "Financial Calendar",
  "WhatsApp Integration",
  "Paycheck Tracker",
  "Group Expenses",
];

const CATEGORIES = [
  { key: "praise",          label: "Loving it 🎉",       desc: "Something that works great" },
  { key: "bug",             label: "Found a bug 🐛",      desc: "Something is broken" },
  { key: "feature_request", label: "I wish it had... 💡", desc: "A feature you'd love" },
  { key: "general",         label: "General feedback 💬", desc: "Anything else" },
];

const NPS_LABELS = {
  0: "😫", 1: "😣", 2: "😟", 3: "🙁", 4: "😐",
  5: "😐", 6: "🙂", 7: "😊", 8: "😄", 9: "😁", 10: "🤩",
};

const NPS_COLOR = (n) => {
  if (n <= 3) return "bg-red-500";
  if (n <= 6) return "bg-amber-400";
  return "bg-emerald-500";
};

export default function FeedbackModal({ onClose }) {
  const [step, setStep] = useState(1); // 1=NPS, 2=Features, 3=Category+Text, 4=Done
  const [nps, setNps] = useState(null);
  const [featureRatings, setFeatureRatings] = useState({});
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totalSteps = 3;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/feedback`, {
        nps_score: nps,
        overall_rating: Math.round(nps / 2) || 1,
        category,
        feature_ratings: featureRatings,
        description,
        page: window.location.pathname,
      });
      setStep(4);
    } catch {
      // still show thanks
      setStep(4);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        {step < 4 && (
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="font-bold text-stone-900 text-lg font-['Outfit']">Share your thoughts</h2>
              <p className="text-xs text-stone-400 mt-0.5">Step {step} of {totalSteps}</p>
            </div>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Progress bar */}
        {step < 4 && (
          <div className="h-1 bg-stone-100 mx-5 rounded-full overflow-hidden mb-5">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        )}

        <div className="px-5 pb-5">

          {/* ── Step 1: NPS ── */}
          {step === 1 && (
            <div>
              <p className="text-sm font-semibold text-stone-700 mb-1">
                How likely are you to recommend BudgetMantra to a friend?
              </p>
              <p className="text-xs text-stone-400 mb-5">0 = Not at all · 10 = Absolutely!</p>

              <div className="flex gap-1.5 flex-wrap mb-3">
                {[...Array(11)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setNps(i)}
                    className={`w-[calc(9.09%-4px)] min-w-[30px] aspect-square rounded-xl text-sm font-bold transition-all
                      ${nps === i
                        ? `${NPS_COLOR(i)} text-white scale-110 shadow-lg`
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                  >
                    {i}
                  </button>
                ))}
              </div>

              {nps !== null && (
                <p className="text-center text-2xl mb-4 animate-bounce">{NPS_LABELS[nps]}</p>
              )}

              <div className="flex justify-between text-xs text-stone-400 mb-5">
                <span>😫 Not likely</span>
                <span>Extremely likely 🤩</span>
              </div>

              <button
                disabled={nps === null}
                onClick={() => setStep(2)}
                className="w-full h-11 bg-gradient-to-r from-orange-500 to-orange-600 disabled:opacity-40 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all hover:from-orange-600 hover:to-orange-700"
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}

          {/* ── Step 2: Feature Ratings ── */}
          {step === 2 && (
            <div>
              <p className="text-sm font-semibold text-stone-700 mb-1">Rate the features you've used</p>
              <p className="text-xs text-stone-400 mb-4">Skip any you haven't tried</p>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {FEATURES.map((f) => (
                  <div key={f} className="flex items-center justify-between py-2 border-b border-stone-50">
                    <span className="text-sm text-stone-700">{f}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => setFeatureRatings(r => ({ ...r, [f]: s }))}
                          className={`transition-all ${(featureRatings[f] || 0) >= s ? "text-amber-400 scale-110" : "text-stone-200 hover:text-amber-300"}`}
                        >
                          <Star size={16} fill="currentColor" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 h-11 border border-stone-200 text-stone-600 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors"
                >
                  <ChevronLeft size={15} /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-[2] h-11 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:from-orange-600 hover:to-orange-700 transition-all"
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Category + Text ── */}
          {step === 3 && (
            <div>
              <p className="text-sm font-semibold text-stone-700 mb-3">What's on your mind?</p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      category === c.key
                        ? "border-orange-400 bg-orange-50"
                        : "border-stone-100 hover:border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-stone-800">{c.label}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{c.desc}</p>
                  </button>
                ))}
              </div>

              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={
                  category === "bug" ? "What happened? What did you expect?" :
                  category === "feature_request" ? "Describe the feature you'd love to see..." :
                  category === "praise" ? "Tell us what you love!" :
                  "Anything you'd like to share with us..."
                }
                rows={4}
                className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none focus:border-orange-400 resize-none mb-4"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 h-11 border border-stone-200 text-stone-600 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors"
                >
                  <ChevronLeft size={15} /> Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-[2] h-11 bg-gradient-to-r from-orange-500 to-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:from-orange-600 hover:to-orange-700 transition-all"
                >
                  {submitting ? "Sending..." : "Submit Feedback ✓"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Thank you ── */}
          {step === 4 && (
            <div className="py-6 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 font-['Outfit'] mb-2">Thank you! 🙏</h3>
              <p className="text-sm text-stone-500 mb-6">
                Your feedback helps us build a better BudgetMantra for every Indian household.
              </p>
              <button
                onClick={onClose}
                className="w-full h-11 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold rounded-xl text-sm hover:from-orange-600 hover:to-orange-700 transition-all"
              >
                Done
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
