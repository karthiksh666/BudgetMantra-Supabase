import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStaleData } from '@/hooks/useStaleData';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/DatePicker';
import { toast } from 'sonner';
import axios from 'axios';
import { API } from '@/App';
import {
  RefreshCw, Plus, Pencil, Trash2, Pause, Play,
  Calendar, IndianRupee, CheckCircle, X, Save, RotateCcw,
} from 'lucide-react';

const FREQ_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'yearly',  label: 'Yearly'  },
];

const FREQ_COLORS = {
  monthly: 'bg-blue-100 text-blue-700',
  weekly:  'bg-violet-100 text-violet-700',
  yearly:  'bg-amber-100 text-amber-700',
};

const EMOJIS = ['🏠', '💡', '💧', '📱', '🌐', '🚗', '🎓', '🏥', '🛒', '📺', '🎵', '🍔', '✈️', '💳', '🔄'];

function nextDueDate(rec) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  try {
    if (rec.frequency === 'monthly') {
      const d = new Date(today.getFullYear(), today.getMonth(), rec.day_of_month);
      if (d <= today) d.setMonth(d.getMonth() + 1);
      return d.toISOString().split('T')[0];
    }
    if (rec.frequency === 'yearly') {
      const sd = new Date(rec.start_date);
      const d = new Date(today.getFullYear(), sd.getMonth(), sd.getDate());
      if (d <= today) d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().split('T')[0];
    }
    if (rec.frequency === 'weekly') {
      const sd = new Date(rec.start_date);
      const daysSince = Math.floor((today - sd) / 86400000);
      const daysUntil = 7 - (daysSince % 7);
      const d = new Date(today);
      d.setDate(d.getDate() + (daysUntil === 7 ? 0 : daysUntil));
      return d.toISOString().split('T')[0];
    }
  } catch { return '—'; }
  return '—';
}

function daysUntil(dateStr) {
  if (!dateStr || dateStr === '—') return null;
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  return diff;
}

const DEFAULT_FORM = {
  name: '', amount: '', category_id: '', category_name: '',
  description: '', frequency: 'monthly', day_of_month: 1,
  start_date: new Date().toISOString().split('T')[0], end_date: '', emoji: '🔄',
};

export default function RecurringExpenses() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(DEFAULT_FORM);
  const [saving, setSaving]     = useState(false);
  const [quickEdit, setQuickEdit] = useState(null); // { id, amount }

  const fetchRecurring = useCallback(async () => {
    const [recRes, catRes] = await Promise.all([
      axios.get(`${API}/recurring-expenses`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${API}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    return { items: recRes.data || [], categories: catRes.data || [] };
  }, [token]); // eslint-disable-line

  const { data: recData, loading, reload: load } = useStaleData(
    "bm_recurring_cache",
    fetchRecurring,
    { errorMsg: "Failed to load recurring expenses", fallback: { items: [], categories: [] } }
  );

  const items      = recData?.items ?? [];
  const categories = (recData?.categories ?? []).filter(c => c.type === 'expense');

  const openAdd = () => {
    setForm(DEFAULT_FORM);
    setEditId(null);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({
      name: item.name, amount: item.amount, category_id: item.category_id,
      category_name: item.category_name, description: item.description || '',
      frequency: item.frequency, day_of_month: item.day_of_month,
      start_date: item.start_date, end_date: item.end_date || '', emoji: item.emoji || '🔄',
    });
    setEditId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.amount || !form.category_id) {
      toast.error('Name, amount and category are required'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount), day_of_month: parseInt(form.day_of_month) };
      if (editId) {
        await axios.put(`${API}/recurring-expenses/${editId}`, payload, { headers });
        toast.success('Updated!');
      } else {
        await axios.post(`${API}/recurring-expenses`, payload, { headers });
        toast.success('Recurring expense added!');
      }
      setShowForm(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (item) => {
    try {
      await axios.put(`${API}/recurring-expenses/${item.id}`, { is_active: !item.is_active }, { headers });
      toast.success(item.is_active ? 'Paused' : 'Resumed');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this recurring expense?')) return;
    try {
      await axios.delete(`${API}/recurring-expenses/${id}`, { headers });
      toast.success('Deleted');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleQuickSave = async () => {
    if (!quickEdit) return;
    try {
      await axios.put(`${API}/recurring-expenses/${quickEdit.id}`, { amount: parseFloat(quickEdit.amount) }, { headers });
      setQuickEdit(null);
      toast.success('Amount updated!');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleBackfill = async (item) => {
    const confirmed = window.confirm(
      `Create all missed "${item.name}" transactions from ${item.start_date} to today?\n\nThis will add the expense to your spends for each missed ${item.frequency} cycle.`
    );
    if (!confirmed) return;
    try {
      const res = await axios.post(`${API}/recurring-expenses/${item.id}/backfill`, {}, { headers });
      if (res.data.created === 0) {
        toast.success('No missed transactions — all up to date!');
      } else {
        toast.success(`Created ${res.data.created} past transaction${res.data.created > 1 ? 's' : ''}!`);
      }
    } catch (e) { toast.error(e.response?.data?.detail || 'Backfill failed'); }
  };

  const totalMonthly = items
    .filter(i => i.is_active)
    .reduce((sum, i) => {
      if (i.frequency === 'monthly') return sum + i.amount;
      if (i.frequency === 'weekly')  return sum + i.amount * 4.33;
      if (i.frequency === 'yearly')  return sum + i.amount / 12;
      return sum;
    }, 0);

  const active   = items.filter(i => i.is_active);
  const paused   = items.filter(i => !i.is_active);
  const upcoming = active
    .map(i => ({ ...i, next: nextDueDate(i), days: daysUntil(nextDueDate(i)) }))
    .filter(i => i.days !== null && i.days <= 7)
    .sort((a, b) => a.days - b.days);

  return (
    <div className="min-h-screen bg-[#fffaf5] dark:bg-stone-950">
      <Navigation />
      <div className="max-w-2xl mx-auto px-4 py-8 pb-24 lg:pb-8 space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 rounded-3xl p-6 text-white relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-36 h-36 bg-white/10 rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <p className="text-violet-200 text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5">
                <RefreshCw size={12} /> Auto-recurring
              </p>
              <button onClick={openAdd}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">
                <Plus size={13} /> Add New
              </button>
            </div>
            <h1 className="text-2xl font-extrabold font-['Outfit']">Recurring Expenses</h1>
            <p className="text-violet-200 text-sm mt-1">Auto-added to your spends every cycle</p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-white/15 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-violet-200 uppercase tracking-wide">Monthly Total</p>
                <p className="font-bold text-sm">₹{Math.round(totalMonthly).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white/15 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-violet-200 uppercase tracking-wide">Active</p>
                <p className="font-bold text-sm">{active.length}</p>
              </div>
              <div className="bg-white/15 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-violet-200 uppercase tracking-wide">Due This Week</p>
                <p className="font-bold text-sm">{upcoming.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Due this week */}
        {upcoming.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Calendar size={12} /> Due this week
            </p>
            <div className="space-y-2">
              {upcoming.map(i => (
                <div key={i.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{i.emoji}</span>
                    <span className="text-sm font-medium text-stone-800">{i.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-stone-700">₹{i.amount.toLocaleString('en-IN')}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      i.days === 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {i.days === 0 ? 'Today' : `${i.days}d`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-stone-800 font-['Outfit']">{editId ? 'Edit Recurring' : 'New Recurring Expense'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-stone-400 hover:text-stone-600"><X size={16} /></button>
            </div>

            {/* Emoji + Name */}
            <div className="flex gap-2">
              <div className="relative">
                <select value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                  className="h-11 w-14 bg-stone-50 border border-stone-200 rounded-xl text-lg text-center outline-none cursor-pointer">
                  {EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Rent, Electricity, Netflix"
                className="flex-1 h-11 bg-stone-50 border-stone-200 rounded-xl" />
            </div>

            {/* Amount */}
            <div className="relative">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Amount" className="h-11 bg-stone-50 border-stone-200 rounded-xl pl-8" />
            </div>

            {/* Category */}
            <select value={form.category_id}
              onChange={e => {
                const cat = categories.find(c => c.id === e.target.value);
                setForm(f => ({ ...f, category_id: e.target.value, category_name: cat?.name || '' }));
              }}
              className="w-full h-11 bg-stone-50 border border-stone-200 rounded-xl px-3 text-sm text-stone-800 outline-none">
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Frequency + Day */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-stone-500 mb-1">Frequency</p>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                  className="w-full h-11 bg-stone-50 border border-stone-200 rounded-xl px-3 text-sm text-stone-800 outline-none">
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {form.frequency === 'monthly' && (
                <div>
                  <p className="text-xs text-stone-500 mb-1">Day of month</p>
                  <Input type="number" min={1} max={28} value={form.day_of_month}
                    onChange={e => setForm(f => ({ ...f, day_of_month: parseInt(e.target.value) || 1 }))}
                    className="h-11 bg-stone-50 border-stone-200 rounded-xl" />
                </div>
              )}
            </div>

            {/* Start date + optional description */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-stone-500 mb-1">Start date</p>
                <DatePicker value={form.start_date} onChange={v => setForm(f => ({ ...f, start_date: v }))} placeholder="Start date" />
              </div>
              <div>
                <p className="text-xs text-stone-500 mb-1">End date (optional)</p>
                <DatePicker value={form.end_date} onChange={v => setForm(f => ({ ...f, end_date: v }))} placeholder="End date (optional)" />
              </div>
            </div>

            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)" className="h-11 bg-stone-50 border-stone-200 rounded-xl" />

            <Button onClick={handleSave} disabled={saving}
              className="w-full h-11 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-semibold">
              <Save size={15} className="mr-2" />
              {saving ? 'Saving…' : editId ? 'Update' : 'Add Recurring Expense'}
            </Button>
          </div>
        )}

        {loading && (
          <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
        )}

        {/* Active list */}
        {!loading && active.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider px-1">Active ({active.length})</p>
            {active.map(item => {
              const next = nextDueDate(item);
              const days = daysUntil(next);
              return (
                <div key={item.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-11 h-11 bg-violet-50 rounded-xl flex items-center justify-center text-xl shrink-0">
                        {item.emoji || '🔄'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-800 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-stone-400 truncate">{item.category_name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${FREQ_COLORS[item.frequency] || 'bg-stone-100 text-stone-500'}`}>
                            {item.frequency}
                          </span>
                          {item.frequency === 'monthly' && (
                            <span className="text-[10px] text-stone-400">day {item.day_of_month}</span>
                          )}
                          {days !== null && (
                            <span className={`text-[10px] font-semibold ${days <= 3 ? 'text-amber-600' : 'text-stone-400'}`}>
                              next: {days === 0 ? 'today' : `${next}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Amount — click to quick-edit */}
                    <div className="text-right shrink-0">
                      {quickEdit?.id === item.id ? (
                        <div className="flex items-center gap-1">
                          <Input type="number" value={quickEdit.amount}
                            onChange={e => setQuickEdit(q => ({ ...q, amount: e.target.value }))}
                            className="w-24 h-8 text-sm text-right border-violet-300 rounded-lg"
                            autoFocus onKeyDown={e => e.key === 'Enter' && handleQuickSave()} />
                          <button onClick={handleQuickSave} className="p-1.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600">
                            <CheckCircle size={13} />
                          </button>
                          <button onClick={() => setQuickEdit(null)} className="p-1.5 text-stone-400 hover:text-stone-600">
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setQuickEdit({ id: item.id, amount: item.amount })}
                          className="group flex items-center gap-1 text-right">
                          <span className="font-bold text-stone-800">₹{item.amount.toLocaleString('en-IN')}</span>
                          <Pencil size={11} className="text-stone-300 group-hover:text-violet-500 transition-colors" />
                        </button>
                      )}
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {item.frequency === 'yearly' ? `₹${Math.round(item.amount/12).toLocaleString('en-IN')}/mo` :
                         item.frequency === 'weekly' ? `₹${Math.round(item.amount*4.33).toLocaleString('en-IN')}/mo` : '/month'}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-stone-50">
                    <button onClick={() => openEdit(item)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-stone-500 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors">
                      <Pencil size={12} /> Edit
                    </button>
                    <button onClick={() => handleToggle(item)}
                      className="flex-1 hidden sm:flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-stone-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors">
                      <Pause size={12} /> Pause
                    </button>
                    <button onClick={() => handleBackfill(item)}
                      className="flex-1 hidden sm:flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-stone-500 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors">
                      <RotateCcw size={12} /> Backfill
                    </button>
                    <button onClick={() => handleDelete(item.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-stone-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paused list */}
        {!loading && paused.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider px-1">Paused ({paused.length})</p>
            {paused.map(item => (
              <div key={item.id} className="bg-stone-50 rounded-2xl border border-stone-100 p-4 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-lg">{item.emoji || '🔄'}</div>
                    <div>
                      <p className="font-semibold text-stone-700 text-sm">{item.name}</p>
                      <p className="text-xs text-stone-400">{item.category_name} · {item.frequency}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-600 text-sm">₹{item.amount.toLocaleString('en-IN')}</span>
                    <button onClick={() => handleToggle(item)}
                      className="p-2 bg-white rounded-xl border border-stone-200 text-stone-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors">
                      <Play size={13} />
                    </button>
                    <button onClick={() => handleDelete(item.id)}
                      className="p-2 bg-white rounded-xl border border-stone-200 text-stone-400 hover:text-red-500 hover:border-red-200 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <RefreshCw size={28} className="text-violet-400" />
            </div>
            <p className="font-semibold text-stone-700 mb-1">No recurring expenses yet</p>
            <p className="text-stone-400 text-sm mb-4">Add rent, electricity, EMIs or any bill that repeats</p>
            <Button onClick={openAdd} className="bg-violet-500 hover:bg-violet-600 text-white rounded-xl px-6">
              <Plus size={15} className="mr-2" /> Add First Recurring Expense
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
