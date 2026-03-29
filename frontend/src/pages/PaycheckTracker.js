import { useState, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { useStaleData } from "@/hooks/useStaleData";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  IndianRupee, Sparkles, Trophy, TrendingUp,
  RefreshCw, Edit3, Trash2, Building2, Plus, Clock,
  ChevronDown, ChevronUp, Briefcase, Receipt, History
} from "lucide-react";
import { MonthPicker } from "@/components/MonthPicker";

const today = new Date();
const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtMo(ym) {
  if (!ym) return "";
  const [yr, mo] = ym.split("-");
  return `${MONTHS[parseInt(mo)-1]} ${yr}`;
}

const EMPTY_PAYSLIP = {
  month: currentYM, employer: "", ctc_annual: "", gross_monthly: "",
  basic: "", hra: "", tds: "", pf_employee: "", pf_employer: "",
  professional_tax: "", other_deductions: "", net_take_home: "", notes: "",
};

const fmtINR = (n) => `₹${Math.round(Math.abs(n || 0)).toLocaleString("en-IN")}`;
const fmtShort = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000)     return `₹${(abs / 1000).toFixed(1)}K`;
  return `₹${abs.toLocaleString("en-IN")}`;
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtMonth(ym) {
  if (!ym) return "Present";
  const [yr, mo] = ym.split("-");
  return `${MONTH_NAMES[parseInt(mo) - 1]} ${yr}`;
}

function monthsBetween(start, end) {
  if (!start) return 0;
  const [sy, sm] = start.split("-").map(Number);
  const now = new Date();
  const [ey, em] = end ? end.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  return (ey - sy) * 12 + (em - sm) + 1;
}

function durationLabel(start, end) {
  const months = monthsBetween(start, end);
  if (months < 12) return `${months} mo`;
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${yrs}y ${rem}m` : `${yrs} yr${yrs > 1 ? "s" : ""}`;
}

const EMPTY_FORM = {
  employer: "", role: "", start_month: "", end_month: "",
  net_take_home: "", ctc_annual: "", gross_monthly: "", tds: "", pf_employee: "", notes: "",
};

const ACCENT_COLORS = [
  { bg: "from-blue-500 to-indigo-600",    light: "bg-blue-50 border-blue-200",    dot: "bg-blue-500",    text: "text-blue-700"   },
  { bg: "from-violet-500 to-purple-600",  light: "bg-violet-50 border-violet-200",dot: "bg-violet-500",  text: "text-violet-700" },
  { bg: "from-emerald-500 to-teal-600",   light: "bg-emerald-50 border-emerald-200",dot:"bg-emerald-500",text: "text-emerald-700"},
  { bg: "from-amber-500 to-orange-600",   light: "bg-amber-50 border-amber-200",  dot: "bg-amber-500",   text: "text-amber-700"  },
  { bg: "from-rose-500 to-pink-600",      light: "bg-rose-50 border-rose-200",    dot: "bg-rose-500",    text: "text-rose-700"   },
];

export default function PaycheckTracker() {
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showOptional, setShowOptional] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Monthly payslip state
  const [showPayslipDialog, setShowPayslipDialog] = useState(false);
  const [payslipForm, setPayslipForm] = useState(EMPTY_PAYSLIP);
  const [payslipMode, setPayslipMode] = useState('single'); // 'single' | 'range'
  const [rangeEnd, setRangeEnd] = useState('');
  const [savingPayslip, setSavingPayslip] = useState(false);
  const [showPayslipHistory, setShowPayslipHistory] = useState(false);
  const [deletePayslipMonth, setDeletePayslipMonth] = useState(null);

  const fetchJobs = useCallback(async () => {
    const res = await axios.get(`${API}/jobs`);
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const fetchPayslips = useCallback(async () => {
    const res = await axios.get(`${API}/paychecks`);
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const { data: jobs, loading: jobsLoading, reload: reloadJobs } = useStaleData(
    "bm_jobs_cache",
    fetchJobs,
    { errorMsg: "Failed to load jobs", fallback: [] }
  );

  const { data: payslips, loading: payslipsLoading, reload: reloadPayslips } = useStaleData(
    "bm_paychecks_cache",
    fetchPayslips,
    { errorMsg: "Failed to load payslips", fallback: [] }
  );

  const loading = jobsLoading || payslipsLoading;

  const fetchData = useCallback(() => {
    reloadJobs();
    reloadPayslips();
  }, [reloadJobs, reloadPayslips]);

  // Generate array of YYYY-MM strings between start and end inclusive
  const monthsBetweenRange = (start, end) => {
    const months = [];
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m > 12) { m = 1; y++; }
    }
    return months;
  };

  const handleSavePayslip = async () => {
    if (!payslipForm.month || !payslipForm.net_take_home) { toast.error("Month and take-home are required"); return; }
    if (payslipMode === 'range' && (!rangeEnd || rangeEnd < payslipForm.month)) { toast.error("End month must be after start month"); return; }
    setSavingPayslip(true);
    try {
      const basePayload = {
        employer: payslipForm.employer || "",
        ctc_annual: parseFloat(payslipForm.ctc_annual) || 0,
        gross_monthly: parseFloat(payslipForm.gross_monthly) || 0,
        basic: parseFloat(payslipForm.basic) || 0,
        hra: parseFloat(payslipForm.hra) || 0,
        tds: parseFloat(payslipForm.tds) || 0,
        pf_employee: parseFloat(payslipForm.pf_employee) || 0,
        pf_employer: parseFloat(payslipForm.pf_employer) || 0,
        professional_tax: parseFloat(payslipForm.professional_tax) || 0,
        other_deductions: parseFloat(payslipForm.other_deductions) || 0,
        net_take_home: parseFloat(payslipForm.net_take_home) || 0,
        notes: payslipForm.notes || "",
      };
      const months = payslipMode === 'range'
        ? monthsBetweenRange(payslipForm.month, rangeEnd)
        : [payslipForm.month];
      await Promise.all(months.map(month => axios.post(`${API}/paychecks`, { ...basePayload, month })));
      toast.success(months.length > 1 ? `${months.length} payslips saved!` : "Payslip saved!");
      setShowPayslipDialog(false);
      setPayslipForm(EMPTY_PAYSLIP);
      setPayslipMode('single');
      setRangeEnd('');
      await fetchData();
    } catch (e) { toast.error(e.response?.data?.detail?.message || e.response?.data?.detail || "Could not save payslip"); }
    finally { setSavingPayslip(false); }
  };

  const handleDeletePayslip = async () => {
    try {
      await axios.delete(`${API}/paychecks/${deletePayslipMonth}`);
      setDeletePayslipMonth(null);
      await fetchData();
      toast.success("Payslip removed");
    } catch { toast.error("Could not delete"); }
  };


  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setShowOptional(false); setShowDialog(true); };
  const openEdit = (job) => {
    setForm({
      employer: job.employer || "", role: job.role || "",
      start_month: job.start_month || "", end_month: job.end_month || "",
      net_take_home: job.net_take_home || "", ctc_annual: job.ctc_annual || "",
      gross_monthly: job.gross_monthly || "", tds: job.tds || "",
      pf_employee: job.pf_employee || "", notes: job.notes || "",
    });
    setEditId(job.id);
    setShowOptional(false);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.employer || !form.start_month || !form.net_take_home) {
      toast.error("Company, start month and take-home are required"); return;
    }
    setSaving(true);
    try {
      const payload = {
        employer: form.employer, role: form.role, start_month: form.start_month,
        end_month: form.end_month,
        net_take_home: parseFloat(form.net_take_home) || 0,
        ctc_annual: parseFloat(form.ctc_annual) || 0,
        gross_monthly: parseFloat(form.gross_monthly) || 0,
        tds: parseFloat(form.tds) || 0,
        pf_employee: parseFloat(form.pf_employee) || 0,
        notes: form.notes,
      };
      if (editId) {
        await axios.put(`${API}/jobs/${editId}`, payload);
        toast.success("Updated!");
      } else {
        await axios.post(`${API}/jobs`, payload);
        toast.success("Job added to your career history 🎉");
      }
      setShowDialog(false);
      await fetchData();
    } catch (e) { toast.error(e.response?.data?.detail?.message || e.response?.data?.detail || "Could not save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/jobs/${deleteId}`);
      setDeleteId(null);
      await fetchData();
      toast.success("Removed");
    } catch { toast.error("Could not delete"); }
  };

  const sorted = [...jobs].sort((a, b) => a.start_month.localeCompare(b.start_month));
  const currentJob = sorted.find(j => !j.end_month);
  const current = currentJob || (sorted.length > 0 ? sorted[sorted.length - 1] : null);
  const totalMonths = sorted.reduce((s, j) => s + monthsBetween(j.start_month, j.end_month), 0);
  const totalEarnings = sorted.reduce((s, j) => s + j.net_take_home * monthsBetween(j.start_month, j.end_month), 0);
  const highestSalary = sorted.reduce((m, j) => Math.max(m, j.net_take_home), 0);

  if (loading) return (
    <div className="min-h-screen bg-[#fffaf5]">
      <Navigation />
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-amber-500" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-[#fffaf5] to-violet-50">
      <Navigation />
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24 lg:py-8 lg:pb-8 space-y-5">

        {/* Hero */}
        <div className="bm-hero relative bg-gradient-to-br from-amber-500 via-orange-500 to-violet-600 rounded-3xl p-6 text-white overflow-hidden shadow-xl shadow-orange-500/20" style={{ backgroundSize: "200% 200%" }}>
          <div className="bm-orb bm-orb-1" style={{ width: 200, height: 200, background: "rgba(255,255,255,0.08)", top: -60, right: -50 }} />
          <div className="bm-orb bm-orb-2" style={{ width: 140, height: 140, background: "rgba(139,92,246,0.25)", bottom: -40, left: -20 }} />
          <div className="bm-orb bm-orb-3" style={{ width: 80, height: 80, background: "rgba(251,191,36,0.2)", top: 20, left: "45%" }} />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Briefcase size={15} className="text-amber-200" />
                <span className="text-amber-200 text-sm font-medium">Career History</span>
              </div>
              {current ? (
                <>
                  <p className="text-3xl font-black font-['Outfit'] tracking-tight">{fmtINR(current.net_take_home)}<span className="text-lg font-semibold opacity-70">/mo</span></p>
                  <p className="text-orange-100 text-sm mt-0.5">{current.employer} · {current.role || "Current Job"}</p>
                  <p className="text-orange-200 text-xs mt-0.5">Since {fmtMonth(current.start_month)}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black font-['Outfit'] text-white/80">No job added yet</p>
                  <p className="text-orange-100 text-sm mt-1">Track your take-home salary & career growth</p>
                  <div className="flex gap-2 mt-3">
                    <div className="bg-white/10 rounded-lg px-3 py-1.5 text-center">
                      <p className="text-white/40 text-[10px]">Take-home</p>
                      <p className="text-white/60 text-xs font-bold">₹ —</p>
                    </div>
                    <div className="bg-white/10 rounded-lg px-3 py-1.5 text-center">
                      <p className="text-white/40 text-[10px]">CTC/yr</p>
                      <p className="text-white/60 text-xs font-bold">₹ —</p>
                    </div>
                    <div className="bg-white/10 rounded-lg px-3 py-1.5 text-center">
                      <p className="text-white/40 text-[10px]">Since</p>
                      <p className="text-white/60 text-xs font-bold">— —</p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <Trophy size={22} className="text-white" />
            </div>
          </div>
          <div className="relative z-10 mt-4">
            <Button onClick={openAdd}
              className="bg-white text-orange-600 hover:bg-orange-50 font-semibold rounded-xl shadow-md text-sm">
              <Plus size={14} className="mr-1.5" /> Add Job
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Career earnings", value: fmtShort(totalEarnings), icon: IndianRupee, accent: "amber" },
              { label: "Highest take-home", value: fmtShort(highestSalary), icon: TrendingUp, accent: "emerald" },
              { label: "Total tenure", value: durationLabel("2000-01", `2000-${String(totalMonths % 12 || 12).padStart(2,"0")}`).replace("2000","").replace("-","") + ` (${Math.floor(totalMonths/12)}y ${totalMonths%12}m)`, icon: Clock, accent: "violet" },
            ].map(({ label, value, icon: Icon, accent }) => (
              <div key={label} className={`bg-white rounded-2xl p-4 border shadow-sm border-${accent}-100`}>
                <div className={`w-7 h-7 rounded-xl bg-${accent}-100 flex items-center justify-center mb-2`}>
                  <Icon size={13} className={`text-${accent}-600`} />
                </div>
                <p className="text-xs text-stone-500">{label}</p>
                <p className="text-sm font-bold text-stone-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Career timeline */}
        {sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-100 p-12 text-center shadow-sm">
            <div className="text-5xl mb-4">💼</div>
            <h3 className="text-lg font-semibold text-stone-800 mb-2">Add your career story</h3>
            <p className="text-stone-500 text-sm mb-6 max-w-xs mx-auto">
              Add each company you've worked at — start date, end date, and take-home salary. That's all it takes.
            </p>
            <Button onClick={openAdd}
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl">
              <Plus size={15} className="mr-1.5" /> Add your first job
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase size={14} className="text-amber-500" />
                <h2 className="font-semibold text-stone-800 text-sm">Career Timeline</h2>
              </div>
              <span className="text-xs text-stone-400">{sorted.length} job{sorted.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="px-5 py-5">
              <div className="relative">
                {/* Vertical connecting line */}
                <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-gradient-to-b from-amber-300 via-violet-300 to-transparent" />

                <div className="space-y-0">
                  {[...sorted].reverse().map((job, idx, arr) => {
                    const color = ACCENT_COLORS[(arr.length - 1 - idx) % ACCENT_COLORS.length];
                    const isCurrent = !job.end_month;
                    return (
                      <div key={job.id} className="relative flex gap-4 pb-6 last:pb-0">
                        {/* Timeline node */}
                        <div className="relative z-10 shrink-0 flex flex-col items-center" style={{ width: 40 }}>
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center shadow-md`}>
                            <Building2 size={15} className="text-white" />
                          </div>
                          {isCurrent && (
                            <span className="mt-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          )}
                        </div>

                        {/* Card */}
                        <div className="flex-1 min-w-0 bg-stone-50 rounded-2xl p-4 border border-stone-100 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-stone-900 text-sm leading-snug">{job.employer}</p>
                                {isCurrent && (
                                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">● Now</span>
                                )}
                              </div>
                              {job.role && (
                                <p className="text-xs font-medium text-stone-600 mt-0.5">{job.role}</p>
                              )}
                              <p className="text-xs text-stone-400 mt-1 flex items-center gap-1.5">
                                <span>{fmtMonth(job.start_month)}</span>
                                <span className="text-stone-300">→</span>
                                <span>{isCurrent ? "Present" : fmtMonth(job.end_month)}</span>
                                <span className="text-stone-300 mx-0.5">·</span>
                                <span className="font-medium text-stone-500">{durationLabel(job.start_month, job.end_month)}</span>
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0 -mt-0.5">
                              <button onClick={() => openEdit(job)}
                                className="p-1.5 text-stone-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50">
                                <Edit3 size={12} />
                              </button>
                              <button onClick={() => setDeleteId(job.id)}
                                className="p-1.5 text-stone-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Salary + extras */}
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${color.light} ${color.text}`}>
                              {fmtINR(job.net_take_home)}/mo take-home
                            </span>
                            {job.ctc_annual > 0 && (
                              <span className="text-[11px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">CTC {fmtShort(job.ctc_annual)}/yr</span>
                            )}
                            {job.tds > 0 && (
                              <span className="text-[11px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">TDS {fmtINR(job.tds)}</span>
                            )}
                          </div>
                          {job.notes && <p className="text-xs text-stone-500 mt-2 italic opacity-70">{job.notes}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Monthly Payslips Section ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-violet-500" />
              <h2 className="font-semibold text-stone-800 text-sm">Monthly Payslips</h2>
              <span className="text-[10px] text-stone-400 bg-stone-100 rounded-full px-2 py-0.5">Detailed</span>
            </div>
            <div className="flex items-center gap-2">
              {payslips.length > 0 && (
                <button onClick={() => setShowPayslipHistory(v => !v)}
                  className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1">
                  <History size={12} /> {showPayslipHistory ? "Hide" : `View all (${payslips.length})`}
                </button>
              )}
              <Button onClick={() => { setPayslipForm(EMPTY_PAYSLIP); setShowPayslipDialog(true); }}
                className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs h-8 px-3">
                <Plus size={12} className="mr-1" /> Add Payslip
              </Button>
            </div>
          </div>
          {payslips.length === 0 ? (
            <div className="p-6 text-center">
              <Receipt size={28} className="text-stone-200 mx-auto mb-2" />
              <p className="text-stone-400 text-sm">No monthly payslips yet</p>
              <p className="text-stone-400 text-xs mt-1">Add detailed payslip data — CTC, gross, TDS, PF, and every deduction</p>
            </div>
          ) : (
            <div>
              {/* Latest payslip preview */}
              {!showPayslipHistory && (() => {
                const latest = [...payslips].sort((a, b) => b.month.localeCompare(a.month))[0];
                return (
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-stone-800 text-sm">{fmtMo(latest.month)}</p>
                        {latest.employer && <p className="text-xs text-stone-400">{latest.employer}</p>}
                      </div>
                      <span className="text-lg font-black text-emerald-700 font-['Outfit']">{fmtINR(latest.net_take_home)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ["Gross", latest.gross_monthly, "bg-blue-50 text-blue-700"],
                        ["TDS", latest.tds, "bg-red-50 text-red-700"],
                        ["PF", (latest.pf_employee||0)+(latest.pf_employer||0), "bg-amber-50 text-amber-700"],
                        ["Basic", latest.basic, "bg-stone-50 text-stone-600"],
                        ["HRA", latest.hra, "bg-stone-50 text-stone-600"],
                        ["PT", latest.professional_tax, "bg-stone-50 text-stone-600"],
                      ].filter(([,v]) => v > 0).map(([l,v,cls]) => (
                        <div key={l} className={`rounded-xl p-2.5 ${cls}`}>
                          <p className="text-[10px] opacity-70">{l}</p>
                          <p className="text-xs font-bold">{fmtINR(v)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {/* Full history */}
              {showPayslipHistory && (
                <div className="divide-y divide-stone-50">
                  {[...payslips].sort((a, b) => b.month.localeCompare(a.month)).map(ps => (
                    <div key={ps.month} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-stone-800">{fmtMo(ps.month)}</p>
                        <p className="text-xs text-stone-400">{ps.employer || ""} · Gross {fmtINR(ps.gross_monthly)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-emerald-700">{fmtINR(ps.net_take_home)}</span>
                        <button onClick={() => setDeletePayslipMonth(ps.month)}
                          className="p-1.5 text-stone-300 hover:text-red-500 transition-colors rounded-lg">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Payslip Dialog ──────────────────────────────────── */}
      <Dialog open={showPayslipDialog} onOpenChange={setShowPayslipDialog}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-['Outfit'] flex items-center gap-2">
              <Receipt size={18} className="text-violet-500" /> Add Monthly Payslip
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-sm">
              Enter your detailed payslip data — CTC, gross, all deductions, and net take-home.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Mode toggle */}
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
              {[['single','Single Month'],['range','Date Range']].map(([m,l]) => (
                <button key={m} type="button" onClick={() => setPayslipMode(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${payslipMode===m ? 'bg-white text-violet-700 shadow-sm' : 'text-stone-500'}`}>
                  {l}
                </button>
              ))}
            </div>
            {payslipMode === 'range' && (
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs text-violet-700">
                💡 One payslip will be created for every month in the range with the same values. Perfect for stable salary months.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-stone-600 text-xs font-medium mb-1 block">{payslipMode==='range' ? 'From Month *' : 'Month *'}</Label>
                <MonthPicker value={payslipForm.month}
                  onChange={v => setPayslipForm(f => ({ ...f, month: v }))}
                  className="h-10 rounded-xl" />
              </div>
              {payslipMode === 'range' ? (
                <div>
                  <Label className="text-stone-600 text-xs font-medium mb-1 block">To Month *</Label>
                  <MonthPicker value={rangeEnd}
                    onChange={v => setRangeEnd(v)}
                    className="h-10 rounded-xl" />
                </div>
              ) : (
                <div>
                  <Label className="text-stone-600 text-xs font-medium mb-1 block">Net Take-home (₹) *</Label>
                  <Input type="number" placeholder="e.g. 65000" value={payslipForm.net_take_home}
                    onChange={e => setPayslipForm(f => ({ ...f, net_take_home: e.target.value }))}
                    className="h-10 rounded-xl border-stone-200 focus:border-violet-400 text-sm" />
                </div>
              )}
            </div>
            {payslipMode === 'range' && (
              <div>
                <Label className="text-stone-600 text-xs font-medium mb-1 block">Net Take-home (₹) *</Label>
                <Input type="number" placeholder="e.g. 65000" value={payslipForm.net_take_home}
                  onChange={e => setPayslipForm(f => ({ ...f, net_take_home: e.target.value }))}
                  className="h-10 rounded-xl border-stone-200 focus:border-violet-400 text-sm" />
              </div>
            )}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">Employer</Label>
              <Input placeholder="Company name" value={payslipForm.employer}
                onChange={e => setPayslipForm(f => ({ ...f, employer: e.target.value }))}
                className="h-10 rounded-xl border-stone-200 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Annual CTC (₹)", "ctc_annual", "e.g. 900000"],
                ["Gross Monthly (₹)", "gross_monthly", "e.g. 75000"],
                ["Basic (₹)", "basic", "e.g. 37500"],
                ["HRA (₹)", "hra", "e.g. 15000"],
                ["TDS / Tax (₹)", "tds", "e.g. 8000"],
                ["PF Employee (₹)", "pf_employee", "e.g. 1800"],
                ["PF Employer (₹)", "pf_employer", "e.g. 1800"],
                ["Professional Tax (₹)", "professional_tax", "e.g. 200"],
                ["Other Deductions (₹)", "other_deductions", "e.g. 0"],
              ].map(([lbl, key, ph]) => (
                <div key={key}>
                  <Label className="text-stone-500 text-xs mb-1 block">{lbl}</Label>
                  <Input type="number" placeholder={ph} value={payslipForm[key]}
                    onChange={e => setPayslipForm(f => ({ ...f, [key]: e.target.value }))}
                    className="h-9 rounded-xl border-stone-200 text-sm" />
                </div>
              ))}
            </div>
            <div>
              <Label className="text-stone-500 text-xs mb-1 block">Notes</Label>
              <Input placeholder="e.g. Hike month, bonus included" value={payslipForm.notes}
                onChange={e => setPayslipForm(f => ({ ...f, notes: e.target.value }))}
                className="h-9 rounded-xl border-stone-200 text-sm" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowPayslipDialog(false)} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleSavePayslip} disabled={savingPayslip}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white rounded-xl">
                {savingPayslip ? <RefreshCw size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
                {payslipMode === 'range' && rangeEnd && payslipForm.month && rangeEnd >= payslipForm.month
                  ? `Save ${monthsBetweenRange(payslipForm.month, rangeEnd).length} Payslips`
                  : 'Save Payslip'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete payslip confirm */}
      <Dialog open={!!deletePayslipMonth} onOpenChange={() => setDeletePayslipMonth(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Remove payslip?</DialogTitle>
            <DialogDescription className="sr-only">Confirm removing payslip</DialogDescription>
          </DialogHeader>
          <p className="text-stone-500 text-sm">The payslip for {fmtMo(deletePayslipMonth)} will be permanently removed.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeletePayslipMonth(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleDeletePayslip} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Job Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-['Outfit'] flex items-center gap-2">
              <Briefcase size={18} className="text-amber-500" />
              {editId ? "Edit Job" : "Add Job"}
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-sm">
              {editId ? "Update the details for this role." : "Add a company you worked at — past or present."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Employer */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">Company Name *</Label>
              <Input placeholder="e.g. Infosys, TCS, Flipkart"
                value={form.employer} onChange={e => setForm(f => ({ ...f, employer: e.target.value }))}
                className="h-10 rounded-xl border-stone-200 focus:border-amber-400 text-sm" />
            </div>

            {/* Role */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">Role / Designation <span className="text-stone-400">(optional)</span></Label>
              <Input placeholder="e.g. Software Engineer, Product Manager"
                value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="h-10 rounded-xl border-stone-200 focus:border-amber-400 text-sm" />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-stone-600 text-xs font-medium mb-1 block">Start Month *</Label>
                <MonthPicker value={form.start_month}
                  onChange={v => setForm(f => ({ ...f, start_month: v }))}
                  className="h-10 rounded-xl" />
              </div>
              <div>
                <Label className="text-stone-600 text-xs font-medium mb-1 block">End Month <span className="text-stone-400">(blank = current)</span></Label>
                <MonthPicker value={form.end_month}
                  onChange={v => setForm(f => ({ ...f, end_month: v }))}
                  placeholder="Blank = current"
                  className="h-10 rounded-xl" />
              </div>
            </div>

            {/* Take-home */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">Monthly Take-home (₹) *</Label>
              <Input type="number" placeholder="e.g. 65000"
                value={form.net_take_home} onChange={e => setForm(f => ({ ...f, net_take_home: e.target.value }))}
                className="h-10 rounded-xl border-stone-200 focus:border-amber-400 text-sm" />
              <p className="text-[11px] text-stone-400 mt-1">The amount credited to your bank account each month</p>
            </div>

            {/* Optional fields toggle */}
            <button onClick={() => setShowOptional(v => !v)}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-amber-600 transition-colors">
              {showOptional ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showOptional ? "Hide" : "Show"} optional fields (CTC, TDS, PF, Notes)
            </button>

            {showOptional && (
              <div className="space-y-3 border border-stone-100 rounded-xl p-4 bg-stone-50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-stone-500 text-xs mb-1 block">Annual CTC (₹)</Label>
                    <Input type="number" placeholder="e.g. 900000"
                      value={form.ctc_annual} onChange={e => setForm(f => ({ ...f, ctc_annual: e.target.value }))}
                      className="h-9 rounded-xl border-stone-200 text-sm bg-white" />
                  </div>
                  <div>
                    <Label className="text-stone-500 text-xs mb-1 block">Gross Monthly (₹)</Label>
                    <Input type="number" placeholder="e.g. 75000"
                      value={form.gross_monthly} onChange={e => setForm(f => ({ ...f, gross_monthly: e.target.value }))}
                      className="h-9 rounded-xl border-stone-200 text-sm bg-white" />
                  </div>
                  <div>
                    <Label className="text-stone-500 text-xs mb-1 block">TDS / Month (₹)</Label>
                    <Input type="number" placeholder="e.g. 8000"
                      value={form.tds} onChange={e => setForm(f => ({ ...f, tds: e.target.value }))}
                      className="h-9 rounded-xl border-stone-200 text-sm bg-white" />
                  </div>
                  <div>
                    <Label className="text-stone-500 text-xs mb-1 block">PF Employee (₹)</Label>
                    <Input type="number" placeholder="e.g. 1800"
                      value={form.pf_employee} onChange={e => setForm(f => ({ ...f, pf_employee: e.target.value }))}
                      className="h-9 rounded-xl border-stone-200 text-sm bg-white" />
                  </div>
                </div>
                <div>
                  <Label className="text-stone-500 text-xs mb-1 block">Notes</Label>
                  <Input placeholder="e.g. Include variable pay, hike month, etc."
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="h-9 rounded-xl border-stone-200 text-sm bg-white" />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleSave} disabled={saving}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl font-semibold">
                {saving ? <RefreshCw size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
                {editId ? "Update" : "Save Job"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Remove this job?</DialogTitle>
            <DialogDescription className="sr-only">Confirm removing job from career history</DialogDescription>
          </DialogHeader>
          <p className="text-stone-500 text-sm">This job record will be permanently removed from your career history.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleDelete} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
