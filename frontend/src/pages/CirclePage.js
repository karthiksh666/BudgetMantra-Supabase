import { useState, useCallback, useEffect, useRef } from "react";
import Navigation from "@/components/Navigation";
import axios from "axios";
import { API, BACKEND_URL } from "@/App";
import { useAuth } from "@/context/AuthContext";
import { useStaleData } from "@/hooks/useStaleData";
import PageLoader from "@/components/PageLoader";
import { toast } from "sonner";
import {
  Users, Plus, Copy, LogOut, Check, Trash2,
  X, Scale, Receipt, CreditCard, Target, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtAmt = (n) => `₹${Math.abs(Math.round(n || 0)).toLocaleString("en-IN")}`;


// Per-member avatar colors — deterministic from index
const AVATAR_COLORS = [
  { bg: "#fde68a", text: "#92400e" },  // amber
  { bg: "#bbf7d0", text: "#14532d" },  // emerald
  { bg: "#bfdbfe", text: "#1e3a8a" },  // blue
  { bg: "#f5d0fe", text: "#701a75" },  // fuchsia
  { bg: "#fed7aa", text: "#7c2d12" },  // orange
  { bg: "#a5f3fc", text: "#164e63" },  // cyan
  { bg: "#ddd6fe", text: "#4c1d95" },  // violet
  { bg: "#fecdd3", text: "#881337" },  // rose
];

function memberColor(idx) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

const CIRCLE_TIPS = [
  "Shared finances, shared goals.",
  "Tracking together keeps surprises away.",
  "Clarity is the foundation of trust.",
];

// ── WebSocket URL helper ──────────────────────────────────────────────────────
function buildWsUrl(circleId, token) {
  const base = BACKEND_URL || window.location.origin;
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws/circle/${circleId}?token=${token}`;
}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function CirclePage() {
  const { token, user } = useAuth();
  const [joinCode, setJoinCode]     = useState("");
  const [circleName, setCircleName] = useState("Our Circle");
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    description: "", amount: "", paid_by: "",
    date: new Date().toISOString().slice(0, 10), category: "General",
  });
  const [showAddEmi, setShowAddEmi] = useState(false);
  const [emiForm, setEmiForm] = useState({
    name: "", total_amount: "", category: "Home Loan",
    due_day: "1", start_date: new Date().toISOString().slice(0, 7) + "-01", end_date: "",
    members_share: {},
  });
  const [copiedCode, setCopiedCode]       = useState(false);
  const [onlineNames, setOnlineNames]     = useState(new Set());

  // Active tab: "expenses" | "emis" | "balances"
  const [activeTab, setActiveTab] = useState("expenses");
  const [expPage,   setExpPage]   = useState(0);
  const [emiPage,   setEmiPage]   = useState(0);
  const PAGE_SIZE = 50;

  const headers = { Authorization: `Bearer ${token}` };

  // ── Circle data ───────────────────────────────────────────────────────────
  const fetchCircle = useCallback(async () => {
    const res = await axios.get(`${API}/circle`, { headers });
    return res.data || [];
  }, [token]); // eslint-disable-line

  const { data: circles, loading, reload: fetchData } = useStaleData(
    "bm_circle_cache",
    fetchCircle,
    { errorMsg: "Failed to load Circle", fallback: [] }
  );

  const circle = circles?.[0] || null;

  // ── Expenses ──────────────────────────────────────────────────────────────
  const fetchExpenses = useCallback(async () => {
    if (!circle) return [];
    const res = await axios.get(`${API}/circle/${circle.id}/expenses`, { headers });
    return res.data || [];
  }, [token, circle?.id]); // eslint-disable-line

  const { data: expenses, reload: reloadExpenses } = useStaleData(
    "bm_circle_expenses_cache",
    fetchExpenses,
    { errorMsg: "Failed to load expenses", fallback: [] }
  );

  // ── Circle EMIs ───────────────────────────────────────────────────────────
  const fetchEmis = useCallback(async () => {
    if (!circle) return [];
    const res = await axios.get(`${API}/circle/${circle.id}/emis`, { headers });
    return res.data || [];
  }, [token, circle?.id]); // eslint-disable-line

  const { data: circleEmis, reload: reloadEmis } = useStaleData(
    "bm_circle_emis_cache",
    fetchEmis,
    { errorMsg: "Failed to load EMIs", fallback: [] }
  );

  // ── Circle Goals ──────────────────────────────────────────────────────────
  const [goalForm, setGoalForm] = useState({ name: "", target_amount: "", emoji: "🎯" });
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [contributeGoalId, setContributeGoalId] = useState(null);
  const [contributeAmount, setContributeAmount] = useState("");

  const fetchGoals = useCallback(async () => {
    if (!circle) return [];
    const res = await axios.get(`${API}/circle/${circle.id}/goals`, { headers });
    return res.data || [];
  }, [token, circle?.id]); // eslint-disable-line

  const { data: circleGoals, reload: reloadGoals } = useStaleData(
    "bm_circle_goals_cache",
    fetchGoals,
    { errorMsg: "Failed to load goals", fallback: [] }
  );

  // ── Lightweight WS for online presence ───────────────────────────────────
  const wsOnlineRef = useRef(null);
  useEffect(() => {
    if (!circle || !token) return;
    const url = buildWsUrl(circle.id, token);
    const ws = new WebSocket(url);
    wsOnlineRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (Array.isArray(msg.online)) {
          setOnlineNames(new Set(msg.online));
        }
      } catch {}
    };

    return () => { ws.close(); };
  }, [circle?.id, token]); // eslint-disable-line

  // ── Derived: member color map & online user IDs ───────────────────────────
  const members = circle?.members || [];
  const memberColorMap = {};
  members.forEach((m, i) => { memberColorMap[m.user_id] = i; });

  const onlineUserIds = new Set(
    members.filter(m => onlineNames.has(m.name)).map(m => m.user_id)
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!circleName.trim()) return;
    try {
      await axios.post(`${API}/circle`, { name: circleName }, { headers });
      toast.success("Circle created!");
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create circle.");
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    try {
      await axios.post(`${API}/circle/join`, { invite_code: joinCode.trim().toUpperCase() }, { headers });
      toast.success("Joined circle!");
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid invite code.");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this circle and all its expenses?")) return;
    try {
      await axios.delete(`${API}/circle/${circle.id}`, { headers });
      toast.success("Circle deleted.");
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete circle.");
    }
  };

  const handleLeave = async () => {
    if (!window.confirm("Leave this circle?")) return;
    try {
      await axios.post(`${API}/circle/${circle.id}/leave`, {}, { headers });
      toast.success("Left circle.");
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to leave circle.");
    }
  };

  const handleAddExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount || !expenseForm.paid_by) {
      toast.error("Please fill description, amount, and who paid.");
      return;
    }
    try {
      await axios.post(`${API}/circle/${circle.id}/expenses`, {
        ...expenseForm,
        amount: parseFloat(expenseForm.amount),
      }, { headers });
      toast.success("Expense added!");
      setShowAddExpense(false);
      setExpenseForm({ description: "", amount: "", paid_by: "", date: new Date().toISOString().slice(0, 10), category: "General" });
      reloadExpenses();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add expense.");
    }
  };

  const handleAddEmi = async () => {
    if (!emiForm.name || !emiForm.total_amount || !emiForm.start_date || !emiForm.end_date) {
      toast.error("Please fill name, amount, start & end date.");
      return;
    }
    // Build equal split if members_share not set
    const share = { ...emiForm.members_share };
    const total = parseFloat(emiForm.total_amount);
    if (Object.keys(share).length === 0 && members.length > 0) {
      const each = parseFloat((total / members.length).toFixed(2));
      members.forEach(m => { share[m.name] = each; });
    }
    try {
      await axios.post(`${API}/circle/${circle.id}/emis`, {
        name: emiForm.name,
        total_amount: total,
        category: emiForm.category,
        due_day: parseInt(emiForm.due_day),
        start_date: emiForm.start_date,
        end_date: emiForm.end_date,
        members_share: share,
      }, { headers });
      toast.success("Joint EMI added!");
      setShowAddEmi(false);
      setEmiForm({ name: "", total_amount: "", category: "Home Loan", due_day: "1", start_date: new Date().toISOString().slice(0, 7) + "-01", end_date: "", members_share: {} });
      reloadEmis();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add EMI.");
    }
  };

  const handleDeleteEmi = async (emiId) => {
    try {
      await axios.delete(`${API}/circle/${circle.id}/emis/${emiId}`, { headers });
      toast.success("EMI removed.");
      reloadEmis();
    } catch {
      toast.error("Failed to delete EMI.");
    }
  };

  const handleDeleteExpense = async (expId) => {
    try {
      await axios.delete(`${API}/circle/${circle.id}/expenses/${expId}`, { headers });
      toast.success("Expense removed.");
      reloadExpenses();
    } catch {
      toast.error("Failed to delete expense.");
    }
  };

  const handleSettle = async () => {
    if (!window.confirm("Mark all current expenses as settled?")) return;
    try {
      await axios.post(`${API}/circle/${circle.id}/settle`, {}, { headers });
      toast.success("All expenses settled!");
      reloadExpenses();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to settle.");
    }
  };

  const handleAddGoal = async () => {
    if (!goalForm.name || !goalForm.target_amount) {
      toast.error("Goal name and target amount are required");
      return;
    }
    try {
      await axios.post(`${API}/circle/${circle.id}/goals`, {
        name: goalForm.name,
        target_amount: parseFloat(goalForm.target_amount),
        emoji: goalForm.emoji || "🎯",
      }, { headers });
      toast.success("Goal added!");
      setShowAddGoal(false);
      setGoalForm({ name: "", target_amount: "", emoji: "🎯" });
      reloadGoals();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add goal");
    }
  };

  const handleContributeGoal = async (goalId) => {
    const amt = parseFloat(contributeAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const myName = members.find(m => m.user_id === user?.id)?.name || user?.name || "Me";
    try {
      await axios.post(`${API}/circle/${circle.id}/goals/${goalId}/contribute`, {
        member_name: myName,
        amount: amt,
      }, { headers });
      toast.success(`₹${amt.toLocaleString("en-IN")} contributed!`);
      setContributeGoalId(null);
      setContributeAmount("");
      reloadGoals();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to contribute");
    }
  };

  const handleDeleteGoal = async (goalId) => {
    if (!window.confirm("Delete this goal?")) return;
    try {
      await axios.delete(`${API}/circle/${circle.id}/goals/${goalId}`, { headers });
      toast.success("Goal deleted");
      reloadGoals();
    } catch {
      toast.error("Failed to delete goal");
    }
  };

  const copyCode = () => {
    if (!circle) return;
    navigator.clipboard.writeText(circle.invite_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isOwner = circle?.owner_id === user?.id;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)]" style={{ background: "#fdf2f8" }}>
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <PageLoader message="Loading Circle..." tips={CIRCLE_TIPS} />
        </div>
      </div>
    </>
  );

  // ── No circle: Create / Join ──────────────────────────────────────────────
  if (!circle) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)]" style={{ background: "#fdf2f8" }}>
        <div className="max-w-lg mx-auto px-4 py-8 pb-28 lg:pb-8 space-y-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-pink-500 flex items-center justify-center shadow-sm">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-800">Family Circle</h1>
              <p className="text-xs text-stone-500">Track your family's shared expenses in one place</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <h2 className="font-bold text-stone-800 mb-1">Create your Family Circle</h2>
            <p className="text-xs text-stone-500 mb-4">Track your family's shared expenses in one place.</p>
            <input
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-pink-300"
              placeholder="Circle name (e.g. Our Home)"
              value={circleName}
              onChange={e => setCircleName(e.target.value)}
            />
            <Button onClick={handleCreate} className="w-full bg-pink-500 hover:bg-pink-600 text-white rounded-xl">
              <Plus size={15} className="mr-1" /> Create Circle
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <h2 className="font-bold text-stone-800 mb-1">Join a Circle</h2>
            <p className="text-xs text-stone-500 mb-4">Enter an invite code shared by your circle owner.</p>
            <input
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-pink-300 uppercase tracking-widest"
              placeholder="6-digit code"
              maxLength={6}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
            />
            <Button onClick={handleJoin} variant="outline" className="w-full rounded-xl border-pink-200 text-pink-600 hover:bg-pink-50">
              Join Circle
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  // ── Circle exists ─────────────────────────────────────────────────────────

  // Tab definitions
  const TABS = [
    { key: "expenses", label: "Expenses",   emoji: "💸", icon: <Receipt    size={14} /> },
    { key: "emis",     label: "Joint EMIs", emoji: "🏠", icon: <CreditCard size={14} /> },
    { key: "goals",    label: "Goals",      emoji: "🎯", icon: <Target     size={14} /> },
    { key: "balances", label: "Summary",    emoji: "📊", icon: <Scale      size={14} /> },
  ];

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] pb-20 lg:pb-0" style={{ background: "#fdf2f8" }}>

        {/* ── Gradient header bar ───────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-pink-500 to-pink-600 px-4 py-4 lg:px-6">
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-pink-100 mb-0.5">Family Circle</p>
              <h1 className="text-lg font-bold text-white truncate">{circle.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-pink-100">Invite code:</span>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 rounded-lg px-2 py-0.5 text-xs font-mono font-bold tracking-widest text-white transition-colors"
                >
                  {circle.invite_code}
                  {copiedCode ? <Check size={10} /> : <Copy size={10} />}
                </button>
              </div>
            </div>

            {/* Online count — only show when someone is actually online */}
            {onlineUserIds.size > 0 && (
              <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm animate-pulse" />
                <span className="text-xs text-white font-semibold">{onlineUserIds.size} online</span>
              </div>
            )}

            {/* Actions */}
            {isOwner ? (
              <button onClick={handleDelete} className="text-pink-200 hover:text-white transition-colors shrink-0" title="Delete circle">
                <Trash2 size={15} />
              </button>
            ) : (
              <button onClick={handleLeave} className="text-pink-200 hover:text-white transition-colors flex items-center gap-1 text-xs shrink-0">
                <LogOut size={13} /> Leave
              </button>
            )}
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-3 lg:px-6 py-4">

          {/* Tab switcher — visible on all screen sizes */}
          <div className="flex items-center gap-2 mb-4 bg-white rounded-2xl border border-stone-100 shadow-sm p-1.5">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  activeTab === tab.key
                    ? "bg-pink-500 text-white shadow-sm"
                    : "text-stone-500 hover:bg-stone-50"
                }`}
              >
                <span className="hidden sm:inline">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden text-base leading-none">{tab.emoji}</span>
                <span className="sm:hidden text-xs">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── Expenses tab ────────────────────────────────────────────── */}
          {activeTab === "expenses" && (
            <div className="space-y-4">
              {/* Family Overview stats strip */}
              {(() => {
                const now = new Date();
                const thisMonthExpenses = (expenses || []).filter(e => {
                  if (!e.date) return false;
                  const d = new Date(e.date);
                  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
                });
                const monthTotal = thisMonthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
                const latestExp = (expenses || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                return (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-3 text-center">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">This Month</p>
                      <p className="text-base font-bold text-pink-600">{fmtAmt(monthTotal)}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">family spending</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-3 text-center">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Members</p>
                      <p className="text-base font-bold text-stone-800">{members.length}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">in this circle</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-3 text-center">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Latest</p>
                      <p className="text-base font-bold text-stone-800 truncate">{latestExp ? fmtAmt(latestExp.amount) : "—"}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5 truncate">{latestExp ? latestExp.description : "no expenses"}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Compact horizontal member strip */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-4 py-3">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Users size={11} className="text-pink-400" /> Members
                </p>
                <div className="flex items-center gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {members.map((m, i) => {
                    const { bg, text } = memberColor(i);
                    const isMe = m.user_id === user?.id;
                    const isOwner = m.user_id === circle.owner_id;
                    const isOnline = onlineUserIds.has(m.user_id);
                    return (
                      <div key={m.user_id} className="flex flex-col items-center gap-1 shrink-0">
                        <div className="relative">
                          <div style={{
                            width: 40, height: 40, borderRadius: "50%",
                            background: bg, color: text,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: 16,
                          }}>
                            {(m.name || "?")[0].toUpperCase()}
                          </div>
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white" />
                          )}
                        </div>
                        <div className="text-center" style={{ maxWidth: 52 }}>
                          <p className="text-[10px] font-semibold text-stone-700 truncate leading-tight">
                            {isMe ? "You" : m.name.split(" ")[0]}
                          </p>
                          {isOwner && (
                            <p className="text-[9px] text-amber-500 font-bold leading-none mt-0.5">Owner</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Expenses list */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                  <h3 className="font-bold text-stone-800 text-sm">All Expenses</h3>
                  <Button
                    size="sm"
                    onClick={() => {
                      setExpenseForm({
                        description: "", amount: "",
                        paid_by: members[0]?.name || "",
                        date: new Date().toISOString().slice(0, 10), category: "General",
                      });
                      setShowAddExpense(true);
                    }}
                    className="h-7 px-3 text-xs bg-pink-500 hover:bg-pink-600 text-white rounded-lg"
                  >
                    <Plus size={12} className="mr-0.5" /> Add Expense
                  </Button>
                </div>
                {!expenses?.length ? (
                  <div className="py-12 text-center text-stone-400">
                    <Receipt size={32} className="mx-auto mb-2 text-stone-200" />
                    <p className="text-sm font-medium">No expenses yet</p>
                    <p className="text-xs mt-1">Add the first shared expense above</p>
                  </div>
                ) : (() => {
                  const sorted = [...(expenses || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
                  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
                  const page = Math.min(expPage, totalPages - 1);
                  const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                  return (
                    <>
                      <div className="divide-y divide-stone-50">
                        {slice.map(exp => (
                          <div key={exp.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors group">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-stone-800 text-sm truncate">{exp.description}</p>
                              <p className="text-xs text-stone-400">{exp.paid_by} paid · split {exp.split_among?.length || 1} ways</p>
                              <p className="text-[10px] text-stone-300 mt-0.5">{exp.date}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-stone-800 text-sm">{fmtAmt(exp.amount)}</p>
                              <p className="text-[10px] text-stone-400">{fmtAmt(exp.share_per_person)} each</p>
                              {exp.settled && <span className="text-[9px] text-emerald-500 font-semibold">Settled</span>}
                            </div>
                            <button onClick={() => handleDeleteExpense(exp.id)}
                              className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 transition-all ml-1">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
                          <button onClick={() => setExpPage(p => Math.max(0, p - 1))} disabled={page === 0}
                            className="text-xs font-semibold text-stone-500 hover:text-stone-800 disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                            ← Prev
                          </button>
                          <span className="text-xs text-stone-400">Page {page + 1} of {totalPages}</span>
                          <button onClick={() => setExpPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                            className="text-xs font-semibold text-stone-500 hover:text-stone-800 disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                            Next →
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Joint EMIs tab ──────────────────────────────────────────── */}
          {activeTab === "emis" && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                  <div>
                    <h3 className="font-bold text-stone-800 text-sm">Joint EMIs</h3>
                    <p className="text-[10px] text-stone-400 mt-0.5">Home loan, rent, shared subscriptions</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAddEmi(true)}
                    className="h-7 px-3 text-xs bg-pink-500 hover:bg-pink-600 text-white rounded-lg"
                  >
                    <Plus size={12} className="mr-0.5" /> Add EMI
                  </Button>
                </div>
                {!circleEmis?.length ? (
                  <div className="py-12 text-center text-stone-400">
                    <CreditCard size={32} className="mx-auto mb-2 text-stone-200" />
                    <p className="text-sm font-medium">No joint EMIs yet</p>
                    <p className="text-xs mt-1">Add a home loan, rent, or shared subscription</p>
                  </div>
                ) : (() => {
                  const totalPages = Math.ceil(circleEmis.length / PAGE_SIZE);
                  const page = Math.min(emiPage, totalPages - 1);
                  const slice = circleEmis.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                  return (
                    <>
                      <div className="divide-y divide-stone-50">
                        {slice.map(emi => (
                          <div key={emi.id} className="px-4 py-3 hover:bg-stone-50 transition-colors group">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-stone-800 text-sm truncate">{emi.name}</p>
                                  <span className="text-[10px] bg-pink-50 text-pink-600 font-semibold px-1.5 py-0.5 rounded-full shrink-0">{emi.category}</span>
                                </div>
                                <p className="text-xs text-stone-400 mt-0.5">Due: {emi.due_day}th · {emi.start_date?.slice(0,7)} → {emi.end_date?.slice(0,7)}</p>
                              </div>
                              <div className="text-right shrink-0 flex items-center gap-2">
                                <p className="font-bold text-stone-800 text-sm">{fmtAmt(emi.total_amount)}<span className="text-[10px] text-stone-400 font-normal">/mo</span></p>
                                <button onClick={() => handleDeleteEmi(emi.id)}
                                  className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 transition-all">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            {emi.members_share && Object.keys(emi.members_share).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {Object.entries(emi.members_share).map(([name, amt]) => (
                                  <span key={name} className="text-[10px] bg-stone-100 text-stone-600 font-medium px-2 py-0.5 rounded-full">
                                    {name.split(" ")[0]}: {fmtAmt(amt)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
                          <button onClick={() => setEmiPage(p => Math.max(0, p - 1))} disabled={page === 0}
                            className="text-xs font-semibold text-stone-500 hover:text-stone-800 disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                            ← Prev
                          </button>
                          <span className="text-xs text-stone-400">Page {page + 1} of {totalPages}</span>
                          <button onClick={() => setEmiPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                            className="text-xs font-semibold text-stone-500 hover:text-stone-800 disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                            Next →
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Monthly total */}
              {circleEmis?.length > 0 && (
                <div className="bg-gradient-to-r from-pink-500 to-pink-600 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-pink-100 text-xs font-semibold">Total monthly commitment</p>
                    <p className="text-white text-2xl font-bold mt-0.5">
                      {fmtAmt(circleEmis.reduce((s, e) => s + (e.total_amount || 0), 0))}
                    </p>
                    <p className="text-pink-100 text-xs mt-0.5">{circleEmis.length} active EMI{circleEmis.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <CreditCard size={22} className="text-white" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Goals tab ───────────────────────────────────────────────── */}
          {activeTab === "goals" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-stone-800 text-sm flex items-center gap-1.5">
                  <Target size={15} className="text-pink-500" /> Shared Goals
                </h3>
                <button
                  onClick={() => setShowAddGoal(true)}
                  className="flex items-center gap-1 h-8 px-3 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-colors"
                >
                  <Plus size={13} /> New Goal
                </button>
              </div>

              {showAddGoal && (
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-3">
                  <p className="text-sm font-bold text-stone-800">Create a Shared Goal</p>
                  <div className="flex gap-2">
                    <input
                      className="w-12 border border-stone-200 rounded-xl px-2 py-2 text-center text-xl focus:outline-none focus:ring-2 focus:ring-pink-300"
                      value={goalForm.emoji}
                      onChange={e => setGoalForm(f => ({ ...f, emoji: e.target.value }))}
                      placeholder="🎯"
                    />
                    <input
                      className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                      placeholder="Goal name (e.g. Family Vacation)"
                      value={goalForm.name}
                      onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <input
                    type="number"
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    placeholder="Target amount (₹)"
                    value={goalForm.target_amount}
                    onChange={e => setGoalForm(f => ({ ...f, target_amount: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleAddGoal} className="flex-1 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-sm h-9">Create Goal</Button>
                    <Button variant="outline" onClick={() => setShowAddGoal(false)} className="rounded-xl text-sm h-9">Cancel</Button>
                  </div>
                </div>
              )}

              {!circleGoals?.length && !showAddGoal && (
                <div className="py-12 text-center bg-white rounded-2xl border border-stone-100">
                  <Target size={32} className="mx-auto mb-2 text-stone-200" />
                  <p className="text-sm font-medium text-stone-500">No shared goals yet</p>
                  <p className="text-xs text-stone-400 mt-1">Create a goal your family can contribute to together</p>
                </div>
              )}

              {(circleGoals || []).map(goal => {
                const pct = goal.target_amount > 0 ? Math.min(100, (goal.saved_amount / goal.target_amount) * 100) : 0;
                const isContributing = contributeGoalId === goal.id;
                const isOwner = goal.created_by === user?.id;
                return (
                  <div key={goal.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{goal.emoji || "🎯"}</span>
                        <div>
                          <p className="font-bold text-stone-800 text-sm">{goal.name}</p>
                          <p className="text-[11px] text-stone-400">Target: ₹{Math.round(goal.target_amount).toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                      {isOwner && (
                        <button onClick={() => handleDeleteGoal(goal.id)} className="text-stone-300 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-stone-500">₹{Math.round(goal.saved_amount || 0).toLocaleString("en-IN")} saved</span>
                        <span className="font-semibold text-pink-600">{Math.round(pct)}%</span>
                      </div>
                      <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-pink-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-stone-400 mt-1">
                        ₹{Math.round(Math.max(0, goal.target_amount - (goal.saved_amount || 0))).toLocaleString("en-IN")} remaining
                      </p>
                    </div>

                    {(goal.contributions || []).length > 0 && (
                      <div className="mb-3 space-y-1">
                        {goal.contributions.slice(-3).map((c, ci) => (
                          <div key={ci} className="flex justify-between text-xs text-stone-500">
                            <span>{c.member_name} · {c.date}</span>
                            <span className="font-semibold text-emerald-600">+₹{Math.round(c.amount).toLocaleString("en-IN")}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isContributing ? (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                          placeholder="Amount (₹)"
                          value={contributeAmount}
                          onChange={e => setContributeAmount(e.target.value)}
                          autoFocus
                        />
                        <button onClick={() => handleContributeGoal(goal.id)} className="bg-pink-500 hover:bg-pink-600 text-white text-xs font-semibold px-4 rounded-xl transition-colors">Add</button>
                        <button onClick={() => { setContributeGoalId(null); setContributeAmount(""); }} className="text-stone-400 text-xs px-2">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setContributeGoalId(goal.id); setContributeAmount(""); }}
                        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-pink-200 text-pink-600 hover:bg-pink-50 text-xs font-semibold transition-colors"
                      >
                        <Plus size={13} /> Contribute
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Summary tab ─────────────────────────────────────────────── */}
          {activeTab === "balances" && (() => {
            const now = new Date();
            const thisMonthExpenses = (expenses || []).filter(e => {
              if (!e.date) return false;
              const d = new Date(e.date);
              return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            });
            const monthTotal = thisMonthExpenses.reduce((s, e) => s + (e.amount || 0), 0);

            // Per-member contribution totals this month
            const contributions = {};
            members.forEach(m => { contributions[m.name] = 0; });
            thisMonthExpenses.forEach(e => {
              if (e.paid_by && contributions[e.paid_by] !== undefined) {
                contributions[e.paid_by] += e.amount || 0;
              } else if (e.paid_by) {
                contributions[e.paid_by] = (contributions[e.paid_by] || 0) + (e.amount || 0);
              }
            });

            const monthName = now.toLocaleString("en-IN", { month: "long" });

            return (
              <div className="space-y-4">
                {/* Month total banner */}
                <div className="bg-gradient-to-r from-pink-500 to-pink-600 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-pink-100 text-xs font-semibold">{monthName} — Family Spending</p>
                    <p className="text-white text-2xl font-bold mt-0.5">{fmtAmt(monthTotal)}</p>
                    <p className="text-pink-100 text-xs mt-0.5">{thisMonthExpenses.length} expense{thisMonthExpenses.length !== 1 ? "s" : ""} this month</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Users size={22} className="text-white" />
                  </div>
                </div>

                {/* Per-member contributions */}
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                  <h3 className="font-bold text-stone-800 text-sm flex items-center gap-1.5 mb-4">
                    <Scale size={14} className="text-pink-500" /> Member Contributions — {monthName}
                  </h3>
                  {Object.keys(contributions).length === 0 ? (
                    <p className="text-sm text-stone-400 text-center py-4">No expenses this month yet</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(contributions)
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, amt], i) => {
                          const pct = monthTotal > 0 ? (amt / monthTotal) * 100 : 0;
                          const colorIdx = members.findIndex(m => m.name === name);
                          const { bg, text } = memberColor(colorIdx >= 0 ? colorIdx : i);
                          return (
                            <div key={name} className="flex items-center gap-3">
                              <div style={{
                                width: 32, height: 32, borderRadius: "50%",
                                background: bg, color: text,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontWeight: 800, fontSize: 13, flexShrink: 0,
                              }}>
                                {(name || "?")[0].toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-semibold text-stone-700 truncate">{name}</p>
                                  <p className="text-sm font-bold text-stone-800 shrink-0 ml-2">{fmtAmt(amt)}</p>
                                </div>
                                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-pink-400 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-stone-400 mt-0.5">{pct.toFixed(0)}% of total</p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {isOwner && (expenses?.filter(e => !e.settled)?.length > 0) && (
                  <button onClick={handleSettle} className="w-full text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl py-2.5 transition-colors border border-emerald-100">
                    Mark all as Settled
                  </button>
                )}
              </div>
            );
          })()}


        </div>
      </div>

      {/* ── Add Expense Modal ─────────────────────────────────────────────── */}
      {showAddExpense && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" onClick={() => setShowAddExpense(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[201] lg:inset-0 lg:flex lg:items-center lg:justify-center">
            <div className="bg-white rounded-t-3xl lg:rounded-2xl shadow-2xl p-5 w-full lg:max-w-md animate-in slide-in-from-bottom lg:animate-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-stone-800">Add Circle Expense</h3>
                <button onClick={() => setShowAddExpense(false)} className="text-stone-400 hover:text-stone-600">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <input
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  placeholder="Description"
                  value={expenseForm.description}
                  onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                />
                <input
                  type="number"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  placeholder="Amount (₹)"
                  value={expenseForm.amount}
                  onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                />
                <select
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
                  value={expenseForm.paid_by}
                  onChange={e => setExpenseForm(f => ({ ...f, paid_by: e.target.value }))}
                >
                  <option value="">Who paid?</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  value={expenseForm.date}
                  onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowAddExpense(false)}>Cancel</Button>
                <Button className="flex-1 bg-pink-500 hover:bg-pink-600 text-white rounded-xl" onClick={handleAddExpense}>Add</Button>
              </div>
            </div>
          </div>
        </>
      )}
      {/* ── Add EMI Modal ──────────────────────────────────────────────────── */}
      {showAddEmi && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" onClick={() => setShowAddEmi(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[201] lg:inset-0 lg:flex lg:items-center lg:justify-center">
            <div className="bg-white rounded-t-3xl lg:rounded-2xl shadow-2xl p-5 w-full lg:max-w-md animate-in slide-in-from-bottom lg:animate-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-stone-800">Add Joint EMI</h3>
                <button onClick={() => setShowAddEmi(false)} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
              </div>
              <div className="space-y-3">
                <input
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  placeholder="Name (e.g. Home Loan, Netflix, House Rent)"
                  value={emiForm.name}
                  onChange={e => setEmiForm(f => ({ ...f, name: e.target.value }))}
                />
                <input
                  type="number"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  placeholder="Monthly amount (₹)"
                  value={emiForm.total_amount}
                  onChange={e => setEmiForm(f => ({ ...f, total_amount: e.target.value }))}
                />
                <select
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
                  value={emiForm.category}
                  onChange={e => setEmiForm(f => ({ ...f, category: e.target.value }))}
                >
                  {["Home Loan", "Rent", "Car Loan", "Subscription", "Education", "Insurance", "Other"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide ml-1">Start</label>
                    <input
                      type="date"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 mt-1"
                      value={emiForm.start_date}
                      onChange={e => setEmiForm(f => ({ ...f, start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide ml-1">End</label>
                    <input
                      type="date"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 mt-1"
                      value={emiForm.end_date}
                      onChange={e => setEmiForm(f => ({ ...f, end_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide ml-1">Due day of month</label>
                  <input
                    type="number" min="1" max="31"
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 mt-1"
                    placeholder="e.g. 5"
                    value={emiForm.due_day}
                    onChange={e => setEmiForm(f => ({ ...f, due_day: e.target.value }))}
                  />
                </div>
                {/* Per-member split — auto equal, user can override */}
                {members.length > 0 && emiForm.total_amount && (
                  <div>
                    <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-2 ml-1">Member Share (auto-split equally)</p>
                    <div className="space-y-1.5">
                      {members.map(m => {
                        const autoEach = parseFloat((parseFloat(emiForm.total_amount || 0) / members.length).toFixed(2));
                        const val = emiForm.members_share[m.name] ?? autoEach;
                        return (
                          <div key={m.user_id} className="flex items-center gap-2">
                            <span className="text-xs text-stone-600 font-medium w-24 truncate">{m.name.split(" ")[0]}</span>
                            <input
                              type="number"
                              className="flex-1 border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-pink-200"
                              value={val}
                              onChange={e => setEmiForm(f => ({ ...f, members_share: { ...f.members_share, [m.name]: parseFloat(e.target.value) || 0 } }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowAddEmi(false)}>Cancel</Button>
                <Button className="flex-1 bg-pink-500 hover:bg-pink-600 text-white rounded-xl" onClick={handleAddEmi}>Add EMI</Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
