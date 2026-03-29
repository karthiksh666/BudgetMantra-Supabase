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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { toast } from "sonner";
import { Plus, TrendingDown, TrendingUp, Trash2, Receipt, ChevronLeft, ChevronRight, CheckSquare, Square, AlertTriangle } from "lucide-react";
import ResetDataButton from '@/components/ResetDataButton';

const fmtAmt = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

const Skeleton = ({ className }) => <div className={`animate-pulse bg-stone-200 rounded-lg ${className}`} />;

// Group transactions by date label
const groupByDate = (txns) => {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const groups    = {};
  txns.forEach(t => {
    const label = t.date === today ? 'Today'
      : t.date === yesterday ? 'Yesterday'
      : new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  });
  return groups;
};

const Transactions = () => {
  const [activeTab]                      = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const currentYear = new Date().getFullYear();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [formData, setFormData]         = useState({
    category_id: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const fetchTxns = useCallback(async () => {
    const [txnRes, catRes] = await Promise.all([
      axios.get(`${API}/transactions`),
      axios.get(`${API}/categories`),
    ]);
    return { transactions: txnRes.data || [], categories: catRes.data || [] };
  }, []);

  const { data: txnData, loading, reload: fetchData } = useStaleData(
    "bm_transactions_cache",
    fetchTxns,
    { errorMsg: "Failed to load transactions", fallback: { transactions: [], categories: [] } }
  );

  // Refresh when Chanakya logs a transaction via chat
  useEffect(() => {
    const onLog = () => fetchData();
    window.addEventListener("chanakya-logged", onLog);
    return () => window.removeEventListener("chanakya-logged", onLog);
  }, [fetchData]);

  const transactions = txnData?.transactions ?? [];
  const categories   = txnData?.categories ?? [];

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/transactions`, {
        category_id:  formData.category_id,
        amount:       parseFloat(formData.amount),
        description:  formData.description,
        date:         formData.date,
      });
      toast.success('Transaction added!');
      setIsDialogOpen(false);
      setFormData({ category_id: '', amount: '', description: '', date: new Date().toISOString().split('T')[0] });
      fetchData();
    } catch {
      toast.error('Failed to add transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/transactions/${id}`);
      toast.success('Deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map(id => axios.delete(`${API}/transactions/${id}`)));
      toast.success(`${selectedIds.size} transaction${selectedIds.size > 1 ? 's' : ''} deleted`);
      setSelectedIds(new Set());
      setSelectMode(false);
      setDeleteModalOpen(false);
      fetchData();
    } catch {
      toast.error('Failed to delete some transactions');
    } finally {
      setBulkDeleting(false);
    }
  };

  const expenseTransactions = transactions.filter(t =>
    t.type === 'expense' && t.date?.startsWith(String(selectedYear))
  );
  const totalExpense = expenseTransactions.reduce((s, t) => s + t.amount, 0);
  const largestSpend = expenseTransactions.length ? Math.max(...expenseTransactions.map(t => t.amount)) : 0;

  // Tab filtering
  const filtered = activeTab === 'all' ? expenseTransactions
    : expenseTransactions.filter(t => t.type === activeTab);

  const groups = groupByDate(filtered);

  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bm-page-bg-violet flex items-center justify-center">
        <PageLoader
          message="Fetching your spends…"
          tips={["Grouping by date", "Tallying income & expenses", "Loading categories"]}
        />
      </div>
    </>
  );

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bm-page-bg-violet" data-testid="transactions-page">
        <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-stone-900 font-['Outfit']">Spends</h1>
              <p className="text-stone-400 text-sm mt-0.5">Track your expenses</p>
            </div>
            <div className="flex items-center gap-2">
              {selectMode ? (
                <>
                  <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={() => selectedIds.size > 0 && setDeleteModalOpen(true)}
                    disabled={selectedIds.size === 0}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors flex items-center gap-1.5">
                    <Trash2 size={12} /> Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setSelectMode(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors flex items-center gap-1.5">
                    <CheckSquare size={12} /> Select
                  </button>
                  <ResetDataButton feature="transactions" label="transactions" onReset={fetchData} />
                </>
              )}
              {!selectMode && <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="add-transaction-btn"
                  className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 shadow-sm shadow-violet-300/40"
                >
                  <Plus size={16} className="mr-1.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="add-transaction-dialog" onOpenAutoFocus={e => e.preventDefault()}>
                <DialogHeader>
                  <DialogTitle>Add Transaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                  <div>
                    <Label className="text-sm font-medium text-stone-700">Category</Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={v => setFormData(p => ({ ...p, category_id: v }))}
                    >
                      <SelectTrigger data-testid="transaction-category-select" className="mt-1.5">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.filter(cat => cat.type === 'expense').map(cat => (
                          <SelectItem key={cat.id} value={cat.id} data-testid={`category-option-${cat.id}`}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-stone-700">Amount (₹)</Label>
                    <Input
                      data-testid="transaction-amount-input"
                      type="number"
                      value={formData.amount}
                      onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))}
                      placeholder="1000"
                      required
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-stone-700">Description</Label>
                    <Input
                      data-testid="transaction-description-input"
                      value={formData.description}
                      onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                      placeholder="e.g., Grocery shopping"
                      required
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-stone-700">Date</Label>
                    <div className="mt-1.5">
                      <DatePicker
                        value={formData.date}
                        onChange={v => setFormData(p => ({ ...p, date: v }))}
                        placeholder="Select date"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button type="submit" data-testid="submit-transaction-btn" className="flex-1 bg-gradient-to-r from-violet-500 to-purple-500">
                      Add Transaction
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="cancel-transaction-btn">
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>}
            </div>
          </div>

          {/* ── Bulk Delete Confirmation Modal ── */}
          <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
            <DialogContent onOpenAutoFocus={e => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle size={18} /> Delete {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''}?
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-stone-500 mt-1">
                This will permanently delete {selectedIds.size} selected transaction{selectedIds.size > 1 ? 's' : ''}. This action cannot be undone.
              </p>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={() => setDeleteModalOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white">
                  {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Summary hero ── */}
          {loading ? (
            <Skeleton className="h-24 rounded-2xl mb-5" />
          ) : (
            <div className="bm-hero rounded-2xl bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 p-5 mb-5 text-white shadow-lg" style={{ boxShadow: "0 8px 32px rgba(124,58,237,0.25)", backgroundSize: "200% 200%" }}>
              <div className="bm-orb bm-orb-1" style={{ width: 160, height: 160, background: "rgba(255,255,255,0.07)", top: -40, right: -30 }} />
              <div className="bm-orb bm-orb-2" style={{ width: 100, height: 100, background: "rgba(192,132,252,0.2)", bottom: -20, left: 10 }} />
              <div className="relative z-10 grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Spent',   value: fmtAmt(totalExpense),           sub: String(selectedYear)   },
                  { label: 'Transactions',  value: expenseTransactions.length,      sub: 'recorded'      },
                  { label: 'Largest Spend', value: fmtAmt(largestSpend),            sub: 'single spend'  },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="bg-white/15 rounded-xl px-3 py-3 backdrop-blur-sm text-center">
                    <p className="text-white font-bold text-base sm:text-lg font-['Outfit'] leading-none">{value}</p>
                    <p className="text-white/60 text-[10px] mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Year picker + Tabs ── */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <span className="px-4 py-1.5 rounded-full text-sm font-semibold bg-violet-500 text-white shadow-md shadow-violet-200">
                All ({expenseTransactions.length})
              </span>
            </div>
            <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1">
              <button onClick={() => setSelectedYear(y => y - 1)}
                className="p-1.5 rounded-lg hover:bg-white transition-colors">
                <ChevronLeft size={14} className="text-stone-500" />
              </button>
              <span className="font-bold text-sm text-stone-700 w-10 text-center">{selectedYear}</span>
              <button onClick={() => setSelectedYear(y => y + 1)} disabled={selectedYear >= currentYear}
                className="p-1.5 rounded-lg hover:bg-white transition-colors disabled:opacity-30">
                <ChevronRight size={14} className="text-stone-500" />
              </button>
            </div>
          </div>

          {/* ── List ── */}
          {loading ? (
            <div className="space-y-2">
              {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center" data-testid="no-transactions">
              <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Receipt size={22} className="text-violet-300" />
              </div>
              <p className="font-semibold text-stone-600">No transactions yet</p>
              <p className="text-stone-400 text-sm mt-1">Tap + to add your first transaction</p>
            </div>
          ) : (
            <div className="space-y-5" data-testid="transactions-list">
              {Object.entries(groups).map(([dateLabel, txns]) => (
                <div key={dateLabel}>
                  {/* Date header */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{dateLabel}</span>
                    <div className="flex-1 h-px bg-stone-100" />
                    <span className="text-xs text-stone-400">
                      {fmtAmt(txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0))} spent
                    </span>
                  </div>

                  {/* Transactions for this date */}
                  <div className="space-y-2">
                    {txns.map(txn => {
                      const isSelected = selectedIds.has(txn.id);
                      return (
                        <div
                          key={txn.id}
                          data-testid={`transaction-${txn.id}`}
                          onClick={selectMode ? () => toggleSelect(txn.id) : undefined}
                          className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-3 transition-all ${
                            selectMode
                              ? isSelected
                                ? 'border-red-300 bg-red-50/30 cursor-pointer'
                                : 'border-stone-100 cursor-pointer hover:border-stone-200'
                              : 'border-stone-100 hover:shadow-md hover:border-violet-100'
                          }`}
                        >
                          {/* Checkbox in select mode */}
                          {selectMode && (
                            <div className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              isSelected ? 'bg-red-500 border-red-500' : 'border-stone-300'
                            }`}>
                              {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                            </div>
                          )}

                          {/* Icon */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            txn.type === 'income' ? 'bg-emerald-50' : 'bg-red-50'
                          }`}>
                            {txn.type === 'income'
                              ? <TrendingUp  size={17} className="text-emerald-500" />
                              : <TrendingDown size={17} className="text-red-500" />}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-stone-800 text-sm truncate">{txn.description}</p>
                            <p className="text-xs text-stone-400">{txn.category_name}</p>
                          </div>

                          {/* Amount + delete */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-bold text-base font-['Outfit'] ${
                              txn.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                            }`}>
                              {txn.type === 'income' ? '+' : '-'}{fmtAmt(txn.amount)}
                            </span>
                            {!selectMode && (
                              <button
                                onClick={() => handleDelete(txn.id)}
                                className="p-1.5 text-stone-200 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default Transactions;
