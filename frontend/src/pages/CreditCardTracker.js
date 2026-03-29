import { useState, useCallback } from "react";
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
  CreditCard, Plus, Trash2, Edit3, AlertCircle, Wallet,
  TrendingUp, Calendar, ChevronRight, IndianRupee, ShoppingBag, X
} from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR = (n) => `₹${Math.round(Math.abs(n) || 0).toLocaleString("en-IN")}`;
const fmtShort = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000)   return `₹${(abs / 1000).toFixed(1)}K`;
  return `₹${abs.toLocaleString("en-IN")}`;
};

const CATEGORIES = [
  "Shopping", "Food & Dining", "Travel", "Fuel", "Entertainment",
  "Groceries", "Medical", "Utilities", "Education", "Electronics", "Other"
];

// Gradient per utilisation %
const utilColor = (pct) => {
  if (pct >= 80) return "from-red-500 to-rose-600";
  if (pct >= 50) return "from-orange-400 to-amber-500";
  return "from-emerald-500 to-teal-500";
};
const utilBg = (pct) => {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-emerald-400";
};

// ── Card chip visual ─────────────────────────────────────────────────────────
const BANK_COLORS = {
  hdfc:   "from-[#004C97] to-[#0066CC]",
  sbi:    "from-[#2B6CB0] to-[#3182CE]",
  icici:  "from-[#C02942] to-[#E74C3C]",
  axis:   "from-[#800000] to-[#C0392B]",
  kotak:  "from-[#D35400] to-[#E67E22]",
  idfc:   "from-[#1A5276] to-[#2E86C1]",
  yes:    "from-[#1E8449] to-[#27AE60]",
  default:"from-slate-700 to-slate-900",
};
const bankGradient = (name = "") => {
  const key = name.toLowerCase().split(" ")[0];
  return BANK_COLORS[key] || BANK_COLORS.default;
};

// ── Card visual component ─────────────────────────────────────────────────────
const CardVisual = ({ card }) => {
  const pct = card.credit_limit > 0
    ? Math.min(100, Math.round(card.outstanding_balance / card.credit_limit * 100))
    : 0;

  return (
    <div className={`relative bg-gradient-to-br ${bankGradient(card.bank_name)} rounded-2xl p-5 text-white shadow-xl overflow-hidden`}>
      {/* decorative circles */}
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />

      <div className="relative">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-xs opacity-60 uppercase tracking-widest">{card.bank_name}</p>
            <p className="font-bold text-lg font-['Outfit']">{card.card_name}</p>
          </div>
          <CreditCard size={28} className="opacity-70" />
        </div>

        {/* utilisation bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs opacity-70 mb-1">
            <span>Used {pct}%</span>
            <span>Limit {fmtShort(card.credit_limit)}</span>
          </div>
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className={`h-full ${utilBg(pct)} rounded-full transition-all`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] opacity-60 uppercase tracking-wider">Outstanding</p>
            <p className="font-bold text-base font-['Outfit']">{fmtINR(card.outstanding_balance)}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] opacity-60 uppercase tracking-wider">Min. Due</p>
            <p className="font-bold text-base font-['Outfit']">
              {fmtINR(card.outstanding_balance * (card.minimum_due_pct || 5) / 100)}
            </p>
          </div>
        </div>

        <div className="flex justify-between mt-3 text-xs opacity-60">
          <span>Statement: {card.statement_day}{['st','nd','rd'][((card.statement_day % 10) - 1)] || 'th'} of month</span>
          <span>Due: {card.due_day}{['st','nd','rd'][((card.due_day % 10) - 1)] || 'th'} of month</span>
        </div>
      </div>
    </div>
  );
};

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ onAdd }) => (
  <div className="text-center py-20">
    <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
      <CreditCard size={36} className="text-indigo-400" />
    </div>
    <p className="text-stone-700 font-semibold text-lg mb-1">No credit cards yet</p>
    <p className="text-stone-400 text-sm mb-6">Add your cards to track spending & utilisation</p>
    <Button onClick={onAdd} className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl px-6">
      <Plus size={16} className="mr-2" /> Add Credit Card
    </Button>
  </div>
);

// ── Field helper ─────────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-stone-600 text-sm font-medium">{label}</Label>
    {children}
  </div>
);
const inp = "h-10 bg-white border-stone-200 focus:border-indigo-400 focus:ring-indigo-400/20 rounded-xl text-sm";

// ── Main Component ────────────────────────────────────────────────────────────
const CreditCardTracker = () => {
  const [summary, setSummary]       = useState(null);
  const [cardModal, setCardModal]   = useState(false);
  const [expModal, setExpModal]     = useState(false);
  const [editCard, setEditCard]     = useState(null);     // card being edited
  const [activeCard, setActiveCard] = useState(null);     // card for expense modal
  const [expenses, setExpenses]     = useState([]);
  const [expCard, setExpCard]       = useState(null);     // card whose expenses are shown
  const [deleteId, setDeleteId]     = useState(null);

  const EMPTY_FORM = { bank_name: "", card_name: "", credit_limit: "", outstanding_balance: "", statement_day: "1", due_day: "20", minimum_due_pct: "5", notes: "" };
  const EMPTY_EXP  = { amount: "", description: "", category: "Shopping", date: new Date().toISOString().split("T")[0] };

  const [form, setForm]         = useState(EMPTY_FORM);
  const [expForm, setExpForm]   = useState(EMPTY_EXP);
  const [saving, setSaving]     = useState(false);

  const fetchCards = useCallback(async () => {
    const [cardsRes, sumRes] = await Promise.all([
      axios.get(`${API}/credit-cards`),
      axios.get(`${API}/credit-cards/summary`),
    ]);
    setSummary(sumRes.data);
    return cardsRes.data || [];
  }, []);

  const { data: cards, loading, reload: fetchData } = useStaleData(
    "bm_credit_cards_cache",
    fetchCards,
    { errorMsg: "Failed to load credit cards", fallback: [] }
  );

  const fetchExpenses = async (card) => {
    try {
      const res = await axios.get(`${API}/credit-cards/${card.id}/expenses`);
      setExpenses(res.data);
      setExpCard(card);
    } catch {
      toast.error("Failed to load expenses");
    }
  };

  const openAdd = () => { setEditCard(null); setForm(EMPTY_FORM); setCardModal(true); };
  const openEdit = (card) => {
    setEditCard(card);
    setForm({
      bank_name: card.bank_name, card_name: card.card_name,
      credit_limit: String(card.credit_limit), outstanding_balance: String(card.outstanding_balance),
      statement_day: String(card.statement_day), due_day: String(card.due_day),
      minimum_due_pct: String(card.minimum_due_pct), notes: card.notes || "",
    });
    setCardModal(true);
  };

  const saveCard = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      credit_limit: parseFloat(form.credit_limit),
      outstanding_balance: parseFloat(form.outstanding_balance || 0),
      statement_day: parseInt(form.statement_day),
      due_day: parseInt(form.due_day),
      minimum_due_pct: parseFloat(form.minimum_due_pct),
    };
    try {
      if (editCard) {
        await axios.put(`${API}/credit-cards/${editCard.id}`, payload);
        toast.success("Card updated");
      } else {
        await axios.post(`${API}/credit-cards`, payload);
        toast.success("Card added");
      }
      setCardModal(false);
      fetchData();
    } catch {
      toast.error("Failed to save card");
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async (id) => {
    try {
      await axios.delete(`${API}/credit-cards/${id}`);
      toast.success("Card deleted");
      setDeleteId(null);
      fetchData();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const openExpense = (card) => { setActiveCard(card); setExpForm(EMPTY_EXP); setExpModal(true); };
  const saveExpense = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`${API}/credit-cards/${activeCard.id}/expense`, {
        ...expForm, amount: parseFloat(expForm.amount),
      });
      toast.success(`₹${expForm.amount} added to ${activeCard.card_name}`);
      setExpModal(false);
      fetchData();
      if (expCard?.id === activeCard.id) fetchExpenses(activeCard);
    } catch {
      toast.error("Failed to log expense");
    } finally {
      setSaving(false);
    }
  };

  const totalCards = summary?.total_cards ?? 0;
  const utilPct    = summary?.utilization_pct ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/40 via-violet-50/20 to-slate-50">
      <Navigation />

      <div className="max-w-6xl mx-auto px-4 py-8 pb-28 md:pb-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-stone-800 font-['Outfit']">Credit Cards</h1>
            <p className="text-stone-500 text-sm mt-0.5">Track spending, utilisation & due dates</p>
          </div>
          <Button onClick={openAdd} className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl shadow-lg shadow-indigo-500/25 gap-2">
            <Plus size={16} /> Add Card
          </Button>
        </div>

        {/* Summary row */}
        {summary && totalCards > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Limit",       value: fmtShort(summary.total_limit),       icon: CreditCard,   color: "text-indigo-600",  bg: "bg-indigo-50" },
              { label: "Outstanding",        value: fmtShort(summary.total_outstanding), icon: TrendingUp,   color: "text-rose-600",    bg: "bg-rose-50"   },
              { label: "Available Credit",   value: fmtShort(summary.total_available),   icon: Wallet,       color: "text-emerald-600", bg: "bg-emerald-50"},
              { label: "Total Minimum Due",  value: fmtShort(summary.total_minimum_due), icon: IndianRupee,  color: "text-amber-600",   bg: "bg-amber-50"  },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm">
                <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon size={18} className={color} />
                </div>
                <p className={`text-xl font-bold font-['Outfit'] ${color}`}>{value}</p>
                <p className="text-xs text-stone-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Utilisation alert */}
        {utilPct >= 50 && (
          <div className={`flex items-start gap-3 rounded-2xl px-5 py-3 mb-6 border ${utilPct >= 80 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
            <AlertCircle size={18} className={utilPct >= 80 ? "text-red-500 mt-0.5 shrink-0" : "text-amber-500 mt-0.5 shrink-0"} />
            <p className={`text-sm font-medium ${utilPct >= 80 ? "text-red-700" : "text-amber-700"}`}>
              {utilPct >= 80
                ? `High utilisation (${utilPct}%) — this can hurt your CIBIL score. Try paying down balances.`
                : `Utilisation at ${utilPct}%. Keep it below 30% for a healthy credit score.`}
            </p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-stone-400">Loading...</div>
        ) : cards.length === 0 ? (
          <EmptyState onAdd={openAdd} />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {cards.map(card => {
              const pct = card.credit_limit > 0
                ? Math.min(100, Math.round(card.outstanding_balance / card.credit_limit * 100))
                : 0;

              return (
                <div key={card.id} className="space-y-3">
                  <CardVisual card={card} />

                  {/* Action row */}
                  <div className="flex gap-2">
                    <Button onClick={() => openExpense(card)} size="sm"
                      className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-xl gap-1.5 text-xs font-semibold">
                      <ShoppingBag size={13} /> Add Expense
                    </Button>
                    <Button onClick={() => fetchExpenses(card)} size="sm" variant="outline"
                      className="flex-1 rounded-xl gap-1.5 text-xs border-stone-200 hover:border-indigo-300 text-stone-600">
                      <ChevronRight size={13} /> View Spends
                    </Button>
                    <Button onClick={() => openEdit(card)} size="sm" variant="ghost" className="px-2.5 rounded-xl hover:bg-indigo-50">
                      <Edit3 size={14} className="text-indigo-500" />
                    </Button>
                    <Button onClick={() => setDeleteId(card.id)} size="sm" variant="ghost" className="px-2.5 rounded-xl hover:bg-red-50">
                      <Trash2 size={14} className="text-red-400" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Expenses panel */}
        {expCard && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-stone-800 font-['Outfit']">{expCard.card_name} — Expenses</h2>
              <button onClick={() => setExpCard(null)} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>
            {expenses.length === 0 ? (
              <p className="text-stone-400 text-sm text-center py-8">No expenses logged yet.</p>
            ) : (
              <div className="space-y-2">
                {expenses.map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-stone-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <ShoppingBag size={14} className="text-indigo-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-800">{e.description}</p>
                        <p className="text-xs text-stone-400">{e.category} · {e.date}</p>
                      </div>
                    </div>
                    <p className="font-bold text-rose-600 text-sm font-['Outfit']">{fmtINR(e.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add / Edit Card Modal ── */}
      <Dialog open={cardModal} onOpenChange={setCardModal}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-['Outfit']">{editCard ? "Edit Card" : "Add Credit Card"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveCard} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Name">
                <Input className={inp} placeholder="HDFC, SBI…" required value={form.bank_name}
                  onChange={e => setForm({ ...form, bank_name: e.target.value })} />
              </Field>
              <Field label="Card Name">
                <Input className={inp} placeholder="Regalia, Millennia…" required value={form.card_name}
                  onChange={e => setForm({ ...form, card_name: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Credit Limit (₹)">
                <Input className={inp} type="number" min="1" placeholder="500000" required value={form.credit_limit}
                  onChange={e => setForm({ ...form, credit_limit: e.target.value })} />
              </Field>
              <Field label="Current Outstanding (₹)">
                <Input className={inp} type="number" min="0" placeholder="0" value={form.outstanding_balance}
                  onChange={e => setForm({ ...form, outstanding_balance: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Statement Day">
                <Input className={inp} type="number" min="1" max="31" value={form.statement_day}
                  onChange={e => setForm({ ...form, statement_day: e.target.value })} />
              </Field>
              <Field label="Due Day">
                <Input className={inp} type="number" min="1" max="31" value={form.due_day}
                  onChange={e => setForm({ ...form, due_day: e.target.value })} />
              </Field>
              <Field label="Min Due %">
                <Input className={inp} type="number" min="1" max="100" step="0.1" value={form.minimum_due_pct}
                  onChange={e => setForm({ ...form, minimum_due_pct: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <Input className={inp} placeholder="e.g. used for travel" value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Button type="submit" disabled={saving}
              className="w-full h-11 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl font-semibold">
              {saving ? "Saving…" : editCard ? "Update Card" : "Add Card"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Log Expense Modal ── */}
      <Dialog open={expModal} onOpenChange={setExpModal}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-['Outfit']">Log Expense — {activeCard?.card_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveExpense} className="space-y-4 mt-2">
            <Field label="Amount (₹)">
              <Input className={inp} type="number" min="1" placeholder="500" required value={expForm.amount}
                onChange={e => setExpForm({ ...expForm, amount: e.target.value })} />
            </Field>
            <Field label="Description">
              <Input className={inp} placeholder="What did you buy?" required value={expForm.description}
                onChange={e => setExpForm({ ...expForm, description: e.target.value })} />
            </Field>
            <Field label="Category">
              <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-stone-200 focus:border-indigo-400 rounded-xl text-sm outline-none">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <DatePicker value={expForm.date}
                onChange={v => setExpForm({ ...expForm, date: v })} />
            </Field>
            <Button type="submit" disabled={saving}
              className="w-full h-11 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-xl font-semibold">
              {saving ? "Logging…" : "Log Expense"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-['Outfit']">Delete Card?</DialogTitle>
          </DialogHeader>
          <p className="text-stone-500 text-sm mt-1">This will permanently remove the card and all its logged expenses.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white" onClick={() => deleteCard(deleteId)}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreditCardTracker;
