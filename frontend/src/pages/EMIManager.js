import { useState, useCallback, useEffect } from "react";
import { useStaleData } from "@/hooks/useStaleData";
import Navigation from "@/components/Navigation";
import PageLoader from "@/components/PageLoader";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/MonthPicker";
import { DatePicker } from "@/components/DatePicker";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle, Pencil, TrendingDown, Calendar, ChevronRight, Copy, Merge, Lock, RotateCcw } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

const calcEMI = (principal, annualRate, tenureMonths) => {
  if (!principal || !annualRate || !tenureMonths) return '';
  const p = parseFloat(principal), r = parseFloat(annualRate) / 12 / 100, n = parseInt(tenureMonths);
  if (r === 0) return (p / n).toFixed(2);
  return Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)).toString();
};

const calcEndDate = (startDate, tenureMonths) => {
  if (!startDate || !tenureMonths) return '';
  const [year, month] = startDate.split('-').map(Number);
  const end = new Date(year, month - 1 + parseInt(tenureMonths));
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
};

// "YYYY-MM" → "MMM YYYY"
const fmtMonthYear = (yyyymm) => {
  if (!yyyymm) return '';
  const [year, month] = yyyymm.split('-').map(Number);
  return new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

// Compute next EMI due date from debit day
const calcNextDue = (emiDebitDay) => {
  if (!emiDebitDay) return null;
  const today = new Date();
  // Compare against start-of-today so debit day = today shows today (not next month)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let due = new Date(today.getFullYear(), today.getMonth(), emiDebitDay);
  if (due < todayStart) due = new Date(today.getFullYear(), today.getMonth() + 1, emiDebitDay);
  return due;
};

const fmtDueDate = (date) => {
  if (!date) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const calcTotalInterest = (principal, emi, tenure) => {
  if (!principal || !emi || !tenure) return 0;
  return Math.round(parseFloat(emi) * parseInt(tenure) - parseFloat(principal));
};

const emptyForm = {
  loan_name: '', principal_amount: '', interest_rate: '',
  monthly_payment: '', start_date: '', tenure_months: '',
  emi_debit_day: '', same_as_start: false
};

const isDebitDayPassed = (debitDay) => {
  if (!debitDay) return false;
  return new Date().getDate() > parseInt(debitDay);
};

// ── Skeleton Card ─────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="rounded-xl border border-stone-100 bg-white overflow-hidden flex animate-pulse">
    <div className="w-1.5 shrink-0 bg-indigo-200" />
    <div className="flex-1 p-5">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="h-5 bg-stone-200 rounded-lg w-40 mb-2" />
          <div className="h-3 bg-stone-100 rounded w-56" />
        </div>
        <div className="h-4 bg-stone-100 rounded w-16" />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><div className="h-3 bg-stone-100 rounded w-24 mb-2" /><div className="h-7 bg-stone-200 rounded w-32" /></div>
        <div><div className="h-3 bg-stone-100 rounded w-24 mb-2" /><div className="h-7 bg-stone-200 rounded w-28" /></div>
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full mb-3" />
      <div className="flex justify-between items-center pt-1">
        <div className="h-3 bg-stone-100 rounded w-32" />
        <div className="flex gap-1.5">
          {[0,1,2,3].map(i => <div key={i} className="h-7 w-7 bg-stone-100 rounded-lg" />)}
        </div>
      </div>
    </div>
  </div>
);

// ── EMI Form (shared by Add + Edit) ──────────────────────────────────────────

const EMIForm = ({ formData, setFormData, onSubmit, onCancel, submitLabel }) => {
  const updateCalc = (updates) => {
    setFormData(prev => {
      const next = { ...prev, ...updates };
      const calc = calcEMI(next.principal_amount, next.interest_rate, next.tenure_months);
      if (calc) next.monthly_payment = calc;
      if (next.same_as_start && next.start_date)
        next.emi_debit_day = next.start_date.split('-')[2] || next.start_date.split('-')[1];
      return next;
    });
  };

  const endDate = calcEndDate(formData.start_date, formData.tenure_months);
  const totalInterest = calcTotalInterest(formData.principal_amount, formData.monthly_payment, formData.tenure_months);

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="form-group">
        <Label>Loan Name</Label>
        <Input value={formData.loan_name} onChange={e => setFormData(p => ({ ...p, loan_name: e.target.value }))} placeholder="e.g. Home Loan, Car Loan" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="form-group">
          <Label>Principal Amount (₹)</Label>
          <Input type="number" value={formData.principal_amount} onChange={e => updateCalc({ principal_amount: e.target.value })} placeholder="500000" required />
        </div>
        <div className="form-group">
          <Label>Interest Rate (% p.a.)</Label>
          <Input type="number" step="0.01" value={formData.interest_rate} onChange={e => updateCalc({ interest_rate: e.target.value })} placeholder="8.5" required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="form-group">
          <Label>Loan Start Date</Label>
          <MonthPicker value={formData.start_date} onChange={v => updateCalc({ start_date: v })} placeholder="Select month" />
        </div>
        <div className="form-group">
          <Label>Tenure (Months)</Label>
          <Input type="number" value={formData.tenure_months} onChange={e => updateCalc({ tenure_months: e.target.value })} placeholder="60" required />
        </div>
      </div>

      <div className="form-group">
        <Label>EMI Debit Date (day of month)</Label>
        <div className="flex items-center gap-3">
          <Input
            type="number" min="1" max="31"
            value={formData.emi_debit_day}
            onChange={e => setFormData(p => ({ ...p, emi_debit_day: e.target.value, same_as_start: false }))}
            placeholder="e.g. 5"
            disabled={formData.same_as_start}
            className="w-32"
          />
          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.same_as_start}
              onChange={e => {
                const checked = e.target.checked;
                setFormData(p => {
                  const day = checked ? '1' : p.emi_debit_day;
                  return { ...p, same_as_start: checked, emi_debit_day: checked ? day : p.emi_debit_day };
                });
              }}
              className="rounded"
            />
            Same as loan start date
          </label>
        </div>
      </div>

      <div className="form-group">
        <Label>Monthly EMI (₹)</Label>
        <Input
          type="number"
          value={formData.monthly_payment}
          onChange={e => setFormData(p => ({ ...p, monthly_payment: e.target.value }))}
          placeholder="Auto-calculated"
          required
        />
        <p className="text-xs text-stone-400 mt-1">Auto-calculated — override if needed</p>
      </div>

      {endDate && (
        <div className="bg-indigo-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-500">Loan End Date</span>
            <span className="font-semibold text-stone-800">{fmtMonthYear(endDate)}</span>
          </div>
          {totalInterest > 0 && (
            <div className="flex justify-between">
              <span className="text-stone-500">Total Interest Payable</span>
              <span className="font-semibold text-red-600">₹{totalInterest.toLocaleString('en-IN')}</span>
            </div>
          )}
          {totalInterest > 0 && (
            <div className="flex justify-between">
              <span className="text-stone-500">Total Amount Payable</span>
              <span className="font-semibold text-stone-800">₹{(parseFloat(formData.principal_amount) + totalInterest).toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" className="flex-1">{submitLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

// ── Pre-closure Calculator ────────────────────────────────────────────────────

const PreClosureModal = ({ emi, onClose }) => {
  const [extraPayment, setExtraPayment] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const totalInterest = Math.round(emi.monthly_payment * emi.tenure_months - emi.principal_amount);
  const remainingMonths = emi.tenure_months - emi.paid_months;

  const calculate = async () => {
    if (!extraPayment || parseFloat(extraPayment) <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/emis/${emi.id}/preclosure-calculate?extra_payment=${extraPayment}`);
      setResult(res.data);
    } catch {
      toast.error('Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-stone-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-stone-500">Remaining Balance</p>
          <p className="font-bold text-red-600 text-lg">₹{Math.round(emi.remaining_balance).toLocaleString('en-IN')}</p>
        </div>
        <div>
          <p className="text-stone-500">Months Remaining</p>
          <p className="font-bold text-stone-800 text-lg">{remainingMonths}</p>
        </div>
        <div>
          <p className="text-stone-500">Total Interest (full tenure)</p>
          <p className="font-bold text-indigo-600">₹{totalInterest.toLocaleString('en-IN')}</p>
        </div>
        <div>
          <p className="text-stone-500">Monthly EMI</p>
          <p className="font-bold text-stone-800">₹{emi.monthly_payment.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Extra / Part Payment Amount (₹)</Label>
        <p className="text-xs text-stone-400">Enter lump sum to see how much interest & time you save</p>
        <div className="flex gap-2">
          <Input type="number" value={extraPayment} onChange={e => setExtraPayment(e.target.value)} placeholder={`e.g. ${Math.round(emi.remaining_balance / 2).toLocaleString('en-IN')}`} />
          <Button onClick={calculate} disabled={loading} className="shrink-0">{loading ? 'Calculating...' : 'Calculate'}</Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[1, 3, 6, 12].map(n => (
            <button key={n} type="button" onClick={() => setExtraPayment((emi.monthly_payment * n).toString())}
              className="text-xs px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors">
              {n} EMI{n > 1 ? 's' : ''} extra
            </button>
          ))}
          <button type="button" onClick={() => setExtraPayment(emi.remaining_balance.toString())}
            className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors">
            Full pre-close
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <p className="font-semibold text-emerald-800 text-sm flex items-center gap-2"><TrendingDown size={16} /> Savings Summary</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-stone-500">New Balance</p><p className="font-bold text-stone-800">₹{result.new_balance.toLocaleString('en-IN')}</p></div>
            <div><p className="text-stone-500">Months Saved</p><p className="font-bold text-emerald-700 text-lg">{result.months_saved} months</p></div>
            <div><p className="text-stone-500">Interest Saved</p><p className="font-bold text-emerald-700 text-lg">₹{result.interest_saved.toLocaleString('en-IN')}</p></div>
            <div><p className="text-stone-500">Remaining Months</p><p className="font-bold text-stone-800">{result.new_remaining_months}</p></div>
          </div>
          {result.new_balance === 0 && (
            <div className="bg-emerald-100 rounded-lg p-3 text-center text-emerald-800 font-semibold text-sm">
              🎉 Full pre-closure! Loan completely closed.
            </div>
          )}
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
    </div>
  );
};

// ── Foreclose Modal ───────────────────────────────────────────────────────────

const ForecloseModal = ({ emi, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  const remainingBalance = Math.round(emi.remaining_balance);
  const remainingMonths  = emi.tenure_months - emi.paid_months;
  const interestWouldPay = Math.round(emi.monthly_payment * remainingMonths - emi.remaining_balance);

  const handleForeclose = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/emis/${emi.id}/foreclose`);
      setResult(res.data);
      toast.success('Loan foreclosed! 🎉');
      onSuccess();
    } catch {
      toast.error('Foreclosure failed');
    } finally {
      setLoading(false);
    }
  };

  if (result) return (
    <div className="space-y-4 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
        <CheckCircle size={32} className="text-emerald-500" />
      </div>
      <h3 className="text-lg font-bold text-stone-800">Loan Closed! 🎉</h3>
      <p className="text-stone-500 text-sm">You've saved <span className="font-bold text-emerald-600">₹{Math.round(result.interest_saved).toLocaleString('en-IN')}</span> in interest by closing early.</p>
      <Button className="w-full" onClick={onClose}>Done</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-stone-500">Amount to pay now</span>
          <span className="font-bold text-red-600 text-lg">₹{remainingBalance.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-500">Months remaining</span>
          <span className="font-semibold text-stone-700">{remainingMonths}</span>
        </div>
        <div className="flex justify-between border-t border-red-100 pt-3">
          <span className="text-stone-500">Interest you'll save</span>
          <span className="font-bold text-emerald-600">₹{Math.max(0, interestWouldPay).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <p className="text-xs text-stone-400 text-center">This marks the loan as fully closed. Ensure you've paid ₹{remainingBalance.toLocaleString('en-IN')} to your lender first.</p>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button onClick={handleForeclose} disabled={loading}
          className="flex-1 bg-red-500 hover:bg-red-600 text-white">
          {loading ? 'Closing…' : 'Confirm Foreclose'}
        </Button>
      </div>
    </div>
  );
};

// ── Merge Modal ───────────────────────────────────────────────────────────────

const MergeModal = ({ emis, onClose, onSuccess }) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [newRate, setNewRate]         = useState('');
  const [newTenure, setNewTenure]     = useState('');
  const [newName, setNewName]         = useState('Consolidated Loan');
  const [loading, setLoading]         = useState(false);

  const selected = emis.filter(e => selectedIds.has(e.id));
  const totalBalance = selected.reduce((s, e) => s + e.remaining_balance, 0);
  const newEMI = newRate && newTenure && totalBalance
    ? (() => {
        const r = parseFloat(newRate) / 12 / 100;
        const n = parseInt(newTenure);
        if (r === 0) return (totalBalance / n).toFixed(0);
        const factor = Math.pow(1 + r, n);
        const result = Math.round((totalBalance * r * factor) / (factor - 1));
        return isFinite(result) && result > 0 ? result : Math.round(totalBalance / n);
      })()
    : null;

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleMerge = async () => {
    if (selected.length < 2) { toast.error('Select at least 2 loans to merge'); return; }
    if (!newRate || !newTenure) { toast.error('Enter new interest rate and tenure'); return; }
    setLoading(true);
    try {
      // Create the merged loan
      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      await axios.post(`${API}/emis`, {
        loan_name: newName,
        principal_amount: Math.round(totalBalance),
        interest_rate: parseFloat(newRate),
        monthly_payment: newEMI,
        start_date: startDate,
        tenure_months: parseInt(newTenure),
        emi_debit_day: null,
      });
      // Close the merged loans
      await Promise.all(selected.map(e =>
        axios.post(`${API}/emis/${e.id}/foreclose`)
      ));
      toast.success(`${selected.length} loans merged into "${newName}" 🎉`);
      onSuccess();
      onClose();
    } catch {
      toast.error('Merge failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <p className="text-xs text-stone-500">Select loans to consolidate into one. Their outstanding balances will be combined into a new loan at your new rate.</p>

      {/* Loan selector */}
      <div className="space-y-2">
        {emis.map(e => (
          <button key={e.id} onClick={() => toggle(e.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              selectedIds.has(e.id) ? 'border-indigo-300 bg-indigo-50' : 'border-stone-100 bg-white hover:border-stone-200'
            }`}>
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
              selectedIds.has(e.id) ? 'bg-indigo-500 border-indigo-500' : 'border-stone-300'
            }`}>
              {selectedIds.has(e.id) && <span className="text-white text-[10px] font-bold">✓</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-800 truncate">{e.loan_name}</p>
              <p className="text-xs text-stone-400">₹{Math.round(e.remaining_balance).toLocaleString('en-IN')} outstanding · {e.interest_rate}% p.a.</p>
            </div>
          </button>
        ))}
      </div>

      {selected.length >= 2 && (
        <>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex justify-between text-sm">
            <span className="text-stone-500">Combined outstanding</span>
            <span className="font-bold text-indigo-700">₹{Math.round(totalBalance).toLocaleString('en-IN')}</span>
          </div>

          <div>
            <Label>New Loan Name</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>New Interest Rate (% p.a.)</Label>
              <Input type="number" step="0.1" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="8.5" className="mt-1" />
            </div>
            <div>
              <Label>New Tenure (months)</Label>
              <Input type="number" value={newTenure} onChange={e => setNewTenure(e.target.value)} placeholder="60" className="mt-1" />
            </div>
          </div>
          {newEMI && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm flex justify-between">
              <span className="text-stone-500">New monthly EMI</span>
              <span className="font-bold text-emerald-700">₹{Number(newEMI).toLocaleString('en-IN')}</span>
            </div>
          )}
        </>
      )}

      <div className="flex gap-3 pt-1">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button onClick={handleMerge} disabled={loading || selected.length < 2}
          className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white">
          {loading ? 'Merging…' : `Merge ${selected.length > 0 ? `(${selected.length})` : ''}`}
        </Button>
      </div>
    </div>
  );
};

// ── Loan Detail Sheet ─────────────────────────────────────────────────────────

const LoanDetailSheet = ({ emi, onClose, onRecordPayment, onPreClose, onForeclose, onEdit, onDelete }) => {
  const totalInterest = calcTotalInterest(emi.principal_amount, emi.monthly_payment, emi.tenure_months);
  const endDate = calcEndDate(emi.start_date, emi.tenure_months);
  const nextDue = calcNextDue(emi.emi_debit_day);
  // Only show repaid if payments have actually been recorded
  const repaid = emi.paid_months > 0 ? Math.round(emi.principal_amount - emi.remaining_balance) : 0;
  const progressPct = Math.round((emi.paid_months / emi.tenure_months) * 100);

  return (
    <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      {/* Top summary */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-500 p-4 text-white">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-white/60 text-xs mb-0.5">Loan Amount</p>
            <p className="text-xl font-bold">₹{emi.principal_amount.toLocaleString('en-IN')}</p>
          </div>
          <div className="text-right">
            <p className="text-white/60 text-xs mb-0.5">Amount Repaid</p>
            <p className="text-xl font-bold">₹{repaid.toLocaleString('en-IN')}</p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-white/70 mb-1.5">
            <span>{emi.paid_months} of {emi.tenure_months} EMIs Paid</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progressPct || 0}%` }} />
          </div>
        </div>
      </div>

      {/* Loan Details */}
      <div className="rounded-xl border border-stone-100 overflow-hidden">
        <div className="px-4 py-3 bg-stone-50 border-b border-stone-100">
          <p className="text-sm font-semibold text-stone-700">Loan Details</p>
        </div>
        <div className="divide-y divide-stone-50">
          {[
            ['Principal Amount', `₹${emi.principal_amount.toLocaleString('en-IN')}`],
            ['Total Interest Payable', `₹${totalInterest.toLocaleString('en-IN')}`],
            ['Total Amount Payable', `₹${(emi.principal_amount + totalInterest).toLocaleString('en-IN')}`],
            ['Principal Outstanding', `₹${Math.round(emi.remaining_balance).toLocaleString('en-IN')}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center px-4 py-3 text-sm">
              <span className="text-stone-500">{label}</span>
              <span className="font-semibold text-stone-800">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* EMI Details */}
      <div className="rounded-xl border border-stone-100 overflow-hidden">
        <div className="px-4 py-3 bg-stone-50 border-b border-stone-100">
          <p className="text-sm font-semibold text-stone-700">EMI Details</p>
        </div>
        <div className="divide-y divide-stone-50">
          {[
            ['EMI Amount', `₹${emi.monthly_payment.toLocaleString('en-IN')} @ ${emi.interest_rate}% p.a.`],
            ['EMI Start Date', fmtMonthYear(emi.start_date)],
            ['EMI End Date', fmtMonthYear(endDate)],
            ['Duration', `${emi.tenure_months} Months`],
            ...(emi.emi_debit_day ? [['Monthly Debit Date', `${emi.emi_debit_day}th of every month`]] : []),
            ...(nextDue ? [['Next Due Date', fmtDueDate(nextDue)]] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center px-4 py-3 text-sm">
              <span className="text-stone-500">{label}</span>
              <span className="font-semibold text-stone-800">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white" onClick={onRecordPayment}>Record Payment</Button>
        <Button variant="outline" onClick={onPreClose} className="text-indigo-600 border-indigo-200">
          <TrendingDown size={15} className="mr-2" /> Pre-close
        </Button>
        <Button variant="outline" onClick={onEdit}><Pencil size={15} className="mr-2" /> Edit Loan</Button>
        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={onForeclose}>
          <Lock size={15} className="mr-2" /> Foreclose
        </Button>
        <Button variant="outline" className="text-red-500 border-red-100 hover:bg-red-50 col-span-2" onClick={onDelete}>
          <Trash2 size={15} className="mr-2" /> Delete Loan
        </Button>
      </div>

      <Button variant="ghost" className="w-full text-stone-400" onClick={onClose}>Close</Button>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const EMIManager = () => {
  const fetchEmisFn = useCallback(async () => {
    const res = await axios.get(`${API}/emis`);
    return res.data || [];
  }, []);

  const { data: emis, loading, reload: fetchEmis } = useStaleData(
    "bm_emis_cache",
    fetchEmisFn,
    { errorMsg: "Failed to load EMIs", fallback: [] }
  );

  useEffect(() => {
    const onLog = () => fetchEmis();
    window.addEventListener("chanakya-logged", onLog);
    return () => window.removeEventListener("chanakya-logged", onLog);
  }, [fetchEmis]);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isPreCloseOpen, setIsPreCloseOpen]   = useState(false);
  const [isForecloseOpen, setIsForecloseOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen]         = useState(false);
  const [isDetailOpen, setIsDetailOpen]       = useState(false);
  const [selectedEmi, setSelectedEmi] = useState(null);
  const [addForm, setAddForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [paymentData, setPaymentData] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0] });
  const [activeTab, setActiveTab] = useState('active');
  const [isPastDebitOpen, setIsPastDebitOpen] = useState(false);
  const [pendingDebitEmi, setPendingDebitEmi] = useState(null);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/emis`, {
        loan_name: addForm.loan_name,
        principal_amount: parseFloat(addForm.principal_amount),
        interest_rate: parseFloat(addForm.interest_rate),
        monthly_payment: parseFloat(addForm.monthly_payment),
        start_date: addForm.start_date,
        tenure_months: parseInt(addForm.tenure_months),
        emi_debit_day: addForm.emi_debit_day ? parseInt(addForm.emi_debit_day) : null,
      });
      toast.success('EMI added!');
      setIsAddOpen(false);
      setAddForm(emptyForm);
      await fetchEmis();
      if (addForm.emi_debit_day && isDebitDayPassed(addForm.emi_debit_day)) {
        const createdEmi = res.data;
        setSelectedEmi(createdEmi);
        setPaymentData({ amount: createdEmi.monthly_payment.toString(), payment_date: new Date().toISOString().split('T')[0] });
        setPendingDebitEmi(createdEmi);
        setIsPastDebitOpen(true);
      }
    } catch {
      toast.error('Failed to add EMI');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selectedEmi?.id) { toast.error('No EMI selected'); return; }
    try {
      await axios.put(`${API}/emis/${selectedEmi.id}`, {
        loan_name: editForm.loan_name,
        principal_amount: parseFloat(editForm.principal_amount),
        interest_rate: parseFloat(editForm.interest_rate),
        monthly_payment: parseFloat(editForm.monthly_payment),
        start_date: editForm.start_date,
        tenure_months: parseInt(editForm.tenure_months),
        emi_debit_day: editForm.emi_debit_day ? parseInt(editForm.emi_debit_day) : null,
      });
      toast.success('EMI updated!');
      setIsEditOpen(false);
      await fetchEmis();
      if (editForm.emi_debit_day && isDebitDayPassed(editForm.emi_debit_day) && selectedEmi.paid_months === 0) {
        setPaymentData({ amount: editForm.monthly_payment, payment_date: new Date().toISOString().split('T')[0] });
        setPendingDebitEmi({ ...selectedEmi, emi_debit_day: parseInt(editForm.emi_debit_day) });
        setIsPastDebitOpen(true);
      }
    } catch (error) {
      console.error('Edit EMI error:', error.response?.data || error.message);
      toast.error(error.response?.data?.detail || 'Failed to update EMI');
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/emis/${selectedEmi.id}/payment`, {
        amount: parseFloat(paymentData.amount),
        payment_date: paymentData.payment_date,
      });
      toast.success('Payment recorded!');
      setIsPaymentOpen(false);
      setPaymentData({ amount: '', payment_date: new Date().toISOString().split('T')[0] });
      fetchEmis();
    } catch {
      toast.error('Failed to record payment');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/emis/${id}`);
      toast.success('EMI deleted');
      setIsDetailOpen(false);
      fetchEmis();
    } catch {
      toast.error('Failed to delete EMI');
    }
  };

  const handleReactivate = async (id) => {
    try {
      await axios.put(`${API}/emis/${id}`, { status: 'active' });
      toast.success('EMI reactivated');
      fetchEmis();
    } catch {
      toast.error('Failed to reactivate EMI');
    }
  };

  const handleMultiDelete = async () => {
    try {
      await Promise.all([...selected].map(id => axios.delete(`${API}/emis/${id}`)));
      toast.success(`${selected.size} EMI${selected.size > 1 ? 's' : ''} deleted`);
      setSelectMode(false);
      setSelected(new Set());
      fetchEmis();
    } catch {
      toast.error('Failed to delete selected EMIs');
    }
  };

  const openEdit = (emi) => {
    setSelectedEmi(emi);
    setEditForm({
      loan_name: emi.loan_name,
      principal_amount: emi.principal_amount.toString(),
      interest_rate: emi.interest_rate.toString(),
      monthly_payment: emi.monthly_payment.toString(),
      start_date: emi.start_date,
      tenure_months: emi.tenure_months.toString(),
      emi_debit_day: emi.emi_debit_day?.toString() || '',
      same_as_start: false,
    });
    setIsDetailOpen(false);
    setIsEditOpen(true);
  };

  const openDetail = (emi) => {
    setSelectedEmi(emi);
    setIsDetailOpen(true);
  };

  const cloneEmi = (emi) => {
    setAddForm({
      loan_name: `${emi.loan_name} (Copy)`,
      principal_amount: emi.principal_amount.toString(),
      interest_rate: emi.interest_rate.toString(),
      monthly_payment: emi.monthly_payment.toString(),
      start_date: emi.start_date,
      tenure_months: emi.tenure_months.toString(),
      emi_debit_day: emi.emi_debit_day?.toString() || '',
      same_as_start: false,
    });
    setIsAddOpen(true);
  };

  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center" style={{ background: "linear-gradient(160deg, #eef2ff 0%, #f5f3ff 50%, #fffaf5 100%)" }}>
        <PageLoader
          message="Loading your EMIs…"
          tips={["Calculating balances", "Checking due dates", "Finding prepayment opportunities"]}
        />
      </div>
    </>
  );

  const activeEmis = emis.filter(e => e.status === 'active');
  const closedEmis = emis.filter(e => e.status === 'closed');

  // Summary stats
  const totalMonthlyEMI = activeEmis.reduce((sum, e) => sum + e.monthly_payment, 0);
  const totalOutstanding = activeEmis.reduce((sum, e) => sum + e.remaining_balance, 0);

  // Find nearest upcoming due date
  const upcomingDues = activeEmis
    .filter(e => e.emi_debit_day)
    .map(e => ({ emi: e, due: calcNextDue(e.emi_debit_day) }))
    .filter(x => x.due)
    .sort((a, b) => a.due - b.due);
  const nearestDue = upcomingDues[0];

  // How many days until a date (0 = today)
  const daysUntil = (date) => {
    if (!date) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(date); d.setHours(0,0,0,0);
    return Math.round((d - today) / 86400000);
  };
  const dueThisWeek = upcomingDues.filter(x => daysUntil(x.due) <= 7).length;
  const dueThisWeekAmount = upcomingDues.filter(x => daysUntil(x.due) <= 7).reduce((s, x) => s + x.emi.monthly_payment, 0);

  return (
    <>
      <Navigation />
      <div className="page-container" style={{ background: "linear-gradient(160deg, #eef2ff 0%, #f5f3ff 50%, #fffaf5 100%)" }} data-testid="emi-manager-page">

        {/* ── Summary Banner ── */}
        {activeEmis.length > 0 && (
          <div className="bm-hero rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-500 to-purple-500 p-5 mb-6 text-white overflow-hidden"
            style={{ boxShadow: "0 8px 32px rgba(99,102,241,0.30)", backgroundSize: "200% 200%" }}>

            {/* Animated orbs */}
            <div className="bm-orb bm-orb-1" style={{ width: 220, height: 220, background: "rgba(255,255,255,0.06)", top: -70, right: -50 }} />
            <div className="bm-orb bm-orb-2" style={{ width: 140, height: 140, background: "rgba(167,139,250,0.20)", bottom: -40, left: 0 }} />
            <div className="bm-orb bm-orb-3" style={{ width: 90,  height: 90,  background: "rgba(255,255,255,0.05)", top: 8, left: "38%" }} />

            {/* Floating emoji coins */}
            {['💸','✨','🧘','☀️'].map((e, i) => (
              <span key={i} className="absolute text-xl select-none pointer-events-none"
                style={{
                  top: `${10 + i * 20}%`, right: `${6 + i * 7}%`,
                  opacity: 0.35,
                  animation: `bm-orb-float${i % 2 === 0 ? '' : '2'} ${3 + i * 0.6}s ease-in-out infinite`,
                  animationDelay: `${i * 0.5}s`,
                }}>{e}</span>
            ))}

            <div className="relative z-10">
              {/* Mood badge */}
              <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 mb-3 text-[11px] font-semibold text-white/90">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                {dueThisWeek === 0 ? '😌 All clear this week — stress free!' : `⏰ ${dueThisWeek} EMI due this week`}
              </div>

              <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-1">Monthly EMI Commitment</p>
              <p className="text-4xl font-bold mb-4 bm-hero-title">₹{Math.round(totalMonthlyEMI).toLocaleString('en-IN')}</p>

              <div className="flex gap-3">
                <div className="flex-1 bg-white/15 rounded-xl px-4 py-3 backdrop-blur-sm border border-white/10">
                  <p className="text-white/60 text-xs mb-0.5">Total Outstanding</p>
                  <p className="text-white font-bold text-lg">₹{Math.round(totalOutstanding).toLocaleString('en-IN')}</p>
                </div>
                <div className="flex-1 bg-white/15 rounded-xl px-4 py-3 backdrop-blur-sm border border-white/10">
                  <p className="text-white/60 text-xs mb-0.5">Due This Week</p>
                  <p className="text-white font-bold text-lg">
                    {dueThisWeek > 0
                      ? `${dueThisWeek} EMI${dueThisWeek > 1 ? 's' : ''} · ₹${Math.round(dueThisWeekAmount).toLocaleString('en-IN')}`
                      : '🎉 None upcoming'}
                  </p>
                </div>
                <div className="flex-1 bg-white/15 rounded-xl px-4 py-3 backdrop-blur-sm border border-white/10">
                  <p className="text-white/60 text-xs mb-0.5">Active Loans</p>
                  <p className="text-white font-bold text-lg">{activeEmis.length} loan{activeEmis.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Progress bar — paid vs outstanding */}
              {totalOutstanding > 0 && (() => {
                const totalOriginal = activeEmis.reduce((s, e) => s + (e.principal_amount || 0), 0);
                const paid = Math.max(0, totalOriginal - totalOutstanding);
                const pct = totalOriginal > 0 ? Math.round((paid / totalOriginal) * 100) : 0;
                return (
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] text-white/60 mb-1.5">
                      <span>Overall repayment progress</span>
                      <span className="font-semibold text-white/80">{pct}% paid off</span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-white/80 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="page-title">EMI Manager</h1>
            <p className="page-subtitle">Track and manage your loan EMIs</p>
          </div>
          <div className="flex items-center gap-2">
          {activeEmis.length >= 2 && (
            <Button variant="outline" size="sm"
              className="hidden sm:inline-flex text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs h-9"
              onClick={() => setIsMergeOpen(true)}>
              <Merge size={14} className="mr-1.5" /> Merge Loans
            </Button>
          )}
          {activeEmis.length > 0 && (
            <Button
              variant="outline" size="sm"
              className={`hidden sm:inline-flex text-xs h-9 ${selectMode ? 'bg-indigo-50 text-indigo-600 border-indigo-300' : 'text-stone-500 border-stone-200'}`}
              onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </Button>
          )}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-emi-btn" className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700">
                <Plus size={18} className="mr-2" />Add EMI
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" data-testid="add-emi-dialog" onOpenAutoFocus={e => e.preventDefault()}>
              <DialogHeader><DialogTitle>Add New EMI</DialogTitle></DialogHeader>
              <EMIForm formData={addForm} setFormData={setAddForm} onSubmit={handleAdd} onCancel={() => setIsAddOpen(false)} submitLabel="Add EMI" />
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-5">
          {['active', 'closed'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-200'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              {tab === 'active' ? `Active (${activeEmis.length})` : `Closed (${closedEmis.length})`}
            </button>
          ))}
        </div>

        {/* ── Active Loans ── */}
        {activeTab === 'active' && (
          <div className="space-y-4" data-testid="active-emis-section">
            {loading ? (
              [0,1,2].map(i => <SkeletonCard key={i} />)
            ) : activeEmis.length === 0 ? (
              <div className="card" data-testid="no-active-emis">
                <div className="empty-state">
                  <div className="empty-state-text">No active EMIs. Add your first loan above.</div>
                </div>
              </div>
            ) : (
              activeEmis.map(emi => {
                const progressPct = Math.round((emi.paid_months / emi.tenure_months) * 100);
                const nextDue = calcNextDue(emi.emi_debit_day);
                const isDueToday = emi.emi_debit_day && new Date().getDate() === emi.emi_debit_day;

                return (
                  <div
                    key={emi.id}
                    data-testid={`active-emi-${emi.id}`}
                    className={`rounded-xl border shadow-sm overflow-hidden flex ${selectMode && selected.has(emi.id) ? 'border-indigo-300 bg-indigo-50/40' : isDueToday ? 'border-indigo-200 bg-indigo-50/30' : 'border-stone-100 bg-white'}`}
                  >
                    {/* Left accent bar */}
                    <div className={`w-1.5 shrink-0 ${isDueToday ? 'bg-indigo-500' : 'bg-indigo-400'}`} />

                    {/* Checkbox in select mode */}
                    {selectMode && (
                      <div className="flex items-center pl-3 pr-1">
                        <input
                          type="checkbox"
                          checked={selected.has(emi.id)}
                          onChange={() => {
                            setSelected(prev => {
                              const next = new Set(prev);
                              next.has(emi.id) ? next.delete(emi.id) : next.add(emi.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 accent-indigo-500 cursor-pointer"
                        />
                      </div>
                    )}

                    <div className="flex-1 p-5">
                      {/* Top row */}
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-base font-bold text-stone-900">{emi.loan_name}</span>
                            {isDueToday && (
                              <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                <Calendar size={10} /> Due Today
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-400">{emi.interest_rate}% p.a. · started {fmtMonthYear(emi.start_date)} · ends {fmtMonthYear(calcEndDate(emi.start_date, emi.tenure_months))}</p>
                        </div>
                        <button
                          onClick={() => openDetail(emi)}
                          className="text-xs text-indigo-500 hover:text-indigo-600 font-medium flex items-center gap-0.5 transition-colors"
                        >
                          Details <ChevronRight size={14} />
                        </button>
                      </div>

                      {/* Balance + EMI row */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-stone-400 mb-0.5">Outstanding Balance</p>
                          <p className="text-xl font-bold text-indigo-600">₹{Math.round(emi.remaining_balance).toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-stone-400 mb-0.5">Monthly EMI</p>
                          <p className="text-xl font-bold text-stone-800">₹{emi.monthly_payment.toLocaleString('en-IN')}</p>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                          <span>{emi.paid_months} of {emi.tenure_months} EMIs paid</span>
                          <span className="font-medium text-stone-500">{progressPct}%</span>
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-400 to-indigo-400 rounded-full transition-all duration-500"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1">
                        {(() => {
                          const days = daysUntil(nextDue);
                          if (days === null) return <span />;
                          if (days === 0) return null; // already shown as "Due Today" badge
                          if (days < 0) return <span className="text-xs font-semibold text-red-500">Overdue by {Math.abs(days)}d</span>;
                          if (days <= 3) return <span className="text-xs font-semibold text-orange-500">Due in {days} day{days > 1 ? 's' : ''}</span>;
                          if (days <= 7) return <span className="text-xs font-semibold text-amber-600">Due in {days} days</span>;
                          return <span className="text-xs text-stone-400">Due in <span className="text-stone-600 font-medium">{days} days</span></span>;
                        })()}
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 text-xs px-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg"
                            onClick={() => { setSelectedEmi(emi); setPaymentData({ amount: emi.monthly_payment.toString(), payment_date: new Date().toISOString().split('T')[0] }); setIsPaymentOpen(true); }}
                            data-testid={`record-payment-${emi.id}`}
                          >
                            Pay
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-lg border-stone-200" onClick={() => { setSelectedEmi(emi); setIsPreCloseOpen(true); }} title="Pre-closure">
                            <TrendingDown size={13} />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-lg border-stone-200" onClick={() => cloneEmi(emi)} title="Clone EMI">
                            <Copy size={13} />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-lg border-stone-200" onClick={() => openEdit(emi)} data-testid={`edit-emi-${emi.id}`}>
                            <Pencil size={13} />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-lg border-stone-200 text-red-400 hover:bg-red-50" onClick={() => handleDelete(emi.id)} data-testid={`delete-emi-${emi.id}`}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Closed Loans ── */}
        {activeTab === 'closed' && (
          <div className="space-y-3" data-testid="closed-emis-section">
            {loading ? (
              [0,1].map(i => <SkeletonCard key={i} />)
            ) : closedEmis.length === 0 ? (
              <div className="card">
                <div className="empty-state"><div className="empty-state-text">No closed loans yet</div></div>
              </div>
            ) : (
              closedEmis.map(emi => (
                <div key={emi.id} data-testid={`closed-emi-${emi.id}`} className="bg-white rounded-2xl border border-stone-100 p-5 flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle size={20} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-stone-800">{emi.loan_name}</p>
                      <p className="text-sm text-stone-400">₹{emi.principal_amount.toLocaleString('en-IN')} · {emi.tenure_months} months · Fully paid</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-amber-500 border-amber-100 hover:bg-amber-50 gap-1.5 text-xs" onClick={() => handleReactivate(emi.id)}>
                      <RotateCcw size={12} /> Reactivate
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-400 border-red-100 hover:bg-red-50" onClick={() => handleDelete(emi.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}


        {/* ── Dialogs ── */}

        {/* Loan Detail Sheet */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedEmi?.loan_name}</DialogTitle>
            </DialogHeader>
            {selectedEmi && (
              <LoanDetailSheet
                emi={selectedEmi}
                onClose={() => setIsDetailOpen(false)}
                onRecordPayment={() => {
                  setPaymentData({ amount: selectedEmi.monthly_payment.toString(), payment_date: new Date().toISOString().split('T')[0] });
                  setIsDetailOpen(false);
                  setIsPaymentOpen(true);
                }}
                onPreClose={() => { setIsDetailOpen(false); setIsPreCloseOpen(true); }}
                onForeclose={() => { setIsDetailOpen(false); setIsForecloseOpen(true); }}
                onEdit={() => openEdit(selectedEmi)}
                onDelete={() => handleDelete(selectedEmi.id)}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-lg" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader><DialogTitle>Edit EMI</DialogTitle></DialogHeader>
            <EMIForm formData={editForm} setFormData={setEditForm} onSubmit={handleEdit} onCancel={() => setIsEditOpen(false)} submitLabel="Save Changes" />
          </DialogContent>
        </Dialog>

        {/* Payment Dialog */}
        <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
          <DialogContent data-testid="payment-dialog">
            <DialogHeader><DialogTitle>Record EMI Payment</DialogTitle></DialogHeader>
            {selectedEmi && (
              <form onSubmit={handlePayment} className="space-y-4">
                <div className="p-4 bg-stone-50 rounded-xl">
                  <p className="font-semibold text-stone-800">{selectedEmi.loan_name}</p>
                  <p className="text-sm text-stone-500 mt-1">Monthly EMI: ₹{selectedEmi.monthly_payment.toLocaleString('en-IN')}</p>
                  <p className="text-sm text-stone-500">Remaining: ₹{Math.round(selectedEmi.remaining_balance).toLocaleString('en-IN')}</p>
                </div>
                <div className="form-group">
                  <Label>Payment Amount (₹)</Label>
                  <Input type="number" value={paymentData.amount} onChange={e => setPaymentData(p => ({ ...p, amount: e.target.value }))} required data-testid="payment-amount-input" />
                </div>
                <div className="form-group">
                  <Label>Payment Date</Label>
                  <DatePicker value={paymentData.payment_date} onChange={v => setPaymentData(p => ({ ...p, payment_date: v }))} placeholder="Select payment date" />
                </div>
                <div className="flex gap-3">
                  <Button type="submit" className="flex-1 bg-gradient-to-r from-indigo-500 to-indigo-600" data-testid="submit-payment-btn">Record Payment</Button>
                  <Button type="button" variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Pre-closure Dialog */}
        <Dialog open={isPreCloseOpen} onOpenChange={setIsPreCloseOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Pre-closure & Part Payment Calculator</DialogTitle>
              {selectedEmi && <p className="text-sm text-stone-500 mt-1">{selectedEmi.loan_name}</p>}
            </DialogHeader>
            {selectedEmi && <PreClosureModal emi={selectedEmi} onClose={() => setIsPreCloseOpen(false)} />}
          </DialogContent>
        </Dialog>

        {/* Foreclose Dialog */}
        <Dialog open={isForecloseOpen} onOpenChange={setIsForecloseOpen}>
          <DialogContent className="max-w-sm" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock size={16} className="text-red-500" /> Foreclose Loan
              </DialogTitle>
              {selectedEmi && <p className="text-sm text-stone-500 mt-1">{selectedEmi.loan_name}</p>}
            </DialogHeader>
            {selectedEmi && (
              <ForecloseModal
                emi={selectedEmi}
                onClose={() => setIsForecloseOpen(false)}
                onSuccess={() => { setIsForecloseOpen(false); fetchEmis(); }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Merge Dialog */}
        <Dialog open={isMergeOpen} onOpenChange={setIsMergeOpen}>
          <DialogContent className="max-w-lg" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Merge size={16} className="text-indigo-500" /> Merge / Consolidate Loans
              </DialogTitle>
            </DialogHeader>
            <MergeModal
              emis={activeEmis}
              onClose={() => setIsMergeOpen(false)}
              onSuccess={fetchEmis}
            />
          </DialogContent>
        </Dialog>

        {/* ── Multi-select delete bar ── */}
        {selectMode && selected.size > 0 && (
          <div className="fixed bottom-20 lg:bottom-6 left-0 right-0 lg:left-64 z-50 flex justify-center px-4">
            <div className="bg-stone-900 text-white rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
              <span className="text-sm font-semibold">{selected.size} selected</span>
              <button onClick={handleMultiDelete} className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-xl transition-colors">Delete</button>
              <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="text-stone-400 hover:text-white text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Past-EMI-Date Confirmation Dialog */}
        <Dialog open={isPastDebitOpen} onOpenChange={setIsPastDebitOpen}>
          <DialogContent className="max-w-sm" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Record First EMI Payment?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-indigo-50 rounded-xl p-4">
                <p className="text-sm text-stone-700">
                  Your EMI debit date (<span className="font-semibold text-indigo-600">{pendingDebitEmi?.emi_debit_day}th of every month</span>) has already passed this month.
                </p>
                <p className="text-sm text-stone-500 mt-2">Would you like to record the first EMI payment now?</p>
              </div>
              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white"
                  onClick={() => {
                    setIsPastDebitOpen(false);
                    setPendingDebitEmi(null);
                    setIsPaymentOpen(true);
                  }}
                >
                  Yes, Record Payment
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setIsPastDebitOpen(false); setPendingDebitEmi(null); }}
                >
                  Skip
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default EMIManager;
