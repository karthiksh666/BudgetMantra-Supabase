import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Navigation from "@/components/Navigation";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useUpgrade } from "@/context/AuthContext";
import { API } from "@/App";
import axios from "axios";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  Lock, Star, ChevronRight, Sparkles, Search, X, Bot,
  ExternalLink, EyeOff, Eye, Play, Calculator, TrendingUp,
  Zap, ArrowRight,
} from "lucide-react";

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

// ── Calculator tools (matching mobile) ───────────────────────────────────────
const TOOL_SECTIONS = [
  {
    title: "Invest & Grow", emoji: "📈",
    tools: [
      { id: "sip",       icon: "📈", title: "SIP Calculator",    sub: "Grow wealth over time",               color: "#10b981", bg: "bg-emerald-50",  to: "/fire" },
      { id: "planner",   icon: "🥧", title: "Invest X",         sub: "Enter amount, get allocation",        color: "#059669", bg: "bg-emerald-50",  to: "/investment-advisor" },
      { id: "stock",     icon: "📊", title: "Stock Analyzer",    sub: "Chanakya's take on any stock",        color: "#3b82f6", bg: "bg-blue-50",     to: "/chat" },
      { id: "gold",      icon: "🥇", title: "Gold Tracker",      sub: "Live gold price & holdings",          color: "#d97706", bg: "bg-amber-50",    to: "/gold" },
    ],
  },
  {
    title: "Safe & Secure", emoji: "🛡️",
    tools: [
      { id: "ppf",       icon: "🛡️", title: "PPF Calculator",   sub: "15-year tax-free compound",           color: "#0d9959", bg: "bg-emerald-50",  to: "/fire" },
      { id: "fd",        icon: "🔒", title: "FD Calculator",    sub: "Fixed deposit maturity",              color: "#6366f1", bg: "bg-indigo-50",   to: "/fire" },
      { id: "rd",        icon: "🔄", title: "RD Calculator",    sub: "Recurring deposit maturity",          color: "#0891b2", bg: "bg-cyan-50",     to: "/fire" },
      { id: "epf",       icon: "🏛️", title: "EPF Calculator",   sub: "Provident fund growth",               color: "#0891b2", bg: "bg-cyan-50",     to: "/fire" },
    ],
  },
  {
    title: "Tax & Salary", emoji: "🧾",
    tools: [
      { id: "salary",    icon: "💵", title: "In-Hand Salary",   sub: "CTC to monthly take-home",            color: "#16b96e", bg: "bg-emerald-50",  to: "/income" },
      { id: "tax",       icon: "📄", title: "Income Tax",       sub: "Old vs new regime FY 25-26",          color: "#be123c", bg: "bg-rose-50",     to: "/fire" },
    ],
  },
  {
    title: "Plan & Compare", emoji: "🏠",
    tools: [
      { id: "emi-calc",  icon: "🧮", title: "EMI Calculator",   sub: "What will a new loan cost?",          color: "#6366f1", bg: "bg-indigo-50",   to: "/emis" },
      { id: "buy-rent",  icon: "🏠", title: "Buy vs Rent",      sub: "Is buying always smarter?",           color: "#3b82f6", bg: "bg-blue-50",     to: "/chat" },
      { id: "fire",      icon: "🔥", title: "FIRE Calculator",  sub: "When can you retire early?",          color: "#f43f5e", bg: "bg-rose-50",     to: "/fire" },
      { id: "lifetime",  icon: "👛", title: "Lifetime Earnings", sub: "How much will you earn?",             color: "#0891b2", bg: "bg-cyan-50",     to: "/lifetime-earnings" },
    ],
  },
  {
    title: "Family", emoji: "👨‍👩‍👧",
    tools: [
      { id: "event",     icon: "🎊", title: "Event Planner",    sub: "Wedding, party budgets",              color: "#ec4899", bg: "bg-pink-50",     to: "/events" },
      { id: "gifts",     icon: "🎁", title: "Celebrations",     sub: "Track gifts & occasions",             color: "#ef4444", bg: "bg-red-50",      to: "/gifts" },
      { id: "children",  icon: "👶", title: "Children",         sub: "Education & milestone costs",         color: "#f472b6", bg: "bg-pink-50",     to: "/children" },
    ],
  },
];

const TOOLS_FLAT = TOOL_SECTIONS.flatMap(s => s.tools);

const TOOL_FILTER_CHIPS = [
  { id: "all",           label: "All" },
  { id: "Invest & Grow", label: "Invest & Grow" },
  { id: "Safe & Secure", label: "Safe & Secure" },
  { id: "Tax & Salary",  label: "Tax & Salary" },
  { id: "Plan & Compare",label: "Plan & Compare" },
  { id: "Family",        label: "Family" },
];

// ── Feature catalog categories ───────────────────────────────────────────────
const CATEGORIES = [
  { id: "all",     label: "All",            emoji: "🌟" },
  { id: "savings", label: "Savings",        emoji: "💰" },
  { id: "assets",  label: "Assets",         emoji: "🪙" },
  { id: "credit",  label: "Credit & Loans", emoji: "💳" },
  { id: "life",    label: "Life & Travel",  emoji: "✈️" },
  { id: "family",  label: "Family",         emoji: "🎁" },
  { id: "tools",   label: "Tools",          emoji: "✨" },
];

const PIE_COLORS = ["#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#f43f5e", "#eab308", "#0891b2", "#ec4899"];

const ls = {
  get: (k, def = []) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtAmt(n) {
  if (n == null || isNaN(n)) return "₹0";
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function buildMonthPills() {
  const pills = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    pills.push({
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      label: d.toLocaleString("en-IN", { month: "short" }) + (d.getFullYear() !== now.getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ""),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  return pills;
}

function gradientToRgb(colorClass) {
  const map = {
    "from-emerald-400": "52,211,153", "from-blue-400": "96,165,250",
    "from-emerald-500": "16,185,129", "from-yellow-400": "251,191,36",
    "from-slate-400":   "148,163,184","from-violet-400": "167,139,250",
    "from-rose-400":    "251,113,133","from-cyan-400":   "34,211,238",
    "from-teal-400":    "45,212,191", "from-sky-400":    "56,189,248",
    "from-indigo-400":  "129,140,248","from-pink-400":   "244,114,182",
    "from-orange-400":  "251,146,60", "from-stone-400":  "168,162,158",
    "from-pink-300":    "249,168,212","from-red-400":    "248,113,113",
    "from-amber-400":   "251,191,36", "from-orange-500": "249,115,22",
  };
  const key = colorClass.split(" ")[0];
  return map[key] || "251,146,60";
}

// ── Custom Tooltip for PieChart ──────────────────────────────────────────────
function CustomPieTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0];
  return (
    <div className="bg-stone-900 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-lg">
      {d.name}: {fmtAmt(d.value)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRENDS TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function TrendsTab() {
  const { user } = useAuth();
  const token = localStorage.getItem("token");
  const navigate = useNavigate();
  const ALL_PILLS = useMemo(() => buildMonthPills(), []);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [activePills, setActivePills] = useState(ALL_PILLS);

  const authHeader = useMemo(() => ({
    headers: { Authorization: `Bearer ${token}` },
  }), [token]);

  const fetchCategories = useCallback(async () => {
    const res = await axios.get(`${API}/categories`, authHeader);
    return res.data?.categories ?? res.data ?? [];
  }, [authHeader]);

  const fetchExpenses = useCallback(async (month, year) => {
    const res = await axios.get(`${API}/transactions?month=${month}&year=${year}&type=expense`, authHeader);
    return res.data?.transactions ?? res.data ?? [];
  }, [authHeader]);

  // Initial load
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cats, txns] = await Promise.all([
          fetchCategories(),
          fetchExpenses(ALL_PILLS[0].month, ALL_PILLS[0].year),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setTransactions(txns);

        // Find which months have data
        const monthChecks = await Promise.all(
          ALL_PILLS.map(pill =>
            fetchExpenses(pill.month, pill.year)
              .then(t => ({ ...pill, hasData: t.reduce((s, x) => s + (x.amount || 0), 0) > 0 }))
              .catch(() => ({ ...pill, hasData: false }))
          )
        );
        const withData = monthChecks.filter(p => p.hasData);
        setActivePills(withData.length > 0 ? withData : [ALL_PILLS[0]]);
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Month change
  useEffect(() => {
    if (!token || loading) return;
    const pill = activePills[selectedIdx];
    if (!pill) return;
    let cancelled = false;
    (async () => {
      setLoadingMonth(true);
      try {
        const txns = await fetchExpenses(pill.month, pill.year);
        if (!cancelled) setTransactions(txns);
      } catch {}
      finally { if (!cancelled) setLoadingMonth(false); }
    })();
    return () => { cancelled = true; };
  }, [selectedIdx]);

  // Derived data
  const spendByCategory = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const key = t.category_id ?? "__none__";
      map[key] = (map[key] ?? 0) + (t.amount || 0);
    });
    return map;
  }, [transactions]);

  const categoryRows = useMemo(() => {
    const catMap = new Map(categories.map(c => [c.id, c]));
    const rows = [];
    categories.forEach(cat => {
      const budget = cat.budget_limit ?? cat.allocated_amount ?? 0;
      const spent = spendByCategory[cat.id] ?? 0;
      if (budget > 0 || spent > 0) {
        rows.push({
          id: cat.id, name: cat.name, emoji: cat.emoji ?? "",
          spent, budget,
          pct: budget > 0 ? Math.round((spent / budget) * 100) : 100,
          isOver: budget > 0 && spent > budget,
        });
      }
    });
    rows.sort((a, b) => b.spent - a.spent);
    return rows;
  }, [categories, spendByCategory]);

  const totalBudget = useMemo(() => categories.reduce((s, c) => s + (c.budget_limit ?? c.allocated_amount ?? 0), 0), [categories]);
  const totalSpent = useMemo(() => transactions.reduce((s, t) => s + (t.amount || 0), 0), [transactions]);

  const pieData = useMemo(() =>
    categoryRows.slice(0, 8).map((r, i) => ({
      name: r.name, value: r.spent, color: PIE_COLORS[i % PIE_COLORS.length],
    })),
  [categoryRows]);

  const topTransactions = useMemo(() =>
    [...transactions].sort((a, b) => b.amount - a.amount).slice(0, 3),
  [transactions]);

  const catNameMap = useMemo(() =>
    Object.fromEntries(categories.map(c => [c.id, c.name])),
  [categories]);

  // Chanakya's Take insights
  const insights = useMemo(() => {
    const items = [];
    if (totalBudget > 0) {
      const usedPct = Math.round((totalSpent / totalBudget) * 100);
      if (usedPct > 100) {
        items.push({ emoji: "🔴", title: `Over budget by ${fmtAmt(totalSpent - totalBudget)}`, detail: `You've used ${usedPct}% of your total budget. Time to tighten up.`, level: "warn", askQ: `I'm over budget by ₹${totalSpent - totalBudget} this month. How can I cut back?` });
      } else if (usedPct > 80) {
        items.push({ emoji: "🟡", title: `${usedPct}% budget used`, detail: `${fmtAmt(totalBudget - totalSpent)} left. Be careful with non-essential spending.`, level: "warn", askQ: `I've used ${usedPct}% of my budget. What should I watch out for?` });
      } else {
        items.push({ emoji: "✅", title: `${usedPct}% budget used — on track`, detail: `${fmtAmt(totalBudget - totalSpent)} remaining. You're doing well this month.`, level: "good", askQ: `I'm on track with my budget. What's the best use of my surplus?` });
      }
    }

    const overCats = categoryRows.filter(r => r.isOver).slice(0, 3);
    overCats.forEach(cat => {
      const over = cat.spent - cat.budget;
      items.push({
        emoji: "⚠️", title: `${cat.name}: ${fmtAmt(over)} over budget`,
        detail: `Spent ${fmtAmt(cat.spent)} against ${fmtAmt(cat.budget)} budget (${cat.pct}%).`,
        level: "warn", askQ: `I overspent on ${cat.name} by ₹${over}. How can I reduce this next month?`,
      });
    });

    const topCat = categoryRows[0];
    if (topCat && !overCats.find(c => c.id === topCat.id) && topCat.spent > 0) {
      const pctOfTotal = totalSpent > 0 ? Math.round((topCat.spent / totalSpent) * 100) : 0;
      items.push({
        emoji: "📊", title: `${topCat.name} is your top spend (${pctOfTotal}%)`,
        detail: `${fmtAmt(topCat.spent)} this month. ${pctOfTotal > 30 ? "This one category is eating a big chunk." : "Looks proportionate."}`,
        level: pctOfTotal > 40 ? "warn" : "info",
        askQ: `${topCat.name} is ${pctOfTotal}% of my spending. Is that normal?`,
      });
    }

    if (topTransactions.length > 0) {
      const biggest = topTransactions[0];
      items.push({
        emoji: "💸", title: `Biggest expense: ${fmtAmt(biggest.amount)}`,
        detail: `"${biggest.description || "Transaction"}" — ${biggest.category_id ? (catNameMap[biggest.category_id] ?? "") : "uncategorised"}`,
        level: "info", askQ: `My biggest expense was ₹${biggest.amount} on "${biggest.description}". Was it a good decision?`,
      });
    }

    return items;
  }, [categoryRows, totalBudget, totalSpent, topTransactions, catNameMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-stone-400 font-medium">Loading trends...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Month selector pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {activePills.map((pill, idx) => (
          <button key={pill.key} onClick={() => setSelectedIdx(idx)}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${
              selectedIdx === idx
                ? "bg-orange-500 text-white shadow-sm shadow-orange-500/30"
                : "bg-white border border-stone-200 text-stone-600 hover:border-orange-300"
            }`}>
            {pill.label}
          </button>
        ))}
      </div>

      {loadingMonth && (
        <div className="flex items-center gap-2 text-sm text-stone-400">
          <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          Updating...
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Budget</p>
          <p className="text-lg font-extrabold text-stone-800">{fmtAmt(totalBudget)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Spent</p>
          <p className="text-lg font-extrabold text-orange-500">{fmtAmt(totalSpent)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Remaining</p>
          <p className={`text-lg font-extrabold ${totalBudget - totalSpent >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {totalBudget - totalSpent < 0 ? "-" : ""}{fmtAmt(Math.abs(totalBudget - totalSpent))}
          </p>
        </div>
      </div>

      {/* Pie chart + legend */}
      {pieData.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-4">Category Breakdown</p>
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="w-full max-w-[260px] aspect-square">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%"
                    paddingAngle={2} dataKey="value" nameKey="name" stroke="none">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 w-full space-y-2">
              {pieData.map((entry, i) => {
                const pct = totalSpent > 0 ? Math.round((entry.value / totalSpent) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                    <span className="flex-1 text-sm text-stone-700 font-medium truncate">{entry.name}</span>
                    <span className="text-sm font-bold text-stone-800">{fmtAmt(entry.value)}</span>
                    <span className="text-xs text-stone-400 w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Category bars */}
      {categoryRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-2">Budget vs Actual</p>
          {categoryRows.slice(0, 8).map((row, i) => (
            <div key={row.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-stone-700">{row.emoji} {row.name}</span>
                <span className={`text-xs font-bold ${row.isOver ? "text-red-500" : "text-stone-500"}`}>
                  {fmtAmt(row.spent)} / {fmtAmt(row.budget)}
                </span>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${row.isOver ? "bg-red-400" : "bg-orange-400"}`}
                  style={{ width: `${Math.min(row.pct, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chanakya's Take */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Chanakya's Take</p>
          </div>
          {insights.map((insight, i) => (
            <div key={i} className={`bg-white rounded-2xl border shadow-sm p-4 ${
              insight.level === "warn" ? "border-amber-200" : insight.level === "good" ? "border-emerald-200" : "border-stone-100"
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">{insight.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-800 mb-0.5">{insight.title}</p>
                  <p className="text-xs text-stone-500 leading-relaxed">{insight.detail}</p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Link to={`/chatbot`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 text-white text-[11px] font-bold hover:bg-stone-800 transition-colors">
                  <Bot size={12} /> Ask Chanakya
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {pieData.length === 0 && !loading && (
        <div className="text-center py-12 bg-white rounded-2xl border border-stone-100 shadow-sm">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-stone-500 font-medium mb-1">No spending data for this month</p>
          <p className="text-xs text-stone-400">Add transactions in Budget Manager to see trends here.</p>
          <Link to="/budget" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors">
            Open Budget <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIONS TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function ActionsTab() {
  const { user } = useAuth();
  const token = localStorage.getItem("token");
  const navigate = useNavigate();

  const [scoreData, setScoreData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/financial-score`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setScoreData(res.data);
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const actions = useMemo(() => {
    if (!scoreData?.amounts) return [];
    const items = [];
    const income = scoreData.amounts.monthly_income || 0;
    const expenses = scoreData.amounts.monthly_expenses || 0;
    const emiTotal = scoreData.amounts.total_emi || 0;
    const netSavings = scoreData.amounts.net_savings || 0;
    const savingsRate = scoreData.details?.savings_rate ?? scoreData.savings_ratio ?? 0;
    const emiRatio = scoreData.details?.emi_ratio ?? scoreData.emi_ratio ?? 0;
    const freeCash = Math.max(0, income - expenses - emiTotal);

    if (income <= 0) {
      items.push({
        emoji: "📝", trend: "No income data yet",
        action: "Add your income to get personalized actions.",
        detail: "Go to Income Tracker and add your salary. Chanakya needs this to give you real advice.",
        to: "/income", btnLabel: "Add income", level: "urgent", color: "#ef4444",
      });
      return items;
    }

    // Emergency fund check
    const emergencyMonths = expenses > 0 ? netSavings / expenses : 0;
    if (emergencyMonths < 3) {
      const gap = Math.max(0, expenses * 6 - netSavings);
      items.push({
        emoji: "🚨", trend: `Emergency fund: ${emergencyMonths.toFixed(1)} months`,
        action: "You need at least 6 months of expenses saved.",
        detail: `Gap: ${fmtAmt(gap)}. A ${fmtAmt(Math.round(gap / 6))}/mo RD closes this in 6 months.`,
        to: "/savings-goals", btnLabel: "Set a goal", level: "urgent", color: "#ef4444",
      });
    }

    // EMI burden
    if (emiRatio > 40) {
      items.push({
        emoji: "💳", trend: `EMI burden: ${Math.round(emiRatio)}% of income`,
        action: `Safe limit is 40%. You're at ${Math.round(emiRatio)}%.`,
        detail: `Prepay your highest-rate loan. Even ${fmtAmt(Math.round(freeCash))} extra this month reduces total interest.`,
        to: "/emis", btnLabel: "Review EMIs", level: "urgent", color: "#ef4444",
      });
    } else if (emiRatio > 0) {
      items.push({
        emoji: "✅", trend: `EMI burden: ${Math.round(emiRatio)}% — within safe limits`,
        action: "Your loan payments are manageable.",
        detail: "Consider prepaying to save on interest, or keep investing the surplus.",
        to: "/emis", btnLabel: "View EMIs", level: "opportunity", color: "#10b981",
      });
    }

    // Savings rate
    if (savingsRate < 10) {
      items.push({
        emoji: "📉", trend: `Savings rate: ${Math.round(savingsRate)}%`,
        action: `You need at least 20% to build wealth. You're at ${Math.round(savingsRate)}%.`,
        detail: `Start with the 50/30/20 rule. Even saving ${fmtAmt(Math.round(income * 0.05))} more per month makes a difference.`,
        to: "/fire", btnLabel: "Start a SIP", level: "important", color: "#f59e0b",
      });
    } else if (savingsRate < 20) {
      items.push({
        emoji: "⏳", trend: `Savings rate: ${Math.round(savingsRate)}% — building`,
        action: `Push from ${Math.round(savingsRate)}% to 20% — that's ${fmtAmt(Math.round(income * 0.2 - (income - expenses)))} more per month.`,
        detail: "Review your top spending category and cut 10-15% from it.",
        to: "/budget", btnLabel: "Review spending", level: "important", color: "#f59e0b",
      });
    } else {
      items.push({
        emoji: "💪", trend: `Savings rate: ${Math.round(savingsRate)}% — strong`,
        action: `You're saving ${fmtAmt(income - expenses)}/mo. Invest it.`,
        detail: `A SIP of ${fmtAmt(Math.round((income - expenses) * 0.7))} at 12% grows to ${fmtAmt(Math.round((income - expenses) * 0.7 * 12 * 10 * 1.8))} in 10 years.`,
        to: "/fire", btnLabel: "Calculate SIP", level: "opportunity", color: "#10b981",
      });
    }

    // Free cash opportunity
    if (freeCash > 5000) {
      items.push({
        emoji: "💰", trend: `Free cash: ${fmtAmt(freeCash)}/month`,
        action: "This money is sitting idle. Put it to work.",
        detail: "Use the Investment Advisor to split this across safe + growth instruments based on your goals.",
        to: "/investment-advisor", btnLabel: "Plan investment", level: "opportunity", color: "#3b82f6",
      });
    }

    // Insurance check
    if (emergencyMonths < 6) {
      items.push({
        emoji: "🛡️", trend: "No insurance data found",
        action: "Do you have health + term insurance?",
        detail: "One medical emergency can wipe out years of savings. A 10L health cover costs around 500/mo.",
        to: "/chatbot", btnLabel: "Ask Chanakya", level: "important", color: "#f59e0b",
      });
    }

    const levelOrder = { urgent: 0, important: 1, opportunity: 2 };
    items.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
    return items;
  }, [scoreData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-stone-400 font-medium">Analyzing your finances...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score summary bar */}
      {scoreData && scoreData.score != null && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-extrabold text-white shrink-0 ${
            scoreData.score >= 70 ? "bg-emerald-500" : scoreData.score >= 40 ? "bg-amber-500" : "bg-red-500"
          }`}>
            {scoreData.score}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-stone-800">
              Financial Health: {scoreData.score >= 70 ? "Strong" : scoreData.score >= 40 ? "Building" : "Needs Work"}
            </p>
            <p className="text-xs text-stone-400 mt-0.5">
              Fundamentals {scoreData.breakdown?.fundamentals}/30 · Discipline {scoreData.breakdown?.discipline}/35 · Momentum {scoreData.breakdown?.momentum}/35
            </p>
          </div>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
        <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Your Actions</p>
        <p className="flex-1 text-xs text-stone-400">Based on your spending trends</p>
      </div>

      {/* Action cards */}
      {actions.map((a, i) => (
        <div key={i} className="bg-white rounded-2xl border shadow-sm p-5 relative overflow-hidden"
          style={{ borderColor: a.color + "30", borderLeftWidth: "3px", borderLeftColor: a.color }}>
          {/* Trend signal */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{a.emoji}</span>
            <span className="flex-1 text-xs font-bold" style={{ color: a.color }}>{a.trend}</span>
            <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full"
              style={{ backgroundColor: a.color + "15", color: a.color }}>
              {a.level}
            </span>
          </div>

          <p className="text-sm font-bold text-stone-800 mb-1">{a.action}</p>
          <p className="text-xs text-stone-500 leading-relaxed mb-4">{a.detail}</p>

          <div className="flex items-center gap-2">
            <Link to={a.to}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: a.color }}>
              {a.btnLabel}
            </Link>
            <Link to="/chatbot"
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors shrink-0">
              <Bot size={12} /> Ask Chanakya
            </Link>
          </div>
        </div>
      ))}

      {actions.length === 0 && !loading && (
        <div className="text-center py-12 bg-white rounded-2xl border border-stone-100 shadow-sm">
          <p className="text-3xl mb-3">📝</p>
          <p className="text-stone-500 font-medium mb-1">Add income data to see personalized actions</p>
          <Link to="/income" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors">
            Add Income <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLS TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function ToolsTab({ onOpenAiPanel }) {
  const { user } = useAuth();
  const isPro = !!user?.is_pro;
  const { triggerUpgrade } = useUpgrade();
  const navigate = useNavigate();

  const [toolFilter, setToolFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [featureCategory, setFeatureCategory] = useState("all");
  const [pinned, setPinned] = useState(() => ls.get("bm_pinned_features"));
  const [hidden, setHidden] = useState(() => ls.get("bm_hidden_features"));
  const [pendingHide, setPendingHide] = useState(null);

  useEffect(() => { ls.set("bm_pinned_features", pinned); window.dispatchEvent(new Event("bm:features-updated")); }, [pinned]);
  useEffect(() => { ls.set("bm_hidden_features", hidden); window.dispatchEvent(new Event("bm:features-updated")); }, [hidden]);

  const togglePin = (id) => setPinned(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const confirmHide = (id) => {
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

  // Filter calculator tools
  const filteredTools = toolFilter === "all"
    ? TOOLS_FLAT
    : TOOL_SECTIONS.find(s => s.title === toolFilter)?.tools || [];

  // Filter feature catalog
  const visibleFeatures = FEATURE_CATALOG.filter(f => {
    if (featureCategory !== "all" && f.category !== featureCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return f.label.toLowerCase().includes(q) || f.tagline.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const pinnedFeats = FEATURE_CATALOG.filter(f => pinned.includes(f.id));

  return (
    <div className="space-y-6">
      {/* Calculator tools section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
          <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Calculators</p>
          <p className="flex-1 text-xs text-stone-400">Plug in custom numbers</p>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4">
          {TOOL_FILTER_CHIPS.map(chip => (
            <button key={chip.id} onClick={() => setToolFilter(chip.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                toolFilter === chip.id
                  ? "bg-orange-500 text-white shadow-sm"
                  : "bg-white border border-stone-200 text-stone-600 hover:border-orange-300"
              }`}>
              {chip.label}
            </button>
          ))}
        </div>

        {/* Quick access row */}
        {toolFilter === "all" && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Link to="/emis" className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 hover:bg-indigo-100 transition-colors">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-lg">💳</div>
              <div>
                <p className="text-sm font-bold text-indigo-900">EMIs</p>
                <p className="text-[10px] text-indigo-500 font-medium">Manage loans</p>
              </div>
            </Link>
            <Link to="/investments" className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 hover:bg-emerald-100 transition-colors">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-lg">📊</div>
              <div>
                <p className="text-sm font-bold text-emerald-900">Investments</p>
                <p className="text-[10px] text-emerald-500 font-medium">Portfolio</p>
              </div>
            </Link>
          </div>
        )}

        {/* Calculator grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredTools.map(tool => (
            <Link key={tool.id} to={tool.to}
              className={`${tool.bg} border border-stone-100 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all group`}>
              <div className="text-2xl mb-2">{tool.icon}</div>
              <p className="text-sm font-bold text-stone-800 group-hover:text-stone-900">{tool.title}</p>
              <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">{tool.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Feature catalog section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <p className="text-xs font-bold uppercase tracking-widest text-stone-500">All Features</p>
          <p className="flex-1 text-xs text-stone-400">{FEATURE_CATALOG.length} features</p>
        </div>

        {/* Search */}
        <div className="relative max-w-md mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search features..."
            className="w-full pl-8 pr-4 py-2 rounded-xl bg-white border border-stone-200 text-sm text-stone-700 placeholder-stone-400 outline-none focus:border-orange-300 transition-colors" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-4">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setFeatureCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                featureCategory === cat.id
                  ? "bg-orange-500 text-white shadow-sm"
                  : "bg-white border border-stone-200 text-stone-600 hover:border-orange-300"
              }`}>
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        {/* Pinned row */}
        {!search && featureCategory === "all" && pinnedFeats.length > 0 && (
          <div className="mb-4 p-3 bg-white border border-orange-100 rounded-2xl shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Pinned</p>
            <div className="flex flex-wrap gap-2">
              {pinnedFeats.map(f => (
                <Link key={f.id} to={f.to}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-xl text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors">
                  {f.emoji} {f.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Feature grid */}
        {visibleFeatures.length === 0 && (
          <div className="text-center py-12">
            <p className="text-3xl mb-3">🔍</p>
            <p className="text-stone-500 font-medium">No features match "{search}"</p>
            <button onClick={() => setSearch("")} className="mt-3 text-orange-500 text-sm font-semibold hover:underline">Clear search</button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleFeatures.map((feat, i) => {
            const isPinned = pinned.includes(feat.id);
            const isHidden = hidden.includes(feat.id);
            const locked = feat.pro && !isPro;
            const rgb = gradientToRgb(feat.color);
            const catLabel = CATEGORIES.find(c => c.id === feat.category)?.label || feat.category;

            return (
              <div key={feat.id}
                className="rounded-2xl border border-stone-200 flex flex-col overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 shadow-sm relative"
                style={{ background: `linear-gradient(145deg, rgba(${rgb},0.03) 0%, #ffffff 40%, #fdfaf7 100%)` }}>
                <div className={`h-1 bg-gradient-to-r ${feat.color}`} />
                <div className="p-3.5 flex flex-col gap-2 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feat.color} flex items-center justify-center text-lg shrink-0`}>
                      {feat.emoji}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
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
                  <div>
                    <p className="font-bold text-stone-800 text-sm leading-tight">{feat.label}</p>
                    <p className="text-xs text-orange-600 font-bold mt-0.5">{feat.tagline}</p>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed flex-1">{feat.desc}</p>
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-stone-100">
                    <button onClick={() => onOpenAiPanel(feat.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-50 text-orange-700 text-[10px] font-semibold hover:bg-orange-100 transition-colors">
                      <Bot size={10} /> Ask Chanakya
                    </button>
                    {locked ? (
                      <button onClick={triggerUpgrade}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 text-violet-600 text-[10px] font-semibold hover:bg-violet-100 transition-colors ml-auto">
                        <Lock size={10} /> Unlock
                      </button>
                    ) : (
                      <Link to={feat.to}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 text-stone-600 text-[10px] font-semibold hover:bg-stone-200 transition-colors ml-auto">
                        Open <ExternalLink size={9} />
                      </Link>
                    )}
                    <button onClick={() => togglePin(feat.id)} disabled={isHidden}
                      className={`hidden sm:inline-flex p-1 rounded-lg transition-all disabled:opacity-30 ${
                        isPinned ? "bg-orange-100 text-orange-600" : "bg-stone-100 text-stone-400 hover:bg-orange-50 hover:text-orange-500"
                      }`}>
                      <Star size={11} className={isPinned ? "fill-orange-500 text-orange-500" : ""} />
                    </button>
                    <button onClick={() => confirmHide(feat.id)}
                      className={`hidden sm:inline-flex p-1 rounded-lg transition-all ${
                        isHidden ? "bg-red-50 text-red-400 hover:bg-orange-50 hover:text-orange-500" : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                      }`}>
                      {isHidden ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hide confirmation modal */}
      {pendingHide && (() => {
        const feat = FEATURE_CATALOG.find(f => f.id === pendingHide);
        return (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${feat?.color || "from-stone-400 to-stone-500"} flex items-center justify-center text-xl shrink-0`}>
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
                  This feature will no longer appear in the More menu. You can restore it anytime from here.
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PLAYBOOK COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function Playbook() {
  const { user } = useAuth();
  const isPro = !!user?.is_pro;
  const { triggerUpgrade } = useUpgrade();

  const [activeTab, setActiveTab] = useState("tools");
  const [aiPanel, setAiPanel] = useState(null);

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
      `;
      document.head.appendChild(style);
    }
  }, []);

  const aiFeature = aiPanel ? FEATURE_CATALOG.find(f => f.id === aiPanel) : null;
  const aiContent = aiPanel ? CHANAKYA_EXAMPLES[aiPanel] : null;

  const TABS = [
    { id: "tools",   label: "Tools",   icon: Calculator },
    { id: "trends",  label: "Trends",  icon: TrendingUp },
    { id: "actions", label: "Actions", icon: Zap },
  ];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #fef9f4 0%, #fdf6ee 50%, #faf4ef 100%)" }}>
      <Navigation />

      {/* Hero */}
      <div className="relative overflow-hidden px-4 pt-8 pb-4 lg:pt-12 lg:pb-6"
        style={{ background: "linear-gradient(135deg, #c2410c 0%, #ea580c 40%, #f97316 70%, #fb923c 100%)" }}>
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-8 w-32 h-32 bg-yellow-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="max-w-6xl mx-auto relative z-10">
          <p className="text-orange-200 text-xs font-bold uppercase tracking-widest mb-1">Insights</p>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white font-['Outfit'] mb-1">
            Your money · trends · tools
          </h1>
          <p className="text-orange-100 text-sm max-w-lg leading-relaxed">
            AI-powered insights based on your actual spending data. Track trends, take action, use calculators.
          </p>

          {/* Tab switcher */}
          <div className="mt-4 flex items-center gap-1 bg-white/15 rounded-xl p-1 max-w-sm">
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    active
                      ? "bg-white text-orange-600 shadow-sm"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}>
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 pb-28 lg:pb-10">
        {activeTab === "tools" && <ToolsTab onOpenAiPanel={setAiPanel} />}
        {activeTab === "trends" && <TrendsTab />}
        {activeTab === "actions" && <ActionsTab />}
      </div>

      {/* Ask Chanakya Panel */}
      {aiPanel && aiContent && aiFeature && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm" onClick={() => setAiPanel(null)} />
          <div className="fixed inset-x-0 bottom-0 z-[301] lg:inset-auto lg:right-6 lg:bottom-6 lg:w-[400px] bg-white rounded-t-3xl lg:rounded-3xl shadow-2xl flex flex-col max-h-[80vh] lg:max-h-[85vh] overflow-hidden">
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
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-stone-50 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">What it does</p>
                <p className="text-sm text-stone-700 leading-relaxed">{aiContent.what}</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1.5">Real example</p>
                <p className="text-sm text-stone-700 leading-relaxed">{aiContent.example}</p>
              </div>
              <div className="flex gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <span className="text-xl shrink-0">💡</span>
                <div>
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Chanakya's tip</p>
                  <p className="text-sm text-stone-700 leading-relaxed">{aiContent.tip}</p>
                </div>
              </div>
            </div>
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
    </div>
  );
}
