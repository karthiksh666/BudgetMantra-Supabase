import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import { API } from "@/App";
import { useStaleData } from "@/hooks/useStaleData";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  HandCoins, Plus, Trash2, Edit3, CheckCircle, AlertCircle,
  Phone, Mail, Calendar, FileText, Loader2
} from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import ResetDataButton from '@/components/ResetDataButton';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR = (n) =>
  `₹${Math.round(Math.abs(n) || 0).toLocaleString("en-IN")}`;

const fmtShort = (n) => {
  const abs = Math.abs(n || 0);
  const sign = (n || 0) < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
};

const fmtDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const isOverdue = (loan) => {
  if (!loan.due_date || loan.status === "settled") return false;
  return loan.due_date < new Date().toISOString().slice(0, 10);
};

const EMPTY_FORM = {
  type: "given",
  person_name: "",
  person_phone: "",
  person_email: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  due_date: "",
  reason: "",
  notes: "",
};

const EMPTY_EDIT_EXTRA = {
  status: "pending",
  settled_amount: "",
};

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    partial: "bg-blue-100 text-blue-700 border-blue-200",
    settled: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${map[status] || map.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// ── Loan Card ─────────────────────────────────────────────────────────────────
const LoanCard = ({ loan, onEdit, onDelete, onMarkSettled, settling }) => {
  const overdue = isOverdue(loan);
  const isGiven = loan.type === "given";
  const progress = loan.amount > 0 ? Math.min((loan.settled_amount / loan.amount) * 100, 100) : 0;

  return (
    <div className={`rounded-2xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
      overdue ? "border-red-200" : "border-stone-100"
    }`}>
      {/* Color accent bar */}
      <div className={`h-1 w-full ${isGiven ? "bg-emerald-400" : "bg-red-400"}`} />

      <div className="p-4">
        {/* Top row: person + amount */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-stone-900 text-base font-['Outfit'] truncate">
                {loan.person_name}
              </span>
              {overdue && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[11px] font-bold border border-red-200">
                  <AlertCircle size={10} /> OVERDUE
                </span>
              )}
              <StatusBadge status={loan.status} />
            </div>
            {/* Contact info */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {loan.person_phone && (
                <span className="flex items-center gap-1 text-stone-400 text-xs">
                  <Phone size={11} /> {loan.person_phone}
                </span>
              )}
              {loan.person_email && (
                <span className="flex items-center gap-1 text-stone-400 text-xs">
                  <Mail size={11} /> {loan.person_email}
                </span>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="text-right shrink-0">
            <p className={`text-xl font-extrabold font-['Outfit'] ${isGiven ? "text-emerald-600" : "text-red-500"}`}>
              {fmtShort(loan.amount)}
            </p>
            <p className="text-xs text-stone-400 font-medium">
              {isGiven ? "I lent" : "I borrowed"}
            </p>
          </div>
        </div>

        {/* Dates + reason */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
          <span className="flex items-center gap-1 text-stone-500 text-xs">
            <Calendar size={11} />
            {fmtDate(loan.date)}
          </span>
          {loan.due_date && (
            <span className={`flex items-center gap-1 text-xs font-medium ${overdue ? "text-red-500" : "text-stone-500"}`}>
              <Calendar size={11} />
              Due: {fmtDate(loan.due_date)}
            </span>
          )}
          {loan.reason && (
            <span className="flex items-center gap-1 text-stone-400 text-xs">
              <FileText size={11} /> {loan.reason}
            </span>
          )}
        </div>

        {/* Progress bar for partial */}
        {loan.status === "partial" && loan.settled_amount > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-stone-500 mb-1">
              <span>Settled: {fmtINR(loan.settled_amount)}</span>
              <span>Remaining: {fmtINR(loan.amount - loan.settled_amount)}</span>
            </div>
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Notes */}
        {loan.notes && (
          <p className="text-xs text-stone-400 italic mb-3 truncate">{loan.notes}</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {loan.status !== "settled" && (
            <Button
              size="sm"
              onClick={() => onMarkSettled(loan)}
              disabled={settling}
              className="h-7 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 rounded-lg shadow-sm disabled:opacity-60"
            >
              {settling
                ? <><Loader2 size={12} className="mr-1 animate-spin" /> Settling…</>
                : <><CheckCircle size={12} className="mr-1" /> Mark Settled</>
              }
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(loan)}
            className="h-7 text-xs border-stone-200 text-stone-600 hover:bg-stone-50 px-3 rounded-lg"
          >
            <Edit3 size={12} className="mr-1" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(loan)}
            className="h-7 text-xs border-red-100 text-red-500 hover:bg-red-50 px-3 rounded-lg ml-auto"
          >
            <Trash2 size={12} className="mr-1" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Loan Form (shared add/edit) ───────────────────────────────────────────────
const LoanForm = ({ form, setForm, editExtra, setEditExtra, isEdit, submitting, onSubmit, onClose }) => {
  const f = (field, val) => setForm(prev => ({ ...prev, [field]: val }));
  const fe = (field, val) => setEditExtra(prev => ({ ...prev, [field]: val }));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Type toggle */}
      {!isEdit && (
        <div>
          <Label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2 block">
            Loan Direction
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: "given",  label: "I Lent Money",    color: "emerald" },
              { val: "taken",  label: "I Borrowed Money", color: "red" },
            ].map(opt => (
              <button
                key={opt.val}
                type="button"
                onClick={() => f("type", opt.val)}
                className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                  form.type === opt.val
                    ? opt.val === "given"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-red-400 bg-red-50 text-red-600"
                    : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Person details */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label className="text-xs font-semibold text-stone-600 mb-1 block">Person Name *</Label>
          <Input
            required
            placeholder="e.g. Rahul Kumar"
            value={form.person_name}
            onChange={e => f("person_name", e.target.value)}
            className="rounded-xl border-stone-200 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold text-stone-600 mb-1 block">Phone</Label>
            <Input
              placeholder="9876543210"
              value={form.person_phone}
              onChange={e => f("person_phone", e.target.value)}
              className="rounded-xl border-stone-200 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-stone-600 mb-1 block">Email</Label>
            <Input
              type="email"
              placeholder="rahul@email.com"
              value={form.person_email}
              onChange={e => f("person_email", e.target.value)}
              className="rounded-xl border-stone-200 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Amount + Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-stone-600 mb-1 block">Amount (₹) *</Label>
          <Input
            required
            type="number"
            min="1"
            placeholder="5000"
            value={form.amount}
            onChange={e => f("amount", e.target.value)}
            className="rounded-xl border-stone-200 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-stone-600 mb-1 block">Date *</Label>
          <DatePicker
            value={form.date}
            onChange={v => f("date", v)}
            className="rounded-xl"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs font-semibold text-stone-600 mb-1 block">Due Date (optional)</Label>
        <DatePicker
          value={form.due_date}
          onChange={v => f("due_date", v)}
          className="rounded-xl"
        />
      </div>

      {/* Reason + Notes */}
      <div>
        <Label className="text-xs font-semibold text-stone-600 mb-1 block">Reason / Purpose</Label>
        <Input
          placeholder="e.g. Emergency, Business, Medical"
          value={form.reason}
          onChange={e => f("reason", e.target.value)}
          className="rounded-xl border-stone-200 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs font-semibold text-stone-600 mb-1 block">Notes</Label>
        <Input
          placeholder="Any additional notes…"
          value={form.notes}
          onChange={e => f("notes", e.target.value)}
          className="rounded-xl border-stone-200 text-sm"
        />
      </div>

      {/* Status + Settled Amount — edit only */}
      {isEdit && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100">
          <div>
            <Label className="text-xs font-semibold text-stone-600 mb-1 block">Status</Label>
            <div className="flex flex-col gap-1.5">
              {["pending", "partial", "settled"].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => fe("status", s)}
                  className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    editExtra.status === s
                      ? s === "pending"
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : s === "partial"
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-stone-200 bg-white text-stone-500"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-stone-600 mb-1 block">Settled Amount (₹)</Label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={editExtra.settled_amount}
              onChange={e => fe("settled_amount", e.target.value)}
              className="rounded-xl border-stone-200 text-sm"
            />
            <p className="text-[11px] text-stone-400 mt-1">
              Leave 0 for fully unsettled
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="flex-1 rounded-xl border-stone-200 text-stone-600"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white shadow-sm shadow-cyan-300/40"
        >
          {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Loan"}
        </Button>
      </div>
    </form>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const HandLoanTracker = () => {
  const [summary, setSummary]     = useState(null);
  const [activeTab, setActiveTab] = useState("all");

  const [addOpen, setAddOpen]         = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [settlingId, setSettlingId]   = useState(null);

  const [form, setForm]               = useState(EMPTY_FORM);
  const [editForm, setEditForm]       = useState(EMPTY_FORM);
  const [editExtra, setEditExtra]     = useState(EMPTY_EDIT_EXTRA);
  const [selectMode, setSelectMode]   = useState(false);
  const [selected, setSelected]       = useState(new Set());

  const token = () => localStorage.getItem("token");
  const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

  const fetchLoans = useCallback(async () => {
    const [loansRes, summaryRes] = await Promise.all([
      axios.get(`${API}/hand-loans`, { headers: authHeaders() }),
      axios.get(`${API}/hand-loans/summary`, { headers: authHeaders() }),
    ]);
    setSummary(summaryRes.data);
    return loansRes.data || [];
  }, []); // eslint-disable-line

  const { data: loans, loading, reload: fetchData } = useStaleData(
    "bm_hand_loans_cache",
    fetchLoans,
    { errorMsg: "Failed to load loans", fallback: [] }
  );

  useEffect(() => {
    const onLog = () => fetchData();
    window.addEventListener("chanakya-logged", onLog);
    return () => window.removeEventListener("chanakya-logged", onLog);
  }, [fetchData]);

  // ── Add ──
  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API}/hand-loans`, {
        type:         form.type,
        person_name:  form.person_name,
        person_phone: form.person_phone,
        person_email: form.person_email,
        amount:       parseFloat(form.amount),
        date:         form.date,
        due_date:     form.due_date,
        reason:       form.reason,
        notes:        form.notes,
      }, { headers: authHeaders() });
      toast.success("Loan added!");
      setAddOpen(false);
      setForm(EMPTY_FORM);
      fetchData();
    } catch (err) {
      if (err.response?.status !== 402) toast.error("Failed to add loan");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit ──
  const openEdit = (loan) => {
    setEditTarget(loan);
    setEditForm({
      type:         loan.type,
      person_name:  loan.person_name,
      person_phone: loan.person_phone || "",
      person_email: loan.person_email || "",
      amount:       loan.amount,
      date:         loan.date,
      due_date:     loan.due_date || "",
      reason:       loan.reason || "",
      notes:        loan.notes || "",
    });
    setEditExtra({
      status:         loan.status,
      settled_amount: loan.settled_amount || "",
    });
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.put(`${API}/hand-loans/${editTarget.id}`, {
        person_name:    editForm.person_name,
        person_phone:   editForm.person_phone,
        person_email:   editForm.person_email,
        amount:         parseFloat(editForm.amount),
        date:           editForm.date,
        due_date:       editForm.due_date,
        reason:         editForm.reason,
        notes:          editForm.notes,
        status:         editExtra.status,
        settled_amount: parseFloat(editExtra.settled_amount || 0),
      }, { headers: authHeaders() });
      toast.success("Loan updated!");
      setEditTarget(null);
      fetchData();
    } catch {
      toast.error("Failed to update loan");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await axios.delete(`${API}/hand-loans/${deleteTarget.id}`, { headers: authHeaders() });
      toast.success("Loan deleted");
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error("Failed to delete loan");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Quick Settle ──
  const handleMarkSettled = async (loan) => {
    setSettlingId(loan.id);
    try {
      await axios.put(`${API}/hand-loans/${loan.id}`, {
        status:         "settled",
        settled_amount: loan.amount,
      }, { headers: authHeaders() });
      toast.success(`${loan.person_name}'s loan marked as settled!`);
      fetchData();
    } catch {
      toast.error("Failed to mark settled");
    } finally {
      setSettlingId(null);
    }
  };

  // ── Multi-select ──
  const handleMultiDelete = async () => {
    try {
      await Promise.all([...selected].map(id => axios.delete(`${API}/hand-loans/${id}`, { headers: authHeaders() })));
      toast.success(`${selected.size} loan${selected.size > 1 ? "s" : ""} deleted`);
      setSelectMode(false);
      setSelected(new Set());
      fetchData();
    } catch {
      toast.error("Failed to delete selected loans");
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Filter ──
  const filtered = loans.filter(l => {
    if (activeTab === "given") return l.type === "given";
    if (activeTab === "taken") return l.type === "taken";
    return true;
  });

  const net = (summary?.total_given || 0) - (summary?.total_taken || 0);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="min-h-[calc(100vh-80px)]" style={{ background: "linear-gradient(160deg, #ecfeff 0%, #f0fffe 50%, #fffaf5 100%)" }}>
          <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">
            <div className="h-8 bg-stone-200 rounded-lg w-48 mb-2 animate-pulse" />
            <div className="h-4 bg-stone-100 rounded w-64 mb-6 animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[1,2,3,4].map(i => (
                <div key={i} className="rounded-2xl bg-white border border-stone-100 p-4 animate-pulse h-20" />
              ))}
            </div>
            {[1,2,3].map(i => (
              <div key={i} className="rounded-2xl bg-white border border-stone-100 p-5 mb-3 animate-pulse h-32" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)]" style={{ background: "linear-gradient(160deg, #ecfeff 0%, #f0fffe 50%, #fffaf5 100%)" }}>
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 bm-page-enter">

          {/* ── Header ── */}
          <div className="bm-hero rounded-2xl mb-6 px-5 py-4 flex items-center justify-between"
            style={{ background: "linear-gradient(135deg, #0e7490, #0891b2, #06b6d4, #0284c7)", backgroundSize:"200% 200%" }}>
            <div className="bm-orb bm-orb-1 w-32 h-32 bg-white/20 -top-10 -right-6" />
            <div className="bm-orb bm-orb-2 w-20 h-20 bg-cyan-300/20 bottom-0 right-20" />
            <div className="relative">
              <h1 className="bm-hero-title text-2xl font-bold text-white font-['Outfit'] flex items-center gap-2">
                <HandCoins size={22} className="text-cyan-200" />
                Hand Loans
              </h1>
              <p className="text-cyan-200/80 text-sm mt-0.5">Track money you've lent or borrowed</p>
            </div>
            <div className="flex items-center gap-2">
              <ResetDataButton feature="hand-loans" label="hand loans" onReset={fetchData} className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-white/20" />
              <Button
                onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
                className="relative bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm rounded-xl shadow-none"
              >
                <Plus size={16} className="mr-1.5" /> Add Loan
              </Button>
            </div>
          </div>

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 bm-stagger">
            {/* I Lent */}
            <div className="rounded-2xl bg-white border border-stone-100 p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">I Lent</p>
              <p className="text-xl font-extrabold text-emerald-600 font-['Outfit'] leading-none">
                {fmtShort(summary?.total_given || 0)}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">{summary?.count_given || 0} loans</p>
            </div>

            {/* I Borrowed */}
            <div className="rounded-2xl bg-white border border-stone-100 p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">I Borrowed</p>
              <p className="text-xl font-extrabold text-red-500 font-['Outfit'] leading-none">
                {fmtShort(summary?.total_taken || 0)}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">{summary?.count_taken || 0} loans</p>
            </div>

            {/* Net Position */}
            <div className="rounded-2xl bg-white border border-stone-100 p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Net Position</p>
              <p className={`text-xl font-extrabold font-['Outfit'] leading-none ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {net >= 0 ? "+" : "-"}{fmtShort(Math.abs(net))}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">{net >= 0 ? "You're owed more" : "You owe more"}</p>
            </div>

            {/* Overdue */}
            <div className={`rounded-2xl border p-4 shadow-sm ${(summary?.overdue_count || 0) > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-stone-100"}`}>
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Overdue</p>
              <p className={`text-xl font-extrabold font-['Outfit'] leading-none ${(summary?.overdue_count || 0) > 0 ? "text-amber-600" : "text-stone-400"}`}>
                {summary?.overdue_count || 0}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">past due date</p>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1 bg-stone-100 p-1 rounded-xl w-fit">
              {[
                { val: "all",   label: "All" },
                { val: "given", label: "I Lent" },
                { val: "taken", label: "I Borrowed" },
              ].map(tab => (
                <button
                  key={tab.val}
                  onClick={() => setActiveTab(tab.val)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === tab.val
                      ? "bg-white text-cyan-600 shadow-sm"
                      : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {filtered.length > 0 && (
              <button
                onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
                className={`hidden sm:inline-flex text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${selectMode ? "bg-cyan-100 border-cyan-300 text-cyan-700" : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"}`}
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
            )}
          </div>

          {/* ── Loan Cards ── */}
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex p-4 bg-stone-100 rounded-2xl mb-4">
                <HandCoins size={32} className="text-stone-400" />
              </div>
              <p className="text-stone-500 font-semibold font-['Outfit']">No loans here yet</p>
              <p className="text-stone-400 text-sm mt-1">Click "Add Loan" to get started</p>
            </div>
          ) : (
            <div className="space-y-3 bm-stagger">
              {filtered.map(loan => (
                <div key={loan.id} className={`relative ${selected.has(loan.id) ? "ring-2 ring-cyan-400 rounded-2xl" : ""}`}
                  onClick={selectMode ? () => toggleSelect(loan.id) : undefined}
                  style={selectMode ? { cursor: "pointer" } : {}}>
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selected.has(loan.id)}
                      onChange={() => toggleSelect(loan.id)}
                      onClick={e => e.stopPropagation()}
                      className="absolute top-3 left-3 w-4 h-4 accent-cyan-500 cursor-pointer z-10"
                    />
                  )}
                  <div className={selectMode ? "pointer-events-none" : ""}>
                    <LoanCard
                      loan={loan}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                      onMarkSettled={handleMarkSettled}
                      settling={settlingId === loan.id}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Multi-select action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-0 right-0 lg:left-64 z-50 flex justify-center px-4">
          <div className="bg-stone-900 text-white rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
            <span className="text-sm font-semibold">{selected.size} selected</span>
            <button onClick={handleMultiDelete} className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-xl transition-colors">Delete</button>
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="text-stone-400 hover:text-white text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Add Modal ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-['Outfit'] text-stone-900">
              Add Hand Loan
            </DialogTitle>
          </DialogHeader>
          <LoanForm
            form={form}
            setForm={setForm}
            editExtra={editExtra}
            setEditExtra={setEditExtra}
            isEdit={false}
            submitting={submitting}
            onSubmit={handleAdd}
            onClose={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ── */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-['Outfit'] text-stone-900">
              Edit Loan — {editTarget?.person_name}
            </DialogTitle>
          </DialogHeader>
          {editTarget && (
            <LoanForm
              form={editForm}
              setForm={setEditForm}
              editExtra={editExtra}
              setEditExtra={setEditExtra}
              isEdit={true}
              submitting={submitting}
              onSubmit={handleEdit}
              onClose={() => setEditTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-['Outfit'] text-stone-900">
              Delete this loan?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-stone-500 mb-5">
            Remove the {deleteTarget?.type === "given" ? "loan to" : "loan from"}{" "}
            <strong className="text-stone-700">{deleteTarget?.person_name}</strong> of{" "}
            <strong className="text-stone-700">{deleteTarget && fmtINR(deleteTarget.amount)}</strong>?
            This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl border-stone-200"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white"
              onClick={handleDelete}
            >
              {submitting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HandLoanTracker;
