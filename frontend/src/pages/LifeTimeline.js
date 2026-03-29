import { useState, useCallback, useRef } from "react";
import axios from "axios";
import { API } from "@/App";
import { useAuth } from "@/context/AuthContext";
import Navigation from "@/components/Navigation";
import { useStaleData } from "@/hooks/useStaleData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Edit3, RefreshCw, Sparkles, Download, Share2, Users, X, ChevronRight, Loader2 } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const EVENT_TYPES = [
  { type: "job",         label: "Job / Career",          emoji: "💼", color: "bg-blue-500",    light: "bg-blue-50 border-blue-200",    text: "text-blue-800"   },
  { type: "education",   label: "Education",              emoji: "🎓", color: "bg-violet-500",  light: "bg-violet-50 border-violet-200",text: "text-violet-800" },
  { type: "marriage",    label: "Marriage / Engagement",  emoji: "💍", color: "bg-pink-500",    light: "bg-pink-50 border-pink-200",    text: "text-pink-800"   },
  { type: "birthday",    label: "Birthday / Anniversary", emoji: "🎂", color: "bg-amber-500",   light: "bg-amber-50 border-amber-200",  text: "text-amber-800"  },
  { type: "child",       label: "Child Born",             emoji: "👶", color: "bg-emerald-500", light: "bg-emerald-50 border-emerald-200",text:"text-emerald-800"},
  { type: "home",        label: "Home / Property",        emoji: "🏠", color: "bg-orange-500",  light: "bg-orange-50 border-orange-200",text: "text-orange-800" },
  { type: "car",         label: "Vehicle",                emoji: "🚗", color: "bg-slate-500",   light: "bg-slate-50 border-slate-200",  text: "text-slate-800"  },
  { type: "achievement", label: "Achievement",            emoji: "🏆", color: "bg-yellow-500",  light: "bg-yellow-50 border-yellow-200",text: "text-yellow-800" },
  { type: "travel",      label: "Travel / Trip",          emoji: "✈️", color: "bg-sky-500",     light: "bg-sky-50 border-sky-200",      text: "text-sky-800"    },
  { type: "health",      label: "Health / Fitness",       emoji: "💪", color: "bg-red-500",     light: "bg-red-50 border-red-200",      text: "text-red-800"    },
  { type: "finance",     label: "Financial Milestone",    emoji: "💰", color: "bg-teal-500",    light: "bg-teal-50 border-teal-200",    text: "text-teal-800"   },
  { type: "other",       label: "Other",                  emoji: "⭐", color: "bg-stone-500",   light: "bg-stone-50 border-stone-200",  text: "text-stone-800"  },
];

const typeInfo = (t) => EVENT_TYPES.find(e => e.type === t) || EVENT_TYPES[EVENT_TYPES.length - 1];

const formatDate = (d) => {
  if (!d) return "";
  if (d.length === 7) {
    const [yr, mo] = d.split("-");
    return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(mo)-1]} ${yr}`;
  }
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const EMPTY_FORM = { type: "job", title: "", date: "", description: "", emoji: "", contacts: "" };

export default function LifeTimeline() {
  const { user } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detailEvent, setDetailEvent] = useState(null); // for the click-through popup
  const [viewMode, setViewMode] = useState('all');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [pdfLoading, setPdfLoading] = useState(false);
  const timelineRef = useRef(null);
  const toggleExpand = (id) => setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const fetchTimeline = useCallback(async () => {
    const res = await axios.get(`${API}/timeline`);
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const { data: events, loading, reload: fetchData } = useStaleData(
    'bm_timeline_cache',
    fetchTimeline,
    { errorMsg: 'Could not load timeline', fallback: [] }
  );

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setShowDialog(true); };
  const openEdit = (ev) => {
    setDetailEvent(null);
    setForm({
      type: ev.type, title: ev.title, date: ev.date,
      description: ev.description || "", emoji: ev.emoji || "",
      contacts: Array.isArray(ev.contacts) ? ev.contacts.join(", ") : (ev.contacts || ""),
    });
    setEditId(ev.id);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.date) { toast.error("Title and date are required"); return; }
    setSaving(true);
    try {
      const contactsArr = form.contacts
        ? form.contacts.split(",").map(s => s.trim()).filter(Boolean)
        : [];
      const payload = {
        ...form,
        emoji: form.emoji || typeInfo(form.type).emoji,
        contacts: contactsArr,
      };
      delete payload.contacts; // rebuild cleanly
      payload.contacts = contactsArr;

      if (editId) {
        await axios.put(`${API}/timeline/${editId}`, payload);
        toast.success("Updated!");
      } else {
        await axios.post(`${API}/timeline`, payload);
        toast.success("Milestone added! 🎉");
      }
      setShowDialog(false);
      await fetchData();
    } catch (e) { toast.error(e.response?.data?.detail?.message || e.response?.data?.detail || "Could not save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/timeline/${id || deleteId}`);
      setDeleteId(null);
      setDetailEvent(null);
      await fetchData();
      toast.success("Removed");
    } catch { toast.error("Could not delete"); }
  };

  const handleExport = async () => {
    if (!timelineRef.current) return;
    setPdfLoading(true);
    toast.info("Generating PDF…");
    try {
      const canvas = await html2canvas(timelineRef.current, {
        scale: 2, useCORS: true, backgroundColor: "#fffaf5",
        ignoreElements: (el) => el.tagName === 'BUTTON',
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const imgW = pageW;
      const imgH = imgW / ratio;
      let y = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, -y, imgW, imgH);
        // Add PIN footer on every page
        if (user?.pdf_password) {
          pdf.setFontSize(8);
          pdf.setTextColor(180, 180, 180);
          pdf.text(`Budget Mantra · PDF PIN: ${user.pdf_password} · ${new Date().toLocaleDateString('en-IN')}`, pageW / 2, pageH - 10, { align: 'center' });
        }
        remaining -= pageH;
        if (remaining > 0) { pdf.addPage(); y += pageH; }
      }
      pdf.save("my-life-timeline.pdf");
      toast.success("PDF downloaded!");
    } catch (e) {
      toast.error("Could not generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleCopyShare = async () => {
    if (!timelineRef.current) return;
    setPdfLoading(true);
    toast.info("Generating snapshot…");
    try {
      const canvas = await html2canvas(timelineRef.current, {
        scale: 2, useCORS: true, backgroundColor: "#fffaf5",
        ignoreElements: (el) => el.tagName === 'BUTTON',
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const imgW = pageW;
      const imgH = imgW / ratio;
      let y = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, -y, imgW, imgH);
        if (user?.pdf_password) {
          pdf.setFontSize(8);
          pdf.setTextColor(180, 180, 180);
          pdf.text(`Budget Mantra · PDF PIN: ${user.pdf_password} · ${new Date().toLocaleDateString('en-IN')}`, pageW / 2, pageH - 10, { align: 'center' });
        }
        remaining -= pageH;
        if (remaining > 0) { pdf.addPage(); y += pageH; }
      }
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      // Open in new tab so user can share from their device
      window.open(url, "_blank");
      toast.success("PDF opened — share from your device!");
    } catch (e) {
      toast.error("Could not generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  // Group by year
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const years = {};
  sorted.forEach(ev => {
    const yr = ev.date.slice(0, 4);
    if (!years[yr]) years[yr] = [];
    years[yr].push(ev);
  });
  const yearKeys = Object.keys(years).sort();

  if (loading) return (
    <div className="min-h-screen bg-[#fffaf5]">
      <Navigation />
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-violet-500" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-[#fffaf5] to-pink-50">
      <Navigation />
      <div className="max-w-2xl mx-auto px-4 py-6 lg:py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 font-['Outfit'] flex items-center gap-2">
              <span>🌟</span> Life Timeline
            </h1>
            <p className="text-stone-500 text-sm mt-0.5">Your personal milestones — tap any to explore</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopyShare} size="sm" disabled={pdfLoading || events.length === 0}
              className="rounded-xl text-stone-500 border-stone-200 text-xs px-3">
              {pdfLoading ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Share2 size={13} className="mr-1" />} Share PDF
            </Button>
            <Button variant="outline" onClick={handleExport} size="sm" disabled={pdfLoading || events.length === 0}
              className="rounded-xl text-stone-500 border-stone-200 text-xs px-3">
              {pdfLoading ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Download size={13} className="mr-1" />} Export PDF
            </Button>
            <Button onClick={openAdd}
              className="bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl shadow-md shadow-violet-500/25 text-sm">
              <Plus size={15} className="mr-1" /> Add
            </Button>
          </div>
        </div>

        {/* Empty state */}
        {events.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 p-12 text-center shadow-sm">
            <div className="text-5xl mb-4">🌱</div>
            <h3 className="text-lg font-semibold text-stone-800 mb-2">Start your life story</h3>
            <p className="text-stone-500 text-sm mb-6 max-w-xs mx-auto">
              Capture your milestones — first job, graduation, marriage, home, kids, travels — all in one beautiful timeline.
            </p>
            <Button onClick={openAdd}
              className="bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl">
              <Plus size={15} className="mr-1.5" /> Add your first milestone
            </Button>
          </div>
        )}

        {/* View mode toggle */}
        {events.length > 0 && (
          <div className="flex gap-2 mb-5 bg-stone-100 rounded-2xl p-1">
            {[['all','🌟 All Events'],['career','💼 Career']].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${viewMode === mode ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Timeline content — captured for PDF */}
        <div ref={timelineRef}>

        {/* Career view */}
        {viewMode === 'career' && (
          <div className="space-y-3">
            {sorted.filter(ev => ['job','education'].includes(ev.type)).length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-stone-100">
                <div className="text-4xl mb-3">💼</div>
                <p className="text-stone-500 text-sm">No career events yet. Add a job or education milestone.</p>
              </div>
            ) : sorted.filter(ev => ['job','education'].includes(ev.type)).map((ev) => {
              const info = typeInfo(ev.type);
              const isLong = (ev.description || '').length > 100;
              const expanded = expandedIds.has(ev.id);
              return (
                <div key={ev.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex gap-3 hover:shadow-md transition-shadow">
                  <div className={`w-12 h-12 ${info.color} rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm`}>
                    {ev.emoji || info.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-stone-900 text-sm leading-snug">{ev.title}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{formatDate(ev.date)}</p>
                        {ev.description && (
                          <p className={`text-xs text-stone-500 mt-1.5 leading-relaxed ${!expanded && isLong ? 'line-clamp-2' : ''}`}>{ev.description}</p>
                        )}
                        {isLong && (
                          <button onClick={() => toggleExpand(ev.id)} className="text-xs text-blue-600 font-semibold mt-0.5">{expanded ? 'See less' : 'See more'}</button>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.light} border ${info.text}`}>{info.label}</span>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(ev)} className="p-1.5 text-stone-400 hover:text-blue-500 transition-colors"><Edit3 size={12} /></button>
                          <button onClick={() => setDeleteId(ev.id)} className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Timeline */}
        {viewMode === 'all' && yearKeys.length > 0 && (
          <div className="relative">
            <div className="absolute left-[26px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-200 via-pink-200 to-amber-200" />

            <div className="space-y-0">
              {yearKeys.map((yr) => (
                <div key={yr}>
                  {/* Year badge */}
                  <div className="flex items-center gap-3 mb-4 mt-6 first:mt-0">
                    <div className="w-[53px] flex justify-center shrink-0">
                      <div className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm z-10 relative">
                        {yr}
                      </div>
                    </div>
                    <div className="h-px flex-1 bg-stone-100" />
                  </div>

                  <div className="space-y-3">
                    {years[yr].map((ev) => {
                      const info = typeInfo(ev.type);
                      return (
                        <div key={ev.id} className="flex gap-3">
                          {/* Dot */}
                          <div className="shrink-0 flex flex-col items-center" style={{ width: 53 }}>
                            <div className={`w-9 h-9 ${info.color} rounded-full flex items-center justify-center text-lg shadow-sm z-10 relative cursor-pointer hover:scale-110 transition-transform`}
                              onClick={() => setDetailEvent(ev)}>
                              {ev.emoji || info.emoji}
                            </div>
                          </div>

                          {/* Card — clickable */}
                          <button
                            onClick={() => setDetailEvent(ev)}
                            className={`flex-1 border rounded-2xl p-4 mb-1 ${info.light} shadow-sm text-left hover:shadow-md transition-all hover:scale-[1.01] group`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <p className="font-semibold text-stone-900 text-sm">{ev.title}</p>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.light} border ${info.text}`}>
                                    {info.label}
                                  </span>
                                </div>
                                <p className="text-xs text-stone-500">{formatDate(ev.date)}</p>
                                {ev.description && (
                                  <p className="text-xs text-stone-500 mt-1 line-clamp-1">{ev.description}</p>
                                )}
                                {ev.contacts?.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1.5">
                                    <Users size={10} className="text-stone-400" />
                                    <span className="text-[10px] text-stone-400">{ev.contacts.length} contact{ev.contacts.length > 1 ? "s" : ""}</span>
                                  </div>
                                )}
                              </div>
                              <ChevronRight size={14} className="text-stone-300 group-hover:text-stone-500 mt-0.5 shrink-0 transition-colors" />
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Present marker */}
            <div className="flex items-center gap-3 mt-6">
              <div className="w-[53px] flex justify-center shrink-0">
                <div className="w-4 h-4 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full shadow-md animate-pulse z-10 relative" />
              </div>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                Today — your story continues ✨
              </span>
            </div>
          </div>
        )}
        </div>{/* end timelineRef */}
      </div>

      {/* ── Detail Popup ──────────────────────────────────────────────── */}
      <Dialog open={!!detailEvent} onOpenChange={() => setDetailEvent(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          {detailEvent && (() => {
            const info = typeInfo(detailEvent.type);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="sr-only">{detailEvent.title}</DialogTitle>
                  <DialogDescription className="sr-only">Milestone detail</DialogDescription>
                </DialogHeader>
                {/* Hero */}
                <div className={`-mx-6 -mt-6 px-6 pt-8 pb-5 ${info.color} rounded-t-2xl`}>
                  <div className="text-4xl mb-3">{detailEvent.emoji || info.emoji}</div>
                  <h2 className="text-xl font-bold text-white font-['Outfit'] leading-tight">{detailEvent.title}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-white/70 text-sm">{formatDate(detailEvent.date)}</span>
                    <span className="text-white/40">·</span>
                    <span className="text-white/70 text-sm">{info.label}</span>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  {/* Description */}
                  {detailEvent.description ? (
                    <div>
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">About this milestone</p>
                      <p className="text-sm text-stone-700 leading-relaxed">{detailEvent.description}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-stone-400 italic">No description yet — tap Edit to add one.</p>
                  )}

                  {/* Contacts / Who can help */}
                  <div>
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
                      <Users size={11} className="inline mr-1" />People who can help
                    </p>
                    {detailEvent.contacts?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {detailEvent.contacts.map((c, i) => (
                          <span key={i} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${info.light} ${info.text}`}>{c}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400">No contacts added — add people who've done this before!</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button onClick={() => openEdit(detailEvent)} variant="outline" className="flex-1 rounded-xl text-sm">
                      <Edit3 size={13} className="mr-1.5" /> Edit
                    </Button>
                    <Button onClick={() => setDeleteId(detailEvent.id)} variant="outline"
                      className="rounded-xl text-red-500 border-red-200 hover:bg-red-50 text-sm px-4">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-['Outfit'] flex items-center gap-2">
              <Sparkles size={18} className="text-violet-500" />
              {editId ? "Edit Milestone" : "Add Milestone"}
            </DialogTitle>
            <DialogDescription className="sr-only">Add or edit a life milestone</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Type selector */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-2 block">Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {EVENT_TYPES.map(et => (
                  <button key={et.type} onClick={() => setForm(f => ({ ...f, type: et.type }))}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all
                      ${form.type === et.type
                        ? `${et.color} text-white border-transparent shadow-sm`
                        : "border-stone-200 text-stone-600 hover:border-stone-300 bg-stone-50"
                      }`}>
                    <span className="text-lg">{et.emoji}</span>
                    <span className="leading-tight text-center">{et.label.split(" / ")[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">Title *</Label>
              <Input placeholder="e.g. Joined Infosys as Software Engineer"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="h-10 rounded-xl border-stone-200 focus:border-violet-400 text-sm" />
            </div>

            {/* Date */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">Date *</Label>
              <DatePicker value={form.date}
                onChange={v => setForm(f => ({ ...f, date: v }))}
                className="h-10 rounded-xl" />
            </div>

            {/* Description */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">Notes / Details <span className="text-stone-400">(optional)</span></Label>
              <textarea
                placeholder="Describe this milestone — what happened, how you felt, key details..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
            </div>

            {/* Contacts */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">
                <Users size={11} className="inline mr-1" />People who can help / have been there <span className="text-stone-400">(optional)</span>
              </Label>
              <Input placeholder="e.g. Rahul (did same course), Priya (HDFC agent)"
                value={form.contacts} onChange={e => setForm(f => ({ ...f, contacts: e.target.value }))}
                className="h-10 rounded-xl border-stone-200 focus:border-violet-400 text-sm" />
              <p className="text-[11px] text-stone-400 mt-1">Separate names by comma. Shown in the detail view so you know who to reach out to.</p>
            </div>

            {/* Custom emoji */}
            <div>
              <Label className="text-stone-600 text-xs font-medium mb-1 block">Custom Emoji <span className="text-stone-400">(optional)</span></Label>
              <Input placeholder="🏡 or leave blank for default"
                value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                className="h-10 rounded-xl border-stone-200 text-sm" />
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleSave} disabled={saving}
                className="flex-1 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-semibold">
                {saving ? <RefreshCw size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
                {editId ? "Update" : "Save Milestone"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Remove milestone?</DialogTitle>
            <DialogDescription className="sr-only">Confirm removing milestone</DialogDescription>
          </DialogHeader>
          <p className="text-stone-500 text-sm">This milestone will be permanently removed from your timeline.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={() => handleDelete()} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
