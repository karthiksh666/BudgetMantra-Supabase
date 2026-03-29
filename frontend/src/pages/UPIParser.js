import { useState, useCallback, useMemo, useRef, useEffect, memo } from "react";
import Navigation from "@/components/Navigation";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle, RefreshCw,
  ArrowDownLeft, ArrowUpRight, TrendingDown, TrendingUp,
  AlertCircle, Download, Trash2, ChevronRight, AlertTriangle,
  FileText, Upload, Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useStaleData } from "@/hooks/useStaleData";

const fmtAmt = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const UPI_APP_COLORS = {
  GPay:       { bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-400"   },
  PhonePe:    { bg: "bg-violet-100", text: "text-violet-700", dot: "bg-violet-400" },
  Paytm:      { bg: "bg-sky-100",    text: "text-sky-700",    dot: "bg-sky-400"    },
  BHIM:       { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-400" },
  CRED:       { bg: "bg-slate-100",  text: "text-slate-700",  dot: "bg-slate-400"  },
  "Amazon Pay":{ bg: "bg-amber-100", text: "text-amber-700",  dot: "bg-amber-400"  },
  default:    { bg: "bg-stone-100",  text: "text-stone-600",  dot: "bg-stone-400"  },
};

const getAppStyle = (app) => UPI_APP_COLORS[app] || UPI_APP_COLORS.default;

const CAT_EMOJI = {
  food: "🍔", groceries: "🛒", transport: "🚗", shopping: "🛍️",
  entertainment: "🎬", utilities: "💡", finance: "💳", insurance: "🛡️", other: "💸",
};

const INVESTMENT_KEYWORDS = [
  'groww', 'zerodha', 'kuvera', 'upstox', 'paytm money', 'paytmlife',
  'angel one', 'angelone', 'iifl', 'motilal', 'hdfc securities', 'kotak securities',
  'sbisec', 'geojit', 'fyers', 'smallcase', '5paisa', 'edelweiss', 'nps',
  'mutual fund', 'm.fund', 'mfund', 'sip', 'coin by zerodha', 'coin@',
  'sensibull', 'dhan', 'stoxkart', 'trade', 'direct@', 'mf@',
];

const isLikelyInvestment = (merchant = '', vpa = '') => {
  const text = `${merchant} ${vpa}`.toLowerCase();
  return INVESTMENT_KEYWORDS.some(kw => text.includes(kw));
};

// UPI VPA patterns that indicate person-to-person transfer (not a merchant)
const _P2P_VPA_SUFFIXES = ['@ybl','@oksbi','@okaxis','@okhdfcbank','@okicici','@paytm','@pthdfc','@ptaxis','@ptsbi','@fbl','@ibl','@jupiteraxis','@axl','@barodampay','@cnrb','@upi'];
const _MERCHANT_BANK_VPA = ['swiggy','zomato','amazon','flipkart','netflix','spotify','irctc','ola','uber','rapido','nobroker','phonepe','gpay','paytm'];

const isP2PTransfer = (merchant = '', vpa = '') => {
  const m = (merchant || '').trim();
  const v = (vpa || '').toLowerCase();
  // Pure phone number (10 digits)
  if (/^\d{10}$/.test(m)) return true;
  // VPA like firstname.lastname@bank or number@bank — not a known merchant
  if (v && _P2P_VPA_SUFFIXES.some(s => v.endsWith(s))) {
    const prefix = v.split('@')[0];
    const knownMerchant = _MERCHANT_BANK_VPA.some(kw => v.includes(kw));
    if (!knownMerchant && /^[a-z]/i.test(prefix)) return true;
  }
  // Name-like string: 2-4 words of letters only (e.g. "Chaitra K M", "Rahul Sharma")
  // Excludes known business suffixes
  const mLower = m.toLowerCase().replace(/\s+(credit|debit|inr|upi|neft|imps|rtgs).*$/i, '').trim();
  const businessSuffixes = ['enterprises','pvt','ltd','private','limited','store','mart','shop','restaurant','hotel','bank','finance'];
  const words = mLower.split(/\s+/);
  if (/^[a-z][a-z\s.]+$/i.test(mLower) && words.length >= 2 && words.length <= 4) {
    if (!businessSuffixes.some(s => mLower.includes(s)) && !_MERCHANT_BANK_VPA.some(kw => mLower.includes(kw))) {
      return true;
    }
  }
  return false;
};

const KEYWORD_CATEGORY_MAP = [
  { keywords: ['swiggy','zomato','blinkit','dunzo','bigbasket','grofer','dmart','reliance fresh','more super','lulu','spencers','foodie','restaurant','dhaba','hotel','cafe','bakery','pizza','burger','kfc','domino','mcdonald','haldiram','subway','chai point','starbucks','barista'], cats: ['dining','food','restaurant','groceries'] },
  { keywords: ['amazon','flipkart','myntra','nykaa','meesho','ajio','lenskart','pepperfry','firstcry','shopsy','snapdeal','tatacliq','shopping','mart','mall','store','shop','retail'], cats: ['shopping'] },
  { keywords: ['ola','uber','rapido','redbus','irctc','makemytrip','yatra','goibibo','cleartrip','petrol','fuel','hp','iocl','bpcl','bus','train','flight','indigo','airindia','spicejet','metro','bmtc','ksrtc'], cats: ['transport','travel'] },
  { keywords: ['electricity','bescom','tpddl','bses','msedcl','water','gas','indane','hp gas','bharat gas','internet','broadband','airtel','jio','vi ','vodafone','bsnl','utility','bill pay','postpaid','prepaid','recharge','tatapower'], cats: ['utilities','bills'] },
  { keywords: ['netflix','spotify','prime video','hotstar','zee5','sonyliv','youtube premium','entertainment','movie','cinema','pvr','inox','bookmyshow','gaming','steam'], cats: ['entertainment'] },
  { keywords: ['hospital','pharmacy','medplus','apollo','max health','fortis','manipal','cipla','dr','clinic','dental','eye care','medicine','health','practo','1mg','pharmeasy'], cats: ['health','medical'] },
  { keywords: ['nobroker','rent','housing','nestaway','magicbricks','99acres','society','maintenance','apartment','pg ','hostel','lease'], cats: ['rent','housing','accommodation'] },
  { keywords: ['school','college','university','udemy','coursera','byjus','unacademy','vedantu','whitehat','tuition','coaching','fees','education','exam','jee','neet'], cats: ['education'] },
  { keywords: ['insurance','lic','hdfc life','sbi life','star health','niva bupa','bajaj allianz','icici lombard','policy','premium','term plan'], cats: ['insurance'] },
];

/**
 * Given a transaction and the user's expense categories, return the best matching category_id.
 * Priority: P2P → UPI Transfers; keyword match → matched category; else "".
 */
const inferCategoryId = (txn, expenseCats) => {
  const merchant = (txn.merchant || txn.description || '');
  const vpa      = (txn.vpa || '');

  // P2P / person transfer → UPI Transfers
  if (isP2PTransfer(merchant, vpa)) {
    const upiCat = expenseCats.find(c => c.name.toLowerCase().includes('upi'));
    if (upiCat) return upiCat.id;
  }

  const text = `${merchant} ${vpa}`.toLowerCase();

  for (const { keywords, cats } of KEYWORD_CATEGORY_MAP) {
    if (keywords.some(kw => text.includes(kw))) {
      const cat = expenseCats.find(c =>
        cats.some(n => c.name.toLowerCase().includes(n))
      );
      if (cat) return cat.id;
    }
  }

  // Fallback: only use "other" / "misc" / "general" — never guess a specific category
  const fallback = expenseCats.find(c =>
    ['other','misc','general','miscellaneous','others'].some(n => c.name.toLowerCase().includes(n))
  );
  return fallback ? fallback.id : '';
};

const PARSE_TIPS = [
  "📄 Reading your statement…",
  "🔍 Scanning for transactions…",
  "🧠 Understanding merchant names…",
  "💡 Matching categories…",
  "✨ Almost done, tidying up…",
];

const ParseLoader = memo(function ParseLoader() {
  const [tip, setTip] = useState(0);
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t1 = setInterval(() => setTip(i => (i + 1) % PARSE_TIPS.length), 2000);
    const t2 = setInterval(() => setDots(i => (i + 1) % 4), 500);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      {/* Pulsing PDF icon */}
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-violet-300 animate-pulse">
          <FileText size={36} className="text-white" />
        </div>
        {/* Orbiting dot */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: "2s" }}>
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-violet-400 shadow-md shadow-violet-300" />
        </div>
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: "3s", animationDirection: "reverse" }}>
          <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 rounded-full bg-purple-300" />
        </div>
      </div>
      {/* Scanning bar */}
      <div className="w-56 h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-violet-400 to-purple-500 rounded-full animate-[scan_1.8s_ease-in-out_infinite]"
          style={{ animation: "scan 1.8s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes scan{0%{width:0%;margin-left:0}50%{width:70%;margin-left:15%}100%{width:0%;margin-left:100%}}`}</style>
      {/* Tip */}
      <p className="text-sm font-semibold text-violet-700 text-center transition-all">
        {PARSE_TIPS[tip]}{'.'.repeat(dots)}
      </p>
      <p className="text-xs text-stone-400">This may take up to 30 seconds for large statements</p>
    </div>
  );
});

export default function UPIParser({ embedded = false }) {
  const { user } = useAuth();
  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [pdfFile,    setPdfFile]    = useState(null);
  const [pdfPassword,    setPdfPassword]    = useState("");
  const [showPdfPwModal, setShowPdfPwModal] = useState(false);
  const [parsed,     setParsed]     = useState([]);  // enriched with {selected, category_id}
  const [stats,      setStats]      = useState(null);
  const [parsing,    setParsing]    = useState(false);
  const [jobId,      setJobId]      = useState(null);
  const [importing,  setImporting]  = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [step,       setStep]       = useState("input"); // input | review | done
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 50;

  const fetchCategories = useCallback(async () => {
    const res = await axios.get(`${API}/categories`, { headers });
    return res.data || [];
  }, [token]); // eslint-disable-line

  const { data: categories } = useStaleData(
    "bm_upi_categories_cache",
    fetchCategories,
    { errorMsg: "Failed to load categories", fallback: [] }
  );

  const expenseCats = categories.filter(c => c.type === "expense");

  // Keep a ref so async poll() always sees the latest categories
  const expenseCatsRef = useRef([]);
  useEffect(() => { expenseCatsRef.current = expenseCats; }, [expenseCats]);

  const handleParsePDF = async (password = "") => {
    if (!pdfFile) { toast.error("Please select a PDF file first"); return; }
    setShowPdfPwModal(false);
    setParsing(true);
    setJobId(null);
    try {
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("pdf_password", password || pdfPassword);
      // Don't override Content-Type — axios sets multipart/form-data with boundary automatically
      const res = await axios.post(`${API}/upi/parse-pdf`, formData, { headers });
      setPdfPassword("");
      // Backend returns job_id — start polling
      const id = res.data?.job_id;
      if (!id) {
        toast.error("Failed to start PDF parsing. Try again.");
        setParsing(false);
        return;
      }
      setJobId(id);
      // Poll until done
      let attempts = 0;
      const poll = async () => {
        try {
          const result = await axios.get(`${API}/upi/parse-pdf/${id}`, { headers });
          if (result.data.status === "processing") {
            if (attempts++ < 30) setTimeout(poll, 1500);
            else { toast.error("PDF parsing timed out. Try again."); setParsing(false); }
            return;
          }
          // Done
          setParsing(false);
          setJobId(null);
          const rawTxns = (result.data.result || []).map(t => ({
            ...t,
            type:    t.type === "credit" ? "income" : "expense",
            selected: t.type !== "credit",
            merchant: t.description,
            possiblyInvestment: isLikelyInvestment(t.description, t.vpa || ''),
          }));
          if (!rawTxns.length) {
            toast.error("No transactions found in this PDF. Try a different statement.");
            return;
          }
          // Apply smart category inference — use ref so we always have the loaded cats
          const catsNow = expenseCatsRef.current.length ? expenseCatsRef.current : expenseCats;
          const enriched = rawTxns.map(t => {
            if (t.type !== "expense") return { ...t, category_id: "", suggested_cat_id: "" };
            const catId = inferCategoryId(t, catsNow);
            return { ...t, category_id: catId, suggested_cat_id: catId };
          });
          // Deselect investment-flagged transactions by default
          const final = enriched.map(t => t.possiblyInvestment ? { ...t, selected: false } : t);
          setParsed(final);
          setPage(1);
          setStats({ total: final.length, parsed: final.length, skipped: 0 });
          setStep("review");
        } catch (pollErr) {
          if (pollErr.response?.status === 422 && pollErr.response?.data?.detail === "password_required") {
            setParsing(false);
            setJobId(null);
            setShowPdfPwModal(true);
          } else {
            setParsing(false);
            setJobId(null);
            toast.error(pollErr.response?.data?.detail || "Failed to parse PDF");
          }
        }
      };
      poll();
    } catch (err) {
      setParsing(false);
      if (err.response?.status === 422 && err.response?.data?.detail === "password_required") {
        setShowPdfPwModal(true);
      } else {
        toast.error(err.response?.data?.detail || "Failed to parse PDF");
      }
    }
  };

  const toggleAll = (val) => setParsed(p => p.map(t => ({ ...t, selected: val })));
  const toggleOne = (id)  => setParsed(p => p.map(t => t.id === id ? { ...t, selected: !t.selected } : t));
  const setCat    = (id, catId) => setParsed(p => p.map(t => t.id === id ? { ...t, category_id: catId } : t));
  const removeOne = (id)  => setParsed(p => p.filter(t => t.id !== id));

  const selectedExpenses = parsed.filter(t => t.selected && t.type === "expense");
  const selectedIncomes  = parsed.filter(t => t.selected && t.type === "income");
  const totalDebit  = selectedExpenses.reduce((s, t) => s + t.amount, 0);
  const totalCredit = selectedIncomes.reduce((s, t) => s + t.amount, 0);
  const unconfirmedCount = selectedExpenses.filter(t => !t.category_id).length;
  const totalPages = Math.ceil(parsed.length / PAGE_SIZE);
  const pagedTxns  = useMemo(() => parsed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [parsed, page]);

  const handleImport = async () => {
    const toImport = parsed.filter(t => t.selected);
    if (!toImport.length) { toast.error("Select at least one transaction"); return; }

    const missingCat = toImport.filter(t => t.type === "expense" && !t.category_id);
    if (missingCat.length) {
      toast.error(`${missingCat.length} expense(s) need a category`);
      return;
    }

    setImporting(true);
    try {
      // Kick off async job — returns immediately
      const res = await axios.post(`${API}/upi/import`, { transactions: toImport }, { headers });
      const importJobId = res.data?.job_id;
      if (!importJobId) { toast.error("Failed to start import."); setImporting(false); return; }

      // Poll until done
      let attempts = 0;
      const pollImport = async () => {
        try {
          const status = await axios.get(`${API}/upi/import/status/${importJobId}`, { headers });
          if (status.data.status === "processing") {
            if (attempts++ < 60) setTimeout(pollImport, 1500);
            else { toast.error("Import timed out. Please try again."); setImporting(false); }
            return;
          }
          if (status.data.status === "error") {
            toast.error(status.data.error || "Import failed. Please try again.");
            setImporting(false);
            return;
          }
          // Done
          setImportResult(status.data);
          setStep("done");
          setImporting(false);
        } catch (pollErr) {
          toast.error(pollErr.response?.data?.detail || "Import failed. Please try again.");
          setImporting(false);
        }
      };
      pollImport();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
      setImporting(false);
    }
  };

  const reset = () => {
    setPdfFile(null); setParsed([]); setStats(null);
    setImportResult(null); setStep("input"); setJobId(null);
  };

  const downloadSampleCSV = () => {
    const rows = [
      ["date", "amount", "description", "type"],
      ["2024-01-15", "500", "Swiggy Food Order", "expense"],
      ["2024-01-16", "1200", "Amazon Shopping", "expense"],
      ["2024-01-17", "50000", "Salary January", "income"],
      ["2024-01-18", "350", "Ola Ride", "expense"],
      ["2024-01-20", "2000", "Electricity Bill", "expense"],
      ["2024-01-22", "5000", "Freelance Payment", "income"],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "budget_mantra_sample_import.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Sample template downloaded");
  };

  const exportParsedCSV = () => {
    if (!parsed.length) return;
    const rows = [["date", "amount", "description", "type", "category"]];
    parsed.forEach(t => {
      const cat = categories.find(c => c.id === t.category_id);
      rows.push([t.date || "", t.amount || "", `"${(t.description || "").replace(/"/g, "'")}"`, t.type, cat?.name || ""]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "statement_transactions.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as CSV");
  };

  return (
    <div className={embedded ? "" : "min-h-screen"} style={embedded ? {} : { background: "linear-gradient(160deg,#fff7ed 0%,#fef3ea 50%,#fdf9f6 100%)" }}>
      {!embedded && <Navigation />}

      {/* Hero — hidden in embedded mode */}
      {!embedded && <div className="relative overflow-hidden px-4 pt-8 pb-6 lg:pt-12 lg:pb-8"
        style={{ background: "linear-gradient(135deg,#7c3aed 0%,#6d28d9 40%,#5b21b6 70%,#4c1d95 100%)" }}>
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-8 w-32 h-32 bg-violet-300/20 rounded-full blur-2xl pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10">
          <p className="text-violet-200 text-xs font-bold uppercase tracking-widest mb-1">📋 Statement Hub</p>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white font-['Outfit'] mb-1">
            Import & Manage Your Bank Statements
          </h1>
          <p className="text-violet-100 text-sm max-w-xl leading-relaxed">
            Upload your PhonePe, GPay, or bank statement PDF — we'll parse and bulk-import your transactions in seconds. No credentials needed.
          </p>

          {/* Step pills */}
          <div className="flex items-center gap-2 mt-4">
            {[
              { key: "input",  label: "1. Upload PDF" },
              { key: "review", label: "2. Review & Tag" },
              { key: "done",   label: "3. Done" },
            ].map((s, i, arr) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full transition-all ${
                  step === s.key
                    ? "bg-white text-violet-700"
                    : step === "done" || (step === "review" && i === 0)
                    ? "bg-white/30 text-white"
                    : "bg-white/10 text-violet-300"
                }`}>{s.label}</span>
                {i < arr.length - 1 && <ChevronRight size={12} className="text-violet-300" />}
              </div>
            ))}
          </div>
        </div>
      </div>}

      <div className={embedded ? "py-4" : "max-w-4xl mx-auto px-4 py-6 pb-28 lg:pb-10"}>

        {/* ── PARSING LOADER ── */}
        {parsing && <div className="bg-white rounded-2xl border border-stone-200 shadow-sm"><ParseLoader /></div>}

        {/* ── STEP 1: INPUT ── */}
        {step === "input" && !parsing && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
                <FileText size={15} className="text-violet-500" />
                <p className="text-sm font-bold text-stone-700">Upload PhonePe / GPay statement PDF</p>
              </div>
              <div className="p-4">
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Download your transaction statement as a PDF from the PhonePe or GPay app (Profile → Statements), then upload it here. No login or bank access required.
                </p>
                <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl px-6 py-8 cursor-pointer transition-colors ${
                  pdfFile ? "border-violet-300 bg-violet-50" : "border-stone-200 bg-stone-50 hover:border-violet-300 hover:bg-violet-50"
                }`}>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={e => setPdfFile(e.target.files?.[0] || null)}
                  />
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${pdfFile ? "bg-violet-100" : "bg-stone-100"}`}>
                    {pdfFile
                      ? <CheckCircle size={22} className="text-violet-600" />
                      : <Upload size={22} className="text-stone-400" />}
                  </div>
                  {pdfFile ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-violet-700">{pdfFile.name}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{(pdfFile.size / 1024).toFixed(0)} KB · Click to change</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-stone-600">Click to select PDF</p>
                      <p className="text-xs text-stone-400 mt-0.5">PhonePe, GPay, Paytm statement</p>
                    </div>
                  )}
                </label>

                <div className="flex items-center justify-between mt-4">
                  <button onClick={downloadSampleCSV}
                    className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 underline underline-offset-2">
                    <Download size={12} /> Download sample template
                  </button>
                  <Button onClick={handleParsePDF} disabled={parsing || !pdfFile}
                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-bold h-9 px-5">
                    {parsing && jobId
                      ? <><RefreshCw size={13} className="mr-1.5 animate-spin" /> Parsing your statement…</>
                      : parsing
                      ? <><RefreshCw size={13} className="mr-1.5 animate-spin" /> Uploading…</>
                      : <><Sparkles size={13} className="mr-1.5" /> Parse & Review Transactions</>}
                  </Button>
                </div>
              </div>
            </div>

            {/* Password-protected PDF help */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-base">🔒</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-800 mb-1.5">Got a password-protected PDF?</p>
                  <p className="text-xs text-amber-700 leading-relaxed mb-2">
                    We can't read encrypted PDFs. Remove the password in 3 steps:
                  </p>
                  <ol className="space-y-1">
                    {[
                      "Upload the PDF to Google Drive",
                      "Double-click to open it — enter your password when prompted",
                      "Press Cmd+P (Mac) or Ctrl+P (Windows) → Save as PDF — done! The new file has no password",
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                        <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 font-bold text-[10px] mt-px">{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
              <p className="text-xs font-bold text-violet-700 uppercase tracking-widest mb-3">How it works</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: "📄", title: "Download PDF", desc: "Open PhonePe or GPay, go to Profile → Statements, and download your statement as a PDF." },
                  { icon: "🔍", title: "We parse it", desc: "We extract amount, merchant, and date from your statement — no credentials required." },
                  { icon: "✅", title: "Review & import", desc: "Pick which ones to import, assign categories, done. Duplicates are auto-skipped." },
                ].map(s => (
                  <div key={s.title} className="flex gap-3">
                    <span className="text-xl shrink-0">{s.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-violet-800">{s.title}</p>
                      <p className="text-xs text-violet-600 mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: REVIEW ── */}
        {step === "review" && (
          <div className="space-y-4">

            {/* Stats bar */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500">Parsed:</span>
                <span className="text-sm font-bold text-violet-600">{stats?.parsed}</span>
                <span className="text-xs text-stone-400">of {stats?.total} messages</span>
              </div>
              {stats?.skipped > 0 && (
                <span className="text-xs text-stone-400">{stats.skipped} non-UPI skipped</span>
              )}
              {unconfirmedCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                  <AlertTriangle size={10} /> {unconfirmedCount} need category
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                  <TrendingDown size={11} /> {fmtAmt(totalDebit)} debit
                </span>
                {totalCredit > 0 && (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                    <TrendingUp size={11} /> {fmtAmt(totalCredit)} credit
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => toggleAll(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors">
                Select all
              </button>
              <button onClick={() => toggleAll(false)}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-600 hover:bg-stone-200 transition-colors">
                Deselect all
              </button>
              <button onClick={() => setParsed(p => p.map(t => ({ ...t, selected: t.type === "expense" })))}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-600 hover:bg-stone-200 transition-colors">
                Expenses only
              </button>
              <span className="text-xs text-stone-400">
                {parsed.filter(t => t.selected).length} of {parsed.length} selected
              </span>
              <button onClick={exportParsedCSV}
                className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-600 hover:bg-stone-200 transition-colors">
                <Download size={12} /> Export CSV
              </button>
            </div>

            {/* Transaction list */}
            <div className="space-y-2">
              {pagedTxns.map(txn => {
                const appStyle = getAppStyle(txn.upi_app);
                const isDebit  = txn.type === "expense";
                const catEmoji = CAT_EMOJI[txn.suggested_category] || "💸";

                return (
                  <div key={txn.id}
                    className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                      txn.possiblyInvestment
                        ? "border-amber-200 bg-amber-50/30"
                        : !txn.selected
                        ? "border-stone-100 opacity-60"
                        : txn.selected && isDebit && !txn.category_id
                        ? "border-orange-300 shadow-sm"
                        : "border-violet-200 shadow-sm"
                    }`}>
                    <div className="flex items-start gap-3 p-3">

                      {/* Checkbox */}
                      <button onClick={() => toggleOne(txn.id)}
                        className={`shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          txn.selected
                            ? "bg-violet-500 border-violet-500"
                            : "border-stone-300 hover:border-violet-400"
                        }`}>
                        {txn.selected && <CheckCircle size={12} className="text-white" />}
                      </button>

                      {/* Type icon */}
                      <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm ${
                        isDebit ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"
                      }`}>
                        {isDebit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-stone-800 truncate">{txn.merchant}</p>
                          {txn.upi_app && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${appStyle.bg} ${appStyle.text}`}>
                              {txn.upi_app}
                            </span>
                          )}
                          <span className="text-[10px] text-stone-400">{txn.date}</span>
                        </div>
                        {txn.possiblyInvestment && (
                          <div className="flex items-center gap-1.5 mt-1.5 bg-amber-100 border border-amber-200 rounded-lg px-2 py-1">
                            <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                            <p className="text-[11px] font-semibold text-amber-700">Looks like an investment — not selected by default. Confirm before importing.</p>
                          </div>
                        )}
                        {txn.vpa && (
                          <p className="text-[11px] text-stone-400 mt-0.5 truncate font-mono">{txn.vpa}</p>
                        )}

                        {/* Category selector for expenses */}
                        {txn.selected && isDebit && (
                          <div className="mt-2 space-y-1.5">
                            {/* Suggestion pill — tap to confirm, or pick different below */}
                            {!txn.category_id && txn.suggested_cat_id && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-stone-400 shrink-0">AI suggests:</span>
                                <button
                                  onClick={() => setCat(txn.id, txn.suggested_cat_id)}
                                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors"
                                >
                                  {catEmoji} {expenseCats.find(c => c.id === txn.suggested_cat_id)?.name || txn.suggested_category}
                                  <span className="text-[9px] bg-violet-200 text-violet-700 px-1 rounded-full">✓ Confirm</span>
                                </button>
                              </div>
                            )}
                            {txn.category_id && (
                              <div className="flex items-center gap-1.5">
                                <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                                <span className="text-[11px] font-semibold text-emerald-700">
                                  {expenseCats.find(c => c.id === txn.category_id)?.name || txn.suggested_category || "Category"}
                                </span>
                                <button onClick={() => setCat(txn.id, "")} className="text-[10px] text-stone-400 hover:text-red-400 ml-1">change</button>
                              </div>
                            )}
                            {/* Always show picker so user can choose a different category */}
                            {!txn.category_id && (
                              <Select value="" onValueChange={val => setCat(txn.id, val)}>
                                <SelectTrigger className={`h-7 text-xs rounded-lg ${!txn.category_id ? "border-orange-300 bg-orange-50/50" : "border-stone-200 bg-stone-50"}`}>
                                  <SelectValue placeholder="Pick a category…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {expenseCats.map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-xs">
                                      {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${isDebit ? "text-red-600" : "text-emerald-600"}`}>
                          {isDebit ? "-" : "+"}{fmtAmt(txn.amount)}
                        </p>
                        <button onClick={() => removeOne(txn.id)}
                          className="mt-1 text-stone-300 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white border border-stone-200 rounded-2xl px-4 py-2.5 shadow-sm">
                <span className="text-xs text-stone-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, parsed.length)} of {parsed.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >← Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => Math.abs(p - page) <= 2).map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`text-xs font-semibold w-7 h-7 rounded-lg transition-colors ${p === page ? "bg-violet-500 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                    >{p}</button>
                  ))}
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >Next →</button>
                </div>
              </div>
            )}

            {/* Import footer */}
            <div className="sticky bottom-24 lg:bottom-4 bg-white border border-stone-200 rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-bold text-stone-700">
                  Import {parsed.filter(t => t.selected).length} transactions
                </p>
                <p className="text-xs text-stone-400">Duplicates (same UPI ref) will be auto-skipped</p>
              </div>
              <Button variant="outline" onClick={reset} className="shrink-0 text-xs h-9">
                ← Start over
              </Button>
              <Button onClick={handleImport} disabled={importing || !parsed.filter(t => t.selected).length}
                className="shrink-0 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold h-9">
                {importing
                  ? <><RefreshCw size={13} className="mr-1.5 animate-spin" /> Saving to your account…</>
                  : <><Download size={13} className="mr-1.5" /> Import Selected</>}
              </Button>
            </div>
            {importing && (
              <div className="mt-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
                <p className="text-xs text-violet-700 font-medium">Importing in background — this page won't freeze. You'll see results when done.</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: DONE ── */}
        {step === "done" && importResult && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-6 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <h2 className="text-xl font-extrabold text-stone-800 font-['Outfit'] mb-1">Import complete!</h2>
              <p className="text-stone-500 text-sm mb-6">Your transactions have been added to Budget Manager.</p>

              <div className="flex justify-center gap-6 mb-6">
                <div className="text-center">
                  <p className="text-3xl font-black text-violet-600 font-['Outfit']">{importResult.imported}</p>
                  <p className="text-xs text-stone-500 font-semibold">imported</p>
                </div>
                {importResult.duplicates > 0 && (
                  <div className="text-center">
                    <p className="text-3xl font-black text-stone-400 font-['Outfit']">{importResult.duplicates}</p>
                    <p className="text-xs text-stone-500 font-semibold">skipped (duplicate)</p>
                  </div>
                )}
                {importResult.errors?.length > 0 && (
                  <div className="text-center">
                    <p className="text-3xl font-black text-red-400 font-['Outfit']">{importResult.errors.length}</p>
                    <p className="text-xs text-stone-500 font-semibold">errors</p>
                  </div>
                )}
              </div>

              {importResult.errors?.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-left mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={13} className="text-red-500" />
                    <p className="text-xs font-bold text-red-700">Some entries failed</p>
                  </div>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 font-mono">{e}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-col items-center gap-3">
                <div className="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3 flex items-center gap-3 w-full">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">₹</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-bold text-stone-700">Ask Chanakya about this import</p>
                    <p className="text-[10px] text-stone-400">Get insights, spot anomalies, or categorise remaining entries via chat</p>
                  </div>
                  <Button size="sm" onClick={() => window.location.href = "/chatbot"}
                    className="shrink-0 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-xs font-bold h-7 px-3 rounded-lg">
                    Open →
                  </Button>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={reset}>Import more</Button>
                  <Button onClick={() => window.location.href = "/budget"}
                    className="bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold">
                    View in Budget →
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PDF Password Modal */}
      {showPdfPwModal && (
        <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-stone-800 text-lg mb-1">🔒 Password Protected PDF</h3>
            <p className="text-sm text-stone-500 mb-3">This PDF is password-protected. Enter the password below to unlock it.</p>
            <Input
              type="password"
              placeholder="PDF password (usually your mobile number)"
              value={pdfPassword}
              onChange={e => setPdfPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && pdfPassword && handleParsePDF(pdfPassword)}
              className="mb-3"
              autoFocus
            />
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4">
              <p className="text-xs font-bold text-amber-700 mb-1.5">💡 Common passwords</p>
              <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                <li>PhonePe: your registered mobile number</li>
                <li>GPay: first 4 letters of name + birth year (e.g. rahm1995)</li>
                <li>Paytm: your registered mobile number</li>
                <li>Bank statements: date of birth (DDMMYYYY)</li>
              </ul>
              <p className="text-xs text-amber-600 mt-2 font-medium">On mobile? Open the PDF in your browser, print → Save as PDF to remove password first.</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => { setShowPdfPwModal(false); handleParsePDF(pdfPassword); }}
                disabled={!pdfPassword.trim()}>
                Unlock & Parse
              </Button>
              <Button variant="outline" className="flex-1"
                onClick={() => { setShowPdfPwModal(false); setPdfPassword(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
