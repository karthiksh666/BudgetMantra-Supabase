import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { useStaleData } from "@/hooks/useStaleData";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2,
  IndianRupee, Plane, Target, CreditCard, RefreshCw, X,
  Heart, Gift, Users, Edit3
} from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const EVENT_COLORS = {
  emi:     { bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500" },
  trip:    { bg: "bg-orange-100",  text: "text-orange-700",  border: "border-orange-200",  dot: "bg-orange-500" },
  goal:    { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  custom:  { bg: "bg-purple-100",  text: "text-purple-700",  border: "border-purple-200",  dot: "bg-purple-500" },
  paycheck:{ bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500" },
  people:  { bg: "bg-rose-100",    text: "text-rose-700",    border: "border-rose-200",    dot: "bg-rose-500" },
};

const TYPE_ICON = { emi: CreditCard, trip: Plane, goal: Target, custom: CalendarDays, paycheck: IndianRupee, people: Heart };

const fmtINR = (n) => n ? `₹${Math.round(n).toLocaleString("en-IN")}` : "";

const EVENT_TYPE_LABELS = {
  birthday: "Birthday", anniversary: "Anniversary", farewell: "Farewell",
  festival: "Festival", other: "Other",
};
const EMPTY_PEOPLE = { person_name: "", event_type: "birthday", month: 1, day: 1, notes: "", gift_budget: "", emoji: "" };
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function FinancialCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const [form, setForm] = useState({ title: "", date: "", type: "custom", amount: "", notes: "" });

  const navigate = useNavigate();
  const location = useLocation();
  const defaultTab = useMemo(() => new URLSearchParams(location.search).get("tab") || "events", []);
  const [sideTab, setSideTab] = useState(defaultTab);   // "events" | "people"
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [editPeople, setEditPeople] = useState(null);
  const [peopleForm, setPeopleForm] = useState(EMPTY_PEOPLE);
  const [savingPeople, setSavingPeople] = useState(false);
  const [deletePeopleId, setDeletePeopleId] = useState(null);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const fetchEventsFn = useCallback(async () => {
    const { data } = await axios.get(`${API}/calendar?month=${monthStr}`);
    return data || [];
  }, [monthStr]);

  const { data: eventsData, loading, reload: reloadEvents } = useStaleData(
    `bm_calendar_${monthStr}`,
    fetchEventsFn,
    { errorMsg: "Could not load calendar", fallback: [] },
  );
  const events = eventsData || [];
  const fetchEvents = reloadEvents;

  const fetchPeopleFn = useCallback(async () => {
    const { data } = await axios.get(`${API}/people-events`);
    return data || [];
  }, []);

  const { data: peopleEventsData, reload: reloadPeople } = useStaleData(
    "bm_people_events_cache",
    fetchPeopleFn,
    { fallback: [] },
  );
  const peopleEvents    = peopleEventsData || [];
  const fetchPeopleEvents = reloadPeople;

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const handleAddEvent = async () => {
    if (!form.title || !form.date) { toast.error("Title and date are required"); return; }
    try {
      const { data } = await axios.post(`${API}/calendar`, {
        title: form.title, date: form.date, type: form.type,
        amount: form.amount ? parseFloat(form.amount) : null,
        notes: form.notes || null,
      });
      fetchEvents();
      setShowAdd(false);
      setForm({ title: "", date: "", type: "custom", amount: "", notes: "" });
      toast.success("Event added!");
    } catch (e) { toast.error(e.response?.data?.detail || "Could not add event"); }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/calendar/${deleteId}`);
      fetchEvents();
      setDeleteId(null);
      toast.success("Event removed");
    } catch { toast.error("Could not delete event"); }
  };

  const handleSavePeople = async () => {
    if (!peopleForm.person_name || !peopleForm.month || !peopleForm.day) {
      toast.error("Name, month and day are required"); return;
    }
    setSavingPeople(true);
    try {
      const payload = {
        person_name: peopleForm.person_name,
        event_type: peopleForm.event_type,
        month: parseInt(peopleForm.month),
        day: parseInt(peopleForm.day),
        notes: peopleForm.notes,
        gift_budget: parseFloat(peopleForm.gift_budget) || 0,
        emoji: peopleForm.emoji,
      };
      if (editPeople) {
        await axios.put(`${API}/people-events/${editPeople.id}`, payload);
        toast.success("Updated!");
      } else {
        await axios.post(`${API}/people-events`, payload);
        toast.success("Event added!");
      }
      setShowAddPeople(false);
      setEditPeople(null);
      setPeopleForm(EMPTY_PEOPLE);
      fetchPeopleEvents();
      fetchEvents();
    } catch (e) { toast.error(e.response?.data?.detail || "Could not save"); }
    finally { setSavingPeople(false); }
  };

  const handleDeletePeople = async () => {
    try {
      await axios.delete(`${API}/people-events/${deletePeopleId}`);
      fetchPeopleEvents();
      setDeletePeopleId(null);
      fetchEvents();
      toast.success("Removed");
    } catch { toast.error("Could not delete"); }
  };

  const openEditPeople = (pe) => {
    setEditPeople(pe);
    setPeopleForm({
      person_name: pe.person_name,
      event_type: pe.event_type,
      month: pe.month,
      day: pe.day,
      notes: pe.notes || "",
      gift_budget: pe.gift_budget || "",
      emoji: pe.emoji || "",
    });
    setShowAddPeople(true);
  };

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsOnDay = (d) => {
    if (!d) return [];
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return events.filter(e => e.date?.startsWith(dateStr));
  };

  const selectedEvents = selectedDay ? eventsOnDay(selectedDay) : [];
  const isToday = (d) => d === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      <Navigation />
      <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 font-['Outfit'] flex items-center gap-2">
              <CalendarDays size={22} className="text-orange-500" /> Financial Calendar
            </h1>
            <p className="text-stone-500 text-sm mt-0.5">EMIs, trips, goals, and custom events in one view</p>
          </div>
          <Button onClick={() => { setForm(f => ({ ...f, date: `${monthStr}-${String(today.getDate()).padStart(2, "0")}` })); setShowAdd(true); }}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl shadow-md shadow-orange-500/25 flex items-center gap-2">
            <Plus size={16} /> Add Event
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2 hover:bg-stone-100 rounded-xl transition-colors">
                <ChevronLeft size={18} className="text-stone-600" />
              </button>
              <h2 className="text-lg font-bold text-stone-800 font-['Outfit']">
                {MONTHS[month - 1]} {year}
              </h2>
              <button onClick={nextMonth} className="p-2 hover:bg-stone-100 rounded-xl transition-colors">
                <ChevronRight size={18} className="text-stone-600" />
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-stone-400 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            {loading ? (
              <div className="flex justify-center py-12">
                <RefreshCw size={22} className="animate-spin text-orange-500" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, idx) => {
                  const dayEvents = d ? eventsOnDay(d) : [];
                  const isSelected = d === selectedDay;
                  return (
                    <div key={idx}
                      onClick={() => d && setSelectedDay(d === selectedDay ? null : d)}
                      className={`relative min-h-[64px] p-1.5 rounded-xl cursor-pointer transition-all ${
                        !d ? "" :
                        isSelected ? "bg-orange-50 border border-orange-300" :
                        "hover:bg-stone-50 border border-transparent"
                      }`}>
                      {d && (
                        <>
                          <span className={`text-sm font-semibold block text-center w-6 h-6 rounded-full flex items-center justify-center mx-auto ${
                            isToday(d) ? "bg-orange-500 text-white" :
                            isSelected ? "text-orange-700" : "text-stone-700"
                          }`}>{d}</span>
                          <div className="mt-0.5 space-y-0.5">
                            {dayEvents.slice(0, 2).map((ev, i) => {
                              const color = EVENT_COLORS[ev.type] || EVENT_COLORS.custom;
                              return (
                                <div key={i} className={`text-[9px] font-medium px-1 py-0.5 rounded ${color.bg} ${color.text} truncate`}>
                                  {ev.title}
                                </div>
                              );
                            })}
                            {dayEvents.length > 2 && (
                              <div className="text-[9px] text-stone-400 px-1">+{dayEvents.length - 2} more</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-stone-100">
              {Object.entries(EVENT_COLORS).map(([type, c]) => (
                <div key={type} className="flex items-center gap-1.5 text-xs text-stone-600">
                  <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                  {type === "people" ? "Birthdays/Anniv" : type.charAt(0).toUpperCase() + type.slice(1)}
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-3">
            {/* Tab switcher */}
            <div className="flex gap-1 bg-stone-100 p-1 rounded-xl">
              {[["events","Events"],["people","People 🎂"]].map(([val,label]) => (
                <button key={val} onClick={() => setSideTab(val)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${sideTab === val ? "bg-white text-orange-600 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                  {label}
                </button>
              ))}
            </div>

            {sideTab === "events" && selectedDay ? (
              <>
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                  <p className="font-semibold text-stone-800 mb-3">
                    {MONTHS[month - 1]} {selectedDay}, {year}
                  </p>
                  {selectedEvents.length === 0 ? (
                    <p className="text-stone-400 text-sm">No events this day.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedEvents.map(ev => {
                        const color = EVENT_COLORS[ev.type] || EVENT_COLORS.custom;
                        const Icon = TYPE_ICON[ev.type] || CalendarDays;
                        return (
                          <div key={ev.id} className={`p-3 rounded-xl border ${color.bg} ${color.border}`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <Icon size={13} className={color.text} />
                                <p className={`font-semibold text-sm ${color.text}`}>{ev.title}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                              {ev.type === "people" && (
                                <button
                                  onClick={() => navigate(`/gifts?person=${encodeURIComponent(ev.person_name)}&occasion=${encodeURIComponent(ev.event_type)}&budget=${ev.amount || 1000}`)}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500 text-white text-[10px] font-bold hover:bg-rose-600 transition-colors">
                                  <Gift size={10} /> Gift
                                </button>
                              )}
                              {(ev.type === "custom" || ev.type === "people") && (
                                <button onClick={() => ev.type === "people" ? setDeletePeopleId(ev.people_event_id) : setDeleteId(ev.id)}
                                  className="text-stone-300 hover:text-red-500 transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                            </div>
                            {ev.amount && <p className={`text-xs font-bold mt-1 ${color.text}`}>{fmtINR(ev.amount)}</p>}
                            {ev.notes && <p className={`text-xs mt-1 opacity-80 ${color.text}`}>{ev.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : sideTab === "events" ? (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 text-center">
                <CalendarDays size={28} className="text-stone-300 mx-auto mb-2" />
                <p className="text-stone-400 text-sm">Tap a date to see events</p>
              </div>
            ) : null}

            {/* Month summary */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
              <p className="font-semibold text-stone-800 text-sm mb-3">This Month</p>
              <div className="space-y-2">
                {["emi", "trip", "goal", "paycheck", "custom"].map(type => {
                  const count = events.filter(e => e.type === type).length;
                  if (count === 0) return null;
                  const color = EVENT_COLORS[type];
                  const Icon = TYPE_ICON[type];
                  const total = events.filter(e => e.type === type && e.amount).reduce((s, e) => s + e.amount, 0);
                  return (
                    <div key={type} className={`flex items-center justify-between p-2.5 rounded-xl ${color.bg} border ${color.border}`}>
                      <div className="flex items-center gap-2">
                        <Icon size={13} className={color.text} />
                        <span className={`text-xs font-semibold capitalize ${color.text}`}>
                          {type === "emi" ? "EMIs" : type.charAt(0).toUpperCase() + type.slice(1) + "s"}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-bold ${color.text}`}>{count} event{count > 1 ? "s" : ""}</p>
                        {total > 0 && <p className={`text-[10px] ${color.text} opacity-80`}>{fmtINR(total)}</p>}
                      </div>
                    </div>
                  );
                })}
                {events.length === 0 && !loading && (
                  <p className="text-stone-400 text-xs text-center py-2">No events this month</p>
                )}
              </div>
            </div>

            {/* ── People Events tab ── */}
            {sideTab === "people" && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart size={14} className="text-rose-500" />
                    <span className="font-semibold text-stone-800 text-sm">People Events</span>
                    <span className="text-[10px] text-stone-400 bg-stone-100 rounded-full px-2 py-0.5">{peopleEvents.length}</span>
                  </div>
                  <button onClick={() => { setPeopleForm(EMPTY_PEOPLE); setEditPeople(null); setShowAddPeople(true); }}
                    className="w-7 h-7 rounded-lg bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 transition-colors">
                    <Plus size={13} />
                  </button>
                </div>
                {peopleEvents.length === 0 ? (
                  <div className="p-6 text-center">
                    <Users size={24} className="text-stone-200 mx-auto mb-2" />
                    <p className="text-stone-400 text-sm">No people events yet</p>
                    <p className="text-stone-400 text-xs mt-0.5">Add birthdays, anniversaries and more</p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-50 max-h-64 overflow-y-auto">
                    {[...peopleEvents].sort((a, b) => a.month - b.month || a.day - b.day).map(pe => {
                      const emoji = pe.emoji || (pe.event_type === "birthday" ? "🎂" : "❤️");
                      const today2 = new Date();
                      const nextOccurrence = new Date(today2.getFullYear(), pe.month - 1, pe.day);
                      if (nextOccurrence < today2) nextOccurrence.setFullYear(today2.getFullYear() + 1);
                      const daysUntil = Math.ceil((nextOccurrence - today2) / 86400000);
                      return (
                        <div key={pe.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-lg shrink-0">{emoji}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-stone-800 text-sm truncate">{pe.person_name}</p>
                            <p className="text-xs text-stone-400">{EVENT_TYPE_LABELS[pe.event_type] || pe.event_type} · {MONTH_NAMES[pe.month - 1]} {pe.day}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-xs font-bold ${daysUntil <= 7 ? "text-rose-600" : daysUntil <= 30 ? "text-amber-600" : "text-stone-400"}`}>
                              {daysUntil === 0 ? "Today! 🎉" : `${daysUntil}d`}
                            </p>
                            {pe.gift_budget > 0 && <p className="text-[10px] text-stone-400">₹{pe.gift_budget.toLocaleString("en-IN")}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => navigate(`/gifts?person=${encodeURIComponent(pe.person_name)}&occasion=${encodeURIComponent(pe.event_type)}&budget=${pe.gift_budget || 1000}`)}
                              className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Get gift ideas">
                              <Gift size={12} />
                            </button>
                            <button onClick={() => openEditPeople(pe)}
                              className="p-1.5 text-stone-300 hover:text-stone-600 hover:bg-stone-50 rounded-lg transition-colors">
                              <Edit3 size={12} />
                            </button>
                            <button onClick={() => setDeletePeopleId(pe.id)}
                              className="p-1.5 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-['Outfit'] flex items-center gap-2">
              <CalendarDays size={18} className="text-orange-500" /> Add Event
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block">Title *</Label>
              <Input placeholder="e.g. Flight to Goa booked" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-stone-700 font-medium mb-1.5 block">Date *</Label>
                <DatePicker value={form.date}
                  onChange={v => setForm(f => ({ ...f, date: v }))}
                  className="h-11 rounded-xl" />
              </div>
              <div>
                <Label className="text-stone-700 font-medium mb-1.5 block">Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-11 rounded-xl border-stone-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="trip">Trip</SelectItem>
                    <SelectItem value="goal">Goal</SelectItem>
                    <SelectItem value="paycheck">Paycheck</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block">Amount (₹, optional)</Label>
              <Input type="number" placeholder="e.g. 15000" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
            </div>
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block">Notes (optional)</Label>
              <Input placeholder="Any additional notes..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowAdd(false)} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleAddEvent} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl">Add Event</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit People Event Dialog */}
      <Dialog open={showAddPeople} onOpenChange={v => { setShowAddPeople(v); if (!v) { setEditPeople(null); setPeopleForm(EMPTY_PEOPLE); } }}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-['Outfit'] flex items-center gap-2">
              <Heart size={18} className="text-rose-500" /> {editPeople ? "Edit" : "Add"} People Event
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block">Person Name *</Label>
              <Input placeholder="e.g. Mom, Rahul, Priya" value={peopleForm.person_name}
                onChange={e => setPeopleForm(f => ({ ...f, person_name: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-rose-400" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-stone-700 font-medium mb-1.5 block">Event Type *</Label>
                <Select value={peopleForm.event_type} onValueChange={v => setPeopleForm(f => ({ ...f, event_type: v }))}>
                  <SelectTrigger className="h-11 rounded-xl border-stone-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="birthday">🎂 Birthday</SelectItem>
                    <SelectItem value="anniversary">❤️ Anniversary</SelectItem>
                    <SelectItem value="farewell">👋 Farewell</SelectItem>
                    <SelectItem value="festival">🎉 Festival</SelectItem>
                    <SelectItem value="other">📅 Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-stone-700 font-medium mb-1.5 block">Emoji (optional)</Label>
                <Input placeholder="🎂" value={peopleForm.emoji}
                  onChange={e => setPeopleForm(f => ({ ...f, emoji: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 text-lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-stone-700 font-medium mb-1.5 block">Month *</Label>
                <Select value={String(peopleForm.month)} onValueChange={v => setPeopleForm(f => ({ ...f, month: parseInt(v) }))}>
                  <SelectTrigger className="h-11 rounded-xl border-stone-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-stone-700 font-medium mb-1.5 block">Day *</Label>
                <Input type="number" min="1" max="31" placeholder="e.g. 15" value={peopleForm.day}
                  onChange={e => setPeopleForm(f => ({ ...f, day: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 focus:border-rose-400" />
              </div>
            </div>
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block">Gift Budget (₹, optional)</Label>
              <Input type="number" placeholder="e.g. 2000" value={peopleForm.gift_budget}
                onChange={e => setPeopleForm(f => ({ ...f, gift_budget: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-rose-400" />
            </div>
            <div>
              <Label className="text-stone-700 font-medium mb-1.5 block">Notes (optional)</Label>
              <Input placeholder="e.g. Loves gadgets, prefers experiences" value={peopleForm.notes}
                onChange={e => setPeopleForm(f => ({ ...f, notes: e.target.value }))}
                className="h-11 rounded-xl border-stone-200 focus:border-rose-400" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowAddPeople(false); setEditPeople(null); setPeopleForm(EMPTY_PEOPLE); }} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleSavePeople} disabled={savingPeople}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white rounded-xl">
                {savingPeople ? <RefreshCw size={14} className="animate-spin mr-1.5" /> : <Heart size={14} className="mr-1.5" />}
                {editPeople ? "Save Changes" : "Add Event"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete people event confirm */}
      <Dialog open={!!deletePeopleId} onOpenChange={() => setDeletePeopleId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Remove this event?</DialogTitle></DialogHeader>
          <p className="text-stone-500 text-sm">This people event will be permanently removed.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeletePeopleId(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleDeletePeople} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Remove Event?</DialogTitle></DialogHeader>
          <p className="text-stone-500 text-sm">This custom event will be permanently removed.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleDelete} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
