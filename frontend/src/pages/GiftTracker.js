import { useState, useEffect, useCallback } from "react";
import { useStaleData } from "@/hooks/useStaleData";
import { useLocation } from "react-router-dom";
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Plus, Gift, Trash2, ArrowUpRight, ArrowDownLeft, Sparkles, Loader2,
  ShoppingBag, PartyPopper, User, Heart, Edit3, ChevronDown, ChevronUp
} from 'lucide-react';
import { DatePicker } from "@/components/DatePicker";
import ResetDataButton from '@/components/ResetDataButton';

const OCCASIONS = ['Birthday', 'Wedding', 'Diwali', 'Holi', 'Eid', 'Christmas', 'Anniversary', 'Baby Shower', 'Graduation', 'Raksha Bandhan', 'Navratri', 'Pongal', 'Onam', 'New Year', 'Other'];
const RELATIONSHIPS = ['Partner', 'Parent', 'Sibling', 'Child', 'Best Friend', 'Friend', 'Colleague', 'Relative', 'Boss', 'Neighbour', 'Other'];
const TAG_COLORS = ['bg-blue-100 text-blue-700', 'bg-rose-100 text-rose-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-violet-100 text-violet-700'];

const fmtINR = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 10000000) return `\u20b9${(a / 10000000).toFixed(2)}Cr`;
  if (a >= 100000)   return `\u20b9${(a / 100000).toFixed(2)}L`;
  if (a >= 1000)     return `\u20b9${(a / 1000).toFixed(1)}K`;
  return `\u20b9${Math.round(a).toLocaleString('en-IN')}`;
};

const EMPTY_GIFT = { person_name: '', person_id: '', occasion: 'Birthday', direction: 'given', amount: '', item_description: '', date: new Date().toISOString().slice(0, 10), return_expected: false, notes: '', event_id: '', event_name: '' };
const EMPTY_PERSON = { name: '', relationship: 'Friend', birthday: '', anniversary: '', age: '', interests: '', dislikes: '', notes: '' };
const EMPTY_RECO = { occasion: 'Birthday', relationship: 'Friend', budget: '1000', return_expected: false, received_gift: '', person_id: '' };

export default function GiftTracker() {
  const [tab, setTab]               = useState('gifts');   // 'gifts' | 'people'
  const [giftFilter, setGiftFilter] = useState('all');     // 'all' | 'given' | 'received'
  const [addGiftOpen, setAddGiftOpen]   = useState(false);
  const [personOpen, setPersonOpen]     = useState(false);
  const [editPerson, setEditPerson]     = useState(null);  // null = add mode
  const [personForm, setPersonForm]     = useState(EMPTY_PERSON);
  const [giftForm, setGiftForm]         = useState(EMPTY_GIFT);
  const [saving, setSaving]             = useState(false);
  const [aiOpen, setAiOpen]             = useState(false);
  const [recoForm, setRecoForm]         = useState(EMPTY_RECO);
  const [recoLoading, setRecoLoading]   = useState(false);
  const [suggestions, setSuggestions]   = useState(null);
  const [expandedPerson, setExpandedPerson] = useState(null);
  const location = useLocation();

  const fetchGifts = useCallback(async () => {
    const r = await axios.get(`${API}/gifts`);
    return Array.isArray(r.data) ? r.data : [];
  }, []);

  const fetchPeople = useCallback(async () => {
    const r = await axios.get(`${API}/gift-people`);
    return Array.isArray(r.data) ? r.data : [];
  }, []);

  const fetchEvents = useCallback(async () => {
    const r = await axios.get(`${API}/events`);
    return r.data || [];
  }, []);

  const { data: gifts, loading: giftsLoading, reload: reloadGifts } = useStaleData(
    "bm_gifts_cache",
    fetchGifts,
    { errorMsg: "Failed to load gifts", fallback: [] }
  );

  const { data: people, loading: peopleLoading, reload: reloadPeople } = useStaleData(
    "bm_gift_people_cache",
    fetchPeople,
    { errorMsg: "Failed to load people", fallback: [] }
  );

  const { data: events } = useStaleData(
    "bm_gift_events_cache",
    fetchEvents,
    { errorMsg: "", fallback: [] }
  );

  const loading = giftsLoading || peopleLoading;

  // Pre-open AI dialog if navigated from calendar
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const occasion = params.get("occasion");
    const budget   = params.get("budget");
    if (occasion) {
      setRecoForm(prev => ({ ...prev, ...(occasion ? { occasion: occasion.charAt(0).toUpperCase() + occasion.slice(1) } : {}), ...(budget ? { budget } : {}) }));
      setSuggestions(null);
      setAiOpen(true);
    }
  }, [location.search]);

  const handleAddGift = async () => {
    if (!giftForm.person_name || !giftForm.amount) { toast.error('Name & amount required'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/gifts`, { ...giftForm, amount: parseFloat(giftForm.amount) });
      toast.success('Gift recorded! 🎁');
      setAddGiftOpen(false);
      setGiftForm(EMPTY_GIFT);
      reloadGifts();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteGift = async (id) => {
    try { await axios.delete(`${API}/gifts/${id}`); toast.success('Deleted'); reloadGifts(); }
    catch { toast.error('Failed to delete'); }
  };

  const handleSavePerson = async () => {
    if (!personForm.name) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      if (editPerson) {
        await axios.put(`${API}/gift-people/${editPerson.id}`, personForm);
        toast.success('Profile updated!');
      } else {
        await axios.post(`${API}/gift-people`, personForm);
        toast.success(`${personForm.name} added to your people!`);
      }
      setPersonOpen(false);
      setPersonForm(EMPTY_PERSON);
      setEditPerson(null);
      reloadPeople();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeletePerson = async (id) => {
    try { await axios.delete(`${API}/gift-people/${id}`); toast.success('Removed'); reloadPeople(); }
    catch { toast.error('Failed'); }
  };

  const openEditPerson = (p) => {
    setEditPerson(p);
    setPersonForm({ name: p.name, relationship: p.relationship, birthday: p.birthday || '', anniversary: p.anniversary || '', age: p.age ? String(p.age) : '', interests: p.interests || '', dislikes: p.dislikes || '', notes: p.notes || '' });
    setPersonOpen(true);
  };

  const openAiForPerson = (p) => {
    setSuggestions(null);
    setRecoForm({ occasion: 'Birthday', relationship: p.relationship, budget: '1500', return_expected: false, received_gift: '', person_id: p.id });
    setAiOpen(true);
  };

  const openAiFromGift = (g) => {
    const person = people.find(p => p.name.toLowerCase() === g.person_name?.toLowerCase());
    setSuggestions(null);
    setRecoForm({ occasion: g.occasion || 'Birthday', relationship: person?.relationship || 'Friend', budget: String(Math.round(g.amount * 0.9) || 1000), return_expected: true, received_gift: g.item_description || g.occasion, person_id: person?.id || '' });
    setAiOpen(true);
  };

  const handleGetSuggestions = async () => {
    if (!recoForm.budget) { toast.error('Enter a budget'); return; }
    setRecoLoading(true);
    setSuggestions(null);
    try {
      const r = await axios.post(`${API}/gifts/recommend`, {
        occasion: recoForm.occasion,
        relationship: recoForm.relationship,
        budget: parseFloat(recoForm.budget),
        return_expected: recoForm.return_expected,
        received_gift: recoForm.received_gift,
        person_id: recoForm.person_id,
      });
      setSuggestions(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'AI recommendation failed'); }
    finally { setRecoLoading(false); }
  };

  // Gifts grouped by person
  const filteredGifts = giftFilter === 'all' ? gifts : gifts.filter(g => g.direction === giftFilter);
  const byPerson = filteredGifts.reduce((acc, g) => {
    const key = g.person_name;
    if (!acc[key]) acc[key] = { given: 0, received: 0, items: [] };
    acc[key].items.push(g);
    if (g.direction === 'given') acc[key].given += g.amount;
    else acc[key].received += g.amount;
    return acc;
  }, {});

  const totalGiven    = gifts.filter(g => g.direction === 'given').reduce((s, g) => s + g.amount, 0);
  const totalReceived = gifts.filter(g => g.direction === 'received').reduce((s, g) => s + g.amount, 0);
  const netBalance    = totalGiven - totalReceived;

  // Upcoming occasions from people profiles (within 30 days)
  const today = new Date();
  const upcoming = people.flatMap(p => {
    const events = [];
    const thisYear = today.getFullYear();
    for (const [field, label] of [['birthday', 'Birthday'], ['anniversary', 'Anniversary']]) {
      const raw = p[field];
      if (!raw) continue;
      // Support MM-DD or full date
      const parts = raw.includes('-') ? raw.split('-') : [];
      if (parts.length < 2) continue;
      const month = parseInt(parts[parts.length === 2 ? 0 : 1]) - 1;
      const day   = parseInt(parts[parts.length === 2 ? 1 : 2]);
      if (isNaN(month) || isNaN(day)) continue;
      let d = new Date(thisYear, month, day);
      if (d < today) d = new Date(thisYear + 1, month, day);
      const diff = Math.ceil((d - today) / 86400000);
      if (diff <= 45) events.push({ person: p, label, date: d, daysLeft: diff });
    }
    return events;
  }).sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <Navigation />
      <div className="lg:pl-64 pb-24">
        <div className="max-w-2xl mx-auto px-4 pt-6">

          {/* Hero */}
          <div className="bm-hero rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500 p-5 mb-6 text-white overflow-hidden relative">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <PartyPopper size={20} className="opacity-90" />
                <span className="text-sm font-semibold opacity-90 font-['Outfit']">Celebrations & Gifting</span>
              </div>
              <p className="text-2xl font-bold font-['Outfit'] mb-3">Every occasion, remembered</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-75 mb-0.5">Given</p>
                  <p className="font-bold text-sm">{fmtINR(totalGiven)}</p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-75 mb-0.5">Received</p>
                  <p className="font-bold text-sm">{fmtINR(totalReceived)}</p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-75 mb-0.5">Net</p>
                  <p className="font-bold text-sm">{netBalance >= 0 ? '+' : ''}{fmtINR(Math.abs(netBalance))}</p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-75 mb-0.5">People</p>
                  <p className="font-bold text-sm">{people.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming occasions */}
          {upcoming.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-2">🎉 Coming up</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {upcoming.map((ev, i) => (
                  <button key={i} onClick={() => openAiForPerson(ev.person)}
                    className="flex-shrink-0 bg-white border border-fuchsia-200 rounded-2xl px-3 py-2.5 text-left shadow-sm hover:shadow-md hover:border-fuchsia-400 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-500 flex items-center justify-center text-white font-bold text-xs">
                        {ev.person.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-stone-800">{ev.person.name}</p>
                        <p className="text-[10px] text-fuchsia-500 font-medium">{ev.label}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-stone-400">{ev.daysLeft === 0 ? 'Today! 🎉' : ev.daysLeft === 1 ? 'Tomorrow' : `in ${ev.daysLeft} days`}</p>
                    <p className="text-[10px] text-fuchsia-500 font-semibold mt-1 flex items-center gap-1"><Sparkles size={9} /> Get gift ideas</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center justify-between flex-wrap gap-y-2 mb-4">
            <div className="flex gap-1 bg-white dark:bg-stone-900 rounded-xl p-1 shadow-sm border border-stone-100 dark:border-stone-800">
              {[['gifts', 'Gifts', <Gift size={13} />], ['people', 'People', <User size={13} />]].map(([id, label, icon]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === id ? 'bg-rose-500 text-white shadow' : 'text-stone-500 dark:text-stone-400'}`}>
                  {icon} {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <ResetDataButton feature="gifts" label="gift records" onReset={reloadGifts} />
              </span>
              <Button size="sm" variant="outline" onClick={() => { setSuggestions(null); setRecoForm(EMPTY_RECO); setAiOpen(true); }}
                className="hidden sm:inline-flex rounded-xl gap-1.5 border-fuchsia-200 text-fuchsia-600 hover:bg-fuchsia-50">
                <Sparkles size={14} /> Gift Ideas
              </Button>
              {tab === 'gifts' ? (
                <Dialog open={addGiftOpen} onOpenChange={setAddGiftOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl gap-1.5">
                      <Plus size={14} /> Add Gift
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Record a Gift</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Person</Label>
                        {people.length > 0 ? (
                          <select value={giftForm.person_id}
                            onChange={e => {
                              const p = people.find(x => x.id === e.target.value);
                              setGiftForm(f => ({ ...f, person_id: e.target.value, person_name: p ? p.name : f.person_name }));
                            }}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1">
                            <option value="">— type name below —</option>
                            {people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.relationship})</option>)}
                          </select>
                        ) : null}
                        {!giftForm.person_id && (
                          <Input className="mt-1" value={giftForm.person_name} onChange={e => setGiftForm(f => ({ ...f, person_name: e.target.value }))} placeholder="Name" />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Direction</Label>
                          <select value={giftForm.direction} onChange={e => setGiftForm(f => ({ ...f, direction: e.target.value }))}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                            <option value="given">Given by me</option>
                            <option value="received">Received</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Amount</Label>
                          <Input type="number" value={giftForm.amount} onChange={e => setGiftForm(f => ({ ...f, amount: e.target.value }))} placeholder="5000" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Occasion</Label>
                          <select value={giftForm.occasion} onChange={e => setGiftForm(f => ({ ...f, occasion: e.target.value }))}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                            {OCCASIONS.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Date</Label>
                          <DatePicker value={giftForm.date} onChange={v => setGiftForm(f => ({ ...f, date: v }))} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Item / Description</Label>
                        <Input value={giftForm.item_description} onChange={e => setGiftForm(f => ({ ...f, item_description: e.target.value }))} placeholder="e.g. Silk saree" />
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="ret" checked={giftForm.return_expected} onChange={e => setGiftForm(f => ({ ...f, return_expected: e.target.checked }))} className="w-4 h-4 rounded" />
                        <Label htmlFor="ret" className="text-xs cursor-pointer">Return gift expected</Label>
                      </div>
                      <div>
                        <Label className="text-xs">Link to Event <span className="text-stone-400">(optional)</span></Label>
                        <select
                          value={giftForm.event_id || ""}
                          onChange={e => {
                            const ev = events.find(ev => ev.id === e.target.value);
                            setGiftForm(f => ({ ...f, event_id: e.target.value, event_name: ev?.title || "" }));
                          }}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
                        >
                          <option value="">— no event —</option>
                          {events.map(ev => (
                            <option key={ev.id} value={ev.id}>{ev.title} ({ev.event_type}, {ev.date?.slice(0,7)})</option>
                          ))}
                        </select>
                      </div>
                      <Button className="w-full bg-rose-500 hover:bg-rose-600" onClick={handleAddGift} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Gift'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl gap-1.5" onClick={() => { setEditPerson(null); setPersonForm(EMPTY_PERSON); setPersonOpen(true); }}>
                  <Plus size={14} /> Add Person
                </Button>
              )}
            </div>
          </div>

          {/* ── GIFTS TAB ── */}
          {tab === 'gifts' && (
            <>
              {/* Gift filter sub-tabs */}
              <div className="flex gap-1 mb-3">
                {['all', 'given', 'received'].map(t => (
                  <button key={t} onClick={() => setGiftFilter(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${giftFilter === t ? 'bg-rose-100 text-rose-600' : 'text-stone-400 hover:text-stone-600'}`}>
                    {t === 'given' ? 'Given' : t === 'received' ? 'Received' : 'All'}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="text-center py-16 text-stone-400">Loading…</div>
              ) : Object.keys(byPerson).length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-5xl mb-3">🎁</div>
                  <p className="text-stone-500 font-medium">No gifts recorded yet</p>
                  <p className="text-stone-400 text-sm mt-1">Track gifts given & received across all occasions</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(byPerson).map(([person, data]) => {
                    const net = data.given - data.received;
                    const profile = people.find(p => p.name.toLowerCase() === person.toLowerCase());
                    return (
                      <div key={person} className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 flex items-center justify-between border-b border-stone-100 dark:border-stone-800">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
                              {person[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-stone-800 dark:text-stone-100 text-sm">{person}</p>
                              <p className="text-[11px] text-stone-400">{data.items.length} gift{data.items.length !== 1 ? 's' : ''}{profile ? ` · ${profile.relationship}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className={`text-xs font-semibold ${net > 0 ? 'text-rose-500' : net < 0 ? 'text-emerald-500' : 'text-stone-400'}`}>
                              {net > 0 ? `Gave ${fmtINR(net)} more` : net < 0 ? `Received ${fmtINR(Math.abs(net))} more` : 'Balanced'}
                            </p>
                            {profile && (
                              <button onClick={() => openAiForPerson(profile)}
                                className="flex items-center gap-1 text-[10px] font-semibold bg-fuchsia-100 text-fuchsia-600 hover:bg-fuchsia-200 px-2 py-1 rounded-lg transition-colors">
                                <Sparkles size={9} /> Ideas
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="divide-y divide-stone-50 dark:divide-stone-800">
                          {data.items.map(g => (
                            <div key={g.id || g._id} className="px-4 py-2.5 flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${g.direction === 'given' ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                                {g.direction === 'given'
                                  ? <ArrowUpRight size={14} className="text-rose-500" />
                                  : <ArrowDownLeft size={14} className="text-emerald-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate">
                                  {g.item_description || g.gift_description || g.occasion}
                                  {g.return_expected && (
                                    <span className="ml-1.5 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 px-1.5 py-0.5 rounded-full">return expected</span>
                                  )}
                                </p>
                                <p className="text-[11px] text-stone-400">
                                  {g.occasion} · {new Date(g.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                                {g.event_name && (
                                  <span className="text-[10px] text-fuchsia-500 font-medium">🎊 {g.event_name}</span>
                                )}
                              </div>
                              <p className={`text-sm font-semibold shrink-0 ${g.direction === 'given' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {g.direction === 'given' ? '-' : '+'}{fmtINR(g.amount)}
                              </p>
                              {g.direction === 'received' && g.return_expected && (
                                <button onClick={() => openAiFromGift(g)}
                                  className="shrink-0 flex items-center gap-1 text-[10px] font-semibold bg-fuchsia-100 text-fuchsia-600 hover:bg-fuchsia-200 px-2 py-1 rounded-lg transition-colors">
                                  <Sparkles size={10} /> Gift back?
                                </button>
                              )}
                              <button onClick={() => handleDeleteGift(g.id || g._id)} className="shrink-0 text-stone-300 hover:text-rose-400 transition-colors ml-1">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── PEOPLE TAB ── */}
          {tab === 'people' && (
            <div className="space-y-3">
              {people.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-5xl mb-3">👥</div>
                  <p className="text-stone-500 font-medium">No people saved yet</p>
                  <p className="text-stone-400 text-sm mt-1 mb-4">Add people you gift often — the AI will use their interests & history to suggest the perfect gift</p>
                  <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl gap-1.5" onClick={() => { setEditPerson(null); setPersonForm(EMPTY_PERSON); setPersonOpen(true); }}>
                    <Plus size={14} /> Add your first person
                  </Button>
                </div>
              ) : people.map(p => {
                const personGifts = gifts.filter(g => g.person_name?.toLowerCase() === p.name.toLowerCase());
                const totalGiven  = personGifts.filter(g => g.direction === 'given').reduce((s, g) => s + g.amount, 0);
                const isExpanded  = expandedPerson === p.id;
                return (
                  <div key={p.id} className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-500 flex items-center justify-center text-white font-bold shrink-0">
                          {p.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-stone-800 dark:text-stone-100">{p.name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-stone-400">{p.relationship}</span>
                            {personGifts.length > 0 && <span className="text-[11px] text-stone-400">· {personGifts.length} gifts · {fmtINR(totalGiven)} given</span>}
                            {p.birthday && <span className="text-[10px] bg-pink-50 text-pink-500 px-1.5 py-0.5 rounded-full">🎂 {p.birthday}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => openAiForPerson(p)}
                          className="flex items-center gap-1 text-[11px] font-semibold bg-fuchsia-100 text-fuchsia-600 hover:bg-fuchsia-200 px-2.5 py-1.5 rounded-xl transition-colors">
                          <Sparkles size={12} /> Gift
                        </button>
                        <button onClick={() => openEditPerson(p)} className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-400 transition-colors">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => handleDeletePerson(p.id)} className="p-1.5 rounded-xl hover:bg-rose-50 text-stone-300 hover:text-rose-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                        <button onClick={() => setExpandedPerson(isExpanded ? null : p.id)} className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-400 transition-colors">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-stone-50 space-y-1.5">
                        {p.interests && <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Interests:</span> {p.interests}</p>}
                        {p.dislikes  && <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Avoid:</span> {p.dislikes}</p>}
                        {p.anniversary && <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Anniversary:</span> {p.anniversary}</p>}
                        {p.age  && <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Age:</span> {p.age}</p>}
                        {p.notes && <p className="text-xs text-stone-600"><span className="font-semibold text-stone-500">Notes:</span> {p.notes}</p>}
                        {!p.interests && !p.dislikes && !p.notes && <p className="text-xs text-stone-400 italic">No details saved. Edit to add interests so the AI can suggest better gifts.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Add/Edit Person Dialog ── */}
      <Dialog open={personOpen} onOpenChange={v => { setPersonOpen(v); if (!v) { setEditPerson(null); setPersonForm(EMPTY_PERSON); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart size={16} className="text-rose-500" />
              {editPerson ? 'Edit Person' : 'Add Person'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input value={personForm.name} onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))} placeholder="Priya Sharma" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Relationship</Label>
                <select value={personForm.relationship} onChange={e => setPersonForm(f => ({ ...f, relationship: e.target.value }))}
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Birthday (MM-DD)</Label>
                <Input value={personForm.birthday} onChange={e => setPersonForm(f => ({ ...f, birthday: e.target.value }))} placeholder="03-15" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Age</Label>
                <Input type="number" value={personForm.age} onChange={e => setPersonForm(f => ({ ...f, age: e.target.value }))} placeholder="28" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Anniversary (MM-DD)</Label>
              <Input value={personForm.anniversary} onChange={e => setPersonForm(f => ({ ...f, anniversary: e.target.value }))} placeholder="06-20" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Interests & Likes <span className="text-stone-400 font-normal">(the AI uses this!)</span></Label>
              <Input value={personForm.interests} onChange={e => setPersonForm(f => ({ ...f, interests: e.target.value }))}
                placeholder="e.g. loves cooking, into fitness, reads sci-fi, coffee addict" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Dislikes / Avoid</Label>
              <Input value={personForm.dislikes} onChange={e => setPersonForm(f => ({ ...f, dislikes: e.target.value }))}
                placeholder="e.g. no alcohol, doesn't wear jewellery" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={personForm.notes} onChange={e => setPersonForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="any other context for better gift ideas" className="mt-1" />
            </div>
            <Button className="w-full bg-rose-500 hover:bg-rose-600 text-white" onClick={handleSavePerson} disabled={saving}>
              {saving ? 'Saving…' : editPerson ? 'Update' : 'Save Person'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AI Gift Advisor Dialog ── */}
      <Dialog open={aiOpen} onOpenChange={v => { setAiOpen(v); if (!v) setSuggestions(null); }}>
        <DialogContent className="max-w-lg w-full rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-fuchsia-500 to-rose-500 flex items-center justify-center">
                <Sparkles size={14} className="text-white" />
              </div>
              AI Gift Advisor
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-1">
            {/* Person selector */}
            <div>
              <Label className="text-xs font-semibold text-stone-600">Who are you gifting?</Label>
              <select value={recoForm.person_id} onChange={e => {
                const p = people.find(x => x.id === e.target.value);
                setRecoForm(f => ({ ...f, person_id: e.target.value, relationship: p ? p.relationship : f.relationship }));
              }} className="w-full mt-1 h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-sm">
                <option value="">— select a person (or leave blank) —</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name} — {p.relationship}{p.interests ? ` (${p.interests.slice(0,30)}…)` : ''}</option>)}
              </select>
              {recoForm.person_id && (() => {
                const p = people.find(x => x.id === recoForm.person_id);
                if (!p) return null;
                return (
                  <div className="mt-1.5 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3 py-2 text-xs text-fuchsia-800">
                    <span className="font-semibold">🧠 AI knows:</span> {p.interests ? `likes ${p.interests}` : 'no interests saved'}{p.dislikes ? `, avoids ${p.dislikes}` : ''}{p.age ? `, age ${p.age}` : ''}
                  </div>
                );
              })()}
            </div>

            {recoForm.received_gift && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs text-emerald-800">
                <span className="font-semibold">↩ Gifting back for:</span> {recoForm.received_gift}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-stone-600">Occasion</Label>
                <select value={recoForm.occasion} onChange={e => setRecoForm(f => ({ ...f, occasion: e.target.value }))}
                  className="w-full mt-1 h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-sm">
                  {OCCASIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-stone-600">Relationship</Label>
                <select value={recoForm.relationship} onChange={e => setRecoForm(f => ({ ...f, relationship: e.target.value }))}
                  className="w-full mt-1 h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-sm">
                  {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-stone-600">Your Budget (₹)</Label>
              <Input type="number" value={recoForm.budget} onChange={e => setRecoForm(f => ({ ...f, budget: e.target.value }))}
                placeholder="e.g. 2000" className="mt-1 h-9 rounded-lg" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="reco-return" checked={recoForm.return_expected}
                onChange={e => setRecoForm(f => ({ ...f, return_expected: e.target.checked }))} className="w-4 h-4 rounded" />
              <Label htmlFor="reco-return" className="text-xs cursor-pointer">This is a return gift</Label>
            </div>
            <Button onClick={handleGetSuggestions} disabled={recoLoading}
              className="w-full bg-gradient-to-r from-fuchsia-500 to-rose-500 hover:from-fuchsia-600 hover:to-rose-600 text-white rounded-xl h-10">
              {recoLoading ? <><Loader2 size={14} className="animate-spin mr-2" /> Getting personalised ideas…</> : <><Sparkles size={14} className="mr-2" /> Get Gift Ideas</>}
            </Button>
          </div>

          {suggestions && (
            <div className="mt-4 space-y-3">
              {suggestions.tip && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800 flex gap-2">
                  <span className="text-base shrink-0">💡</span>
                  <span>{suggestions.tip}</span>
                </div>
              )}
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">5 Personalised Ideas</p>
              <div className="space-y-2.5">
                {(suggestions.suggestions || []).map((s, i) => (
                  <div key={i} className="bg-white border border-stone-100 rounded-2xl p-3.5 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-bold text-stone-800 text-sm">{s.name}</p>
                      <span className="text-xs font-bold text-fuchsia-600 bg-fuchsia-50 px-2 py-0.5 rounded-full shrink-0">{s.price_range}</span>
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed mb-1">{s.description}</p>
                    {s.personalised_note && (
                      <p className="text-xs text-fuchsia-700 bg-fuchsia-50 rounded-lg px-2 py-1 mb-2 italic">✨ {s.personalised_note}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {(s.tags || []).map((tag, ti) => (
                          <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TAG_COLORS[ti % TAG_COLORS.length]}`}>{tag}</span>
                        ))}
                      </div>
                      {s.where_to_buy && (
                        <span className="text-[10px] text-stone-400 flex items-center gap-1 shrink-0 ml-2">
                          <ShoppingBag size={9} /> {s.where_to_buy}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
