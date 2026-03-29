import { useState, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { useStaleData } from '@/hooks/useStaleData';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Baby, GraduationCap, School, BookOpen, Heart, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { DatePicker } from "@/components/DatePicker";

const STAGES = ['Birth & Infancy', 'Early Childhood', 'Primary School', 'Secondary School', 'Higher Education', 'Wedding', 'Other'];
const CATS   = ['Medical', 'Education', 'Extracurricular', 'Clothing', 'Travel', 'Food', 'Wedding', 'Toys & Books', 'Other'];
const STAGE_ICONS = { 'Birth & Infancy': '👶', 'Early Childhood': '🧒', 'Primary School': '📚', 'Secondary School': '🎒', 'Higher Education': '🎓', 'Wedding': '💒', 'Other': '📦' };
const STAGE_COLORS = { 'Birth & Infancy': 'from-pink-400 to-rose-500', 'Early Childhood': 'from-orange-400 to-amber-500', 'Primary School': 'from-blue-400 to-blue-600', 'Secondary School': 'from-violet-400 to-purple-600', 'Higher Education': 'from-emerald-400 to-teal-600', 'Wedding': 'from-red-400 to-pink-600', 'Other': 'from-stone-400 to-stone-600' };

const fmtINR = (n) => { const a=Math.abs(n||0); if(a>=10000000) return `₹${(a/10000000).toFixed(2)}Cr`; if(a>=100000) return `₹${(a/100000).toFixed(2)}L`; if(a>=1000) return `₹${(a/1000).toFixed(1)}K`; return `₹${Math.round(a).toLocaleString('en-IN')}`; };

const calcAge = (dob) => {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  const years = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  const months = Math.floor((diff % (365.25 * 24 * 3600 * 1000)) / (30.44 * 24 * 3600 * 1000));
  return years < 1 ? `${months}m` : `${years}y ${months}m`;
};

export default function ChildrenTracker() {
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [childForm, setChildForm] = useState({ name: '', dob: '', gender: '' });
  const [expenseDialogChild, setExpenseDialogChild] = useState(null);
  const [expForm, setExpForm] = useState({ stage: 'Birth & Infancy', category: 'Medical', description: '', amount: '', date: new Date().toISOString().slice(0,10), notes: '' });
  const [expanded, setExpanded] = useState({});
  const [delChild, setDelChild] = useState(null);
  const [delExp, setDelExp]     = useState(null);

  const fetchChildren = useCallback(async () => {
    const r = await axios.get(`${API}/children`);
    return r.data || [];
  }, []);

  const { data: children, loading, reload: fetchData } = useStaleData(
    'bm_children_cache',
    fetchChildren,
    { errorMsg: 'Failed to load children', fallback: [] }
  );

  const handleAddChild = async () => {
    if (!childForm.name) { toast.error('Name required'); return; }
    try { await axios.post(`${API}/children`, childForm); toast.success('Child added!'); setAddChildOpen(false); setChildForm({ name:'',dob:'',gender:'' }); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleAddExpense = async () => {
    if (!expForm.amount) { toast.error('Amount required'); return; }
    try { await axios.post(`${API}/children/${expenseDialogChild}/expenses`, { ...expForm, amount: parseFloat(expForm.amount) }); toast.success('Expense added!'); setExpenseDialogChild(null); setExpForm({ stage:'Birth & Infancy', category:'Medical', description:'', amount:'', date: new Date().toISOString().slice(0,10), notes:'' }); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleDelChild = async () => { try { await axios.delete(`${API}/children/${delChild}`); toast.success('Removed'); setDelChild(null); fetchData(); } catch { toast.error('Failed'); } };
  const handleDelExp   = async () => { try { await axios.delete(`${API}/children/${delExp.childId}/expenses/${delExp.id}`); toast.success('Removed'); setDelExp(null); fetchData(); } catch { toast.error('Failed'); } };

  const totalSpent = children.reduce((s, c) => s + (c.total_spent || 0), 0);

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-pink-50 via-orange-50 to-amber-50/30 dark:bg-[#0c1017]">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Hero */}
          <div className="bm-hero rounded-3xl bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 p-6 mb-6 text-white overflow-hidden" style={{ backgroundSize:'200% 200%', boxShadow:'0 12px 40px rgba(244,63,94,0.30)' }}>
            <div className="bm-orb bm-orb-1" style={{ width:200, height:200, background:'rgba(255,255,255,0.08)', top:-60, right:-50 }} />
            <div className="bm-orb bm-orb-2" style={{ width:120, height:120, background:'rgba(251,191,36,0.18)', bottom:-30, left:10 }} />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">👨‍👩‍👧‍👦</div>
                <div>
                  <p className="font-bold text-lg font-['Outfit']">Children's Cost Journey</p>
                  <p className="text-white/70 text-xs">From first breath to first steps in life</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><p className="text-white/60 text-xs mb-0.5">Total Children</p><p className="text-3xl font-black">{children.length}</p></div>
                <div><p className="text-white/60 text-xs mb-0.5">Total Spent</p><p className="text-3xl font-black">{fmtINR(totalSpent)}</p></div>
                <div><p className="text-white/60 text-xs mb-0.5">Life Stages</p><p className="text-3xl font-black">{STAGES.length - 1}</p></div>
              </div>
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 font-['Outfit']">Children Tracker</h1>
              <p className="text-stone-400 text-sm">Track every rupee spent from birth to beyond</p>
            </div>
            <Dialog open={addChildOpen} onOpenChange={setAddChildOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-pink-500 to-rose-600 text-white"><Plus size={16} className="mr-1.5" /> Add Child</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Add Child</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div><Label>Name *</Label><Input placeholder="e.g. Arya" value={childForm.name} onChange={e => setChildForm(f=>({...f,name:e.target.value}))} className="mt-1 rounded-xl" /></div>
                  <div><Label>Date of Birth</Label><DatePicker value={childForm.dob} onChange={v => setChildForm(f=>({...f,dob:v}))} className="mt-1" /></div>
                  <div><Label>Gender</Label>
                    <select value={childForm.gender} onChange={e => setChildForm(f=>({...f,gender:e.target.value}))} className="w-full h-10 mt-1 border border-stone-200 rounded-xl px-3 text-sm outline-none bg-white dark:bg-stone-900">
                      <option value="">Select</option><option>Boy</option><option>Girl</option><option>Other</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2"><Button variant="outline" onClick={()=>setAddChildOpen(false)} className="flex-1 rounded-xl">Cancel</Button><Button onClick={handleAddChild} className="flex-1 bg-pink-500 text-white rounded-xl">Add Child</Button></div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? <div className="text-center py-16 text-stone-400">Loading…</div> :
           children.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-3">👶</div>
              <p className="font-bold text-stone-700 dark:text-stone-300 text-lg">No children added yet</p>
              <p className="text-stone-400 text-sm">Track every milestone and expense</p>
              <Button onClick={()=>setAddChildOpen(true)} className="mt-4 bg-pink-500 text-white"><Plus size={14} className="mr-1.5"/>Add Child</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {children.map(child => {
                const age = calcAge(child.dob);
                const byStage = STAGES.reduce((acc, s) => { acc[s] = (child.expenses||[]).filter(e => e.stage === s); return acc; }, {});
                const isExpanded = expanded[child.id];
                return (
                  <div key={child.id} className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-pink-100 to-rose-100 rounded-2xl flex items-center justify-center text-2xl">
                            {child.gender === 'Boy' ? '👦' : child.gender === 'Girl' ? '👧' : '🧒'}
                          </div>
                          <div>
                            <p className="font-bold text-stone-800 dark:text-stone-100 text-lg">{child.name}</p>
                            <p className="text-stone-400 text-xs">{age ? `Age: ${age}` : ''} {child.dob ? `· Born ${child.dob}` : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-xs text-stone-400">Total Spent</p>
                            <p className="font-bold text-rose-600 text-lg">{fmtINR(child.total_spent)}</p>
                          </div>
                          <button onClick={()=>setDelChild(child.id)} className="p-2 text-stone-300 hover:text-red-400 transition-colors"><Trash2 size={15}/></button>
                          <button onClick={()=>setExpanded(e=>({...e,[child.id]:!e[child.id]}))} className="p-2 text-stone-400 hover:text-stone-700">
                            {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                          </button>
                        </div>
                      </div>

                      {/* Stage pills */}
                      <div className="flex gap-2 flex-wrap mt-4">
                        {STAGES.slice(0,-1).map(stage => {
                          const count = byStage[stage]?.length || 0;
                          const total = byStage[stage]?.reduce((s,e)=>s+e.amount,0) || 0;
                          return (
                            <div key={stage} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${count > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-stone-50 text-stone-400 border border-stone-200'}`}>
                              <span>{STAGE_ICONS[stage]}</span>
                              <span>{stage.split(' ')[0]}</span>
                              {count > 0 && <span className="font-bold">· {fmtINR(total)}</span>}
                            </div>
                          );
                        })}
                      </div>

                      <button onClick={()=>setExpenseDialogChild(child.id)} className="mt-4 w-full py-2 border-2 border-dashed border-stone-200 hover:border-rose-300 text-stone-400 hover:text-rose-500 rounded-xl text-sm font-medium transition-all">
                        + Add Expense
                      </button>
                    </div>

                    {/* Expanded expense list */}
                    {isExpanded && (child.expenses||[]).length > 0 && (
                      <div className="border-t border-stone-100 dark:border-stone-800 px-5 py-3 space-y-2">
                        {[...(child.expenses||[])].sort((a,b)=>b.date?.localeCompare(a.date||'')).map(exp => (
                          <div key={exp.id} className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-3">
                              <span className="text-lg">{STAGE_ICONS[exp.stage] || '📦'}</span>
                              <div>
                                <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{exp.description || exp.category}</p>
                                <p className="text-xs text-stone-400">{exp.stage} · {exp.date}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-rose-600">{fmtINR(exp.amount)}</p>
                              <button onClick={()=>setDelExp({id:exp.id, childId:child.id})} className="p-1 text-stone-300 hover:text-red-400 transition-colors"><Trash2 size={12}/></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Expense Dialog */}
      <Dialog open={!!expenseDialogChild} onOpenChange={v=>!v&&setExpenseDialogChild(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Life Stage</Label>
              <select value={expForm.stage} onChange={e=>setExpForm(f=>({...f,stage:e.target.value}))} className="w-full h-10 mt-1 border border-stone-200 rounded-xl px-3 text-sm outline-none bg-white dark:bg-stone-900">
                {STAGES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div><Label>Category</Label>
              <select value={expForm.category} onChange={e=>setExpForm(f=>({...f,category:e.target.value}))} className="w-full h-10 mt-1 border border-stone-200 rounded-xl px-3 text-sm outline-none bg-white dark:bg-stone-900">
                {CATS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div><Label>Description</Label><Input placeholder="e.g. School fees" value={expForm.description} onChange={e=>setExpForm(f=>({...f,description:e.target.value}))} className="mt-1 rounded-xl"/></div>
            <div><Label>Amount (₹) *</Label><Input type="number" placeholder="e.g. 50000" value={expForm.amount} onChange={e=>setExpForm(f=>({...f,amount:e.target.value}))} className="mt-1 rounded-xl"/></div>
            <div><Label>Date</Label><DatePicker value={expForm.date} onChange={v=>setExpForm(f=>({...f,date:v}))} className="mt-1" /></div>
            <div className="flex gap-2 pt-2"><Button variant="outline" onClick={()=>setExpenseDialogChild(null)} className="flex-1 rounded-xl">Cancel</Button><Button onClick={handleAddExpense} className="flex-1 bg-pink-500 text-white rounded-xl">Add Expense</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!delChild} onOpenChange={v=>!v&&setDelChild(null)}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Remove Child?</DialogTitle></DialogHeader>
          <p className="text-sm text-stone-500">This will delete all expenses for this child.</p>
          <div className="flex gap-2 mt-4"><Button variant="outline" onClick={()=>setDelChild(null)} className="flex-1">Cancel</Button><Button onClick={handleDelChild} className="flex-1 bg-red-500 text-white">Delete</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!delExp} onOpenChange={v=>!v&&setDelExp(null)}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Remove Expense?</DialogTitle></DialogHeader>
          <div className="flex gap-2 mt-4"><Button variant="outline" onClick={()=>setDelExp(null)} className="flex-1">Cancel</Button><Button onClick={handleDelExp} className="flex-1 bg-red-500 text-white">Delete</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
