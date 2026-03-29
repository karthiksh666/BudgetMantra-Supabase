import { useState, useCallback } from "react";
import { useStaleData } from "@/hooks/useStaleData";
import PageLoader from "@/components/PageLoader";
import axios from "axios";
import { API } from "@/App";
import { useAuth } from "@/context/AuthContext";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users, Plus, Trash2, IndianRupee, ArrowRight,
  ChevronLeft, ReceiptText, Scale, AlertCircle, Pencil,
  CheckCircle2, ListFilter, SplitSquareVertical,
} from "lucide-react";

const fmtINR = (n) => `₹${Math.abs(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
const today = () => new Date().toISOString().split("T")[0];

const CAT_OPTIONS = ["Food", "Accommodation", "Transport", "Shopping", "Entertainment", "Utilities", "Fuel", "Other"];

const CAT_EMOJI = { Food: "🍕", Accommodation: "🏨", Transport: "🚗", Shopping: "🛍️", Entertainment: "🎬", Utilities: "💡", Fuel: "⛽", Other: "📦" };

const TIPS = [
  "Tracking together prevents awkward 'who paid?' moments.",
  "Split bills instantly — no more spreadsheets.",
  "Chanakya knows your group balances too.",
];

const AVATAR_COLORS = [
  { bg: "#fde68a", text: "#92400e" }, { bg: "#bbf7d0", text: "#14532d" },
  { bg: "#bfdbfe", text: "#1e3a8a" }, { bg: "#f5d0fe", text: "#701a75" },
  { bg: "#fed7aa", text: "#7c2d12" }, { bg: "#a5f3fc", text: "#164e63" },
  { bg: "#fecdd3", text: "#9f1239" }, { bg: "#d9f99d", text: "#365314" },
];
const avatarColor = (i) => AVATAR_COLORS[Math.abs(i) % AVATAR_COLORS.length];
const avatarIdx = (name, members) => members.indexOf(name);

const EMPTY_EXP = { description: "", amount: "", paid_by: "", category: "Food", split_among: [], date: today(), notes: "", split_type: "equal", splits: {} };

export default function GroupExpenses() {
  const { user } = useAuth();
  const myName = user?.name || "";

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [expenses,      setExpenses]      = useState([]);
  const [balances,      setBalances]      = useState([]);
  const [settlements,   setSettlements]   = useState([]);
  const [expLoading,    setExpLoading]    = useState(false);
  const [activeTab,     setActiveTab]     = useState("balances"); // "balances" | "expenses" | "activity"

  const [showNewGroup,   setShowNewGroup]   = useState(false);
  const [showExpModal,   setShowExpModal]   = useState(false);
  const [editingExp,     setEditingExp]     = useState(null); // expense object or null
  const [settleTarget,   setSettleTarget]   = useState(null); // {from, to, amount}
  const [deleteGroupId,  setDeleteGroupId]  = useState(null);
  const [deleteExpId,    setDeleteExpId]    = useState(null);

  const [groupForm, setGroupForm] = useState({ name: "", description: "", members: "" });
  const [expForm,   setExpForm]   = useState(EMPTY_EXP);
  const [savingExp, setSavingExp] = useState(false);
  const [settling,  setSettling]  = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────────
  const fetchGroupsFn = useCallback(async () => {
    const { data } = await axios.get(`${API}/expense-groups`);
    return data || [];
  }, []);
  const { data: groups, loading, reload: fetchGroups } = useStaleData(
    "bm_groups_cache", fetchGroupsFn, { errorMsg: "Could not load groups", fallback: [] },
  );

  const fetchGroupDetails = async (group) => {
    setSelectedGroup(group);
    setExpLoading(true);
    try {
      const [expRes, balRes, setRes] = await Promise.all([
        axios.get(`${API}/expense-groups/${group.id}/expenses`),
        axios.get(`${API}/expense-groups/${group.id}/balances`),
        axios.get(`${API}/expense-groups/${group.id}/settlements`),
      ]);
      setExpenses(Array.isArray(expRes.data) ? expRes.data : []);
      setBalances(Array.isArray(balRes.data) ? balRes.data : []);
      setSettlements(Array.isArray(setRes.data) ? setRes.data : []);
    } catch { toast.error("Could not load group details"); }
    finally { setExpLoading(false); }
  };

  const refreshGroup = async () => {
    if (!selectedGroup) return;
    try {
      const [expRes, balRes, setRes] = await Promise.all([
        axios.get(`${API}/expense-groups/${selectedGroup.id}/expenses`),
        axios.get(`${API}/expense-groups/${selectedGroup.id}/balances`),
        axios.get(`${API}/expense-groups/${selectedGroup.id}/settlements`),
      ]);
      setExpenses(Array.isArray(expRes.data) ? expRes.data : []);
      setBalances(Array.isArray(balRes.data) ? balRes.data : []);
      setSettlements(Array.isArray(setRes.data) ? setRes.data : []);
    } catch {}
  };

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleCreateGroup = async () => {
    if (!groupForm.name) { toast.error("Enter a group name"); return; }
    const members = groupForm.members.split(",").map(m => m.trim()).filter(Boolean);
    if (members.length < 1) { toast.error("Add at least one member"); return; }
    try {
      await axios.post(`${API}/expense-groups`, { name: groupForm.name, description: groupForm.description, members });
      fetchGroups();
      setShowNewGroup(false);
      setGroupForm({ name: "", description: "", members: "" });
      toast.success("Group created!");
    } catch (e) { toast.error(e.response?.data?.detail || "Could not create group"); }
  };

  const handleDeleteGroup = async () => {
    try {
      await axios.delete(`${API}/expense-groups/${deleteGroupId}`);
      fetchGroups();
      if (selectedGroup?.id === deleteGroupId) { setSelectedGroup(null); setExpenses([]); setBalances([]); setSettlements([]); }
      setDeleteGroupId(null);
      toast.success("Group deleted");
    } catch { toast.error("Could not delete group"); }
  };

  const openAddExpense = () => {
    setEditingExp(null);
    setExpForm({ ...EMPTY_EXP, paid_by: myName && selectedGroup?.members?.includes(myName) ? myName : "" });
    setShowExpModal(true);
  };

  const openEditExpense = (exp) => {
    setEditingExp(exp);
    setExpForm({
      description: exp.description,
      amount: String(exp.amount),
      paid_by: exp.paid_by,
      category: exp.category || "Food",
      split_among: exp.split_among || [],
      date: exp.date || today(),
      notes: exp.notes || "",
      split_type: exp.split_type || "equal",
      splits: exp.splits || {},
    });
    setShowExpModal(true);
  };

  const handleSaveExpense = async () => {
    if (!expForm.description || !expForm.amount || !expForm.paid_by) {
      toast.error("Fill all required fields"); return;
    }
    const splitAmong = expForm.split_among.length ? expForm.split_among : selectedGroup.members;
    const payload = {
      description: expForm.description,
      amount: parseFloat(expForm.amount),
      paid_by: expForm.paid_by,
      category: expForm.category,
      split_among: splitAmong,
      date: expForm.date || today(),
      notes: expForm.notes,
      split_type: expForm.split_type,
      splits: expForm.split_type === "exact" ? expForm.splits : null,
    };
    setSavingExp(true);
    try {
      if (editingExp) {
        await axios.put(`${API}/expense-groups/${selectedGroup.id}/expenses/${editingExp.id}`, payload);
        toast.success("Expense updated");
      } else {
        await axios.post(`${API}/expense-groups/${selectedGroup.id}/expenses`, payload);
        toast.success("Expense added");
      }
      setShowExpModal(false);
      setEditingExp(null);
      setExpForm(EMPTY_EXP);
      await refreshGroup();
    } catch (e) { toast.error(e.response?.data?.detail || "Could not save expense"); }
    finally { setSavingExp(false); }
  };

  const handleDeleteExpense = async () => {
    try {
      await axios.delete(`${API}/expense-groups/${selectedGroup.id}/expenses/${deleteExpId}`);
      setDeleteExpId(null);
      await refreshGroup();
      toast.success("Expense removed");
    } catch { toast.error("Could not delete expense"); }
  };

  const handleSettle = async () => {
    if (!settleTarget) return;
    setSettling(true);
    try {
      await axios.post(`${API}/expense-groups/${selectedGroup.id}/settle`, {
        paid_by: settleTarget.from,
        paid_to: settleTarget.to,
        amount: settleTarget.amount,
        note: settleTarget.note || "",
        date: today(),
      });
      setSettleTarget(null);
      await refreshGroup();
      toast.success(`✓ Settled ${fmtINR(settleTarget.amount)} from ${settleTarget.from} to ${settleTarget.to}`);
    } catch { toast.error("Could not record settlement"); }
    finally { setSettling(false); }
  };

  const toggleSplitMember = (m) => setExpForm(f => ({
    ...f,
    split_among: f.split_among.includes(m) ? f.split_among.filter(x => x !== m) : [...f.split_among, m],
  }));

  // ── Derived ──────────────────────────────────────────────────────────────────
  const members    = selectedGroup?.members || [];
  const totalSpent = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const iAmMember  = members.includes(myName);
  const myPaid     = expenses.filter(e => e.paid_by === myName).reduce((s, e) => s + (e.amount || 0), 0);
  const myShare    = expenses.reduce((s, e) => {
    const split = e.split_among?.length ? e.split_among : members;
    return split.includes(myName) ? s + e.amount / split.length : s;
  }, 0);
  const myNet = myPaid - myShare;

  // Per-member net balance (for summary chips)
  const memberBalances = members.reduce((acc, m) => {
    const paid  = expenses.filter(e => e.paid_by === m).reduce((s, e) => s + e.amount, 0);
    const share = expenses.reduce((s, e) => {
      const sp = e.split_among?.length ? e.split_among : members;
      return sp.includes(m) ? s + e.amount / sp.length : s;
    }, 0);
    const settledOut = settlements.filter(s => s.paid_by === m).reduce((s, x) => s + x.amount, 0);
    const settledIn  = settlements.filter(s => s.paid_to === m).reduce((s, x) => s + x.amount, 0);
    acc[m] = paid - share + settledIn - settledOut;
    return acc;
  }, {});

  // Combined activity feed (expenses + settlements sorted by date desc)
  const activity = [
    ...expenses.map(e => ({ ...e, _type: "expense" })),
    ...settlements.map(s => ({ ...s, _type: "settlement" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-amber-50/30 flex items-center justify-center">
        <PageLoader message="Loading groups…" tips={TIPS} />
      </div>
    </>
  );

  const showDetail = !!selectedGroup;

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] pb-20 lg:pb-0" style={{ background: "#fffaf5" }}>
        <div className="max-w-6xl mx-auto px-4 py-4 lg:py-6">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-4">
            {showDetail ? (
              <div className="flex items-center gap-3 lg:hidden">
                <button onClick={() => { setSelectedGroup(null); setExpenses([]); setBalances([]); setSettlements([]); }}
                  className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600">
                  <ChevronLeft size={18} />
                </button>
                <div>
                  <h1 className="text-base font-bold text-stone-900">{selectedGroup.name}</h1>
                  <p className="text-xs text-stone-400">{members.length} members · {fmtINR(totalSpent)} total</p>
                </div>
              </div>
            ) : null}
            <div className={showDetail ? "hidden lg:flex items-center gap-3" : "flex items-center gap-3"}>
              <div className="w-9 h-9 rounded-2xl bg-orange-100 flex items-center justify-center">
                <Users size={18} className="text-orange-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-stone-900">Group Expenses</h1>
                <p className="text-xs text-stone-500">Splitwise-style bill splitting</p>
              </div>
            </div>
            <Button onClick={() => setShowNewGroup(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-sm flex items-center gap-1.5 text-sm h-9">
              <Plus size={15} /> New Group
            </Button>
          </div>

          {groups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users size={28} className="text-orange-500" />
              </div>
              <h3 className="text-lg font-semibold text-stone-800 mb-2">No groups yet</h3>
              <p className="text-stone-500 text-sm mb-6 max-w-xs mx-auto">Create a group for a trip, flatmates, or any shared expense.</p>
              <Button onClick={() => setShowNewGroup(true)} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl">
                Create your first group
              </Button>
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-3 lg:gap-4">

              {/* ── Group list ── */}
              <div className={`space-y-2 ${showDetail ? "hidden lg:block" : ""}`}>
                {groups.map((g, gi) => {
                  const { bg, text } = avatarColor(gi);
                  const isSelected = selectedGroup?.id === g.id;
                  return (
                    <div key={g.id} onClick={() => fetchGroupDetails(g)}
                      className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md active:scale-[0.98] ${
                        isSelected ? "border-orange-300 shadow-md ring-1 ring-orange-200" : "border-stone-100 shadow-sm"
                      }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ background: bg, color: text }}>
                            {g.name[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-800 text-sm truncate">{g.name}</p>
                            <p className="text-xs text-stone-400">{g.members?.length || 0} members</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button onClick={(e) => { e.stopPropagation(); setDeleteGroupId(g.id); }}
                            className="p-1.5 text-stone-200 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                            <Trash2 size={13} />
                          </button>
                          <ChevronLeft size={15} className="text-stone-300 rotate-180" />
                        </div>
                      </div>
                      {g.description && <p className="text-xs text-stone-400 mt-2 truncate">{g.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(g.members || []).slice(0, 4).map(m => (
                          <span key={m} className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">{m}</span>
                        ))}
                        {(g.members?.length || 0) > 4 && (
                          <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">+{g.members.length - 4}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Group detail ── */}
              <div className={`lg:col-span-2 space-y-3 ${showDetail ? "" : "hidden lg:block"}`}>
                {selectedGroup ? (
                  expLoading ? (
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 flex items-center justify-center min-h-[200px]">
                      <div className="text-center">
                        <div className="flex justify-center gap-1.5 mb-3">
                          {[0,1,2].map(i => (
                            <span key={i} className="w-2 h-2 rounded-full bg-orange-400 inline-block animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                        <p className="text-xs text-stone-400">Loading…</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* ── Summary strip ── */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-3 text-center">
                          <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Total</p>
                          <p className="text-base font-bold text-orange-600">{fmtINR(totalSpent)}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</p>
                        </div>
                        <div className={`rounded-2xl border shadow-sm p-3 text-center ${
                          iAmMember
                            ? myNet > 0.5 ? "bg-emerald-50 border-emerald-100" : myNet < -0.5 ? "bg-red-50 border-red-100" : "bg-white border-stone-100"
                            : "bg-white border-stone-100"
                        }`}>
                          <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Your balance</p>
                          <p className={`text-base font-bold ${myNet > 0.5 ? "text-emerald-600" : myNet < -0.5 ? "text-red-500" : "text-stone-500"}`}>
                            {myNet > 0.5 ? "+" : myNet < -0.5 ? "-" : ""}{fmtINR(Math.abs(myNet))}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${myNet > 0.5 ? "text-emerald-500" : myNet < -0.5 ? "text-red-400" : "text-stone-400"}`}>
                            {myNet > 0.5 ? "owed to you" : myNet < -0.5 ? "you owe" : "all clear ✓"}
                          </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-3 text-center">
                          <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Outstanding</p>
                          <p className="text-base font-bold text-stone-800">{balances.length}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">{balances.length === 0 ? "all settled ✓" : "debt(s) left"}</p>
                        </div>
                      </div>

                      {/* ── Member balance pills ── */}
                      {members.length > 0 && (
                        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                          <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-3">Member Balances</p>
                          <div className="flex flex-wrap gap-2">
                            {members.map((m, mi) => {
                              const net = memberBalances[m] || 0;
                              const { bg, text } = avatarColor(mi);
                              return (
                                <div key={m} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${
                                  net > 0.5 ? "bg-emerald-50 border-emerald-100" : net < -0.5 ? "bg-red-50 border-red-100" : "bg-stone-50 border-stone-100"
                                }`}>
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: bg, color: text }}>
                                    {m[0].toUpperCase()}
                                  </div>
                                  <span className="font-medium text-stone-700">{m}</span>
                                  <span className={`font-bold text-xs ${net > 0.5 ? "text-emerald-600" : net < -0.5 ? "text-red-500" : "text-stone-400"}`}>
                                    {net > 0.5 ? `+${fmtINR(net)}` : net < -0.5 ? `-${fmtINR(Math.abs(net))}` : "settled"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ── Tabs ── */}
                      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                        <div className="flex border-b border-stone-100">
                          {[
                            { key: "balances", label: "Settle Up", icon: Scale },
                            { key: "expenses", label: "Expenses", icon: ReceiptText },
                            { key: "activity", label: "Activity", icon: ListFilter },
                          ].map(({ key, label, icon: Icon }) => (
                            <button key={key} onClick={() => setActiveTab(key)}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
                                activeTab === key ? "text-orange-600 border-b-2 border-orange-500 bg-orange-50/50" : "text-stone-400 hover:text-stone-600"
                              }`}>
                              <Icon size={13} /> {label}
                            </button>
                          ))}
                        </div>

                        <div className="p-4">
                          {/* Add expense button always visible */}
                          <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-semibold text-stone-600">
                              {activeTab === "balances" ? "Who owes who" : activeTab === "expenses" ? "All expenses" : "Recent activity"}
                            </p>
                            <Button onClick={openAddExpense} size="sm"
                              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs h-7 px-3 flex items-center gap-1">
                              <Plus size={12} /> Add Expense
                            </Button>
                          </div>

                          {/* ── Balances tab ── */}
                          {activeTab === "balances" && (
                            balances.length === 0 ? (
                              <div className="flex items-center gap-3 py-4 text-emerald-600 bg-emerald-50 rounded-xl px-4">
                                <CheckCircle2 size={20} />
                                <div>
                                  <p className="font-semibold text-sm">All settled up!</p>
                                  <p className="text-xs text-emerald-500 mt-0.5">Everyone is even. Add more expenses to track.</p>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {balances.map((b, i) => {
                                  const { bg, text } = avatarColor(avatarIdx(b.from, members));
                                  return (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100">
                                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: bg, color: text }}>
                                        {b.from?.[0]?.toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-stone-700">
                                          <strong>{b.from}</strong> owes <strong>{b.to}</strong>
                                        </p>
                                        <p className="text-xs text-stone-400 mt-0.5">{fmtINR(b.amount)}</p>
                                      </div>
                                      <ArrowRight size={13} className="text-stone-300 shrink-0" />
                                      <button
                                        onClick={() => setSettleTarget({ from: b.from, to: b.to, amount: b.amount, note: "" })}
                                        className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                                        Settle Up
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          )}

                          {/* ── Expenses tab ── */}
                          {activeTab === "expenses" && (
                            expenses.length === 0 ? (
                              <div className="text-center py-8">
                                <IndianRupee size={24} className="text-stone-300 mx-auto mb-2" />
                                <p className="text-stone-500 text-sm font-medium">No expenses yet</p>
                                <p className="text-stone-400 text-xs mt-1">Add the first expense above</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {expenses.map((exp) => {
                                  const { bg, text } = avatarColor(avatarIdx(exp.paid_by, members));
                                  const splitN = exp.split_among?.length || members.length;
                                  const perPerson = splitN > 0 ? exp.amount / splitN : exp.amount;
                                  return (
                                    <div key={exp.id} className="group flex items-start gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100 hover:border-stone-200 transition-colors">
                                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 bg-stone-100">
                                        {CAT_EMOJI[exp.category] || "📦"}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-stone-800 text-sm">{exp.description}</p>
                                        <p className="text-xs text-stone-400 mt-0.5">
                                          <span className="font-medium text-stone-600">{exp.paid_by}</span> paid · {splitN}-way split · {fmtDate(exp.date)}
                                        </p>
                                        {exp.notes && <p className="text-xs text-stone-400 italic mt-1">"{exp.notes}"</p>}
                                        {exp.split_among?.length > 0 && exp.split_among.length < members.length && (
                                          <p className="text-xs text-stone-400 mt-0.5">Split: {exp.split_among.join(", ")}</p>
                                        )}
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="font-bold text-stone-800 text-sm">{fmtINR(exp.amount)}</p>
                                        <p className="text-[10px] text-stone-400">{fmtINR(perPerson)} each</p>
                                      </div>
                                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button onClick={() => openEditExpense(exp)} className="p-1.5 text-stone-400 hover:text-orange-500 transition-colors">
                                          <Pencil size={12} />
                                        </button>
                                        <button onClick={() => setDeleteExpId(exp.id)} className="p-1.5 text-stone-400 hover:text-red-500 transition-colors">
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          )}

                          {/* ── Activity tab ── */}
                          {activeTab === "activity" && (
                            activity.length === 0 ? (
                              <div className="text-center py-8">
                                <ListFilter size={24} className="text-stone-300 mx-auto mb-2" />
                                <p className="text-stone-500 text-sm">No activity yet</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {activity.map((item, i) => {
                                  if (item._type === "settlement") {
                                    return (
                                      <div key={`s-${item.id || i}`} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                          <CheckCircle2 size={15} className="text-emerald-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-emerald-800">
                                            <strong>{item.paid_by}</strong> paid <strong>{item.paid_to}</strong>
                                          </p>
                                          {item.note && <p className="text-xs text-emerald-600 italic">"{item.note}"</p>}
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="font-bold text-emerald-700 text-sm">{fmtINR(item.amount)}</p>
                                          <p className="text-[10px] text-emerald-500">{fmtDate(item.date)}</p>
                                        </div>
                                      </div>
                                    );
                                  }
                                  const { bg, text } = avatarColor(avatarIdx(item.paid_by, members));
                                  return (
                                    <div key={`e-${item.id || i}`} className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100">
                                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0" style={{ background: bg, color: text }}>
                                        {item.paid_by?.[0]?.toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-stone-800">{item.description}</p>
                                        <p className="text-xs text-stone-400">paid by <strong className="text-stone-600">{item.paid_by}</strong></p>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="font-bold text-stone-800 text-sm">{fmtINR(item.amount)}</p>
                                        <p className="text-[10px] text-stone-400">{fmtDate(item.date)}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </>
                  )
                ) : (
                  <div className="hidden lg:flex bg-white rounded-2xl border border-stone-100 shadow-sm p-12 flex-col items-center justify-center min-h-[300px] text-center">
                    <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-3">
                      <Users size={24} className="text-orange-400" />
                    </div>
                    <p className="text-stone-600 font-medium text-sm">Select a group</p>
                    <p className="text-stone-400 text-xs mt-1">Pick a group from the left to see expenses and balances</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── New Group Modal ── */}
      <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold"><Users size={16} className="text-orange-500" /> New Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block text-sm">Group Name *</Label>
              <Input placeholder="e.g. Goa Trip, Roommates…" value={groupForm.name}
                onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
            </div>
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block text-sm">Members * <span className="font-normal text-stone-400">(comma-separated, include yourself)</span></Label>
              <Input placeholder="Ravi, Priya, Anand, You" value={groupForm.members}
                onChange={e => setGroupForm(f => ({ ...f, members: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
            </div>
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block text-sm">Description <span className="font-normal text-stone-400">(optional)</span></Label>
              <Input placeholder="Trip to Goa, Jan 2025…" value={groupForm.description}
                onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowNewGroup(false)} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleCreateGroup} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl">Create Group</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Expense Modal ── */}
      <Dialog open={showExpModal} onOpenChange={v => { if (!v) { setShowExpModal(false); setEditingExp(null); } }}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold">
              <IndianRupee size={16} className="text-orange-500" />
              {editingExp ? "Edit Expense" : "Add Expense"} — {selectedGroup?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder="What was it for? (e.g. Dinner at Shiv Sagar)" value={expForm.description}
              onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
              className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">Amount (₹) *</Label>
                <Input type="number" placeholder="1200" value={expForm.amount}
                  onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
              </div>
              <div>
                <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">Date</Label>
                <Input type="date" value={expForm.date}
                  onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">Category</Label>
                <Select value={expForm.category} onValueChange={v => setExpForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-11 rounded-xl border-stone-200"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAT_OPTIONS.map(c => <SelectItem key={c} value={c}>{CAT_EMOJI[c]} {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">Paid By *</Label>
                <Select value={expForm.paid_by} onValueChange={v => setExpForm(f => ({ ...f, paid_by: v }))}>
                  <SelectTrigger className="h-11 rounded-xl border-stone-200"><SelectValue placeholder="Who paid?" /></SelectTrigger>
                  <SelectContent>{members.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Split section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-stone-600 text-xs font-semibold">Split Among <span className="font-normal text-stone-400">(default: everyone)</span></Label>
                <div className="flex gap-1">
                  {[{key:"equal",label:"Equal"},{key:"exact",label:"Custom ₹"}].map(opt => (
                    <button key={opt.key} type="button" onClick={() => setExpForm(f => ({ ...f, split_type: opt.key }))}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                        expForm.split_type === opt.key ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {members.map(m => {
                  const inSplit = expForm.split_among.includes(m) || expForm.split_among.length === 0;
                  return (
                    <button key={m} type="button" onClick={() => toggleSplitMember(m)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        inSplit ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}>
                      {m}
                    </button>
                  );
                })}
              </div>

              {expForm.split_type === "exact" && (
                <div className="mt-3 space-y-2 p-3 bg-stone-50 rounded-xl border border-stone-100">
                  <p className="text-xs text-stone-500 font-medium flex items-center gap-1.5"><SplitSquareVertical size={12} /> Custom amounts per person</p>
                  {(expForm.split_among.length ? expForm.split_among : members).map(m => (
                    <div key={m} className="flex items-center gap-2">
                      <span className="text-sm text-stone-600 w-24 truncate">{m}</span>
                      <Input type="number" placeholder="0"
                        value={expForm.splits?.[m] || ""}
                        onChange={e => setExpForm(f => ({ ...f, splits: { ...f.splits, [m]: parseFloat(e.target.value) || 0 } }))}
                        className="h-8 rounded-lg border-stone-200 text-sm flex-1" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">Notes <span className="font-normal text-stone-400">(optional)</span></Label>
              <Input placeholder="Any details…" value={expForm.notes}
                onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))}
                className="h-10 rounded-xl border-stone-200 focus:border-orange-400" />
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => { setShowExpModal(false); setEditingExp(null); }} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleSaveExpense} disabled={savingExp} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl">
                {savingExp ? "Saving…" : editingExp ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Settle Up Modal ── */}
      <Dialog open={!!settleTarget} onOpenChange={v => { if (!v) setSettleTarget(null); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold">
              <CheckCircle2 size={16} className="text-emerald-500" /> Settle Up
            </DialogTitle>
          </DialogHeader>
          {settleTarget && (
            <div className="space-y-4 mt-2">
              <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
                <p className="text-sm text-emerald-700">
                  <strong>{settleTarget.from}</strong> pays <strong>{settleTarget.to}</strong>
                </p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtINR(settleTarget.amount)}</p>
              </div>
              <div>
                <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">Amount</Label>
                <Input type="number" value={settleTarget.amount}
                  onChange={e => setSettleTarget(t => ({ ...t, amount: parseFloat(e.target.value) || 0 }))}
                  className="h-11 rounded-xl border-stone-200 focus:border-emerald-400" />
              </div>
              <div>
                <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">Note <span className="font-normal text-stone-400">(optional)</span></Label>
                <Input placeholder="UPI, cash, bank transfer…"
                  value={settleTarget.note || ""}
                  onChange={e => setSettleTarget(t => ({ ...t, note: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 focus:border-emerald-400" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setSettleTarget(null)} className="flex-1 rounded-xl">Cancel</Button>
                <Button onClick={handleSettle} disabled={settling} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl">
                  {settling ? "Recording…" : "Mark as Settled"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete group ── */}
      <Dialog open={!!deleteGroupId} onOpenChange={() => setDeleteGroupId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Delete Group?</DialogTitle></DialogHeader>
          <p className="text-stone-500 text-sm">All expenses and settlements will be permanently deleted.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteGroupId(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleDeleteGroup} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete expense ── */}
      <Dialog open={!!deleteExpId} onOpenChange={() => setDeleteExpId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Remove Expense?</DialogTitle></DialogHeader>
          <p className="text-stone-500 text-sm">This expense will be removed and balances recalculated.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteExpId(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleDeleteExpense} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
