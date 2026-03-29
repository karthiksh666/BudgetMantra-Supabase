import { useState, useCallback, useEffect } from "react";
import { useStaleData } from "@/hooks/useStaleData";
import axios from "axios";
import { API } from "@/App";
import Navigation from "@/components/Navigation";
import PageLoader from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plane, MapPin, Calendar, Users, Plus, ArrowLeft, ChevronRight,
  Wallet, BarChart2, Trash2, X, CheckCircle, RefreshCw,
  Utensils, Car, Home, Zap, Target,
  ShoppingBag, Clock, AlertTriangle,
  Edit2, Sparkles, Send, Download,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtINR = (n) => `₹${Math.round(Math.abs(n || 0)).toLocaleString("en-IN")}`;

const fmt = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const tripStatus = (trip) => {
  const today = new Date().toISOString().split("T")[0];
  if (!trip.start_date) return { label: "Draft", cls: "bg-stone-100 text-stone-600" };
  if (trip.end_date && trip.end_date < today) return { label: "Completed", cls: "bg-emerald-100 text-emerald-700" };
  if (trip.start_date <= today) return { label: "Active", cls: "bg-orange-100 text-orange-700" };
  return { label: "Upcoming", cls: "bg-amber-100 text-amber-700" };
};

const CAT_ICONS = {
  food:      { icon: Utensils, color: "text-orange-500", bg: "bg-orange-50",  label: "Food" },
  transport: { icon: Car,      color: "text-blue-500",   bg: "bg-blue-50",    label: "Transport" },
  stay:      { icon: Home,     color: "text-purple-500", bg: "bg-purple-50",  label: "Stay" },
  activity:  { icon: Zap,      color: "text-amber-500",  bg: "bg-amber-50",   label: "Activity" },
  other:     { icon: Wallet,   color: "text-stone-500",  bg: "bg-stone-100",  label: "Other" },
};

const EXPENSE_TIPS = [
  "Loading your trip expenses…",
  "Splitting bills fairly…",
  "Calculating who owes what…",
];

const TRIP_TIPS = [
  "Loading your trips…",
  "Packing your memories…",
  "Almost ready to explore…",
];

const ITINERARY_TIPS = [
  "Generating your itinerary…",
  "Chanakya is planning your days…",
  "Crafting the perfect schedule…",
];

// ── Empty form defaults ────────────────────────────────────────────────────────
const EMPTY_TRIP = { name: "", destination: "", start_date: "", end_date: "", budget: "", members: "" };

// ── Destination typeahead data ─────────────────────────────────────────────────
const DESTINATIONS = [
  "Goa","Mumbai","Delhi","Bangalore","Chennai","Hyderabad","Kolkata","Jaipur","Udaipur","Jodhpur",
  "Agra","Varanasi","Rishikesh","Manali","Shimla","Kasol","Leh","Spiti Valley","Coorg","Ooty",
  "Munnar","Alleppey","Kovalam","Varkala","Pondicherry","Mysore","Hampi","Gokarna","Lonavala",
  "Mahabaleshwar","Aurangabad","Nashik","Amritsar","Dharamshala","McLeod Ganj","Dalhousie","Chopta",
  "Nainital","Mussoorie","Jim Corbett","Ranthambore","Pushkar","Jaisalmer","Bikaner","Kochi",
  "Munnar","Wayanad","Kumarakom","Andaman Islands","Lakshadweep","Darjeeling","Gangtok","Sikkim",
  "Arunachal Pradesh","Meghalaya","Kaziranga","Khajuraho","Bhopal","Pune","Nashik",
  // International
  "Bali, Indonesia","Bangkok, Thailand","Singapore","Dubai, UAE","Maldives","Sri Lanka","Nepal",
  "Paris, France","London, UK","Rome, Italy","Barcelona, Spain","Amsterdam, Netherlands",
  "Tokyo, Japan","Seoul, South Korea","Hong Kong","Phuket, Thailand","Krabi, Thailand",
  "Vietnam","Cambodia","Malaysia","Bhutan","Oman","Turkey","Greece","Prague","Budapest",
  "New York, USA","Los Angeles, USA","Sydney, Australia","New Zealand","Mauritius","Kenya",
];

// ── Trip vibe options ──────────────────────────────────────────────────────────
const VIBES = [
  { key: "beach",     label: "Beach",     emoji: "🏖️" },
  { key: "mountains", label: "Mountains", emoji: "🏔️" },
  { key: "culture",   label: "Culture",   emoji: "🏛️" },
  { key: "food",      label: "Food",      emoji: "🍜" },
  { key: "adventure", label: "Adventure", emoji: "🧗" },
  { key: "wildlife",  label: "Wildlife",  emoji: "🦁" },
  { key: "shopping",  label: "Shopping",  emoji: "🛍️" },
  { key: "relaxation",label: "Relaxation",emoji: "🧘" },
  { key: "history",   label: "History",   emoji: "🗿" },
  { key: "nightlife", label: "Nightlife", emoji: "🎉" },
];
const EMPTY_EXP  = { description: "", amount: "", paid_by: "", category: "food", date: new Date().toISOString().split("T")[0], split_among: [] };

// ═══════════════════════════════════════════════════════════════════════════════
// Buy Goals Tab — pure local calculator
// ═══════════════════════════════════════════════════════════════════════════════
const BUY_QUICK_ITEMS = [
  { name: "iPhone 16 Pro",         amount: 134900,  emoji: "📱" },
  { name: "MacBook Air M3",        amount: 114900,  emoji: "💻" },
  { name: "Royal Enfield",         amount: 185000,  emoji: "🏍️" },
  { name: "Tata Nexon EV",         amount: 1499000, emoji: "🚗" },
  { name: "Home Down Payment",     amount: 500000,  emoji: "🏠" },
  { name: "International Holiday", amount: 150000,  emoji: "✈️" },
];

const BUY_STATUS = {
  buy_now: {
    icon: CheckCircle,
    label: "You Can Buy Soon!",
    gradient: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    badgeLabel: "✅ Buy Soon!",
  },
  save_more: {
    icon: Clock,
    label: "Keep Saving",
    gradient: "from-amber-500 to-orange-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    badgeLabel: "⏳ Keep Saving",
  },
  not_advisable: {
    icon: AlertTriangle,
    label: "Not Advisable Now",
    gradient: "from-red-500 to-rose-500",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    badge: "bg-red-100 text-red-700",
    badgeLabel: "⚠️ Not Yet",
  },
};

const fmtAmt = (n) => {
  if (!n && n !== 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000)   return `₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000)     return `₹${(abs / 1000).toFixed(0)}K`;
  return `₹${abs.toLocaleString("en-IN")}`;
};

function BuyGoalsTab() {
  const [itemName,       setItemName]       = useState("");
  const [targetAmount,   setTargetAmount]   = useState("");
  const [currentSavings, setCurrentSavings] = useState("");
  const [monthlySavings, setMonthlySavings] = useState("");
  const [result,         setResult]         = useState(null);

  const handleCalculate = () => {
    if (!itemName.trim() || !targetAmount || !monthlySavings) {
      toast.error("Please enter item name, target amount, and monthly savings");
      return;
    }
    const target   = parseFloat(targetAmount);
    const current  = parseFloat(currentSavings) || 0;
    const monthly  = parseFloat(monthlySavings);

    if (current >= target) {
      setResult({ status: "buy_now", months: 0, readyDate: new Date() });
      return;
    }
    const remaining = target - current;
    const months    = Math.ceil(remaining / monthly);
    const readyDate = new Date();
    readyDate.setMonth(readyDate.getMonth() + months);

    const status = months <= 3 ? "buy_now" : months > 24 ? "not_advisable" : "save_more";
    setResult({ status, months, readyDate });
  };

  const cfg = result ? BUY_STATUS[result.status] : null;
  const StatusIcon = cfg?.icon;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Input Card ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6">
          <h2 className="font-bold text-stone-800 font-['Outfit'] mb-5 flex items-center gap-2">
            <ShoppingBag size={16} className="text-emerald-500" /> What do you want to buy?
          </h2>

          <div className="space-y-4">
            <div>
              <Label className="text-stone-700 font-medium text-sm">Item Name</Label>
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. iPhone 16 Pro, Royal Enfield…"
                className="mt-1.5 h-11 border-stone-200 focus:border-emerald-400 rounded-xl"
              />
            </div>

            <div>
              <Label className="text-stone-700 font-medium text-sm">Target Amount (₹)</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-semibold text-sm">₹</span>
                <Input
                  type="number"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="1,00,000"
                  className="h-11 pl-7 border-stone-200 focus:border-emerald-400 rounded-xl"
                />
              </div>
            </div>

            <div>
              <Label className="text-stone-700 font-medium text-sm">Current Savings (₹)</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-semibold text-sm">₹</span>
                <Input
                  type="number"
                  value={currentSavings}
                  onChange={(e) => setCurrentSavings(e.target.value)}
                  placeholder="0"
                  className="h-11 pl-7 border-stone-200 focus:border-emerald-400 rounded-xl"
                />
              </div>
            </div>

            <div>
              <Label className="text-stone-700 font-medium text-sm">Monthly Savings (₹)</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-semibold text-sm">₹</span>
                <Input
                  type="number"
                  value={monthlySavings}
                  onChange={(e) => setMonthlySavings(e.target.value)}
                  placeholder="10,000"
                  className="h-11 pl-7 border-stone-200 focus:border-emerald-400 rounded-xl"
                />
              </div>
            </div>

            {/* Quick pick chips */}
            <div>
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider mb-2">Quick Pick</p>
              <div className="flex flex-wrap gap-2">
                {BUY_QUICK_ITEMS.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setItemName(item.name); setTargetAmount(item.amount.toString()); }}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-200
                      ${itemName === item.name
                        ? "bg-emerald-100 border-emerald-300 text-emerald-700 scale-105"
                        : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 hover:scale-105"
                      }`}
                  >
                    <span>{item.emoji}</span>
                    {item.name} <span className="text-stone-400">({fmtAmt(item.amount)})</span>
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleCalculate}
              className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl shadow-sm shadow-emerald-300/40 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              Calculate Affordability
            </Button>
          </div>
        </div>

        {/* ── Result / Placeholder ── */}
        {!result ? (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 flex flex-col justify-center items-center text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
              <ShoppingBag size={24} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-stone-800 font-['Outfit'] mb-2">How It Works</h3>
            <div className="space-y-3 text-left w-full mt-2">
              {[
                ["💰", "Enter how much you want to save each month"],
                ["🎯", "Tell us the item price and your current savings"],
                ["📅", "We calculate exactly when you can afford it"],
                ["✅", "Under 3 months? You can buy soon!"],
              ].map(([icon, text]) => (
                <div key={text} className="flex items-center gap-3 text-sm text-stone-600">
                  <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center text-base shrink-0">{icon}</div>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-4 italic">No API calls — just honest math.</p>
          </div>
        ) : cfg ? (
          <div className="space-y-4">
            {/* Status banner */}
            <div className={`rounded-2xl overflow-hidden border ${cfg.border}`}>
              <div className={`bg-gradient-to-r ${cfg.gradient} p-5 text-white`}>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <StatusIcon size={20} />
                  </div>
                  <span className="font-bold text-lg font-['Outfit']">{cfg.label}</span>
                </div>
                <p className="text-white/90 text-sm">
                  {result.months === 0
                    ? "You already have enough saved — go buy it!"
                    : `You'll be ready in ${result.months} month${result.months !== 1 ? "s" : ""}.`}
                </p>
              </div>
              <div className={`${cfg.bg} grid grid-cols-2 divide-x divide-stone-200/60`}>
                <div className="px-4 py-4 text-center">
                  <Calendar size={15} className={`${cfg.text} mx-auto mb-1.5 opacity-70`} />
                  <p className={`font-bold text-xl font-['Outfit'] ${cfg.text}`}>
                    {result.months === 0 ? "Now" : `${result.months} mo`}
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">months to go</p>
                </div>
                <div className="px-4 py-4 text-center">
                  <Target size={15} className={`${cfg.text} mx-auto mb-1.5 opacity-70`} />
                  <p className={`font-bold text-sm font-['Outfit'] ${cfg.text}`}>
                    {result.months === 0
                      ? "Ready!"
                      : result.readyDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">ready date</p>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            {result.months > 0 && result.months <= 36 && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <p className="text-sm font-semibold text-stone-700 mb-3 font-['Outfit']">Savings Timeline</p>
                <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${cfg.gradient} rounded-full`}
                    style={{ width: `${Math.max(4, Math.min(100, (1 / result.months) * 100 * 3))}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-stone-400 mt-1.5">
                  <span>Today</span>
                  <span className={`font-semibold ${cfg.text}`}>{result.months} month{result.months !== 1 ? "s" : ""} away</span>
                  <span>Goal 🎯</span>
                </div>
              </div>
            )}

            <button
              onClick={() => { setResult(null); setItemName(""); setTargetAmount(""); setCurrentSavings(""); setMonthlySavings(""); }}
              className="w-full text-center text-sm text-stone-400 hover:text-emerald-500 font-medium transition-colors py-2"
            >
              ← Try a different item
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function TripPlanner() {
  // ── Top-level planning tab ───────────────────────────────────────────────────
  const [planTab, setPlanTab] = useState("trips"); // "trips" | "buy"

  // ── Trip state ───────────────────────────────────────────────────────────────
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [activeTab, setActiveTab] = useState("itinerary");

  const fetchTripsFn = useCallback(async () => {
    const res = await axios.get(`${API}/trips`);
    return res.data || [];
  }, []);

  const { data: trips, loading: tripsLoading, reload: reloadTrips } = useStaleData(
    "bm_trips_cache",
    fetchTripsFn,
    { errorMsg: "Failed to load trips", fallback: [] }
  );

  const [showCreate,    setShowCreate]    = useState(false);
  const [tripForm,      setTripForm]      = useState(EMPTY_TRIP);
  const [creating,      setCreating]      = useState(false);
  const [deleteId,      setDeleteId]      = useState(null);

  const [tripDetail,    setTripDetail]    = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [balances,      setBalances]      = useState(null);
  const [balLoading,    setBalLoading]    = useState(false);
  const [quickInsights, setQuickInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showAddExp,    setShowAddExp]    = useState(false);
  const [expForm,       setExpForm]       = useState(EMPTY_EXP);
  const [addingExp,     setAddingExp]     = useState(false);
  const [deleteExpId,   setDeleteExpId]   = useState(null);

  const [preferences,   setPreferences]   = useState("");
  const [prefVibes,     setPrefVibes]     = useState([]);
  const [generating,    setGenerating]    = useState(false);

  // ── Trip creation wizard ──────────────────────────────────────────────────────
  const [wizardStep,    setWizardStep]    = useState(0); // 0=dest, 1=dates, 2=people, 3=vibe, 4=budget
  const [destQuery,     setDestQuery]     = useState("");
  const [destOpen,      setDestOpen]      = useState(false);
  const [selectedVibes, setSelectedVibes] = useState([]);
  const [membersInput,  setMembersInput]  = useState("");
  const [adults,        setAdults]        = useState(2);

  const destSuggestions = destQuery.length > 0
    ? DESTINATIONS.filter(d => d.toLowerCase().includes(destQuery.toLowerCase())).slice(0, 6)
    : [];

  const openWizard = () => {
    setTripForm(EMPTY_TRIP);
    setDestQuery("");
    setSelectedVibes([]);
    setMembersInput("");
    setAdults(2);
    setWizardStep(0);
    setShowCreate(true);
  };

  const closeWizard = () => {
    setShowCreate(false);
    setTripForm(EMPTY_TRIP);
    setDestQuery("");
    setSelectedVibes([]);
    setMembersInput("");
    setAdults(2);
    setWizardStep(0);
  };

  const toggleVibe = (key) =>
    setSelectedVibes(v => v.includes(key) ? v.filter(k => k !== key) : [...v, key]);

  const wizardCanNext = () => {
    if (wizardStep === 0) return tripForm.destination.trim().length > 0;
    if (wizardStep === 1) return true; // dates optional
    if (wizardStep === 2) return true; // members optional
    if (wizardStep === 3) return selectedVibes.length > 0;
    return true;
  };

  // ── Inline day edit ──────────────────────────────────────────────────────────
  const [editingDay,    setEditingDay]    = useState(null);
  const [editDayText,   setEditDayText]   = useState("");

  // ── AI brainstorm per day ────────────────────────────────────────────────────
  const [brainstormDay,     setBrainstormDay]     = useState(null);
  const [brainstormInput,   setBrainstormInput]   = useState("");
  const [brainstormResult,  setBrainstormResult]  = useState("");
  const [brainstormLoading, setBrainstormLoading] = useState(false);
  const [budgetInput,       setBudgetInput]       = useState("");
  const [savingBudget,      setSavingBudget]      = useState(false);
  const [savingAsGoal,      setSavingAsGoal]      = useState(false);

  const handleSaveAsGoal = async () => {
    if (!budget || budget <= 0) return;
    setSavingAsGoal(true);
    try {
      const tripName = currentTrip?.name || currentTrip?.destination || "Trip";
      const startDate = currentTrip?.start_date || null;
      // Default deadline: trip start date, or 6 months from today if not set
      const deadline = startDate || new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0];
      await axios.post(`${API}/savings-goals`, {
        name: `${tripName} Fund`,
        target_amount: budget,
        target_date: deadline,
        category: "travel",
        priority: "medium",
      }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      toast.success(`Goal "${tripName} Fund" created in Savings Goals!`);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Could not create savings goal";
      if (err?.response?.status === 402) {
        toast.error("Savings goal limit reached. Upgrade to Pro for unlimited goals.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSavingAsGoal(false);
    }
  };

  // ── Trip Detail Loader ───────────────────────────────────────────────────────
  const loadTripDetail = async (id) => {
    setDetailLoading(true);
    setBalances(null);
    try {
      const res = await axios.get(`${API}/trips/${id}`);
      setTripDetail(res.data);
    } catch {
      toast.error("Could not load trip details");
    } finally {
      setDetailLoading(false);
    }
  };

  const loadBalances = async (id) => {
    setBalLoading(true);
    try {
      const res = await axios.get(`${API}/trips/${id}/balances`);
      setBalances(res.data);
    } catch {
      toast.error("Could not load balances");
    } finally {
      setBalLoading(false);
    }
  };

  const loadQuickInsights = async (id) => {
    if (quickInsights) return; // already loaded
    setInsightsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/trips/${id}/quick-insights`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setQuickInsights(res.data);
    } catch {
      toast.error("Could not load travel insights");
    } finally {
      setInsightsLoading(false);
    }
  };

  const openTrip = async (id) => {
    setSelectedTripId(id);
    setActiveTab("itinerary");
    setTripDetail(null);
    setQuickInsights(null);
    await loadTripDetail(id);
    loadQuickInsights(id);
  };

  // ── Auto-poll while itinerary is generating (max 20 attempts ≈ 80s) ──────────
  useEffect(() => {
    if (tripDetail?.itinerary_status !== "generating" || !selectedTripId) return;
    let attempts = 0;
    const MAX = 20;
    const id = setInterval(async () => {
      attempts += 1;
      try {
        const res = await axios.get(`${API}/trips/${selectedTripId}`);
        setTripDetail(res.data);
        if (res.data.itinerary_status !== "generating" || attempts >= MAX) clearInterval(id);
      } catch {
        if (attempts >= MAX) clearInterval(id);
      }
    }, 4000);
    return () => clearInterval(id);
  }, [tripDetail?.itinerary_status, selectedTripId]);

  const handleSaveBudget = async () => {
    const val = parseFloat(budgetInput.replace(/,/g, ""));
    if (!val || val <= 0) return;
    setSavingBudget(true);
    try {
      await axios.put(`${API}/trips/${selectedTripId}`, { budget: val }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      setTripDetail(prev => ({ ...prev, budget: val }));
      setBudgetInput("");
      toast.success(`Budget set to ${fmtINR(val)}`);
    } catch {
      toast.error("Could not save budget");
    } finally {
      setSavingBudget(false);
    }
  };

  const backToList = () => {
    setSelectedTripId(null);
    setTripDetail(null);
    setBalances(null);
    setActiveTab("itinerary");
  };

  // ── Create Trip (from wizard) ─────────────────────────────────────────────────
  const handleCreateTrip = async () => {
    if (!tripForm.destination) {
      toast.error("Destination is required");
      return;
    }
    setCreating(true);
    try {
      const members = membersInput
        ? membersInput.split(",").map((m) => m.trim()).filter(Boolean)
        : [];
      // Auto-generate trip name: destination + year
      const year = tripForm.start_date ? tripForm.start_date.slice(0, 4) : new Date().getFullYear();
      const name = tripForm.name.trim() || `${tripForm.destination.split(",")[0]} ${year}`;
      // Build preferences string from vibes for itinerary generation hint
      const vibeLabels = selectedVibes.map(k => VIBES.find(v => v.key === k)?.label).filter(Boolean);
      const res = await axios.post(`${API}/trips`, {
        name,
        destination: tripForm.destination,
        start_date:  tripForm.start_date || null,
        end_date:    tripForm.end_date   || null,
        budget:      tripForm.budget ? parseFloat(tripForm.budget) : null,
        members,
        preferences: vibeLabels.join(", "),
      });
      // Kick off itinerary generation with people count
      if (res.data?.id) {
        axios.post(`${API}/trips/${res.data.id}/generate`, {
          preferences: vibeLabels.join(", ") || "sightseeing, local food, authentic experiences",
          adults,
        }).catch(() => {});
      }
      reloadTrips();
      closeWizard();
      toast.success("Trip created! Open it to generate your itinerary.");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not create trip");
    } finally {
      setCreating(false);
    }
  };

  // ── Delete Trip ──────────────────────────────────────────────────────────────
  const handleDeleteTrip = async () => {
    try {
      await axios.delete(`${API}/trips/${deleteId}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      reloadTrips();
      if (selectedTripId === deleteId) backToList();
      setDeleteId(null);
      toast.success("Trip deleted");
    } catch {
      toast.error("Could not delete trip");
    }
  };

  // ── Add Expense ──────────────────────────────────────────────────────────────
  const handleAddExpense = async () => {
    if (!expForm.description || !expForm.amount || !expForm.paid_by) {
      toast.error("Description, amount, and payer are required");
      return;
    }
    setAddingExp(true);
    try {
      const members = tripDetail?.members || [];
      const splitAmong = expForm.split_among.length ? expForm.split_among : members;
      await axios.post(`${API}/trips/${selectedTripId}/expenses`, {
        description:  expForm.description,
        amount:       parseFloat(expForm.amount),
        paid_by:      expForm.paid_by,
        category:     expForm.category,
        date:         expForm.date,
        split_among:  splitAmong,
      });
      await loadTripDetail(selectedTripId);
      setBalances(null);
      setShowAddExp(false);
      setExpForm(EMPTY_EXP);
      toast.success("Expense added!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add expense");
    } finally {
      setAddingExp(false);
    }
  };

  // ── Delete Expense ───────────────────────────────────────────────────────────
  const handleDeleteExpense = async () => {
    try {
      await axios.delete(`${API}/trips/${selectedTripId}/expenses/${deleteExpId}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      await loadTripDetail(selectedTripId);
      setBalances(null);
      setDeleteExpId(null);
      toast.success("Expense removed");
    } catch {
      toast.error("Could not remove expense");
    }
  };

  // ── Generate Itinerary ───────────────────────────────────────────────────────
  const handleGenerateItinerary = async () => {
    const vibeStr = prefVibes.map(k => VIBES.find(v => v.key === k)?.label).filter(Boolean).join(", ");
    const finalPrefs = [vibeStr, preferences.trim()].filter(Boolean).join(", ");
    if (!finalPrefs) {
      toast.error("Pick at least one vibe or describe your preferences");
      return;
    }
    setGenerating(true);
    try {
      await axios.post(`${API}/trips/${selectedTripId}/generate`, {
        preferences: finalPrefs,
        origin_city: currentTrip?.origin_city || "",
        adults: currentTrip?.members?.length || 1,
      });
      setTripDetail((prev) => ({ ...prev, itinerary: [], itinerary_status: "generating" }));
      setPreferences("");
      setPrefVibes([]);
      toast.success("Chanakya is crafting your itinerary — tap Refresh in ~30 seconds!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not start itinerary generation");
    } finally {
      setGenerating(false);
    }
  };

  // ── Save inline day edit ─────────────────────────────────────────────────────
  const handleSaveDayEdit = async (idx) => {
    const updatedActivities = editDayText
      .split("\n")
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean);
    const updatedItinerary = (tripDetail?.itinerary || []).map((d, i) =>
      i === idx ? { ...d, activities: updatedActivities } : d
    );
    try {
      await axios.patch(`${API}/trips/${selectedTripId}/itinerary`, { itinerary: updatedItinerary });
      setTripDetail((prev) => ({ ...prev, itinerary: updatedItinerary }));
      setEditingDay(null);
      setEditDayText("");
      toast.success("Day updated!");
    } catch {
      toast.error("Could not save day");
    }
  };

  // ── AI brainstorm for a day ───────────────────────────────────────────────────
  const handleBrainstorm = async (idx, day) => {
    if (!brainstormInput.trim()) return;
    setBrainstormLoading(true);
    setBrainstormResult("");
    try {
      const trip = trips.find((t) => t.id === selectedTripId) || tripDetail;
      const res = await axios.post(
        `${API}/chatbot`,
        {
          message: `For Day ${idx + 1} of my ${trip?.destination || "trip"} trip (${day.title || ""}), suggest: ${brainstormInput}`,
          conversation_history: [],
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      setBrainstormResult(res.data?.response || "");
    } catch {
      toast.error("Could not get AI suggestions");
    } finally {
      setBrainstormLoading(false);
    }
  };

  // ── Add brainstorm result as day note ─────────────────────────────────────────
  const handleAddBrainstormToDay = async (idx) => {
    if (!brainstormResult) return;
    const updatedItinerary = (tripDetail?.itinerary || []).map((d, i) =>
      i === idx ? { ...d, notes: d.notes ? `${d.notes}\n\n${brainstormResult}` : brainstormResult } : d
    );
    try {
      await axios.patch(`${API}/trips/${selectedTripId}/itinerary`, { itinerary: updatedItinerary });
      setTripDetail((prev) => ({ ...prev, itinerary: updatedItinerary }));
      setBrainstormDay(null);
      setBrainstormInput("");
      setBrainstormResult("");
      toast.success("Added to day!");
    } catch {
      toast.error("Could not update day");
    }
  };

  // ── Export Trip PDF ───────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    const trip = currentTrip || {};
    const exps = tripDetail?.expenses || [];
    const itin = tripDetail?.itinerary || [];
    const bookingTips = tripDetail?.booking_tips || [];
    const visaInfo = tripDetail?.visa_info || "";
    const currencyTip = tripDetail?.currency_tip || "";
    const bestMonths = tripDetail?.best_months || "";
    const totalSpentLocal = exps.reduce((s, e) => s + (e.amount || 0), 0);

    const catTotals = {};
    exps.forEach(e => {
      const cat = e.category || "other";
      catTotals[cat] = (catTotals[cat] || 0) + (e.amount || 0);
    });

    const catRows = Object.entries(catTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, amt]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #f5f5f4;text-transform:capitalize">${cat}</td><td style="padding:6px 8px;border-bottom:1px solid #f5f5f4;text-align:right;font-weight:700">₹${Math.round(amt).toLocaleString('en-IN')}</td></tr>`)
      .join("");

    const expRows = exps
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map(e => `<tr><td style="padding:5px 8px;border-bottom:1px solid #f5f5f4;font-size:12px">${e.date || ""}</td><td style="padding:5px 8px;border-bottom:1px solid #f5f5f4;font-size:12px">${e.description || ""}</td><td style="padding:5px 8px;border-bottom:1px solid #f5f5f4;font-size:12px;text-transform:capitalize">${e.category || ""}</td><td style="padding:5px 8px;border-bottom:1px solid #f5f5f4;font-size:12px">${e.paid_by || ""}</td><td style="padding:5px 8px;border-bottom:1px solid #f5f5f4;font-size:12px;text-align:right;font-weight:600">₹${Math.round(e.amount || 0).toLocaleString('en-IN')}</td></tr>`)
      .join("");

    const itinDays = itin
      .map((day, i) => {
        const acts = (day.activities || day.highlights || [])
          .map(a => `<li style="margin:3px 0;font-size:12px;color:#44403c">${typeof a === "object" ? (a.name || a.activity || "") : a}</li>`)
          .join("");
        return `<div style="margin-bottom:16px;page-break-inside:avoid"><div style="background:#fff7ed;border-left:3px solid #f97316;padding:8px 12px;margin-bottom:6px"><strong style="color:#f97316;font-size:11px;text-transform:uppercase">Day ${i + 1}</strong>${day.title ? `<span style="font-weight:700;color:#1c1917;font-size:13px;margin-left:8px">${day.title}</span>` : ""}</div><ul style="margin:0;padding-left:18px">${acts || "<li style='color:#a8a29e;font-size:12px'>No activities listed</li>"}</ul></div>`;
      })
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${trip.name || "Trip"} — Budget Mantra</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1c1917;background:#fff}@media print{@page{margin:12mm}}</style></head><body>
<div style="background:linear-gradient(135deg,#f97316,#c2410c);padding:28px 36px 24px;color:#fff">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
    <div style="width:52px;height:52px;background:#fff;border-radius:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,0.2)">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
    </div>
    <div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <span style="font-size:15px;font-weight:900;letter-spacing:-0.3px">Budget Mantra</span>
        <span style="font-size:10px;font-weight:600;opacity:.7;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:20px;letter-spacing:.5px;text-transform:uppercase">Trip Report</span>
      </div>
      <div style="font-size:26px;font-weight:900;letter-spacing:-0.5px;line-height:1.1">${trip.name || "Trip"}</div>
    </div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:24px;font-size:13px;opacity:.9">
    <span>📍 ${trip.destination || "—"}</span>
    ${trip.start_date ? `<span>📅 ${trip.start_date}${trip.end_date ? " → " + trip.end_date : ""}</span>` : ""}
    ${trip.members?.length ? `<span>👥 ${trip.members.join(", ")}</span>` : ""}
    ${trip.budget ? `<span>💰 Budget: ₹${Math.round(trip.budget).toLocaleString('en-IN')}</span>` : ""}
  </div>
</div>

<div style="padding:24px 32px">
  ${totalSpentLocal > 0 ? `<div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 20px;min-width:140px"><div style="font-size:11px;color:#9a3412;font-weight:600;text-transform:uppercase;margin-bottom:4px">Total Spent</div><div style="font-size:22px;font-weight:800;color:#c2410c">₹${Math.round(totalSpentLocal).toLocaleString('en-IN')}</div></div>
    ${trip.budget ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 20px;min-width:140px"><div style="font-size:11px;color:#14532d;font-weight:600;text-transform:uppercase;margin-bottom:4px">Remaining</div><div style="font-size:22px;font-weight:800;color:#15803d">₹${Math.round(Math.max(0, trip.budget - totalSpentLocal)).toLocaleString('en-IN')}</div></div>` : ""}
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 20px;min-width:140px"><div style="font-size:11px;color:#1e3a8a;font-weight:600;text-transform:uppercase;margin-bottom:4px">Expenses</div><div style="font-size:22px;font-weight:800;color:#1d4ed8">${exps.length}</div></div>
  </div>` : ""}

  ${catRows ? `<div style="margin-bottom:24px"><h3 style="font-size:14px;font-weight:700;color:#1c1917;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #f97316">Spending by Category</h3><table style="width:100%;border-collapse:collapse">${catRows}</table></div>` : ""}

  ${expRows ? `<div style="margin-bottom:24px"><h3 style="font-size:14px;font-weight:700;color:#1c1917;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #f97316">All Expenses</h3><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#fafaf9"><th style="padding:6px 8px;text-align:left;font-size:11px;color:#78716c;font-weight:600">Date</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#78716c;font-weight:600">Description</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#78716c;font-weight:600">Category</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#78716c;font-weight:600">Paid by</th><th style="padding:6px 8px;text-align:right;font-size:11px;color:#78716c;font-weight:600">Amount</th></tr></thead><tbody>${expRows}</tbody></table></div>` : ""}

  ${itinDays ? `<div style="page-break-before:auto"><h3 style="font-size:14px;font-weight:700;color:#1c1917;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #f97316">Itinerary</h3>${itinDays}</div>` : ""}

  ${(bookingTips.length > 0 || visaInfo || currencyTip || bestMonths) ? `
  <div style="margin-top:24px;page-break-inside:avoid">
    <h3 style="font-size:14px;font-weight:700;color:#1c1917;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #f97316">Travel Tips & Info</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
      ${bookingTips.length > 0 ? `
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#c2410c;text-transform:uppercase;margin-bottom:8px">✈ Booking Tips</div>
        ${bookingTips.map(tip => {
          const label = typeof tip === 'object' ? (tip.tip || tip.label || '') : tip;
          const detail = typeof tip === 'object' ? (tip.detail || '') : '';
          return `<div style="margin-bottom:6px;font-size:12px;color:#44403c"><span style="font-weight:600">${label}</span>${detail ? `<div style="color:#78716c;margin-top:2px">${detail}</div>` : ''}</div>`;
        }).join('')}
      </div>` : ''}
      ${visaInfo ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#14532d;text-transform:uppercase;margin-bottom:8px">🛂 Visa & Entry</div>
        <div style="font-size:12px;color:#44403c;line-height:1.5">${visaInfo}</div>
      </div>` : ''}
      ${currencyTip ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;margin-bottom:8px">💱 Currency & Money</div>
        <div style="font-size:12px;color:#44403c;line-height:1.5">${currencyTip}</div>
      </div>` : ''}
      ${bestMonths ? `
      <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:12px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:#581c87;text-transform:uppercase;margin-bottom:8px">🌤 Best Time to Visit</div>
        <div style="font-size:12px;color:#44403c;line-height:1.5">${bestMonths}</div>
      </div>` : ''}
    </div>
  </div>` : ''}
</div>

<div style="background:#fafaf9;border-top:2px solid #f97316;padding:14px 36px;font-size:11px;color:#a8a29e;display:flex;justify-content:space-between;align-items:center">
  <div style="display:flex;align-items:center;gap:6px">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
    <strong style="color:#f97316;font-size:12px">Budget Mantra</strong>
    <span>· Your personal finance command centre</span>
  </div>
  <span>${new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Allow pop-ups to export PDF"); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  };

  // ── Split among toggle ───────────────────────────────────────────────────────
  const toggleSplit = (member) =>
    setExpForm((f) => ({
      ...f,
      split_among: f.split_among.includes(member)
        ? f.split_among.filter((m) => m !== member)
        : [...f.split_among, member],
    }));

  // ── Derived data ─────────────────────────────────────────────────────────────
  const currentTrip = trips.find((t) => t.id === selectedTripId) || null;
  const expenses    = tripDetail?.expenses || [];
  const members     = tripDetail?.members  || currentTrip?.members || [];
  const totalSpent  = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const budget      = tripDetail?.budget   || currentTrip?.budget || 0;
  const budgetPct   = budget > 0 ? Math.min(100, (totalSpent / budget) * 100) : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Loading gate
  // ═══════════════════════════════════════════════════════════════════════════
  if (tripsLoading && !trips.length) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-56px)] bg-[#fffaf5] flex items-center justify-center">
        <PageLoader message="Loading your trips…" tips={TRIP_TIPS} />
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Trip Detail View — shown when planTab === "trips" and a trip is selected
  // ═══════════════════════════════════════════════════════════════════════════
  if (planTab === "trips" && selectedTripId) {
    const status = currentTrip ? tripStatus(currentTrip) : { label: "Trip", cls: "bg-stone-100 text-stone-600" };
    const itinerary = tripDetail?.itinerary || [];

    return (
      <div className="min-h-screen bg-[#fffaf5]">
        <Navigation />

        {/* ── Hero Header ── */}
        <div className="bg-gradient-to-r from-orange-500 via-orange-500 to-orange-600 px-4 py-7 lg:py-9 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 0%, transparent 60%), radial-gradient(circle at 80% 20%, white 0%, transparent 50%)" }} />
          <div className="max-w-6xl mx-auto relative">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={backToList}
                className="flex items-center gap-1.5 text-orange-100 hover:text-white text-sm font-medium transition-colors group"
              >
                <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                All Trips
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                title="Export trip as PDF"
              >
                <Download size={13} /> Export PDF
              </button>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl lg:text-3xl font-extrabold text-white font-['Outfit']">
                    {currentTrip?.name || "Trip Detail"}
                  </h1>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>
                    {status.label}
                  </span>
                </div>
                <p className="text-orange-100 text-sm mt-1 flex items-center gap-1.5 flex-wrap">
                  <MapPin size={13} />
                  {currentTrip?.destination}
                  {currentTrip?.start_date && (
                    <>
                      <span className="text-orange-300 mx-1">·</span>
                      <Calendar size={13} />
                      {fmt(currentTrip.start_date)}
                      {currentTrip.end_date && ` – ${fmt(currentTrip.end_date)}`}
                    </>
                  )}
                </p>
              </div>
              {budget > 0 && (
                <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-5 py-3 text-white text-sm min-w-[200px]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-orange-100 text-xs">Budget</span>
                    <span className="font-bold">{fmtINR(budget)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${budgetPct > 90 ? "bg-red-400" : "bg-orange-200"}`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-xs">
                    <span className="text-orange-200">Spent {fmtINR(totalSpent)}</span>
                    <span className={budgetPct > 90 ? "text-red-300" : "text-orange-200"}>
                      {fmtINR(Math.max(0, budget - totalSpent))} left
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="bg-white border-b border-stone-100 sticky top-14 z-30 shadow-sm">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex gap-1">
              {[
                { id: "itinerary", label: "Itinerary",      emoji: "📅" },
                { id: "budget",    label: "Budget & Splits", emoji: "💰" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === "budget" && !balances && !balLoading) {
                      loadBalances(selectedTripId);
                    }
                    if (tab.id === "budget" && !quickInsights && !insightsLoading) {
                      loadQuickInsights(selectedTripId);
                    }
                  }}
                  className={`px-4 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                    activeTab === tab.id
                      ? "border-orange-500 text-orange-600"
                      : "border-transparent text-stone-500 hover:text-stone-700"
                  }`}
                >
                  {tab.emoji} {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={22} className="animate-spin text-orange-500" />
            </div>
          ) : (
            <>
              {/* ── Itinerary Tab ── */}
              {activeTab === "itinerary" && (
                <>
                {/* ── Travel Essentials strip ── */}
                {(insightsLoading || quickInsights) && (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                    <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      ✈️ Travel Essentials
                      {insightsLoading && <span className="text-orange-400 animate-pulse">· Generating…</span>}
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Currency */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 text-base">💱</div>
                        <div>
                          <p className="text-[10px] text-stone-400 font-medium">Exchange Rate</p>
                          {insightsLoading && !quickInsights
                            ? <div className="h-3.5 w-20 bg-stone-100 rounded animate-pulse mt-1" />
                            : <p className="text-xs font-bold text-stone-800">{quickInsights?.approx_inr_rate || "—"}</p>}
                        </div>
                      </div>
                      {/* Cash to carry */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 text-base">💵</div>
                        <div>
                          <p className="text-[10px] text-stone-400 font-medium">Cash to Carry</p>
                          {insightsLoading && !quickInsights
                            ? <div className="h-3.5 w-20 bg-stone-100 rounded animate-pulse mt-1" />
                            : <p className="text-xs font-bold text-stone-800">{quickInsights?.cash_to_carry_local || "—"}</p>}
                        </div>
                      </div>
                      {/* Baggage */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-base">🧳</div>
                        <div>
                          <p className="text-[10px] text-stone-400 font-medium">Baggage (Economy)</p>
                          {insightsLoading && !quickInsights
                            ? <div className="h-3.5 w-20 bg-stone-100 rounded animate-pulse mt-1" />
                            : <p className="text-xs font-bold text-stone-800">{quickInsights?.baggage_economy_kg ? `${quickInsights.baggage_economy_kg} kg + ${quickInsights.baggage_cabin_kg || 7} kg cabin` : "—"}</p>}
                        </div>
                      </div>
                      {/* Per day budget */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0 text-base">📅</div>
                        <div>
                          <p className="text-[10px] text-stone-400 font-medium">Per Day Budget</p>
                          {insightsLoading && !quickInsights
                            ? <div className="h-3.5 w-20 bg-stone-100 rounded animate-pulse mt-1" />
                            : <p className="text-xs font-bold text-stone-800">{quickInsights?.per_day_inr ? `₹${Math.round(quickInsights.per_day_inr).toLocaleString("en-IN")}` : "—"}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  {itinerary.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 lg:p-12 text-center">
                      {tripDetail?.itinerary_status === "generating" ? (
                        <>
                          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4 relative">
                            <Sparkles size={26} className="text-orange-600 animate-pulse" />
                          </div>
                          <h3 className="text-lg font-semibold text-stone-800 mb-2">Chanakya is planning your trip</h3>
                          <p className="text-stone-500 text-sm mb-4 max-w-sm mx-auto">
                            Generating your day-by-day itinerary with local tips and must-dos. This takes about 20–30 seconds.
                          </p>
                          <div className="flex items-center justify-center gap-1.5 mb-6">
                            {[0,1,2,3,4].map(i => (
                              <div key={i} className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: `${i * 0.12}s` }} />
                            ))}
                          </div>
                          <button
                            onClick={() => loadTripDetail(selectedTripId)}
                            className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 mx-auto"
                          >
                            <RefreshCw size={13} /> Refresh
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Calendar size={26} className="text-orange-600" />
                          </div>
                          <h3 className="text-lg font-semibold text-stone-800 mb-2">No itinerary yet</h3>
                          <p className="text-stone-500 text-sm mb-6 max-w-sm mx-auto">
                            Describe your travel preferences and let Chanakya AI craft a day-by-day plan for you.
                          </p>
                        </>
                      )}
                      {tripDetail?.itinerary_status !== "generating" && (
                        <div className="max-w-lg mx-auto space-y-4">
                          {/* Vibe multiselect chips */}
                          <div>
                            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Pick your vibe</p>
                            <div className="flex flex-wrap gap-2">
                              {VIBES.map((v) => (
                                <button
                                  key={v.key}
                                  onClick={() => setPrefVibes(prev =>
                                    prev.includes(v.key) ? prev.filter(k => k !== v.key) : [...prev, v.key]
                                  )}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                                    prefVibes.includes(v.key)
                                      ? "bg-orange-500 border-orange-500 text-white"
                                      : "border-stone-200 text-stone-500 hover:border-orange-300"
                                  }`}
                                >
                                  <span>{v.emoji}</span>{v.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Optional extra text */}
                          <div>
                            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Anything else? (optional)</p>
                            <textarea
                              value={preferences}
                              onChange={(e) => setPreferences(e.target.value)}
                              placeholder="e.g. seafood, sunset views, no clubs…"
                              rows={2}
                              className="w-full rounded-xl border border-stone-200 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-300 px-4 py-3 text-sm text-stone-800 resize-none"
                            />
                          </div>
                          <Button
                            onClick={handleGenerateItinerary}
                            disabled={generating || (prefVibes.length === 0 && !preferences.trim())}
                            className="w-full bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white rounded-xl font-semibold shadow-md shadow-orange-500/20 flex items-center justify-center gap-2"
                          >
                            {generating ? (
                              <>
                                <RefreshCw size={15} className="animate-spin" />
                                {ITINERARY_TIPS[Math.floor(Date.now() / 2000) % ITINERARY_TIPS.length]}
                              </>
                            ) : (
                              <>✨ Generate with Chanakya</>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-stone-800 font-['Outfit']">
                          {itinerary.length}-Day Itinerary
                        </h2>
                        <button
                          onClick={() => setTripDetail((prev) => ({ ...prev, itinerary: [], itinerary_status: "failed" }))}
                          className="text-xs text-stone-400 hover:text-red-500 transition-colors"
                        >
                          Regenerate
                        </button>
                      </div>

                      {/* ── Flights panel ── */}
                      {tripDetail?.flight_options?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden mb-4">
                          <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-stone-100 px-5 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Plane size={15} className="text-sky-500" />
                              <span className="font-semibold text-stone-800 text-sm">Flights</span>
                              <span className="text-[10px] text-stone-400 font-normal">via Skyscanner</span>
                            </div>
                            {tripDetail?.origin_city && (
                              <span className="text-xs text-stone-500">{tripDetail.origin_city} → {currentTrip?.destination}</span>
                            )}
                          </div>
                          <div className="divide-y divide-stone-50">
                            {tripDetail.flight_options.slice(0, 4).map((f, i) => {
                              const dur = `${Math.floor(f.duration_mins / 60)}h ${f.duration_mins % 60}m`;
                              const stopLabel = f.stops === 0 ? "Direct" : `${f.stops} stop`;
                              const dep = f.departure?.substring(11, 16) || "";
                              const arr = f.arrival?.substring(11, 16) || "";
                              return (
                                <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? "bg-emerald-400" : "bg-stone-200"}`} />
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-stone-800 truncate">{f.airline}</p>
                                      <p className="text-xs text-stone-400">{stopLabel} · {dur}{dep ? ` · ${dep}→${arr}` : ""}</p>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className={`text-sm font-bold ${i === 0 ? "text-emerald-600" : "text-stone-700"}`}>
                                      ₹{f.price_inr?.toLocaleString("en-IN")}
                                    </p>
                                    {i === 0 && <p className="text-[10px] text-emerald-500 font-medium">Cheapest</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {tripDetail?.estimated_total_cost > 0 && (
                            <div className="bg-stone-50 border-t border-stone-100 px-5 py-2.5 flex items-center justify-between">
                              <span className="text-xs text-stone-500">Estimated total (flights + activities)</span>
                              <span className="text-sm font-bold text-stone-800">₹{tripDetail.estimated_total_cost?.toLocaleString("en-IN")}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {itinerary.map((day, idx) => (
                        <div key={idx} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                          {/* ── Day card header ── */}
                          <div className="bg-gradient-to-r from-orange-50 to-orange-50 border-b border-stone-100 px-5 py-3 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-orange-600 uppercase tracking-wide">Day {idx + 1}</span>
                              {day.title && <p className="font-semibold text-stone-800 text-sm mt-0.5">{day.title}</p>}
                              {day.theme && <p className="text-[11px] text-stone-500 mt-0.5">{day.theme}</p>}
                              {day.weather_note && (
                                <p className="text-[11px] text-sky-600 mt-0.5">☁ {day.weather_note}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {/* ── Action buttons ── */}
                              <button
                                onClick={() => {
                                  setBrainstormDay(brainstormDay === idx ? null : idx);
                                  setBrainstormInput("");
                                  setBrainstormResult("");
                                }}
                                className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-100 hover:bg-orange-200 px-2.5 py-1.5 rounded-lg transition-colors"
                                title="AI Ideas"
                              >
                                <Sparkles size={12} /> Ideas
                              </button>
                              <button
                                onClick={() => {
                                  const acts = day.activities || day.highlights || [];
                                  const text = acts
                                    .map((a, i) => `${i + 1}. ${typeof a === "object" ? (a.activity || a.name || "") : a}`)
                                    .join("\n");
                                  setEditingDay(editingDay === idx ? null : idx);
                                  setEditDayText(text);
                                }}
                                className="p-1.5 text-stone-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                title="Edit day"
                              >
                                <Edit2 size={13} />
                              </button>
                              <div className="text-right">
                                {day.location && (
                                  <span className="text-xs text-stone-500 flex items-center gap-1 justify-end">
                                    <MapPin size={11} /> {day.location}
                                  </span>
                                )}
                                {(day.daily_cost_estimate || day.estimated_cost_inr || day.estimated_cost) > 0 && (
                                  <span className="text-xs font-semibold text-orange-700 block mt-0.5">
                                    ~{fmtINR(day.daily_cost_estimate || day.estimated_cost_inr || day.estimated_cost)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* ── AI Brainstorm panel ── */}
                          {brainstormDay === idx && (
                            <div className="border-b border-orange-100 bg-orange-50 px-5 py-4">
                              <p className="text-xs font-semibold text-orange-700 mb-2 flex items-center gap-1">
                                <Sparkles size={12} /> Ask Chanakya for ideas for Day {idx + 1}
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={brainstormInput}
                                  onChange={(e) => setBrainstormInput(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && handleBrainstorm(idx, day)}
                                  placeholder="Ask Chanakya for ideas…"
                                  className="flex-1 rounded-xl border border-orange-200 bg-white focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-300 px-3 py-2 text-sm text-stone-800"
                                />
                                <button
                                  onClick={() => handleBrainstorm(idx, day)}
                                  disabled={brainstormLoading || !brainstormInput.trim()}
                                  className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                                >
                                  {brainstormLoading ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                                  Send
                                </button>
                              </div>
                              {brainstormResult && (
                                <div className="mt-3 bg-white rounded-xl border border-orange-100 px-4 py-3">
                                  <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">{brainstormResult}</p>
                                  <button
                                    onClick={() => handleAddBrainstormToDay(idx)}
                                    className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                                  >
                                    <Plus size={12} /> Add to day
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Day card body ── */}
                          <div className="px-5 py-4">
                            {editingDay === idx ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editDayText}
                                  onChange={(e) => setEditDayText(e.target.value)}
                                  rows={Math.max(4, editDayText.split("\n").length + 1)}
                                  className="w-full rounded-xl border border-stone-200 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-300 px-3 py-2.5 text-sm text-stone-800 resize-none"
                                  placeholder="One activity per line…"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveDayEdit(idx)}
                                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => { setEditingDay(null); setEditDayText(""); }}
                                    className="bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {(day.activities || day.highlights || []).length > 0 ? (
                                  <div className="divide-y divide-stone-50">
                                    {(day.activities || day.highlights || []).map((a, ai) => {
                                      const act = typeof a === "object"
                                        ? { ...a, name: a.name || a.activity || "", cost_inr: a.cost_inr || a.estimated_cost || 0 }
                                        : { name: a, cost_inr: 0 };
                                      const typeColors = {
                                        food: "bg-orange-100 text-orange-600",
                                        transport: "bg-blue-100 text-blue-600",
                                        accommodation: "bg-purple-100 text-purple-600",
                                        sightseeing: "bg-orange-100 text-orange-600",
                                        shopping: "bg-pink-100 text-pink-600",
                                        experience: "bg-amber-100 text-amber-600",
                                      };
                                      const typeColor = typeColors[act.type] || "bg-stone-100 text-stone-500";
                                      return (
                                        <div key={ai} className="flex gap-3 py-2.5 border-b border-stone-50 last:border-0">
                                          {act.time && (
                                            <div className="shrink-0 w-12 text-right">
                                              <span className="text-[11px] font-semibold text-stone-400 tabular-nums">{act.time}</span>
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-semibold text-stone-800 text-sm">{act.name || (typeof a === "string" ? a : "")}</span>
                                                  {act.book_ahead && (
                                                    <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-semibold">Pre-book</span>
                                                  )}
                                                  {act.type && (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor}`}>{act.type}</span>
                                                  )}
                                                </div>
                                                {act.description && (
                                                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{act.description}</p>
                                                )}
                                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                                  {act.duration && <span className="text-[11px] text-stone-400">⏱ {act.duration}</span>}
                                                  {act.open_days && <span className="text-[11px] text-stone-400">🗓 {act.open_days}</span>}
                                                  {act.rating > 0 && <span className="text-[11px] text-amber-500">★ {act.rating}</span>}
                                                </div>
                                                {act.tip && (
                                                  <div className="mt-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                                                    <p className="text-[11px] text-amber-700"><span className="font-semibold">Tip:</span> {act.tip}</p>
                                                  </div>
                                                )}
                                              </div>
                                              {act.cost_inr > 0 && (
                                                <div className="shrink-0 text-right">
                                                  <span className="text-sm font-bold text-stone-700">₹{act.cost_inr?.toLocaleString("en-IN")}</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-stone-400 text-sm italic">No activities listed.</p>
                                )}
                                {day.notes && (
                                  <p className="text-xs text-stone-400 mt-3 border-t border-stone-50 pt-3 whitespace-pre-wrap">
                                    {day.notes}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Travel Intel ── */}
                {(tripDetail?.best_months || tripDetail?.visa_info || tripDetail?.currency_tip || (tripDetail?.booking_tips || []).length > 0) && (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                    <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                      <span className="text-lg">🧭</span> Travel Intel
                    </h3>
                    <div className="space-y-3 divide-y divide-stone-50">
                      {tripDetail?.best_months && (
                        <div className="flex gap-3 py-2 first:pt-0">
                          <span className="text-xs font-bold text-stone-400 uppercase tracking-wide w-28 shrink-0 pt-0.5">Best months</span>
                          <span className="text-sm text-stone-700">{tripDetail.best_months}</span>
                        </div>
                      )}
                      {tripDetail?.visa_info && (
                        <div className="flex gap-3 py-2">
                          <span className="text-xs font-bold text-stone-400 uppercase tracking-wide w-28 shrink-0 pt-0.5">Visa</span>
                          <span className="text-sm text-stone-700">{tripDetail.visa_info}</span>
                        </div>
                      )}
                      {tripDetail?.currency_tip && (
                        <div className="flex gap-3 py-2">
                          <span className="text-xs font-bold text-stone-400 uppercase tracking-wide w-28 shrink-0 pt-0.5">Currency</span>
                          <span className="text-sm text-stone-700">{tripDetail.currency_tip}</span>
                        </div>
                      )}
                      {(tripDetail?.booking_tips || []).length > 0 && (
                        <div className="flex gap-3 py-2">
                          <span className="text-xs font-bold text-stone-400 uppercase tracking-wide w-28 shrink-0 pt-0.5">Booking tips</span>
                          <ul className="text-sm text-stone-700 space-y-1.5">
                            {tripDetail.booking_tips.map((tip, i) => {
                              const text = typeof tip === 'string' ? tip : tip?.tip || tip?.text || JSON.stringify(tip);
                              const when = typeof tip === 'object' && tip?.when ? tip.when : null;
                              const saves = typeof tip === 'object' && tip?.saves ? tip.saves : null;
                              return (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-orange-400 mt-0.5 shrink-0">•</span>
                                  <span>{text}{when && <span className="text-stone-400 text-xs ml-1">({when}{saves ? ` · saves ₹${saves}` : ''})</span>}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </>
              )}

              {/* ── Budget Tab ── */}
              {activeTab === "budget" && (() => {
                const tripStart  = currentTrip?.start_date ? new Date(currentTrip.start_date) : null;
                const tripEnd    = currentTrip?.end_date   ? new Date(currentTrip.end_date)   : null;
                const daysTotal  = tripStart && tripEnd ? Math.max(1, Math.round((tripEnd - tripStart) / 86400000) + 1) : null;
                const daysLeft   = tripStart ? Math.max(0, Math.ceil((tripStart - Date.now()) / 86400000)) : null;
                const perPerson  = members.length > 1 && totalSpent > 0 ? totalSpent / members.length : null;
                const perDay     = daysTotal && totalSpent > 0 ? totalSpent / daysTotal : null;
                const remaining  = budget > 0 ? budget - totalSpent : null;
                const perDayLeft = remaining && daysLeft > 0 ? remaining / daysLeft : null;

                return (
                <div className="space-y-4">

                  {/* ── Quick Insights ── */}
                  {(quickInsights || insightsLoading) && (

                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-stone-800 flex items-center gap-2 text-sm">
                          <span className="text-base">✈️</span> Travel Quick Insights
                        </h3>
                        {insightsLoading && (
                          <div className="flex items-center gap-1.5 text-xs text-stone-400">
                            <RefreshCw size={11} className="animate-spin" /> Generating…
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Per Day Budget */}
                          <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                            <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide mb-1">Per Day Budget</p>
                            {insightsLoading && !quickInsights
                              ? <><div className="h-5 w-24 bg-orange-100 rounded animate-pulse mb-1" /><div className="h-3 w-16 bg-orange-100 rounded animate-pulse" /></>
                              : <>
                                  <p className="text-base font-bold text-orange-700 font-['Outfit']">
                                    {quickInsights?.per_day_inr ? `₹${Math.round(quickInsights.per_day_inr).toLocaleString("en-IN")}` : "—"}
                                  </p>
                                  {quickInsights?.per_day_local && (
                                    <p className="text-[10px] text-orange-400 mt-0.5">{quickInsights.per_day_local}</p>
                                  )}
                                </>
                            }
                          </div>

                          {/* Cash to Carry */}
                          <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                            <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-1">Cash to Carry</p>
                            {insightsLoading && !quickInsights
                              ? <><div className="h-5 w-24 bg-emerald-100 rounded animate-pulse mb-1" /><div className="h-3 w-16 bg-emerald-100 rounded animate-pulse" /></>
                              : <>
                                  <p className="text-base font-bold text-emerald-700 font-['Outfit']">
                                    {quickInsights?.cash_to_carry_local || "—"}
                                  </p>
                                  {quickInsights?.approx_inr_rate && (
                                    <p className="text-[10px] text-emerald-500 mt-0.5">{quickInsights.approx_inr_rate}</p>
                                  )}
                                </>
                            }
                          </div>

                          {/* Baggage Allowance */}
                          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                            <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide mb-1">Baggage Limit</p>
                            {insightsLoading && !quickInsights
                              ? <><div className="h-5 w-24 bg-blue-100 rounded animate-pulse mb-1" /><div className="h-3 w-16 bg-blue-100 rounded animate-pulse" /></>
                              : <>
                                  <p className="text-base font-bold text-blue-700 font-['Outfit']">
                                    {quickInsights?.baggage_economy_kg ? `${quickInsights.baggage_economy_kg} kg` : "—"}
                                  </p>
                                  <p className="text-[10px] text-blue-400 mt-0.5">
                                    Cabin: {quickInsights?.baggage_cabin_kg ?? 7} kg
                                  </p>
                                </>
                            }
                          </div>

                          {/* Forex Tip */}
                          <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
                            <p className="text-[10px] text-violet-600 font-semibold uppercase tracking-wide mb-1">Forex Tip</p>
                            {insightsLoading && !quickInsights
                              ? <><div className="h-3 w-full bg-violet-100 rounded animate-pulse mb-1" /><div className="h-3 w-3/4 bg-violet-100 rounded animate-pulse" /></>
                              : <p className="text-[11px] text-violet-700 leading-relaxed">
                                  {quickInsights?.forex_fee_tip || "—"}
                                </p>
                            }
                          </div>
                        </div>
                      {quickInsights?.baggage_note && (
                        <p className="text-[11px] text-stone-400 mt-3 flex items-start gap-1.5">
                          <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
                          {quickInsights.baggage_note}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Stats strip ── */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 text-center">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Total Spent</p>
                      <p className="text-lg font-bold text-stone-800">{fmtINR(totalSpent)}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 text-center">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Budget</p>
                      <p className="text-lg font-bold text-orange-600">{budget > 0 ? fmtINR(budget) : "—"}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">{budget > 0 ? (remaining >= 0 ? `${fmtINR(remaining)} left` : `${fmtINR(-remaining)} over`) : "not set"}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 text-center">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Per Person</p>
                      <p className="text-lg font-bold text-stone-800">{perPerson ? fmtINR(perPerson) : "—"}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">{members.length} traveller{members.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 text-center">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wide mb-1">Per Day</p>
                      <p className="text-lg font-bold text-stone-800">{perDay ? fmtINR(perDay) : "—"}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">{daysTotal ? `${daysTotal} days total` : "no dates set"}</p>
                    </div>
                  </div>

                  {/* ── Budget bar / Set budget ── */}
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-stone-800 flex items-center gap-2">
                        <BarChart2 size={16} className="text-orange-500" /> Budget Overview
                      </h3>
                      <Button
                        onClick={() => { setExpForm({ ...EMPTY_EXP, paid_by: members[0] || "", split_among: [] }); setShowAddExp(true); }}
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs flex items-center gap-1"
                      >
                        <Plus size={13} /> Add Expense
                      </Button>
                    </div>

                    {budget > 0 ? (
                      <>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-stone-500">Spent</span>
                          <span className="font-bold text-stone-800">{fmtINR(totalSpent)} <span className="text-stone-400 font-normal">/ {fmtINR(budget)}</span></span>
                        </div>
                        <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${budgetPct > 90 ? "bg-red-400" : budgetPct > 70 ? "bg-amber-400" : "bg-gradient-to-r from-orange-400 to-orange-400"}`}
                            style={{ width: `${Math.min(100, budgetPct)}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-2 text-xs">
                          <span className="text-stone-400">{budgetPct.toFixed(0)}% used</span>
                          <span className={remaining < 0 ? "text-red-500 font-semibold" : remaining < budget * 0.1 ? "text-amber-500 font-semibold" : "text-emerald-500 font-semibold"}>
                            {remaining >= 0 ? `${fmtINR(remaining)} remaining` : `${fmtINR(-remaining)} over budget`}
                          </span>
                        </div>
                        {perDayLeft && (
                          <p className="text-xs text-stone-400 mt-2 text-center">
                            {fmtINR(perDayLeft)}/day left for the remaining {daysLeft} days before trip
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <button
                            onClick={() => setBudgetInput(budget.toString())}
                            className="text-xs text-orange-500 hover:text-orange-700 underline underline-offset-2"
                          >
                            Change budget
                          </button>
                          <button
                            onClick={handleSaveAsGoal}
                            disabled={savingAsGoal}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {savingAsGoal ? "Saving…" : "💰 Save as Savings Goal"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="border border-dashed border-orange-200 rounded-xl p-4 bg-orange-50/50">
                        <p className="text-sm font-medium text-stone-700 mb-1">Set a total budget for this trip</p>
                        <p className="text-xs text-stone-400 mb-3">We'll track how much you've spent vs. your target and alert you when you're close.</p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={budgetInput}
                            onChange={e => setBudgetInput(e.target.value)}
                            placeholder="e.g. 80000"
                            onKeyDown={e => e.key === "Enter" && handleSaveBudget()}
                            className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                          <Button
                            onClick={handleSaveBudget}
                            disabled={savingBudget || !budgetInput}
                            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm px-4"
                          >
                            {savingBudget ? "Saving…" : "Set"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Category breakdown ── */}
                  {expenses.length > 0 && (
                    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                      <h3 className="font-semibold text-stone-800 mb-4 text-sm">By Category</h3>
                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        {Object.entries(CAT_ICONS).map(([key, { icon: Icon, color, bg, label }]) => {
                          const catTotal = expenses.filter(e => (e.category || "other") === key).reduce((s, e) => s + (e.amount || 0), 0);
                          if (catTotal === 0) return null;
                          const catPct = totalSpent > 0 ? (catTotal / totalSpent * 100).toFixed(0) : 0;
                          return (
                            <div key={key} className={`${bg} rounded-xl p-3 text-center`}>
                              <Icon size={18} className={`${color} mx-auto mb-1`} />
                              <p className="text-xs text-stone-500">{label}</p>
                              <p className={`font-bold text-sm ${color}`}>{fmtINR(catTotal)}</p>
                              <p className="text-[10px] text-stone-400 mt-0.5">{catPct}%</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Expenses list ── */}
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                    <h3 className="font-semibold text-stone-800 mb-4 text-sm">All Expenses</h3>
                    {expenses.length === 0 ? (
                      <div className="text-center py-10">
                        <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Wallet size={24} className="text-orange-400" />
                        </div>
                        <p className="text-stone-600 font-medium text-sm">No expenses yet</p>
                        <p className="text-stone-400 text-xs mt-1 mb-4">Start logging what you spend — food, transport, activities…</p>
                        <button
                          onClick={() => { setExpForm({ ...EMPTY_EXP, paid_by: members[0] || "", split_among: [] }); setShowAddExp(true); }}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
                        >
                          + Add First Expense
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {expenses.map((exp) => {
                          const cat = CAT_ICONS[exp.category || "other"] || CAT_ICONS.other;
                          const Icon = cat.icon;
                          return (
                            <div key={exp.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100 hover:border-stone-200 transition-colors group">
                              <div className={`w-9 h-9 ${cat.bg} rounded-xl flex items-center justify-center shrink-0`}>
                                <Icon size={15} className={cat.color} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-stone-800 text-sm truncate">{exp.description}</p>
                                <p className="text-xs text-stone-400">
                                  Paid by <strong className="text-stone-600">{exp.paid_by}</strong>
                                  {exp.split_among?.length > 0 && ` · split ${exp.split_among.length} ways`}
                                  {exp.date && ` · ${fmt(exp.date)}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold text-stone-800 text-sm">{fmtINR(exp.amount)}</p>
                                {exp.split_among?.length > 1 && (
                                  <p className="text-[10px] text-stone-400">{fmtINR(exp.amount / exp.split_among.length)} each</p>
                                )}
                              </div>
                              <button
                                onClick={() => setDeleteExpId(exp.id)}
                                className="p-1.5 text-stone-200 group-hover:text-red-400 transition-colors shrink-0"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* ── Splits (merged into budget tab) ── */}
                  <div className="border-t border-stone-100 pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-stone-800 flex items-center gap-2">
                        <Users size={16} className="text-orange-500" /> Who Owes What
                      </h3>
                      <Button variant="outline" size="sm" onClick={() => loadBalances(selectedTripId)}
                        className="rounded-xl text-xs flex items-center gap-1.5">
                        <RefreshCw size={12} className={balLoading ? "animate-spin" : ""} /> Refresh
                      </Button>
                    </div>

                    {balLoading && (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw size={20} className="animate-spin text-orange-500" />
                      </div>
                    )}

                    {!balLoading && !balances && (
                      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 text-center">
                        <Users size={24} className="text-stone-300 mx-auto mb-2" />
                        <p className="text-stone-400 text-sm mb-3">Calculate who owes what</p>
                        <Button onClick={() => loadBalances(selectedTripId)}
                          className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm">
                          Calculate Balances
                        </Button>
                      </div>
                    )}

                    {balances && !balLoading && (
                      <div className="space-y-3">
                        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex-1 text-center">
                              <p className="text-xs text-stone-400 mb-1">Total Spent</p>
                              <p className="text-lg font-bold text-stone-800">{fmtINR(balances.total_spent || totalSpent)}</p>
                            </div>
                            {members.length > 0 && (
                              <div className="flex-1 text-center border-l border-stone-100">
                                <p className="text-xs text-stone-400 mb-1">Per Person</p>
                                <p className="text-lg font-bold text-stone-800">{fmtINR((balances.total_spent || totalSpent) / members.length)}</p>
                              </div>
                            )}
                            <div className="flex-1 text-center border-l border-stone-100">
                              <p className="text-xs text-stone-400 mb-1">Settlements</p>
                              <p className="text-lg font-bold text-stone-800">{(balances.settlements || []).length}</p>
                            </div>
                          </div>
                        </div>

                        {balances.member_balances && Object.keys(balances.member_balances).length > 0 && (
                          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                            <h4 className="font-semibold text-stone-700 text-xs uppercase tracking-wide mb-3">Member Balances</h4>
                            <div className="space-y-2">
                              {Object.entries(balances.member_balances).map(([member, balance]) => (
                                <div key={member} className={`flex items-center justify-between p-3 rounded-xl border ${balance >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${balance >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                      {member[0]?.toUpperCase()}
                                    </div>
                                    <span className="text-sm font-medium text-stone-800">{member}</span>
                                  </div>
                                  <span className={`text-sm font-semibold ${balance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                    {balance >= 0 ? `gets back ${fmtINR(balance)}` : `owes ${fmtINR(Math.abs(balance))}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(balances.settlements || []).length === 0 ? (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center">
                            <CheckCircle size={22} className="text-emerald-400 mx-auto mb-2" />
                            <p className="text-stone-600 font-medium text-sm">All settled up!</p>
                          </div>
                        ) : (
                          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                            <h4 className="font-semibold text-stone-700 text-xs uppercase tracking-wide mb-3">Settlements Needed</h4>
                            <div className="space-y-2">
                              {(balances.settlements || []).map((s, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl text-sm">
                                  <div className="w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold shrink-0">
                                    {(s.from || s.debtor)?.[0]?.toUpperCase()}
                                  </div>
                                  <p className="flex-1 text-stone-700">
                                    <strong className="text-red-700">{s.from || s.debtor}</strong>{" owes "}
                                    <strong className="text-stone-800">{s.to || s.creditor}</strong>{" "}
                                    <span className="font-bold text-red-700">{fmtINR(s.amount)}</span>
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

            </>
          )}
        </div>

        {/* ── Add Expense Modal ── */}
        <Dialog open={showAddExp} onOpenChange={setShowAddExp}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-['Outfit'] flex items-center gap-2">
                <Wallet size={18} className="text-orange-500" /> Add Expense
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-stone-700 font-medium mb-1.5 block">Description *</Label>
                <Input
                  placeholder="e.g. Dinner at Spice Coast…"
                  value={expForm.description}
                  onChange={(e) => setExpForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-11 rounded-xl border-stone-200 focus:border-orange-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-stone-700 font-medium mb-1.5 block">Amount (₹) *</Label>
                  <Input
                    type="number"
                    placeholder="1200"
                    value={expForm.amount}
                    onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                    className="h-11 rounded-xl border-stone-200 focus:border-orange-400"
                  />
                </div>
                <div>
                  <Label className="text-stone-700 font-medium mb-1.5 block">Date</Label>
                  <Input
                    type="date"
                    value={expForm.date}
                    onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                    className="h-11 rounded-xl border-stone-200 focus:border-orange-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-stone-700 font-medium mb-1.5 block">Paid By *</Label>
                  {members.length > 0 ? (
                    <Select value={expForm.paid_by} onValueChange={(v) => setExpForm((f) => ({ ...f, paid_by: v }))}>
                      <SelectTrigger className="h-11 rounded-xl border-stone-200">
                        <SelectValue placeholder="Select payer" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="Payer name"
                      value={expForm.paid_by}
                      onChange={(e) => setExpForm((f) => ({ ...f, paid_by: e.target.value }))}
                      className="h-11 rounded-xl border-stone-200 focus:border-orange-400"
                    />
                  )}
                </div>
                <div>
                  <Label className="text-stone-700 font-medium mb-1.5 block">Category</Label>
                  <Select value={expForm.category} onValueChange={(v) => setExpForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger className="h-11 rounded-xl border-stone-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CAT_ICONS).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {members.length > 1 && (
                <div>
                  <Label className="text-stone-700 font-medium mb-1.5 block">Split Among</Label>
                  <div className="flex flex-wrap gap-2">
                    {members.map((m) => {
                      const isSelected = expForm.split_among.includes(m) || expForm.split_among.length === 0;
                      return (
                        <button
                          key={m}
                          onClick={() => toggleSplit(m)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                            isSelected
                              ? "bg-orange-500 text-white border-orange-500"
                              : "bg-white text-stone-600 border-stone-200"
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Default: split equally among all</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowAddExp(false)} className="flex-1 rounded-xl">Cancel</Button>
                <Button
                  onClick={handleAddExpense}
                  disabled={addingExp}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl flex items-center gap-1.5 justify-center"
                >
                  {addingExp && <RefreshCw size={13} className="animate-spin" />}
                  Add Expense
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete Expense Confirm ── */}
        <Dialog open={!!deleteExpId} onOpenChange={() => setDeleteExpId(null)}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader><DialogTitle>Remove Expense?</DialogTitle></DialogHeader>
            <p className="text-stone-500 text-sm">This expense and its split records will be removed.</p>
            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => setDeleteExpId(null)} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleDeleteExpense} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Remove</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Main Planning Hub View (list + tab switcher)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#fffaf5]">
      <Navigation />

      {/* ── Planning Hub Hero ── */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-4 py-10 lg:py-14 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(circle at 15% 60%, white 0%, transparent 50%), radial-gradient(circle at 85% 20%, white 0%, transparent 45%)" }}
        />
        <div className="absolute right-8 top-1/2 -translate-y-1/2 text-5xl opacity-15 pointer-events-none hidden lg:block select-none">🗺️</div>
        <div className="max-w-6xl mx-auto relative">
          <p className="text-violet-200 text-xs font-bold uppercase tracking-widest mb-1">Budget Mantra</p>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-white font-['Outfit']">Planning Hub</h1>
          <p className="text-violet-100 text-sm mt-2 max-w-md">
            Plan your future — trips and big purchases.
          </p>
        </div>
      </div>

      {/* ── Three pill tabs ── */}
      <div className="bg-white border-b border-stone-100 shadow-sm sticky top-14 z-30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: "trips", label: "Trips",      icon: Plane,       activeColor: "border-orange-500 text-orange-600" },
              { id: "buy",   label: "Buy Goals",  icon: ShoppingBag, activeColor: "border-emerald-500 text-emerald-600" },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setPlanTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                    planTab === tab.id
                      ? tab.activeColor
                      : "border-transparent text-stone-500 hover:text-stone-700"
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}

      {/* Trips Tab */}
      {planTab === "trips" && (
        <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
              <Plane size={18} className="text-orange-500" /> Your Trips
            </h2>
            <Button
              onClick={openWizard}
              className="bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold rounded-2xl px-5 shadow-md shadow-orange-500/20 flex items-center gap-2"
            >
              <Plus size={16} /> Plan a Trip
            </Button>
          </div>

          {trips.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Plane size={28} className="text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-stone-800 mb-2 font-['Outfit']">No trips yet</h3>
              <p className="text-stone-500 text-sm mb-6 max-w-sm mx-auto">
                Plan your first adventure. Track budgets, split bills among friends, and let Chanakya craft your day-by-day itinerary.
              </p>
              <Button
                onClick={openWizard}
                className="bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white rounded-2xl px-6 shadow-md shadow-orange-500/30 flex items-center gap-2 mx-auto"
              >
                <Plus size={16} /> Plan your first trip
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {trips.map((trip) => {
                const status = tripStatus(trip);
                const tripBudget = trip.budget || 0;
                const spent  = trip.total_spent || 0;
                const pct    = tripBudget > 0 ? Math.min(100, (spent / tripBudget) * 100) : 0;
                return (
                  <div
                    key={trip.id}
                    onClick={() => openTrip(trip.id)}
                    className="bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-md hover:border-orange-200 cursor-pointer transition-all group"
                  >
                    <div className="bg-gradient-to-r from-orange-50 to-orange-50 rounded-t-2xl px-5 py-4 border-b border-stone-100">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-stone-800 font-['Outfit'] truncate group-hover:text-orange-700 transition-colors">
                            {trip.name}
                          </h3>
                          <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1 truncate">
                            <MapPin size={11} className="shrink-0" /> {trip.destination}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.cls}`}>
                            {status.label}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteId(trip.id); }}
                            className="p-1 text-stone-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                      {trip.start_date && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500">
                          <Calendar size={12} className="text-orange-500" />
                          {fmt(trip.start_date)}
                          {trip.end_date && ` – ${fmt(trip.end_date)}`}
                        </div>
                      )}

                      {trip.members?.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Users size={12} className="text-orange-500" />
                          <div className="flex flex-wrap gap-1">
                            {trip.members.slice(0, 4).map((m) => (
                              <span key={m} className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">{m}</span>
                            ))}
                            {trip.members.length > 4 && (
                              <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">
                                +{trip.members.length - 4}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {tripBudget > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                            <span>Budget {fmtINR(tripBudget)}</span>
                            {spent > 0 && <span className={pct > 90 ? "text-red-500 font-medium" : ""}>{pct.toFixed(0)}% used</span>}
                          </div>
                          <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct > 90 ? "bg-red-400" : "bg-gradient-to-r from-orange-400 to-orange-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {trip.itinerary_status === "generating" ? (
                        <div className="flex items-center gap-2 pt-1">
                          <div className="flex gap-0.5">
                            {[0,1,2].map(i => (
                              <div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-orange-600 font-medium">Chanakya is planning your trip…</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end pt-1">
                          <span className="text-xs text-orange-600 font-semibold flex items-center gap-1 group-hover:gap-1.5 transition-all">
                            View trip <ChevronRight size={13} />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Buy Goals Tab */}
      {planTab === "buy" && <BuyGoalsTab />}

      {/* ── Create Trip Wizard ── */}
      <Dialog open={showCreate} onOpenChange={closeWizard}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-stone-100">
            <div
              className="h-1 bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-300"
              style={{ width: `${((wizardStep + 1) / 5) * 100}%` }}
            />
          </div>

          <div className="px-6 pb-6 pt-5">
            {/* Step 0 — Destination */}
            {wizardStep === 0 && (
              <div>
                <p className="text-xs text-orange-500 font-bold uppercase tracking-widest mb-1">Step 1 of 5</p>
                <h2 className="text-xl font-bold text-stone-800 font-['Outfit'] mb-1">Where are you headed? 🌍</h2>
                <p className="text-sm text-stone-400 mb-5">Search for a city or destination</p>
                <div className="relative">
                  <Input
                    autoFocus
                    placeholder="Type a city, country, or place…"
                    value={destQuery}
                    onChange={(e) => {
                      setDestQuery(e.target.value);
                      setTripForm(f => ({ ...f, destination: e.target.value }));
                      setDestOpen(true);
                    }}
                    onFocus={() => setDestOpen(true)}
                    className="h-12 rounded-xl border-stone-200 focus:border-orange-400 text-base"
                  />
                  {destOpen && destSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
                      {destSuggestions.map((d) => (
                        <button
                          key={d}
                          onClick={() => {
                            setDestQuery(d);
                            setTripForm(f => ({ ...f, destination: d }));
                            setDestOpen(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2"
                        >
                          <MapPin size={13} className="text-orange-400 shrink-0" /> {d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {tripForm.destination && (
                  <p className="text-sm text-emerald-600 font-medium mt-3 flex items-center gap-1.5">
                    <CheckCircle size={14} /> {tripForm.destination}
                  </p>
                )}
              </div>
            )}

            {/* Step 1 — Dates */}
            {wizardStep === 1 && (
              <div>
                <p className="text-xs text-orange-500 font-bold uppercase tracking-widest mb-1">Step 2 of 5</p>
                <h2 className="text-xl font-bold text-stone-800 font-['Outfit'] mb-1">When are you going? 📅</h2>
                <p className="text-sm text-stone-400 mb-5">Skip if dates aren't set yet</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">From</Label>
                    <Input type="date" value={tripForm.start_date}
                      onChange={(e) => setTripForm(f => ({ ...f, start_date: e.target.value }))}
                      className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
                  </div>
                  <div>
                    <Label className="text-stone-600 text-xs font-semibold mb-1.5 block">To</Label>
                    <Input type="date" value={tripForm.end_date}
                      min={tripForm.start_date}
                      onChange={(e) => setTripForm(f => ({ ...f, end_date: e.target.value }))}
                      className="h-11 rounded-xl border-stone-200 focus:border-orange-400" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — People */}
            {wizardStep === 2 && (
              <div>
                <p className="text-xs text-orange-500 font-bold uppercase tracking-widest mb-1">Step 3 of 5</p>
                <h2 className="text-xl font-bold text-stone-800 font-['Outfit'] mb-1">Who's coming? 👥</h2>
                <p className="text-sm text-stone-400 mb-6">Number of people travelling together</p>

                {/* Stepper */}
                <div className="flex items-center justify-center gap-8 mb-6">
                  <button
                    onClick={() => setAdults(a => Math.max(1, a - 1))}
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-2xl font-bold transition-colors ${adults <= 1 ? "border-stone-200 text-stone-300" : "border-orange-400 text-orange-500 hover:bg-orange-50"}`}
                    disabled={adults <= 1}
                  >−</button>
                  <div className="text-center">
                    <div className="text-6xl font-black text-stone-800 leading-none">{adults}</div>
                    <div className="text-xs text-stone-400 mt-1">{adults === 1 ? "person" : "people"}</div>
                  </div>
                  <button
                    onClick={() => setAdults(a => Math.min(20, a + 1))}
                    className="w-12 h-12 rounded-full border-2 border-orange-400 text-orange-500 hover:bg-orange-50 flex items-center justify-center text-2xl font-bold transition-colors"
                  >+</button>
                </div>

                {/* Quick picks */}
                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => setAdults(n)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors ${adults === n ? "bg-orange-500 text-white border-orange-500" : "border-stone-200 text-stone-500 hover:border-orange-300"}`}
                    >{n}</button>
                  ))}
                </div>

                {/* Optional member names */}
                <p className="text-xs text-stone-400 mb-2">Names (optional — for expense splitting)</p>
                <Input
                  placeholder="e.g. Karthik, Priya, Ravi"
                  value={membersInput}
                  onChange={(e) => setMembersInput(e.target.value)}
                  className="h-10 rounded-xl border-stone-200 focus:border-orange-400 text-sm"
                />
                {membersInput && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {membersInput.split(",").map(m => m.trim()).filter(Boolean).map((m, i) => (
                      <span key={i} className="bg-orange-100 text-orange-700 text-xs font-semibold px-3 py-1 rounded-full">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3 — Vibe */}
            {wizardStep === 3 && (
              <div>
                <p className="text-xs text-orange-500 font-bold uppercase tracking-widest mb-1">Step 4 of 5</p>
                <h2 className="text-xl font-bold text-stone-800 font-['Outfit'] mb-1">What's your vibe? ✨</h2>
                <p className="text-sm text-stone-400 mb-5">Pick all that apply — Chanakya will plan accordingly</p>
                <div className="grid grid-cols-3 gap-2">
                  {VIBES.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => toggleVibe(v.key)}
                      className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border-2 transition-all text-sm font-semibold ${
                        selectedVibes.includes(v.key)
                          ? "border-orange-400 bg-orange-50 text-orange-700"
                          : "border-stone-100 bg-stone-50 text-stone-600 hover:border-orange-200"
                      }`}
                    >
                      <span className="text-xl">{v.emoji}</span>
                      <span className="text-xs">{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4 — Budget */}
            {wizardStep === 4 && (
              <div>
                <p className="text-xs text-orange-500 font-bold uppercase tracking-widest mb-1">Step 5 of 5</p>
                <h2 className="text-xl font-bold text-stone-800 font-['Outfit'] mb-1">What's your budget? 💰</h2>
                <p className="text-sm text-stone-400 mb-5">Optional — helps Chanakya keep suggestions realistic</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-bold">₹</span>
                  <Input
                    autoFocus
                    type="number"
                    placeholder="e.g. 50000"
                    value={tripForm.budget}
                    onChange={(e) => setTripForm(f => ({ ...f, budget: e.target.value }))}
                    className="h-12 rounded-xl border-stone-200 focus:border-orange-400 pl-8 text-base"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {[15000, 30000, 50000, 100000, 200000].map(amt => (
                    <button key={amt}
                      onClick={() => setTripForm(f => ({ ...f, budget: String(amt) }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        tripForm.budget === String(amt)
                          ? "border-orange-400 bg-orange-50 text-orange-700"
                          : "border-stone-200 text-stone-600 hover:border-orange-300"
                      }`}
                    >
                      ₹{amt.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nav buttons */}
            <div className="flex gap-3 mt-6">
              {wizardStep > 0 ? (
                <Button variant="outline" onClick={() => setWizardStep(s => s - 1)} className="flex-1 rounded-xl">
                  Back
                </Button>
              ) : (
                <Button variant="outline" onClick={closeWizard} className="flex-1 rounded-xl">Cancel</Button>
              )}
              {wizardStep < 4 ? (
                <Button
                  onClick={() => setWizardStep(s => s + 1)}
                  disabled={!wizardCanNext()}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl"
                >
                  Next →
                </Button>
              ) : (
                <Button
                  onClick={handleCreateTrip}
                  disabled={creating}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl flex items-center gap-1.5 justify-center"
                >
                  {creating ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={14} />}
                  {creating ? "Creating…" : "Let's go!"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Trip Confirm ── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Delete Trip?</DialogTitle></DialogHeader>
          <p className="text-stone-500 text-sm">All expenses and itinerary data for this trip will be permanently deleted.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleDeleteTrip} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white">Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
