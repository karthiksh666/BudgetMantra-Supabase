import { useState } from "react";
import axios from "axios";
import { API } from "@/App";
import Navigation from "@/components/Navigation";
import { toast } from "sonner";
import UPIParser from "@/pages/UPIParser";
import {
  Download, Upload, Sparkles, ScanSearch, FileSpreadsheet,
  Trash2, AlertTriangle, CheckCircle, Database, RefreshCw, X, FileText, Zap,
} from "lucide-react";

const DataManagement = () => {
  const [activeTab,    setActiveTab]    = useState("statements"); // statements | vault
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [seedingDemo, setSeedingDemo]   = useState(false);

  const [showDupModal, setShowDupModal]   = useState(false);
  const [dupGroups, setDupGroups]         = useState([]);
  const [dupLoading, setDupLoading]       = useState(false);
  const [toDelete, setToDelete]           = useState({});
  const [deletingDups, setDeletingDups]   = useState(false);

  // Smart Parser state
  const [spLoading,   setSpLoading]   = useState(false);
  const [spResults,   setSpResults]   = useState(null); // null = not scanned yet
  const [spConfirmed, setSpConfirmed] = useState(new Set());
  const [spDismissed, setSpDismissed] = useState(new Set());

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      const res = await axios.get(`${API}/import/sample`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = "budget_mantra_template.xlsx"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded!");
    } catch { toast.error("Could not download template"); }
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await axios.post(`${API}/import/excel`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      const imp = res.data.imported;
      const parts = [
        imp.transactions  && `${imp.transactions} transactions`,
        imp.emis          && `${imp.emis} EMIs`,
        imp.categories    && `${imp.categories} categories`,
        imp.savings_goals && `${imp.savings_goals} goals`,
        imp.investments   && `${imp.investments} investments`,
        imp.gold          && `${imp.gold} gold entries`,
        imp.hand_loans    && `${imp.hand_loans} loans`,
        imp.gifts         && `${imp.gifts} gifts`,
      ].filter(Boolean);
      toast.success(`Imported: ${parts.join(", ") || "nothing new"}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed — make sure it is a valid .xlsx file");
    } finally { setImporting(false); e.target.value = ""; }
  };

  const handleExportData = async () => {
    try {
      toast.info("Preparing your export…");
      const res = await axios.get(`${API}/export/excel`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `budgetmantra_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Export downloaded!");
    } catch { toast.error("Could not export data"); }
  };

  const handleExportCSV = async () => {
    try {
      toast.info("Preparing CSV…");
      const [txnRes, catRes] = await Promise.all([
        axios.get(`${API}/transactions`),
        axios.get(`${API}/categories`),
      ]);
      const cats = Object.fromEntries((catRes.data || []).map(c => [c.id, c.name]));
      const rows = [["Date", "Description", "Amount", "Type", "Category"]];
      (txnRes.data || []).forEach(t => {
        rows.push([t.date, `"${(t.description || "").replace(/"/g, '""')}"`, t.amount, t.type, cats[t.category_id] || ""]);
      });
      const csv = rows.map(r => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `budgetmantra_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`${txnRes.data.length} transactions exported as CSV`);
    } catch { toast.error("Could not export CSV"); }
  };

  const handleSeedDemo = async () => {
    setSeedingDemo(true);
    try {
      const res = await axios.post(`${API}/seed-sample-data?force=true`);
      toast.success(res.data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not load sample data");
    } finally { setSeedingDemo(false); }
  };

  const handleFindDuplicates = async () => {
    setDupLoading(true); setShowDupModal(true);
    try {
      const { data } = await axios.get(`${API}/transactions`);
      const groups = {};
      data.forEach(t => {
        const key = `${t.description?.toLowerCase().trim()}|${t.amount}|${t.date}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });
      const dupList = Object.entries(groups)
        .filter(([, items]) => items.length > 1)
        .map(([key, items]) => ({ key, items }));
      setDupGroups(dupList);
      const marks = {};
      dupList.forEach(({ items }) => { items.slice(1).forEach(t => { marks[t.id] = true; }); });
      setToDelete(marks);
    } catch { toast.error("Could not fetch transactions"); setShowDupModal(false); }
    finally { setDupLoading(false); }
  };

  // ── Smart Parser handlers ──────────────────────────────────────────────────
  const handleDetectSubscriptions = async () => {
    setSpLoading(true);
    try {
      const { data } = await axios.get(`${API}/smart-parser/subscriptions`);
      setSpResults(data.detected || []);
      setSpConfirmed(new Set());
      setSpDismissed(new Set());
      if ((data.detected || []).length === 0) {
        toast.info("No new recurring patterns found in your last 90 days of expenses.");
      }
    } catch {
      toast.error("Could not scan expenses");
    } finally {
      setSpLoading(false);
    }
  };

  const handleMakeRecurring = async (item, idx) => {
    try {
      await axios.post(`${API}/recurring-expenses`, {
        name: item.suggested_name,
        amount: item.amount,
        category_id: item.category_id || "",
        category_name: item.category_name || "General",
        description: item.description,
        frequency: item.frequency || "monthly",
        day_of_month: item.day_of_month || 1,
        start_date: item.last_date || new Date().toISOString().slice(0, 10),
        emoji: item.emoji || "🔄",
      });
      setSpConfirmed(prev => new Set([...prev, idx]));
      toast.success(`${item.suggested_name} added as a recurring expense!`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not create recurring expense");
    }
  };

  const handleDeleteDups = async () => {
    const ids = Object.entries(toDelete).filter(([, v]) => v).map(([id]) => id);
    if (!ids.length) { toast.info("Nothing selected to delete"); return; }
    setDeletingDups(true);
    try {
      await Promise.all(ids.map(id => axios.delete(`${API}/transactions/${id}`)));
      toast.success(`Removed ${ids.length} duplicate${ids.length > 1 ? "s" : ""}`);
      setShowDupModal(false); setDupGroups([]); setToDelete({});
    } catch { toast.error("Could not delete some duplicates"); }
    finally { setDeletingDups(false); }
  };

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-[#fffaf5]">

        {/* Hero */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-white/20 rounded-2xl">
                {activeTab === "statements" ? <FileText size={24} /> : <Database size={24} />}
              </div>
              <div>
                <h1 className="text-3xl font-bold font-['Outfit']">Finance Hub</h1>
                <p className="text-emerald-100 text-sm mt-0.5">Import, export, backup and manage your financial data</p>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex gap-2">
              {[
                { id: "statements", label: "Statement Hub",  icon: <FileText size={14} /> },
                { id: "vault",      label: "Finance Vault",  icon: <Database size={14} /> },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? "bg-white text-emerald-700"
                      : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === "statements" ? (
          <div className="max-w-4xl mx-auto">
            <UPIParser embedded />
          </div>
        ) : (
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* ── Main grid ── */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">

            {/* Import */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-50 rounded-xl"><Upload size={20} className="text-orange-500" /></div>
                <div>
                  <h2 className="font-bold text-stone-800 font-['Outfit']">Import Data</h2>
                  <p className="text-xs text-stone-400">Bulk-upload via Excel template (.xlsx)</p>
                </div>
              </div>
              {importResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700 font-medium">
                  ✓ {importResult.imported?.transactions || 0} transactions · {importResult.imported?.emis || 0} EMIs · {importResult.imported?.categories || 0} categories imported
                </div>
              )}
              <p className="text-sm text-stone-500 leading-relaxed flex-1">
                Download the template, fill it with your data, and upload it here. Supports transactions, EMIs, goals, investments, gold, hand loans and more — all at once.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={handleDownloadTemplate}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm border border-stone-200 hover:bg-stone-50 text-stone-700 transition-colors">
                  <FileSpreadsheet size={15} /> Get Template
                </button>
                <label className="flex-1">
                  <input type="file" accept=".xlsx" onChange={handleImportExcel} className="hidden" />
                  <div className={`flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm transition-colors cursor-pointer ${importing ? 'bg-stone-200 text-stone-400' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
                    {importing ? <><RefreshCw size={15} className="animate-spin" /> Importing…</> : <><Upload size={15} /> Upload</>}
                  </div>
                </label>
              </div>
            </div>

            {/* Export */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 rounded-xl"><Download size={20} className="text-emerald-600" /></div>
                <div>
                  <h2 className="font-bold text-stone-800 font-['Outfit']">Export Data</h2>
                  <p className="text-xs text-stone-400">Download all your data as Excel</p>
                </div>
              </div>
              <p className="text-sm text-stone-500 leading-relaxed flex-1">
                Export everything — transactions, budgets, EMIs, goals, investments, gold — into a single Excel workbook. Great for backups or switching devices.
              </p>
              <div className="flex gap-2">
                <button onClick={handleExportData}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">
                  <Download size={15} /> Excel
                </button>
                <button onClick={handleExportCSV}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm bg-teal-500 hover:bg-teal-600 text-white transition-colors">
                  <FileText size={15} /> CSV
                </button>
              </div>
            </div>

            {/* Demo Data */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-violet-50 rounded-xl"><Sparkles size={20} className="text-violet-500" /></div>
                <div>
                  <h2 className="font-bold text-stone-800 font-['Outfit']">Demo Data</h2>
                  <p className="text-xs text-stone-400">Explore with sample data</p>
                </div>
              </div>
              <p className="text-sm text-stone-500 leading-relaxed flex-1">
                Load realistic sample data across all features — budgets, EMIs, transactions, goals, investments and more. Great for exploring before adding your own data.
              </p>
              <button onClick={handleSeedDemo} disabled={seedingDemo}
                className="flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm bg-violet-500 hover:bg-violet-600 disabled:bg-stone-200 disabled:text-stone-400 text-white transition-colors">
                {seedingDemo ? <><RefreshCw size={15} className="animate-spin" /> Loading…</> : <><Sparkles size={15} /> Load Demo Data</>}
              </button>
            </div>

            {/* Duplicate Finder */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-50 rounded-xl"><ScanSearch size={20} className="text-red-500" /></div>
                <div>
                  <h2 className="font-bold text-stone-800 font-['Outfit']">Find Duplicates</h2>
                  <p className="text-xs text-stone-400">Clean up double entries</p>
                </div>
              </div>
              <p className="text-sm text-stone-500 leading-relaxed flex-1">
                Scans for transactions with the same description, amount, and date. Review each group and selectively delete the extras while keeping the originals.
              </p>
              <button onClick={handleFindDuplicates}
                className="flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm bg-red-500 hover:bg-red-600 text-white transition-colors">
                <ScanSearch size={15} /> Scan for Duplicates
              </button>
            </div>

            {/* Smart Subscription Detector */}
            <div className="md:col-span-2 lg:col-span-3 bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-50 rounded-xl"><Zap size={20} className="text-orange-500" /></div>
                  <div>
                    <h2 className="font-bold text-stone-800 font-['Outfit']">Smart Subscription Detector</h2>
                    <p className="text-xs text-stone-400">Scans your last 90 days of expenses — detects subscriptions & recurring payments by keywords and patterns</p>
                  </div>
                </div>
                <button
                  onClick={handleDetectSubscriptions}
                  disabled={spLoading}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl font-semibold text-sm bg-orange-500 hover:bg-orange-600 disabled:bg-stone-200 disabled:text-stone-400 text-white transition-colors shrink-0"
                >
                  {spLoading ? <><RefreshCw size={14} className="animate-spin" /> Scanning…</> : <><Zap size={14} /> Scan Expenses</>}
                </button>
              </div>

              {spResults === null && !spLoading && (
                <div className="flex flex-col items-center justify-center py-8 text-center bg-orange-50/50 rounded-xl border border-dashed border-orange-200">
                  <span className="text-3xl mb-2">🔍</span>
                  <p className="text-sm font-medium text-stone-600">Hit "Scan Expenses" to detect potential subscriptions</p>
                  <p className="text-xs text-stone-400 mt-1">We look for Netflix, Spotify, gym, insurance, SIPs, and any payment that repeats monthly</p>
                </div>
              )}

              {spResults !== null && spResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-3xl mb-2">✅</span>
                  <p className="text-sm font-medium text-stone-700">No new recurring patterns found</p>
                  <p className="text-xs text-stone-400 mt-1">All detected subscriptions are already set up as recurring expenses</p>
                </div>
              )}

              {spResults !== null && spResults.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {spResults.map((item, idx) => {
                    const confirmed = spConfirmed.has(idx);
                    const dismissed = spDismissed.has(idx);
                    if (dismissed) return null;
                    return (
                      <div key={idx} className={`rounded-xl border p-4 transition-all ${confirmed ? "border-emerald-200 bg-emerald-50" : "border-stone-100 bg-stone-50"}`}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl leading-none">{item.emoji}</span>
                            <div>
                              <p className="font-semibold text-stone-800 text-sm leading-tight">{item.suggested_name}</p>
                              <p className="text-xs text-stone-400 truncate max-w-[140px]">{item.description}</p>
                            </div>
                          </div>
                          {confirmed ? (
                            <span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Added</span>
                          ) : (
                            <button onClick={() => setSpDismissed(prev => new Set([...prev, idx]))} className="shrink-0 text-stone-300 hover:text-stone-500">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-base font-bold text-stone-800">₹{Math.round(item.amount).toLocaleString("en-IN")}</p>
                            <p className="text-[11px] text-stone-400 capitalize">{item.frequency} · Day {item.day_of_month}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-stone-500">Last paid</p>
                            <p className="text-xs font-semibold text-stone-700">{item.last_date || "—"}</p>
                            <p className="text-[10px] text-stone-400">{item.occurrences}× detected</p>
                          </div>
                        </div>
                        {!confirmed && (
                          <button
                            onClick={() => handleMakeRecurring(item, idx)}
                            className="w-full h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors"
                          >
                            + Make Recurring
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tips card */}
            <div className="bg-gradient-to-br from-stone-50 to-white rounded-2xl border border-stone-100 shadow-sm p-6">
              <h2 className="font-bold text-stone-800 font-['Outfit'] mb-3 flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" /> Quick Tips
              </h2>
              <ul className="space-y-2.5 text-sm text-stone-500">
                {[
                  "Download the template, fill it in, and upload to bulk-import everything at once",
                  "Export your data monthly as a personal backup",
                  "Use Demo Data to safely explore all features before adding your own",
                  "Run Duplicate Scan after importing to catch double entries",
                  "For PDF bank statements, use the Statement Hub instead",
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
        )} {/* end vault tab */}
      </div>

      {/* ── Duplicate Finder Modal ── */}
      {showDupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-50 rounded-xl"><ScanSearch size={15} className="text-red-500" /></div>
                <div>
                  <h3 className="font-bold text-stone-900 font-['Outfit']">Find Duplicate Transactions</h3>
                  <p className="text-xs text-stone-400">Same description + amount + date = duplicate</p>
                </div>
              </div>
              <button onClick={() => setShowDupModal(false)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {dupLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
                  <p className="text-sm text-stone-500">Scanning your transactions…</p>
                </div>
              ) : dupGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <div className="text-4xl">✅</div>
                  <p className="font-semibold text-stone-700">No duplicates found!</p>
                  <p className="text-sm text-stone-400">Your transaction data looks clean.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700">
                      Found <strong>{dupGroups.length} group{dupGroups.length > 1 ? "s" : ""}</strong> with duplicates.
                      Checked items will be deleted — uncheck any you want to keep.
                    </p>
                  </div>
                  {dupGroups.map(({ key, items }) => (
                    <div key={key} className="border border-stone-100 rounded-2xl overflow-hidden">
                      <div className="bg-stone-50 px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-stone-800 truncate">{items[0].description}</p>
                          <p className="text-[11px] text-stone-400">
                            ₹{Math.round(items[0].amount).toLocaleString("en-IN")} · {items[0].date} · {items.length} copies
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                          {items.length - 1} extra
                        </span>
                      </div>
                      {items.map((t, i) => (
                        <div key={t.id} className={`flex items-center gap-3 px-4 py-2.5 ${i < items.length - 1 ? "border-b border-stone-50" : ""} ${toDelete[t.id] ? "bg-red-50/50" : "bg-white"}`}>
                          <input type="checkbox" checked={!!toDelete[t.id]}
                            onChange={e => setToDelete(prev => ({ ...prev, [t.id]: e.target.checked }))}
                            className="w-4 h-4 accent-red-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-stone-600 truncate">{t.category_name || "Uncategorized"}</p>
                            <p className="text-[10px] text-stone-400">Added {new Date(t.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${toDelete[t.id] ? "text-red-500 line-through" : "text-stone-700"}`}>
                            ₹{Math.round(t.amount).toLocaleString("en-IN")}
                          </span>
                          {i === 0 && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">KEEP</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!dupLoading && dupGroups.length > 0 && (
              <div className="px-5 py-4 border-t border-stone-100 shrink-0 flex items-center justify-between gap-3">
                <p className="text-xs text-stone-400">{Object.values(toDelete).filter(Boolean).length} selected to delete</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowDupModal(false)}
                    className="px-4 py-2 text-sm font-medium text-stone-600 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleDeleteDups} disabled={deletingDups || !Object.values(toDelete).some(Boolean)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-stone-200 disabled:text-stone-400 rounded-xl transition-colors">
                    <Trash2 size={13} /> {deletingDups ? "Deleting…" : "Delete Selected"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DataManagement;
