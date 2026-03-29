import { useState, useEffect, useRef } from "react";
import Navigation from "@/components/Navigation";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useUpgrade } from "@/context/AuthContext";
import { Lock, Star, ChevronRight, Sparkles, Search, X, Bot, ExternalLink, EyeOff, Eye, Play } from "lucide-react";

// ── Feature catalog ───────────────────────────────────────────────────────────
export const FEATURE_CATALOG = [
  { id: "budget",         to: "/budget",         label: "Budget Manager",     emoji: "📊", tagline: "Set limits, stop overspending",          desc: "Create monthly budgets per category. Get real-time alerts when you're close to the limit.", category: "savings", pro: false, color: "from-emerald-400 to-teal-500",    anim: "0s"   },
  { id: "savings-goals",  to: "/savings-goals",  label: "Savings Goals",      emoji: "🎯", tagline: "Save for what excites you",              desc: "Set a goal — vacation, MacBook, wedding fund — track progress and get nudged when falling behind.", category: "savings", pro: false, color: "from-blue-400 to-indigo-500",     anim: "0.1s" },
  { id: "investments",    to: "/investments",    label: "Investments",         emoji: "📈", tagline: "See your full portfolio in one place",   desc: "Track stocks, mutual funds, FDs, PPF, NPS, real estate and insurance. See total value and returns.", category: "savings", pro: true,  color: "from-emerald-500 to-green-600",   anim: "0.2s" },
  { id: "gold",           to: "/gold",           label: "Gold Tracker",        emoji: "🥇", tagline: "Know your gold's real value today",      desc: "Track physical gold, jewellery and digital gold with live market value.", category: "assets", pro: true,  color: "from-yellow-400 to-amber-500",    anim: "0.3s" },
  { id: "silver",         to: "/silver",         label: "Silver Tracker",      emoji: "🥈", tagline: "Every gram counts",                     desc: "Monitor silver coins, bars and jewellery with current market value.", category: "assets", pro: true,  color: "from-slate-400 to-slate-500",     anim: "0.1s" },
  { id: "credit-cards",   to: "/credit-cards",   label: "Credit Cards",        emoji: "💳", tagline: "Beat the billing cycle",                desc: "Track balances, due dates and spending across all your credit cards. Never pay late fees again.", category: "credit", pro: true,  color: "from-violet-400 to-purple-500",   anim: "0.2s" },
  { id: "hand-loans",     to: "/hand-loans",     label: "Hand Loans",          emoji: "🤝", tagline: "Never forget who owes you",             desc: "Track money lent to and borrowed from friends and family with due dates.", category: "credit", pro: true,  color: "from-rose-400 to-pink-500",       anim: "0s"   },
  { id: "subscriptions",  to: "/subscriptions",  label: "Subscriptions",       emoji: "📺", tagline: "Kill the subs you forgot about",        desc: "See every recurring subscription, total monthly cost and next renewal date.", category: "credit", pro: false, color: "from-cyan-400 to-sky-500",        anim: "0.3s" },
  { id: "recurring",      to: "/recurring",      label: "Recurring Expenses",  emoji: "🔄", tagline: "Set it and track it automatically",     desc: "Auto-add regular expenses — rent, SIP, insurance — every month. No more manual re-entry.", category: "credit", pro: false, color: "from-teal-400 to-green-500",      anim: "0.1s" },
  { id: "trips",          to: "/trips",          label: "Trip Planner",        emoji: "✈️", tagline: "Let AI plan your dream trip",           desc: "Enter destination + budget — Chanakya AI builds full day-by-day itinerary with costs, visa info and booking hacks.", category: "life", pro: true, color: "from-sky-400 to-blue-500",        anim: "0.2s" },
  { id: "group-expenses", to: "/group-expenses", label: "Group Expenses",      emoji: "👥", tagline: "Split bills without awkward texts",     desc: "Track group spending on trips, events or flat-sharing. See who owes what and settle up cleanly.", category: "life", pro: true, color: "from-indigo-400 to-violet-500",   anim: "0s"   },
  { id: "timeline",       to: "/timeline",       label: "Life Timeline",       emoji: "📍", tagline: "Your financial life story",             desc: "Record milestones — first job, home purchase, marriage, travel — on a beautiful shareable timeline.", category: "life", pro: true, color: "from-pink-400 to-rose-500",       anim: "0.3s" },
  { id: "calendar",       to: "/calendar",       label: "Financial Calendar",  emoji: "📅", tagline: "See your financial year at a glance",   desc: "All EMI due dates, salary days, trip dates and goal deadlines in one unified calendar view.", category: "life", pro: false, color: "from-orange-400 to-amber-500",    anim: "0.1s" },
  { id: "when-to-buy",    to: "/when-to-buy",    label: "When to Buy",         emoji: "🛍️", tagline: "Never buy at the wrong time",           desc: "AI tells you the ideal time to buy electronics and appliances based on discount cycles.", category: "life", pro: false, color: "from-emerald-400 to-green-500",   anim: "0.2s" },
  { id: "luxury",         to: "/luxury",         label: "Luxury Tracker",      emoji: "⌚", tagline: "Know what your valuables are worth",    desc: "Track watches, bags, jewellery and collectibles with purchase price vs current market value.", category: "family", pro: true, color: "from-stone-400 to-zinc-500",      anim: "0s"   },
  { id: "children",       to: "/children",       label: "Children",            emoji: "👶", tagline: "Plan their future from day one",        desc: "Track kids' milestones, school fees, medical costs and build their financial plan.", category: "family", pro: true, color: "from-pink-300 to-rose-400",       anim: "0.1s" },
  { id: "gifts",          to: "/gifts",          label: "Celebrations & Gifts", emoji: "🎁", tagline: "Occasions, people & perfect gifts",     desc: "Track all your celebrations — save people's interests, log gifts given/received, and get AI ideas that actually know the person.", category: "family", pro: true, color: "from-red-400 to-rose-500",        anim: "0.3s" },
  { id: "events",         to: "/events",         label: "Event Planner",       emoji: "🎊", tagline: "Plan weddings, birthdays & festivals",  desc: "Plan every major event end-to-end — set budget, track actual costs, manage guest count, and get AI-generated menu, WhatsApp invites, catering checklist and reminder timeline.", category: "family", pro: true, color: "from-orange-400 to-amber-500",    anim: "0.1s" },
  { id: "family",         to: "/family",         label: "Family",              emoji: "👨‍👩‍👧", tagline: "Finance as a family unit",              desc: "Add family members, share the dashboard with your spouse or parents and track household finances together.", category: "family", pro: false, color: "from-amber-400 to-orange-500",    anim: "0.2s" },
  { id: "upi-parser",     to: "/upi-parser",     label: "SMS / UPI Import",    emoji: "📲", tagline: "Bulk import from any bank or UPI app",  desc: "Paste bank SMS or UPI messages (GPay, PhonePe, Paytm, BHIM) and auto-import transactions in bulk. Works with all major Indian banks.", category: "tools", pro: false, color: "from-violet-400 to-purple-500",  anim: "0.2s" },
  { id: "income",         to: "/income",         label: "Income Tracker",      emoji: "💵", tagline: "See every rupee coming in",            desc: "Log salary, freelance, rental, dividends and other income sources. See monthly totals and trends.", category: "tools", pro: false, color: "from-blue-400 to-indigo-500",    anim: "0.3s" },
  { id: "fire",           to: "/fire",           label: "FIRE Calculator",     emoji: "🔥", tagline: "Calculate your freedom date",          desc: "Find out when you can retire based on savings rate, monthly expenses and target corpus.", category: "tools", pro: false, color: "from-orange-500 to-red-600",     anim: "0s"   },
  { id: "piggy-bank", to: "/piggy-bank", label: "Piggy Bank", emoji: "🐷", tagline: "Track your cash stash", desc: "Keep track of physical cash — in your wallet, home safe, or that jar in the kitchen. Log deposits and withdrawals. Free for everyone.", category: "tools", pro: false, color: "from-orange-400 to-amber-500", anim: "0.1s" },
];

// ── Chanakya explanations with real examples ──────────────────────────────────
const CHANAKYA_EXAMPLES = {
  "budget": {
    what: "Budget Manager lets you cap spending per category every month. Once you set a limit, every transaction you log is measured against it in real-time.",
    example: "Priya realised she was spending ₹11,000 on food every month without noticing. She set a ₹8,000 cap on Food & Dining. On the 22nd she got an alert at ₹7,100. She skipped two Zomato weekends and ended April at ₹7,800 — her first month under budget.",
    tip: "Start with your top 3 overspend categories. Small wins build the habit."
  },
  "savings-goals": {
    what: "You set a target amount, a deadline and a name. Budget Mantra tracks how much you've saved toward it and tells you the monthly contribution needed to hit the date.",
    example: "Arjun wanted a Sony WH-1000XM5 (₹29,990) in 3 months. He set it as a goal. Budget Mantra told him to park ₹10,000/month. By month 2 he was at 65% — a small bonus from client work pushed him to 100% in 2.5 months.",
    tip: "Link a specific account or SIP to a goal for zero-effort progress tracking."
  },
  "investments": {
    what: "One dashboard for every asset class — stocks, mutual funds, gold, FD, PPF, NPS and real estate. See your total portfolio value, category allocation and returns side by side.",
    example: "Kavita had investments across Zerodha, SBI FD, PPF and her employer NPS — four separate apps. She added them all here and saw her total portfolio for the first time: ₹14.2L. She also discovered her equity allocation was only 18%, way below her target.",
    tip: "Even if you only track manually, having the full picture in one place changes how you think about money."
  },
  "gold": {
    what: "Log every gold item — jewellery, coins, digital gold — with weight and purchase price. The tracker applies live market rates to show current value vs what you paid.",
    example: "Rao's family had 120g of gold jewellery bought at various times between ₹2,800 and ₹5,200 per gram. In Gold Tracker he logged each item. Today the value shows ₹8.4L — he realised his 'savings' in gold had nearly doubled.",
    tip: "Include pawned or pledged gold too — it's still part of your net worth."
  },
  "silver": {
    what: "Track silver bars, coins and utensils with current market pricing. Pairs with the Gold Tracker for a complete precious metals view.",
    example: "Meera inherited 500g of silver from her grandmother. She added it to Silver Tracker — at today's price it's worth ₹38,000. Small but it's part of her net worth calculation now.",
    tip: "Most people forget silver in their net worth. Don't."
  },
  "credit-cards": {
    what: "Add all your credit cards, their limits and billing dates. Log expenses to each card and get a due date reminder before it hits.",
    example: "Rohan had 3 cards — HDFC, Axis and Amazon Pay. He always paid minimum due and forgot which card charged what. After adding them here, he saw his total credit card debt was ₹47,000 across cards. He set up alerts and paid off the highest-interest one first.",
    tip: "Sort cards by interest rate. Always pay the most expensive one first."
  },
  "hand-loans": {
    what: "Log money you lend or borrow — person's name, amount, date, purpose and due date. Get reminders before the due date so recovery conversations aren't awkward.",
    example: "Suresh lent ₹15,000 to a friend for a laptop 'for a week'. Six weeks later he'd forgotten. After adding Hand Loans, he saw the outstanding amount with the date. The gentle reminder helped him ask without it feeling like an accusation.",
    tip: "Log even small ₹500-1000 loans. Patterns reveal who's reliable."
  },
  "subscriptions": {
    what: "Add every subscription — OTT, software, gym, magazines. See total monthly spend, next renewal and how long since you last used each one.",
    example: "Divya found she had Netflix, Prime, Hotstar, Spotify, YouTube Premium and LinkedIn Premium running simultaneously. Total: ₹2,340/month. She'd been paying for LinkedIn Premium for 14 months without a single job search. Cancelled. Saved ₹28,000/year.",
    tip: "Sort by 'last used'. Anything over 30 days untouched is a candidate to cancel."
  },
  "recurring": {
    what: "Set up a recurring entry and it automatically appears in your transactions every month — rent, SIP, insurance premium, electricity. No manual logging needed.",
    example: "Nikhil paid ₹22,000 rent, ₹5,000 SIP, ₹1,800 insurance and ₹900 internet every month. He set up four recurring entries. Now his monthly expenses baseline is auto-populated — he only logs variable spends manually.",
    tip: "Add your salary as a recurring income entry too. Great for seeing net cash flow."
  },
  "trips": {
    what: "Enter a destination, travel dates, number of people, style (budget/mid/luxury) and budget. Chanakya AI builds a full itinerary with day-by-day plans, estimated costs, visa info and booking tips.",
    example: "Ananya planned a 7-night Bali trip for 2 on a ₹1.2L budget. She entered the details and Chanakya built a full plan — days 1-3 in Ubud, 4-7 in Seminyak, estimated costs per segment, visa-on-arrival info for Indian passport and a tip to book Garuda Indonesia 3 weeks early for ₹8,000 off.",
    tip: "Set the budget lower than your actual limit. AI plans to the number — so you'll always have a buffer."
  },
  "group-expenses": {
    what: "Create a group for a trip or event. Log shared expenses and split them. See a clean summary of who owes whom and by how much, eliminating the 'I think you owe me ₹340?' conversations.",
    example: "6 friends went to Coorg for a weekend. Expenses for stay, petrol, food and booze were paid by different people. By Sunday night, Group Expenses showed: Rahul owes Kiran ₹1,240, Deepak owes Rahul ₹890, net settlements in 3 simple transfers.",
    tip: "Settle in pairs, not rounds. Three transfers is better than six."
  },
  "timeline": {
    what: "A visual chronological record of your life's financial and personal milestones — jobs, homes, travel, achievements, children. Shareable as a beautiful card.",
    example: "Vikram added his career milestones: first job at ₹4.2L in 2018, promotion to ₹8.5L in 2020, first car in 2021, flat booked in 2023. Looking at the timeline he saw his income had doubled in 5 years while expenses had tripled — a realisation that changed his savings rate.",
    tip: "Add financial milestones alongside life ones. The correlation is eye-opening."
  },
  "calendar": {
    what: "A single calendar showing every financial event — EMI due dates, salary credits, goal deadlines, subscription renewals and trip dates. Never be surprised by a debit again.",
    example: "On the 7th of every month, Pooja had 3 EMIs, 2 subscription renewals and a SIP all hitting her account. She didn't know until she saw red on the 7th in Financial Calendar. She staggered her SIP to the 10th and moved one subscription to the 15th. Cash flow crisis solved.",
    tip: "Look at your next 30-day calendar every Sunday. 5 minutes prevents a lot of surprises."
  },
  "when-to-buy": {
    what: "Enter a product category — TV, phone, laptop, AC, fridge. AI tells you the best months to buy based on Indian sale patterns, discount windows and product release cycles.",
    example: "Sunil wanted a 55-inch Samsung TV. When to Buy said: 'Wait. Republic Day sale (Jan 24-27) typically sees 25-35% off Samsung TVs. Current price ₹68,000. Expected: ₹46,000-52,000.' He waited 3 weeks and bought at ₹49,990 — saved ₹18,000.",
    tip: "Electronics bought in Jan (Republic Day), Oct (Dussehra/Navratri) or Nov (Diwali) are almost always cheaper."
  },
  "luxury": {
    what: "Log high-value items — watches, designer bags, jewellery, art, wine — with purchase price and condition. Track current estimated resale value and see total luxury asset worth.",
    example: "Riya bought an Omega Seamaster in 2021 for ₹3.8L. She added it to Luxury Tracker. Two years later the estimated value shows ₹4.4L — a 16% return, better than her FD. It changed how she thought about 'expensive' purchases.",
    tip: "Luxury items that hold value are investments. Track them like one."
  },
  "children": {
    what: "Add each child with their date of birth. Log school fees, medical costs, extracurriculars and milestones. See total spend per child per year and build a cost projection for education.",
    example: "Arun logged his 8-year-old daughter's expenses: school fees ₹1.4L/year, tuition ₹36,000, sports coaching ₹18,000. Total: ₹2.1L/year. Projecting to engineering college at 18, he realised he needed to start a ₹15,000/month education SIP immediately.",
    tip: "The earlier you log child expenses, the more accurate your college fund calculation."
  },
  "gifts": {
    what: "Log gifts given and received — amount, occasion, person, item. See total gift spend per year, per person and per occasion. Notice patterns: are you always the generous one?",
    example: "Seema logged gifts for a year: she'd given ₹43,000 in gifts across 12 occasions. Received: ₹11,000. The imbalance across a few relationships made her rethink those friendships — not with bitterness, just clarity.",
    tip: "Set a personal gift budget per occasion before the season. Diwali gifts alone can spiral."
  },
  "events": {
    what: "Add any event — wedding, birthday, pooja, festival, corporate function. Set a budget, track actual costs against it, log the guest count and venue. The AI planner generates a full plan: suggested menu (veg + non-veg), a ready-to-send WhatsApp invite, catering checklist, budget breakdown by category and a week-by-week reminder timeline.",
    example: "Radhika was planning her brother's wedding reception for 350 guests with a ₹8L budget. She added the event and hit 'AI Plan'. In seconds she had: a complete North Indian menu, a WhatsApp invite she copied directly, a catering checklist with 12 items and timing, and a budget breakdown showing venue at 35%, catering at 40%, decor at 15%, photography at 10%. She shared the plan with her parents on the spot.",
    tip: "Add the event 3-6 months out and check the reminder timeline first. Missing the venue booking window is the single most expensive mistake in Indian event planning."
  },
  "family": {
    what: "Add family members to your account. They can view a shared dashboard or you can see a combined view of household income, expenses and savings — useful for couples and joint families.",
    example: "Nandini and her husband both earn. They had no idea of combined household cash flow. After linking in Family, they saw: combined income ₹1.98L, combined expenses ₹1.41L, savings rate 28.8%. For the first time they had a shared financial picture.",
    tip: "Even if only one person manages finances, visibility for both builds trust and avoids surprises."
  },
  "upi-parser": {
    what: "Paste all your bank/UPI SMS messages in one go. Budget Mantra reads every transaction — amount, merchant, UPI app, date — and lets you review and import them to your budget with a single tap.",
    example: "Rohit had 3 months of unlogged expenses. He opened WhatsApp/Messages, copied his HDFC and PhonePe SMS thread, pasted 180 messages. The importer found 143 UPI transactions, auto-tagged 89 of them to the right category, and Rohit imported them all in under 3 minutes. Three months of data — done.",
    tip: "Run this monthly on the 1st. Copy the previous month's SMS in one go — never fall behind on logging again."
  },
  "income": {
    what: "Log every income source — salary, freelance projects, rental income, dividends, interest and anything else. See a monthly breakdown by type and track trends over time.",
    example: "Ravi had a ₹95,000 salary, a ₹12,000 freelance project in February and ₹3,800 in dividend income. After logging them in Income Tracker, his Budget Manager showed a savings rate of 34% for February — the highest ever. He'd been underestimating his income all along.",
    tip: "Log freelance and one-time income separately from salary. It reveals your true earning potential beyond your job."
  },
  "fire": {
    what: "Enter your current savings, monthly savings rate, monthly expenses and expected retirement age. The FIRE Calculator tells you your target corpus, how many years to reach it and what you can change to retire earlier.",
    example: "Akash, 29, earns ₹1.2L/month and saves ₹35,000. Monthly expenses ₹55,000. FIRE Calculator: target corpus ₹2.75Cr, on track to hit it at age 52. But if he increases savings to ₹50,000/month, he hits it at 46 — 6 years earlier. That one number changed his priorities.",
    tip: "Run the calculator with your actual numbers, not aspirational ones. The output is only useful if the input is honest."
  },
};

const CATEGORIES = [
  { id: "all",     label: "All",            emoji: "🌟" },
  { id: "savings", label: "Savings",        emoji: "💰" },
  { id: "assets",  label: "Assets",         emoji: "🪙" },
  { id: "credit",  label: "Credit & Loans", emoji: "💳" },
  { id: "life",    label: "Life & Travel",  emoji: "✈️" },
  { id: "family",  label: "Family",         emoji: "🎁" },
  { id: "tools",   label: "Tools",          emoji: "✨" },
];

const ls = {
  get: (k, def = []) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// ── Helper: extract a single hex-like color from a Tailwind gradient class ───
function gradientToRgb(colorClass) {
  const map = {
    "from-emerald-400": "52,211,153", "from-blue-400": "96,165,250",
    "from-emerald-500": "16,185,129", "from-yellow-400": "251,191,36",
    "from-slate-400":   "148,163,184","from-violet-400": "167,139,250",
    "from-rose-400":    "251,113,133","from-cyan-400":   "34,211,238",
    "from-teal-400":    "45,212,191", "from-sky-400":    "56,189,248",
    "from-indigo-400":  "129,140,248","from-pink-400":   "244,114,182",
    "from-orange-400":  "251,146,60", "from-emerald-400":"52,211,153",
    "from-stone-400":   "168,162,158","from-pink-300":   "249,168,212",
    "from-red-400":     "248,113,113","from-amber-400":  "251,191,36",
    "from-orange-500":  "249,115,22", "from-blue-400":   "96,165,250",
  };
  const key = colorClass.split(" ")[0];
  return map[key] || "251,146,60";
}

// ── Live preview widget ───────────────────────────────────────────────────────
const PREVIEW_FEATURES = FEATURE_CATALOG.filter(f =>
  ["budget","savings-goals","trips","gold","credit-cards","events","fire","investments","when-to-buy","timeline"].includes(f.id)
);

function PlaybookLivePreview() {
  const [idx, setIdx]       = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % PREVIEW_FEATURES.length);
        setVisible(true);
      }, 300);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const feat = PREVIEW_FEATURES[idx];
  const rgb  = gradientToRgb(feat.color);

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-xl border border-white/10"
      style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(12px)" }}>
      {/* header */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-white/10">
        <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Preview
        </span>
        <span className="text-[10px] text-white/50 font-medium">Auto-cycling</span>
      </div>

      {/* card body */}
      <div className="px-3.5 py-3"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)", transition: "opacity 0.3s ease, transform 0.3s ease" }}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: `rgba(${rgb},0.35)`, border: `1px solid rgba(${rgb},0.4)` }}>
            {feat.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-sm font-bold text-white leading-tight">{feat.label}</p>
              {feat.pro && (
                <span className="text-[9px] font-bold text-white/60 bg-white/10 px-1.5 py-0.5 rounded-full">Pro</span>
              )}
            </div>
            <p className="text-xs text-white/70 leading-snug">{feat.tagline}</p>
          </div>
        </div>

        {/* mini detail from CHANAKYA_EXAMPLES tip */}
        {CHANAKYA_EXAMPLES[feat.id]?.tip && (
          <div className="mt-2.5 px-2.5 py-2 rounded-xl bg-white/10 border border-white/10">
            <p className="text-[10px] text-white/70 leading-relaxed">
              <span className="text-white/50 font-bold mr-1">💡</span>
              {CHANAKYA_EXAMPLES[feat.id].tip}
            </p>
          </div>
        )}
      </div>

      {/* dots */}
      <div className="flex items-center justify-center gap-1 pb-3">
        {PREVIEW_FEATURES.map((_, i) => (
          <button key={i} onClick={() => { setVisible(false); setTimeout(() => { setIdx(i); setVisible(true); }, 200); }}
            className="rounded-full transition-all duration-300"
            style={{ width: i === idx ? 14 : 6, height: 6, background: i === idx ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)" }} />
        ))}
      </div>
    </div>
  );
}

export default function Playbook() {
  const { user } = useAuth();
  const isPro = !!user?.is_pro;
  const { triggerUpgrade } = useUpgrade();

  const [pinned, setPinned]     = useState(() => ls.get("bm_pinned_features"));
  const [hidden, setHidden]     = useState(() => ls.get("bm_hidden_features"));
  const [pendingHide, setPendingHide] = useState(null); // feature id waiting for hide confirm
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("all");
  const [aiPanel, setAiPanel] = useState(null); // feature id
  const searchRef = useRef(null);

  // Inject keyframes once
  useEffect(() => {
    const id = "bm-fade-up-style";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = `
        @keyframes bm-fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bm-orb-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => { ls.set("bm_pinned_features", pinned); window.dispatchEvent(new Event("bm:features-updated")); }, [pinned]);
  useEffect(() => { ls.set("bm_hidden_features", hidden); window.dispatchEvent(new Event("bm:features-updated")); }, [hidden]);

  const togglePin  = (id) => setPinned(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const confirmHide = (id) => {
    // If already hidden, restore immediately (no confirmation needed)
    if (hidden.includes(id)) {
      setHidden(h => h.filter(x => x !== id));
    } else {
      setPendingHide(id);
    }
  };

  const doHide = () => {
    if (!pendingHide) return;
    setHidden(h => [...h, pendingHide]);
    setPinned(p => p.filter(x => x !== pendingHide));
    setPendingHide(null);
  };

  const visible = FEATURE_CATALOG.filter(f => {
    if (category !== "all" && f.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return f.label.toLowerCase().includes(q) || f.tagline.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const pinnedFeats = FEATURE_CATALOG.filter(f => pinned.includes(f.id));
  const aiFeature   = aiPanel ? FEATURE_CATALOG.find(f => f.id === aiPanel) : null;
  const aiContent   = aiPanel ? CHANAKYA_EXAMPLES[aiPanel] : null;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #fef9f4 0%, #fdf6ee 50%, #faf4ef 100%)" }}>
      <Navigation />

      {/* Hero */}
      <div className="relative overflow-hidden px-4 pt-8 pb-6 lg:pt-12 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #c2410c 0%, #ea580c 40%, #f97316 70%, #fb923c 100%)" }}>
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-8 w-32 h-32 bg-yellow-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10 lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
          {/* Left — title + search */}
          <div>
            <p className="text-orange-200 text-xs font-bold uppercase tracking-widest mb-1">📖 Budget Mantra Playbook</p>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white font-['Outfit'] mb-1.5">
              Discover every feature.
            </h1>
            <p className="text-orange-100 text-sm max-w-lg leading-relaxed">
              {FEATURE_CATALOG.length} features — pin to quick access, hide from nav to keep it clean. Ask Chanakya what anything does.
              {hidden.length > 0 && <span className="ml-1 text-orange-300 font-semibold">{hidden.length} hidden from nav.</span>}
            </p>

            {/* Search */}
            <div className="mt-4 relative max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-300 pointer-events-none" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search features…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/20 border border-white/30 text-white placeholder-orange-200 text-sm font-medium outline-none focus:bg-white/30 transition-colors"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-200 hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Right — live preview (desktop only) */}
          <div className="hidden lg:block">
            <PlaybookLivePreview />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 pb-28 lg:pb-10">

        {/* Category pills + hide toggle */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-5">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${
                category === cat.id
                  ? "bg-orange-500 text-white shadow-sm shadow-orange-500/30"
                  : "bg-white border border-stone-200 text-stone-600 hover:border-orange-300 hover:text-orange-600 shadow-sm"
              }`}>
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        {/* Pinned row */}
        {!search && category === "all" && pinnedFeats.length > 0 && (
          <div className="mb-6 p-4 bg-white border border-orange-100 rounded-2xl shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2.5">⭐ Pinned — shows at top of More menu</p>
            <div className="flex flex-wrap gap-2">
              {pinnedFeats.map(f => (
                <Link key={f.id} to={f.to}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-xl text-sm font-semibold text-orange-700 hover:bg-orange-100 transition-colors">
                  {f.emoji} {f.label}
                </Link>
              ))}
            </div>
          </div>
        )}


        {/* No results */}
        {visible.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-stone-500 font-medium">No features match "{search}"</p>
            <button onClick={() => setSearch("")} className="mt-3 text-orange-500 text-sm font-semibold hover:underline">Clear search</button>
          </div>
        )}

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {visible.map((feat, i) => {
            const isPinned  = pinned.includes(feat.id);
            const isHidden  = hidden.includes(feat.id);
            const locked    = feat.pro && !isPro;
            const rgb       = gradientToRgb(feat.color);
            const catLabel  = CATEGORIES.find(c => c.id === feat.category)?.label || feat.category;

            return (
              <div key={feat.id}
                className="rounded-2xl border border-stone-200 flex flex-col overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 shadow-sm relative"
                style={{
                  background: `linear-gradient(145deg, rgba(${rgb},0.03) 0%, #ffffff 40%, #fdfaf7 100%)`,
                  animationDelay: `${i * 40}ms`,
                  animation: "bm-fade-up 0.4s ease both",
                }}>

                {/* Colour accent bar */}
                <div className={`h-1 bg-gradient-to-r ${feat.color}`} />

                <div className="p-4 flex flex-col gap-3 flex-1">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    {/* Larger emoji icon with drop-shadow */}
                    <div
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feat.color} flex items-center justify-center text-2xl shrink-0`}
                      style={{
                        filter: `drop-shadow(0 4px 8px rgba(${rgb},0.35))`,
                        animation: `bm-orb-float ${2.5 + i * 0.15}s ease-in-out infinite`,
                        animationDelay: feat.anim,
                      }}>
                      {feat.emoji}
                    </div>

                    {/* Top-right: category pill + lock */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span
                        className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                        style={{ background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})` }}>
                        {catLabel}
                      </span>
                      {locked && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 bg-violet-100 text-violet-500 rounded-full">
                          <Lock size={8} /> Pro
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Text */}
                  <div>
                    <p className="font-bold text-stone-800 text-sm leading-tight">{feat.label}</p>
                    <p className="text-sm text-orange-600 font-bold mt-0.5 leading-tight">{feat.tagline}</p>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed flex-1">{feat.desc}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-stone-100">
                    <button onClick={() => setAiPanel(feat.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-orange-50 text-orange-700 text-[11px] font-semibold hover:bg-orange-100 transition-colors">
                      <Bot size={11} /> Ask Chanakya
                    </button>
                    {locked ? (
                      <button onClick={triggerUpgrade}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-violet-50 text-violet-600 text-[11px] font-semibold hover:bg-violet-100 transition-colors ml-auto">
                        <Lock size={11} /> Unlock
                      </button>
                    ) : (
                      <Link to={feat.to}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 text-stone-600 text-[11px] font-semibold hover:bg-stone-200 transition-colors ml-auto">
                        Open <ExternalLink size={10} />
                      </Link>
                    )}
                    <button onClick={() => togglePin(feat.id)} disabled={isHidden}
                      className={`hidden sm:inline-flex p-1.5 rounded-xl transition-all disabled:opacity-30 ${
                        isPinned ? "bg-orange-100 text-orange-600" : "bg-stone-100 text-stone-400 hover:bg-orange-50 hover:text-orange-500"
                      }`} title={isPinned ? "Unpin from More menu" : "Pin to More menu"}>
                      <Star size={13} className={isPinned ? "fill-orange-500 text-orange-500" : ""} />
                    </button>
                    <button onClick={() => confirmHide(feat.id)}
                      className={`hidden sm:inline-flex p-1.5 rounded-xl transition-all ${
                        isHidden ? "bg-red-50 text-red-400 hover:bg-orange-50 hover:text-orange-500" : "bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600"
                      }`} title={isHidden ? "Hidden from nav — click to restore" : "Visible in nav — click to hide"}>
                      {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </div>

      {/* Ask Chanakya Panel */}
      {aiPanel && aiContent && aiFeature && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm" onClick={() => setAiPanel(null)} />
          <div className="fixed inset-x-0 bottom-0 z-[301] lg:inset-auto lg:right-6 lg:bottom-6 lg:w-[400px] bg-white rounded-t-3xl lg:rounded-3xl shadow-2xl flex flex-col max-h-[80vh] lg:max-h-[85vh] overflow-hidden">

            {/* Panel header */}
            <div className="relative overflow-hidden rounded-t-3xl lg:rounded-t-3xl shrink-0"
              style={{ background: "linear-gradient(135deg, #c2410c, #ea580c, #f97316)" }}>
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
              <div className="relative flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${aiFeature.color} flex items-center justify-center text-lg shadow-md shrink-0`}>
                    {aiFeature.emoji}
                  </div>
                  <div>
                    <p className="text-[10px] text-orange-200 font-bold uppercase tracking-widest">Chanakya explains</p>
                    <p className="font-extrabold text-white text-base font-['Outfit']">{aiFeature.label}</p>
                  </div>
                </div>
                <button onClick={() => setAiPanel(null)} className="p-1.5 text-white/60 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* What it does */}
              <div className="bg-stone-50 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">What it does</p>
                <p className="text-sm text-stone-700 leading-relaxed">{aiContent.what}</p>
              </div>

              {/* Example */}
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1.5">📖 Real example</p>
                <p className="text-sm text-stone-700 leading-relaxed">{aiContent.example}</p>
              </div>

              {/* Tip */}
              <div className="flex gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <span className="text-xl shrink-0">💡</span>
                <div>
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Chanakya's tip</p>
                  <p className="text-sm text-stone-700 leading-relaxed">{aiContent.tip}</p>
                </div>
              </div>
            </div>

            {/* Panel footer */}
            <div className="shrink-0 px-5 pb-6 pt-3 border-t border-stone-100">
              {(aiFeature.pro && !isPro) ? (
                <button onClick={() => { setAiPanel(null); triggerUpgrade(); }}
                  className="w-full h-11 rounded-2xl text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
                  <Lock size={13} className="inline mr-2" />Unlock Pro to use {aiFeature.label}
                </button>
              ) : (
                <Link to={aiFeature.to} onClick={() => setAiPanel(null)}
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-2xl text-sm font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #c2410c, #ea580c)" }}>
                  Open {aiFeature.label} <ChevronRight size={15} />
                </Link>
              )}
            </div>
          </div>
        </>
      )}

      {/* Hide confirmation modal */}
      {pendingHide && (() => {
        const feat = FEATURE_CATALOG.find(f => f.id === pendingHide);
        return (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${feat?.color || 'from-stone-400 to-stone-500'} flex items-center justify-center text-xl shrink-0`}>
                  {feat?.emoji}
                </div>
                <div>
                  <p className="font-bold text-stone-900 text-base">{feat?.label}</p>
                  <p className="text-xs text-stone-500">{feat?.tagline}</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-sm font-semibold text-amber-800 mb-1">Hide from nav bar?</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  This feature will no longer appear in the More menu. You can restore it anytime from Playbook.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPendingHide(null)}
                  className="flex-1 py-2.5 border border-stone-200 rounded-xl text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-colors">
                  Cancel
                </button>
                <button onClick={doHide}
                  className="flex-1 py-2.5 bg-stone-800 hover:bg-stone-900 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5">
                  <EyeOff size={14} /> Hide from Nav
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
