import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "@/App";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import {
  Users, MessageSquare, TrendingUp, Star, BarChart2,
  ChevronDown, ChevronUp, Shield, Crown, Bug, Lightbulb, Heart, MessageCircle, Trash2,
  Mail, Send, CheckCircle2, AlertCircle, Loader2,
  Activity, Zap, DollarSign, AlertTriangle, Cpu
} from "lucide-react";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

const CATEGORY_META = {
  praise:          { label: "Praise",          icon: Heart,        color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  bug:             { label: "Bug Report",       icon: Bug,          color: "text-red-600 bg-red-50 border-red-100" },
  feature_request: { label: "Feature Request",  icon: Lightbulb,    color: "text-amber-600 bg-amber-50 border-amber-100" },
  general:         { label: "General",          icon: MessageCircle,color: "text-blue-600 bg-blue-50 border-blue-100" },
};

const EMAIL_TYPES = [
  { value: "welcome",        label: "Welcome / Onboarding",   desc: "New user welcome email with all features" },
  { value: "emi_reminder",   label: "EMI Reminder",           desc: "Upcoming EMI due alert" },
  { value: "goal_milestone", label: "Goal Milestone",         desc: "Savings goal progress milestone" },
  { value: "budget_alert",   label: "Budget Alert",           desc: "Category spending near/over limit" },
  { value: "weekly_digest",  label: "Weekly Digest",          desc: "Weekly spending snapshot" },
];

const NPS_COLOR = (n) => n >= 9 ? "text-emerald-600" : n >= 7 ? "text-amber-500" : "text-red-500";
const STAR_COLOR = (r) => r >= 4 ? "text-emerald-600" : r >= 3 ? "text-amber-500" : "text-red-500";

// ── Stat Card ──
const StatCard = ({ label, value, sub, icon: Icon, color }) => (
  <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>
      <Icon size={18} />
    </div>
    <p className="text-2xl font-bold text-stone-900 font-['Outfit']">{value}</p>
    <p className="text-xs font-semibold text-stone-500 mt-0.5">{label}</p>
    {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
  </div>
);

// ── Sparkline ──
const Sparkline = ({ data }) => {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.signups), 1);
  return (
    <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
      <p className="text-sm font-bold text-stone-700 mb-4">Signups — Last 7 Days</p>
      <div className="flex items-end gap-2 h-20">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-gradient-to-t from-orange-400 to-orange-300 rounded-t-md transition-all"
              style={{ height: `${(d.signups / max) * 100}%`, minHeight: d.signups > 0 ? 4 : 0 }}
            />
            <span className="text-[10px] text-stone-400 rotate-45 origin-left ml-1">{d.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Feedback Row ──
const FeedbackRow = ({ fb }) => {
  const [open, setOpen] = useState(false);
  const meta = CATEGORY_META[fb.category] || CATEGORY_META.general;
  const Icon = meta.icon;
  return (
    <div className="border border-stone-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 hover:bg-stone-50 transition-colors text-left"
      >
        <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg border ${meta.color}`}>
          <Icon size={11} /> {meta.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-700 truncate">{fb.user_name}</p>
          <p className="text-xs text-stone-400">{fb.user_email} · {fb.is_pro ? "Pro" : "Free"}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-bold ${NPS_COLOR(fb.nps_score)}`}>NPS {fb.nps_score}</span>
          <span className={`text-sm font-bold ${STAR_COLOR(fb.overall_rating)}`}>★ {fb.overall_rating}</span>
          <span className="text-xs text-stone-400">{new Date(fb.created_at).toLocaleDateString("en-IN")}</span>
          {open ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 bg-stone-50 border-t border-stone-100 space-y-3">
          {fb.description && (
            <div>
              <p className="text-xs font-semibold text-stone-500 mb-1">Comment</p>
              <p className="text-sm text-stone-700 bg-white rounded-lg p-3 border border-stone-100">{fb.description}</p>
            </div>
          )}
          {Object.keys(fb.feature_ratings || {}).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-stone-500 mb-2">Feature Ratings</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(fb.feature_ratings).map(([f, r]) => (
                  <div key={f} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-stone-100">
                    <span className="text-xs text-stone-600">{f}</span>
                    <span className="text-xs font-bold text-amber-500">{"★".repeat(r)}{"☆".repeat(5 - r)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {fb.page && <p className="text-xs text-stone-400">Submitted from: {fb.page}</p>}
        </div>
      )}
    </div>
  );
};

// ── User Table Row ──
const UserRow = ({ user, onDelete }) => (
  <tr className="group border-b border-stone-100 hover:bg-stone-50 transition-colors">
    <td className="px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {user.name?.[0]?.toUpperCase() || "?"}
        </div>
        <span className="text-sm font-semibold text-stone-800">{user.name || "—"}</span>
        {user.is_admin && (
          <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Shield size={8} /> Admin
          </span>
        )}
      </div>
    </td>
    <td className="px-4 py-3 text-sm text-stone-500 max-w-[200px] truncate">{user.email}</td>
    <td className="px-4 py-3 text-sm text-stone-400">{user.phone || "—"}</td>
    <td className="px-4 py-3">
      {user.is_pro ? (
        <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
          <Crown size={9} /> Pro
        </span>
      ) : (
        <span className="text-xs font-semibold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full w-fit block">Free</span>
      )}
    </td>
    <td className="px-4 py-3 text-sm text-stone-500">
      {user.streak > 0
        ? <span className="flex items-center gap-1">{user.streak} <span className="text-base">🔥</span></span>
        : <span className="text-stone-300">0 🔥</span>
      }
    </td>
    <td className="px-4 py-3 text-sm text-stone-400 whitespace-nowrap">
      {user.created_at ? new Date(user.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
    </td>
    <td className="px-4 py-3 sticky right-0 bg-white group-hover:bg-stone-50">
      {!user.is_admin && (
        <button
          onClick={() => onDelete(user)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors text-xs font-semibold whitespace-nowrap"
        >
          <Trash2 size={11} /> Delete
        </button>
      )}
    </td>
  </tr>
);

// ── Main ──
export default function AdminPortal() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Email tab state
  const [welcomeResult, setWelcomeResult] = useState(null);
  const [welcomeSending, setWelcomeSending] = useState(false);
  const [welcomeDryRun, setWelcomeDryRun] = useState(null);
  const [emailForm, setEmailForm] = useState({
    email: "", name: "", email_type: "welcome",
    emi_name: "", amount: "", due_days: "3",
    goal_name: "", pct: "", saved: "", target: "",
    category: "", budget: "", spent: "",
    income: "", top_cat: "", top_cat_amt: "", txn_count: "",
  });
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState(null);

  // API billing / health state
  const [apiUsage, setApiUsage] = useState(null);
  const [apiHealth, setApiHealth] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);

  const loadApiData = async (secret) => {
    setApiLoading(true);
    try {
      const qs = `?admin_secret=${encodeURIComponent(secret)}`;
      const [usage, health] = await Promise.all([
        axios.get(`${API}/admin/api-usage${qs}`).catch(() => ({ data: null })),
        axios.get(`${API}/admin/api-health${qs}`).catch(() => ({ data: { status: "error", error: "Request failed" } })),
      ]);
      setApiUsage(usage.data);
      setApiHealth(health.data);
    } catch (_) { /* silently fail — non-critical */ }
    finally { setApiLoading(false); }
  };

  const loadAll = async (secret) => {
    setLoading(true);
    setLoadError("");
    try {
      const qs = `?admin_secret=${encodeURIComponent(secret)}`;
      const [s, u, f] = await Promise.all([
        axios.get(`${API}/admin/stats${qs}`),
        axios.get(`${API}/admin/users${qs}`),
        axios.get(`${API}/admin/feedback${qs}`),
      ]);
      setStats(s.data);
      setUsers(u.data.items || []);
      setFeedback(f.data.items || []);
      setFeedTotal(f.data.total || 0);
      setAdminSecret(secret);
      loadApiData(secret);  // fire-and-forget — loads API billing data in background
    } catch (e) {
      setLoadError(e.response?.data?.detail || "Invalid secret or server error");
    }
    finally { setLoading(false); }
  };

  const loadFeedback = async (cat) => {
    const qs = `admin_secret=${encodeURIComponent(adminSecret)}`;
    const { data } = await axios.get(`${API}/admin/feedback?${qs}${cat ? `&category=${cat}` : ""}`);
    setFeedback(data.items || []);
    setFeedTotal(data.total || 0);
  };

  const deleteUser = async () => {
    if (!deleteTarget || !adminSecret.trim()) return;
    if (deleteEmailConfirm.trim().toLowerCase() !== deleteTarget.email.toLowerCase()) {
      alert("Email doesn't match. Type the user's email exactly to confirm deletion.");
      return;
    }
    setDeleting(true);
    try {
      await axios.post(`${API}/admin/delete-user`, { email: deleteTarget.email, admin_secret: adminSecret });
      setUsers(u => u.filter(x => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteEmailConfirm("");
    } catch (e) {
      alert(e.response?.data?.detail || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const dryRunWelcome = async () => {
    if (!adminSecret.trim()) return;
    try {
      const { data } = await axios.post(`${API}/admin/send-welcome-emails`, {
        admin_secret: adminSecret,
        dry_run: true,
      });
      setWelcomeDryRun(data);
    } catch (e) {
      alert(e.response?.data?.detail || "Failed");
    }
  };

  const sendWelcomeAll = async () => {
    if (!adminSecret.trim() || !window.confirm(`Send onboarding email to ${welcomeDryRun?.pending_count ?? "all pending"} users?`)) return;
    setWelcomeSending(true);
    setWelcomeResult(null);
    try {
      const { data } = await axios.post(`${API}/admin/send-welcome-emails`, {
        admin_secret: adminSecret,
        dry_run: false,
      });
      setWelcomeResult(data);
      setWelcomeDryRun(null);
    } catch (e) {
      alert(e.response?.data?.detail || "Send failed");
    } finally {
      setWelcomeSending(false);
    }
  };

  const sendEmailToUser = async () => {
    if (!adminSecret.trim() || !emailForm.email.trim()) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const payload = {
        admin_secret: adminSecret,
        email: emailForm.email,
        name: emailForm.name || "there",
        email_type: emailForm.email_type,
        emi_name: emailForm.emi_name,
        amount: parseFloat(emailForm.amount) || 0,
        due_days: parseInt(emailForm.due_days) || 3,
        goal_name: emailForm.goal_name,
        pct: parseFloat(emailForm.pct) || 0,
        saved: parseFloat(emailForm.saved) || 0,
        target: parseFloat(emailForm.target) || 0,
        category: emailForm.category,
        budget: parseFloat(emailForm.budget) || 0,
        spent: parseFloat(emailForm.spent) || 0,
        income: parseFloat(emailForm.income) || 0,
        top_cat: emailForm.top_cat,
        top_cat_amt: parseFloat(emailForm.top_cat_amt) || 0,
        txn_count: parseInt(emailForm.txn_count) || 0,
      };
      const { data } = await axios.post(`${API}/admin/send-email-to-user`, payload);
      setEmailResult(data);
    } catch (e) {
      setEmailResult({ error: e.response?.data?.detail || "Send failed" });
    } finally {
      setEmailSending(false);
    }
  };

  if (loading) return (
    <><Navigation /><div className="min-h-screen bg-[#fffaf5] flex items-center justify-center">
      <div className="animate-pulse text-stone-400 text-sm">Loading admin data...</div>
    </div></>
  );

  // Secret gate — show before data is loaded
  if (!adminSecret) return (
    <><Navigation />
    <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 w-full max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow mb-4 mx-auto">
          <Shield size={22} className="text-white" />
        </div>
        <h2 className="text-lg font-bold text-stone-900 text-center mb-1 font-['Outfit']">Admin Portal</h2>
        <p className="text-xs text-stone-400 text-center mb-6">Enter the admin secret to continue</p>
        <input
          type="password"
          value={secretInput}
          onChange={e => setSecretInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && secretInput.trim() && loadAll(secretInput.trim())}
          placeholder="Admin secret"
          className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 mb-3"
          autoFocus
        />
        {loadError && <p className="text-xs text-red-500 mb-3 text-center">{loadError}</p>}
        <button
          onClick={() => secretInput.trim() && loadAll(secretInput.trim())}
          className="w-full bg-gradient-to-r from-purple-500 to-purple-700 text-white font-semibold py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
        >
          Unlock
        </button>
      </div>
    </div></>
  );

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "users",    label: `Users (${fmt(stats?.total_users)})` },
    { key: "feedback", label: `Feedback (${fmt(feedTotal)})` },
    { key: "emails",   label: "Emails" },
  ];

  const ef = emailForm.email_type;

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-[#fffaf5]">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900 font-['Outfit']">Admin Portal</h1>
              <p className="text-xs text-stone-400">Logged in as {user?.email}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-stone-100 p-1 rounded-xl mb-6 w-fit">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === t.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {tab === "overview" && stats && (
            <div className="space-y-5">

              {/* ── API & Billing ── */}
              <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center">
                      <Cpu size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-stone-700">API & Billing</p>
                      <p className="text-xs text-stone-400">Anthropic API usage and health</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiHealth ? (
                      apiHealth.status === "healthy" ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> API Healthy
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> API Error
                        </span>
                      )
                    ) : apiLoading ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-400 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-full">
                        <Loader2 size={10} className="animate-spin" /> Checking...
                      </span>
                    ) : null}
                    <button
                      onClick={() => loadApiData(adminSecret)}
                      disabled={apiLoading}
                      className="text-xs text-stone-400 hover:text-violet-500 transition-colors"
                    >
                      ↺ Refresh
                    </button>
                  </div>
                </div>

                {/* Alert banner */}
                {apiUsage && (apiUsage.today_calls > 500 || apiUsage.estimated_cost_usd > 10) && (
                  <div className="flex items-center gap-3 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold text-amber-800">
                      {apiUsage.today_calls > 500 && `High usage: ${fmt(apiUsage.today_calls)} API calls today. `}
                      {apiUsage.estimated_cost_usd > 10 && `Estimated cost: $${apiUsage.estimated_cost_usd} this period.`}
                    </p>
                  </div>
                )}

                {/* API health error detail */}
                {apiHealth && apiHealth.status === "error" && (
                  <div className="flex items-center gap-3 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle size={16} className="text-red-500 shrink-0" />
                    <p className="text-xs text-red-700 font-mono break-all">{apiHealth.error}</p>
                  </div>
                )}

                {apiUsage ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard label="AI Calls Today"   value={fmt(apiUsage.today_calls)}   icon={Zap}         color="bg-violet-50 text-violet-600" />
                    <StatCard label="Calls This Month" value={fmt(apiUsage.month_calls)}   icon={Activity}    color="bg-indigo-50 text-indigo-600" />
                    <StatCard label="Est. Cost (USD)"  value={`$${apiUsage.estimated_cost_usd}`} icon={DollarSign} color="bg-emerald-50 text-emerald-600" />
                    <StatCard label="Total Tokens"     value={fmt(apiUsage.total_tokens)}  icon={Cpu}         color="bg-sky-50 text-sky-600" />
                  </div>
                ) : apiLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={18} className="animate-spin text-stone-300" />
                  </div>
                ) : (
                  <p className="text-xs text-stone-400 text-center py-4">No API usage data available</p>
                )}

                {/* Active users row */}
                {apiUsage && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <StatCard label="Total Users"   value={fmt(apiUsage.total_users)}  icon={Users}    color="bg-blue-50 text-blue-600" />
                    <StatCard label="Active Today"  value={fmt(apiUsage.active_today)} sub="users with chat activity" icon={Activity} color="bg-green-50 text-green-600" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Users"     value={fmt(stats.total_users)}    sub={`+${fmt(stats.new_this_month)} this month`} icon={Users}        color="bg-blue-50 text-blue-600" />
                <StatCard label="Pro Users"       value={fmt(stats.pro_users)}      sub={`${stats.pro_pct}% conversion`}             icon={Crown}        color="bg-amber-50 text-amber-600" />
                <StatCard label="Avg NPS"         value={stats.avg_nps ?? "—"}      sub="0–10 scale"                                 icon={TrendingUp}   color="bg-emerald-50 text-emerald-600" />
                <StatCard label="Feedback"        value={fmt(stats.total_feedback)} sub="all time"                                   icon={MessageSquare} color="bg-purple-50 text-purple-600" />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard label="Transactions Logged" value={fmt(stats.total_transactions)} icon={BarChart2} color="bg-orange-50 text-orange-600" />
                <StatCard label="Trip Plans"           value={fmt(stats.total_trips)}        icon={TrendingUp} color="bg-teal-50 text-teal-600" />
                <StatCard label="Active EMIs"          value={fmt(stats.total_emis)}         icon={Star}       color="bg-rose-50 text-rose-600" />
              </div>

              <Sparkline data={stats.signups_last_7_days} />

              {Object.keys(stats.feedback_by_category || {}).length > 0 && (
                <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
                  <p className="text-sm font-bold text-stone-700 mb-4">Feedback Breakdown</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(stats.feedback_by_category).map(([cat, count]) => {
                      const meta = CATEGORY_META[cat] || CATEGORY_META.general;
                      const Icon = meta.icon;
                      return (
                        <div key={cat} className={`flex flex-col items-center p-4 rounded-xl border ${meta.color}`}>
                          <Icon size={20} className="mb-2" />
                          <p className="text-xl font-bold font-['Outfit']">{count}</p>
                          <p className="text-xs font-semibold mt-0.5">{meta.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Users ── */}
          {tab === "users" && (() => {
            const filtered = users.filter(u =>
              !userSearch.trim() ||
              u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
              u.email?.toLowerCase().includes(userSearch.toLowerCase())
            );
            return (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                {/* Table header bar */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                  <p className="text-sm font-bold text-stone-700">
                    All registered accounts
                    <span className="ml-2 text-xs font-semibold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{fmt(users.length)} total</span>
                  </p>
                  <button onClick={() => loadAll(adminSecret)} className="text-xs text-stone-400 hover:text-orange-500 flex items-center gap-1 transition-colors">
                    ↺ Refresh
                  </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-stone-100">
                  <input
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-orange-300 bg-stone-50"
                  />
                </div>

                {/* Table */}
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-stone-50 border-b border-stone-100">
                      <tr>
                        {["Name", "Email", "Phone", "Plan", "Streak", "Joined"].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                        <th className="px-4 py-3 text-xs font-bold text-stone-400 uppercase tracking-wide sticky right-0 bg-stone-50"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0
                        ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-stone-400">No users found</td></tr>
                        : filtered.map(u => <UserRow key={u.id || u.email} user={u} onDelete={setDeleteTarget} />)
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ── Delete confirm modal ── */}
          {deleteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                    <Trash2 size={18} className="text-red-500" />
                  </div>
                  <div>
                    <p className="font-bold text-stone-900">Permanently delete user?</p>
                    <p className="text-xs text-stone-500 mt-0.5">{deleteTarget.name} · {deleteTarget.email}</p>
                  </div>
                </div>
                <p className="text-sm text-stone-500">
                  This wipes <span className="font-semibold text-stone-700">all their data</span> — transactions, chat, investments, everything. Type their email exactly to confirm.
                </p>
                <input
                  type="text"
                  value={deleteEmailConfirm}
                  onChange={e => setDeleteEmailConfirm(e.target.value)}
                  placeholder={deleteTarget.email}
                  autoComplete="off"
                  className="w-full h-10 px-3 rounded-xl border border-red-200 text-sm outline-none focus:border-red-400 bg-red-50/30"
                />
                <div className="flex gap-3">
                  <button onClick={() => { setDeleteTarget(null); setDeleteEmailConfirm(""); }}
                    className="flex-1 h-10 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50">
                    Cancel
                  </button>
                  <button
                    onClick={deleteUser}
                    disabled={deleting || deleteEmailConfirm.trim().toLowerCase() !== deleteTarget.email.toLowerCase()}
                    className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-40">
                    {deleting ? "Deleting…" : "Delete forever"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Feedback ── */}
          {tab === "feedback" && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {["", "praise", "bug", "feature_request", "general"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setFilterCat(cat); loadFeedback(cat); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      filterCat === cat
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-stone-600 border-stone-200 hover:border-orange-300"
                    }`}
                  >
                    {cat === "" ? "All" : CATEGORY_META[cat]?.label || cat}
                  </button>
                ))}
              </div>

              {feedback.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-sm">No feedback yet</div>
              ) : (
                <div className="space-y-2">
                  {feedback.map(fb => <FeedbackRow key={fb.id} fb={fb} />)}
                </div>
              )}
            </div>
          )}

          {/* ── Emails ── */}
          {tab === "emails" && (
            <div className="space-y-6">

              {/* Admin secret shared input */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={15} className="text-purple-500" />
                  <p className="text-sm font-bold text-stone-700">Admin Secret</p>
                </div>
                <input
                  type="password"
                  value={emailSecret}
                  onChange={e => setEmailSecret(e.target.value)}
                  placeholder="Enter admin secret for all email actions"
                  className="w-full h-10 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-purple-400 font-mono"
                />
              </div>

              {/* Send welcome to pending users */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Mail size={15} className="text-orange-500" />
                  <p className="text-sm font-bold text-stone-700">Send Onboarding Email to All Pending Users</p>
                </div>
                <p className="text-xs text-stone-400 mb-4">Sends the branded welcome email to every user who hasn't received it yet.</p>

                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={dryRunWelcome}
                    disabled={!emailSecret.trim()}
                    className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                  >
                    Preview (dry run)
                  </button>
                  <button
                    onClick={sendWelcomeAll}
                    disabled={welcomeSending || !emailSecret.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
                  >
                    {welcomeSending ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send Welcome Emails</>}
                  </button>
                </div>

                {welcomeDryRun && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm font-semibold text-amber-800 mb-2">{welcomeDryRun.pending_count} users pending</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {welcomeDryRun.emails?.map(e => (
                        <p key={e} className="text-xs text-amber-700 font-mono">{e}</p>
                      ))}
                    </div>
                  </div>
                )}

                {welcomeResult && (
                  <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Done!</p>
                      <p className="text-xs text-emerald-700">Sent: {welcomeResult.sent} · Failed: {welcomeResult.failed} · Total: {welcomeResult.total}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Send specific email to specific user */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Send size={15} className="text-blue-500" />
                  <p className="text-sm font-bold text-stone-700">Send Email to Specific User</p>
                </div>
                <p className="text-xs text-stone-400 mb-4">Test any email type or manually trigger a notification.</p>

                <div className="space-y-3">
                  {/* Email type selector */}
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1 block">Email Type</label>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {EMAIL_TYPES.map(t => (
                        <button
                          key={t.value}
                          onClick={() => setEmailForm(f => ({ ...f, email_type: t.value }))}
                          className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                            emailForm.email_type === t.value
                              ? "border-blue-400 bg-blue-50 text-blue-800"
                              : "border-stone-200 hover:border-stone-300 text-stone-600"
                          }`}
                        >
                          <p className="font-semibold">{t.label}</p>
                          <p className="text-stone-400 mt-0.5">{t.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Common fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-stone-500 mb-1 block">Recipient Email *</label>
                      <input
                        value={emailForm.email}
                        onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="user@example.com"
                        className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-stone-500 mb-1 block">Name (optional)</label>
                      <input
                        value={emailForm.name}
                        onChange={e => setEmailForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Rohan"
                        className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>

                  {/* Type-specific fields */}
                  {ef === "emi_reminder" && (
                    <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">EMI Name</label>
                        <input value={emailForm.emi_name} onChange={e => setEmailForm(f => ({ ...f, emi_name: e.target.value }))} placeholder="Home Loan" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Amount (₹)</label>
                        <input type="number" value={emailForm.amount} onChange={e => setEmailForm(f => ({ ...f, amount: e.target.value }))} placeholder="12000" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Due in (days)</label>
                        <input type="number" value={emailForm.due_days} onChange={e => setEmailForm(f => ({ ...f, due_days: e.target.value }))} placeholder="3" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                    </div>
                  )}

                  {ef === "goal_milestone" && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Goal Name</label>
                        <input value={emailForm.goal_name} onChange={e => setEmailForm(f => ({ ...f, goal_name: e.target.value }))} placeholder="Europe Trip" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">% Complete</label>
                        <input type="number" value={emailForm.pct} onChange={e => setEmailForm(f => ({ ...f, pct: e.target.value }))} placeholder="75" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Saved (₹)</label>
                        <input type="number" value={emailForm.saved} onChange={e => setEmailForm(f => ({ ...f, saved: e.target.value }))} placeholder="75000" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Target (₹)</label>
                        <input type="number" value={emailForm.target} onChange={e => setEmailForm(f => ({ ...f, target: e.target.value }))} placeholder="100000" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                    </div>
                  )}

                  {ef === "budget_alert" && (
                    <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Category</label>
                        <input value={emailForm.category} onChange={e => setEmailForm(f => ({ ...f, category: e.target.value }))} placeholder="Food & Dining" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Spent (₹)</label>
                        <input type="number" value={emailForm.spent} onChange={e => setEmailForm(f => ({ ...f, spent: e.target.value }))} placeholder="4200" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Budget (₹)</label>
                        <input type="number" value={emailForm.budget} onChange={e => setEmailForm(f => ({ ...f, budget: e.target.value }))} placeholder="5000" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                    </div>
                  )}

                  {ef === "weekly_digest" && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Total Spent (₹)</label>
                        <input type="number" value={emailForm.spent} onChange={e => setEmailForm(f => ({ ...f, spent: e.target.value }))} placeholder="18500" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Income (₹)</label>
                        <input type="number" value={emailForm.income} onChange={e => setEmailForm(f => ({ ...f, income: e.target.value }))} placeholder="75000" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Top Category</label>
                        <input value={emailForm.top_cat} onChange={e => setEmailForm(f => ({ ...f, top_cat: e.target.value }))} placeholder="Food & Dining" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Top Cat Amt (₹)</label>
                        <input type="number" value={emailForm.top_cat_amt} onChange={e => setEmailForm(f => ({ ...f, top_cat_amt: e.target.value }))} placeholder="6200" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1 block">Transactions</label>
                        <input type="number" value={emailForm.txn_count} onChange={e => setEmailForm(f => ({ ...f, txn_count: e.target.value }))} placeholder="42" className="w-full h-9 px-3 rounded-xl border border-stone-200 text-sm outline-none focus:border-blue-400" />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={sendEmailToUser}
                    disabled={emailSending || !emailSecret.trim() || !emailForm.email.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
                  >
                    {emailSending
                      ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                      : <><Send size={14} /> Send {EMAIL_TYPES.find(t => t.value === ef)?.label}</>
                    }
                  </button>

                  {emailResult && (
                    emailResult.error
                      ? (
                        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                          <AlertCircle size={18} className="text-red-500 shrink-0" />
                          <p className="text-sm text-red-700">{emailResult.error}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                          <p className="text-sm text-emerald-700">
                            {emailResult.sent ? `Email sent to ${emailResult.email}` : `Failed to send to ${emailResult.email} — check SMTP config`}
                          </p>
                        </div>
                      )
                  )}
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </>
  );
}
