import { useState, useCallback } from 'react';
import { useStaleData } from '@/hooks/useStaleData';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Plus, Watch, ShoppingBag, Gem, Palette, Star, Car, Wine,
  Smartphone, Footprints, Package, TrendingUp, TrendingDown,
  Shield, Edit2, Trash2, MoreVertical, Crown
} from 'lucide-react';
import { DatePicker } from "@/components/DatePicker";
import ResetDataButton from '@/components/ResetDataButton';

const CATEGORIES = [
  { label: 'Watch',       icon: Watch,       color: 'from-slate-600 to-slate-800',   bg: 'bg-slate-50',   text: 'text-slate-700'   },
  { label: 'Bag',         icon: ShoppingBag, color: 'from-amber-600 to-amber-800',   bg: 'bg-amber-50',   text: 'text-amber-700'   },
  { label: 'Jewellery',   icon: Gem,         color: 'from-pink-500 to-rose-600',     bg: 'bg-pink-50',    text: 'text-pink-700'    },
  { label: 'Art',         icon: Palette,     color: 'from-violet-500 to-purple-700', bg: 'bg-violet-50',  text: 'text-violet-700'  },
  { label: 'Collectible', icon: Star,        color: 'from-yellow-500 to-amber-600',  bg: 'bg-yellow-50',  text: 'text-yellow-700'  },
  { label: 'Car',         icon: Car,         color: 'from-blue-600 to-blue-800',     bg: 'bg-blue-50',    text: 'text-blue-700'    },
  { label: 'Wine',        icon: Wine,        color: 'from-red-600 to-red-800',       bg: 'bg-red-50',     text: 'text-red-700'     },
  { label: 'Electronics', icon: Smartphone,  color: 'from-emerald-500 to-teal-700',  bg: 'bg-emerald-50', text: 'text-emerald-700' },
  { label: 'Footwear',    icon: Footprints,  color: 'from-orange-500 to-orange-700', bg: 'bg-orange-50',  text: 'text-orange-700'  },
  { label: 'Other',       icon: Package,     color: 'from-stone-500 to-stone-700',   bg: 'bg-stone-50',   text: 'text-stone-700'   },
];

const CONDITIONS = ['Mint', 'Excellent', 'Good', 'Fair', 'Poor'];

const fmtINR = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 10000000) return `₹${(abs/10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `₹${(abs/100000).toFixed(2)}L`;
  if (abs >= 1000)     return `₹${(abs/1000).toFixed(1)}K`;
  return `₹${Math.round(abs).toLocaleString('en-IN')}`;
};

const getCat = (label) => CATEGORIES.find(c => c.label === label) || CATEGORIES[CATEGORIES.length - 1];

const EMPTY_FORM = {
  name: '', brand: '', category: 'Watch', purchase_price: '', current_value: '',
  purchase_date: '', condition: 'Good', serial_number: '', insured: false,
  insurance_value: '', notes: '',
};

export default function LuxuryTracker() {
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterCat, setFilterCat]   = useState('All');

  const fetchLuxury = useCallback(async () => {
    const res = await axios.get(`${API}/luxury-items`);
    return res.data || { items: [], total_cost: 0, total_value: 0, gain: 0 };
  }, []);

  const { data, loading, reload: fetchData } = useStaleData(
    'bm_luxury_cache',
    fetchLuxury,
    { errorMsg: 'Failed to load items', fallback: { items: [], total_cost: 0, total_value: 0, gain: 0 } }
  );

  const openAdd  = () => { setForm(EMPTY_FORM); setEditId(null); setDialogOpen(true); };
  const openEdit = (item) => {
    setForm({ ...EMPTY_FORM, ...item, purchase_price: item.purchase_price, current_value: item.current_value, insurance_value: item.insurance_value || '' });
    setEditId(item.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.purchase_price) { toast.error('Name and purchase price are required'); return; }
    const payload = { ...form, purchase_price: parseFloat(form.purchase_price), current_value: parseFloat(form.current_value || form.purchase_price), insurance_value: parseFloat(form.insurance_value || 0) };
    try {
      if (editId) { await axios.put(`${API}/luxury-items/${editId}`, payload); toast.success('Updated!'); }
      else         { await axios.post(`${API}/luxury-items`, payload); toast.success('Item added!'); }
      setDialogOpen(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); }
  };

  const handleDelete = async () => {
    try { await axios.delete(`${API}/luxury-items/${deleteId}`); toast.success('Deleted'); setDeleteId(null); fetchData(); }
    catch { toast.error('Failed to delete'); }
  };

  const filtered = filterCat === 'All' ? data.items : data.items.filter(i => i.category === filterCat);
  const gainPct  = data.total_cost > 0 ? ((data.gain / data.total_cost) * 100).toFixed(1) : 0;
  const isUp     = data.gain >= 0;

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-stone-50 to-amber-50/30 dark:bg-[#0c1017]">
        <div className="max-w-5xl mx-auto px-4 py-6">

          {/* Hero banner */}
          <div className="bm-hero rounded-3xl bg-gradient-to-r from-slate-800 via-slate-700 to-amber-700 p-6 mb-6 text-white overflow-hidden" style={{ backgroundSize: '200% 200%', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
            <div className="bm-orb bm-orb-1" style={{ width: 220, height: 220, background: 'rgba(255,255,255,0.05)', top: -70, right: -60 }} />
            <div className="bm-orb bm-orb-2" style={{ width: 140, height: 140, background: 'rgba(251,191,36,0.15)', bottom: -40, left: 0 }} />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center"><Crown size={20} className="text-amber-300" /></div>
                <div>
                  <p className="text-white/70 text-xs uppercase tracking-widest">Luxury Portfolio</p>
                  <p className="text-xs text-amber-200">{data.items.length} item{data.items.length !== 1 ? 's' : ''} tracked</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-white/60 text-xs mb-0.5">Total Cost</p>
                  <p className="text-2xl font-black font-['Outfit']">{fmtINR(data.total_cost)}</p>
                </div>
                <div>
                  <p className="text-white/60 text-xs mb-0.5">Current Value</p>
                  <p className="text-2xl font-black font-['Outfit']">{fmtINR(data.total_value)}</p>
                </div>
                <div>
                  <p className="text-white/60 text-xs mb-0.5">Appreciation</p>
                  <p className={`text-2xl font-black font-['Outfit'] ${isUp ? 'text-emerald-300' : 'text-red-300'}`}>
                    {isUp ? '+' : ''}{fmtINR(data.gain)} <span className="text-base">({gainPct}%)</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Header + Add */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">Luxury Tracker</h1>
              <p className="text-stone-400 text-sm">Your curated collection of fine items</p>
            </div>
            <div className="flex items-center gap-2">
              <ResetDataButton feature="luxury-items" label="luxury items" onReset={fetchData} className="hidden sm:inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-rose-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20" />
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAdd} className="bg-gradient-to-r from-slate-700 to-amber-700 text-white">
                  <Plus size={16} className="mr-1.5" /> Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editId ? 'Edit Item' : 'Add Luxury Item'}</DialogTitle></DialogHeader>
                <LuxuryForm form={form} setForm={setForm} onSave={handleSave} onCancel={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {/* Category filters */}
          <div className="flex gap-2 flex-wrap mb-5">
            {['All', ...CATEGORIES.map(c => c.label)].map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filterCat === cat ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-stone-600 border-stone-200 hover:border-slate-400'}`}>
                {cat}
              </button>
            ))}
          </div>

          {/* Items grid */}
          {loading ? (
            <div className="text-center py-16 text-stone-400">Loading your collection…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-3">💎</div>
              <p className="font-bold text-stone-700 dark:text-stone-300 text-lg">No items yet</p>
              <p className="text-stone-400 text-sm mt-1">Start tracking your luxury collection</p>
              <Button onClick={openAdd} className="mt-4 bg-slate-800 text-white"><Plus size={14} className="mr-1.5" /> Add First Item</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(item => {
                const cat  = getCat(item.category);
                const CatIcon = cat.icon;
                const gain = item.current_value - item.purchase_price;
                const gainUp = gain >= 0;
                return (
                  <div key={item.id} className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md transition-all overflow-hidden group">
                    <div className={`h-2 bg-gradient-to-r ${cat.color}`} />
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 ${cat.bg} rounded-xl flex items-center justify-center`}>
                          <CatIcon size={18} className={cat.text} />
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(item)} className="p-1.5 text-stone-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={13} /></button>
                          <button onClick={() => setDeleteId(item.id)} className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <p className="font-bold text-stone-800 dark:text-stone-100 text-sm truncate">{item.name}</p>
                      {item.brand && <p className="text-xs text-stone-400 mb-2">{item.brand}</p>}
                      <div className="flex justify-between items-end mt-2">
                        <div>
                          <p className="text-xs text-stone-400">Current Value</p>
                          <p className="font-bold text-stone-800 dark:text-stone-100">{fmtINR(item.current_value)}</p>
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-semibold ${gainUp ? 'text-emerald-600' : 'text-red-500'}`}>
                          {gainUp ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
                          {gainUp ? '+' : ''}{fmtINR(gain)}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-500 rounded-full">{item.condition}</span>
                        {item.insured && <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full flex items-center gap-1"><Shield size={9}/> Insured</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Item?</DialogTitle></DialogHeader>
          <p className="text-sm text-stone-500">This will permanently remove this item from your collection.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
            <Button onClick={handleDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white">Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LuxuryForm({ form, setForm, onSave, onCancel }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Item Name *</Label>
          <Input placeholder="e.g. Rolex Submariner" value={form.name} onChange={e => set('name', e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>Brand</Label>
          <Input placeholder="e.g. Rolex" value={form.brand} onChange={e => set('brand', e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <select value={form.category} onChange={e => set('category', e.target.value)} className="w-full h-10 border border-stone-200 rounded-xl px-3 text-sm outline-none bg-white dark:bg-stone-900 dark:border-stone-700">
            {CATEGORIES.map(c => <option key={c.label}>{c.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Purchase Price (₹) *</Label>
          <Input type="number" placeholder="e.g. 500000" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>Current Value (₹)</Label>
          <Input type="number" placeholder="Leave blank = cost" value={form.current_value} onChange={e => set('current_value', e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>Purchase Date</Label>
          <DatePicker value={form.purchase_date} onChange={v => set('purchase_date', v)} className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>Condition</Label>
          <select value={form.condition} onChange={e => set('condition', e.target.value)} className="w-full h-10 border border-stone-200 rounded-xl px-3 text-sm outline-none bg-white dark:bg-stone-900 dark:border-stone-700">
            {CONDITIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Serial / Reference Number</Label>
          <Input placeholder="Optional" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} className="rounded-xl" />
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <input type="checkbox" id="insured" checked={form.insured} onChange={e => set('insured', e.target.checked)} className="w-4 h-4" />
          <label htmlFor="insured" className="text-sm font-medium text-stone-700 dark:text-stone-300">Insured?</label>
          {form.insured && <Input type="number" placeholder="Insurance value ₹" value={form.insurance_value} onChange={e => set('insurance_value', e.target.value)} className="rounded-xl flex-1" />}
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Notes</Label>
          <Input placeholder="Any notes" value={form.notes} onChange={e => set('notes', e.target.value)} className="rounded-xl" />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl">Cancel</Button>
        <Button onClick={onSave} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white rounded-xl">Save Item</Button>
      </div>
    </div>
  );
}
