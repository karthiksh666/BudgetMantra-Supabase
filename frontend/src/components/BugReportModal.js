import { useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { X, Bug, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const SEVERITIES = [
  { key: "blocking", label: "Blocking", desc: "App crashes / can't use it", color: "bg-red-100 text-red-700 border-red-200" },
  { key: "high",     label: "High",     desc: "Major feature broken",       color: "bg-orange-100 text-orange-700 border-orange-200" },
  { key: "medium",   label: "Medium",   desc: "Annoying but workaround exists", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { key: "low",      label: "Low",      desc: "Minor cosmetic issue",       color: "bg-blue-100 text-blue-700 border-blue-200" },
];

export default function BugReportModal({ onClose }) {
  const [form, setForm] = useState({
    bug_title: "",
    description: "",
    steps_to_reproduce: "",
    severity: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const browserInfo = `${navigator.userAgent.slice(0, 120)} | ${window.innerWidth}×${window.innerHeight}`;

  const handleSubmit = async () => {
    if (!form.bug_title.trim()) { toast.error("Please enter a bug title"); return; }
    if (!form.severity) { toast.error("Please select a severity level"); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/feedback`, {
        nps_score: null,
        overall_rating: 0,
        category: "bug",
        description: form.description,
        page: window.location.pathname,
        bug_title: form.bug_title,
        severity: form.severity,
        steps_to_reproduce: form.steps_to_reproduce,
        browser_info: browserInfo,
        status: "open",
      });
      setDone(true);
    } catch {
      toast.error("Failed to submit — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">

        {done ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-stone-900 font-['Outfit'] mb-2">Bug reported!</h2>
            <p className="text-sm text-stone-500 mb-6">Thanks for helping us improve. We'll look into it and fix it as soon as possible.</p>
            <button onClick={onClose} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center">
                  <Bug size={16} className="text-red-500" />
                </div>
                <div>
                  <h2 className="font-bold text-stone-900 text-base font-['Outfit']">Report a Bug</h2>
                  <p className="text-xs text-stone-400">Help us fix what's broken</p>
                </div>
              </div>
              <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-4">

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">What's the bug? <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Gold tracker shows wrong value"
                  value={form.bug_title}
                  onChange={e => setForm(f => ({ ...f, bug_title: e.target.value }))}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-xl px-3 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">How bad is it? <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {SEVERITIES.map(s => (
                    <button key={s.key} onClick={() => setForm(f => ({ ...f, severity: s.key }))}
                      className={`text-left p-2.5 rounded-xl border text-xs font-semibold transition-all ${form.severity === s.key ? s.color + ' ring-2 ring-offset-1 ring-current' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}>
                      <div className="font-bold">{s.label}</div>
                      <div className="font-normal opacity-80 mt-0.5">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">What happened?</label>
                <textarea
                  rows={3}
                  placeholder="Describe what you saw vs what you expected..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-orange-400"
                />
              </div>

              {/* Steps */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">Steps to reproduce (optional)</label>
                <textarea
                  rows={3}
                  placeholder={"1. Go to Gold Tracker\n2. Click Add Item\n3. See error"}
                  value={form.steps_to_reproduce}
                  onChange={e => setForm(f => ({ ...f, steps_to_reproduce: e.target.value }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-orange-400 font-mono text-xs"
                />
              </div>

              {/* Auto info */}
              <div className="bg-stone-50 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={13} className="text-stone-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  <strong>Auto-captured:</strong> Page — <code className="bg-stone-200 px-1 rounded">{window.location.pathname}</code>, browser & screen size. This helps us reproduce the bug faster.
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-2">
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                <Bug size={15} />
                {submitting ? "Submitting…" : "Submit Bug Report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
