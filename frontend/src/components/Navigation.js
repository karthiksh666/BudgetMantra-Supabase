import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useUpgrade } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import ProfileDrawer from '@/components/ProfileDrawer';
import FeedbackModal from '@/components/FeedbackModal';
import BugReportModal from '@/components/BugReportModal';
import { useState } from 'react';
import {
  LayoutDashboard, X, CreditCard, Target, ShoppingCart, IndianRupee,
  FileText, Flame, User, TrendingUp, Moon, Sun,
  HandCoins, Plane, Scale, BarChart2, Wallet, LayoutGrid, CalendarDays, Crown, Users, Gift, RefreshCw,
  MessageSquarePlus, Bug, Shield,
} from 'lucide-react';

// ── Primary tabs (always visible) ────────────────────────────────────────────
const TABS = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/income',    label: 'Income',   icon: TrendingUp      },
  { to: '/chatbot',   label: 'Chanakya', icon: IndianRupee     },
  { to: '/budget',    label: 'Expenses', icon: ShoppingCart    },
];

// ── More drawer — grouped ─────────────────────────────────────────────────────
const MORE_GROUPS = [
  {
    label: 'Manage',
    items: [
      { to: '/emis',         label: 'EMIs',        icon: CreditCard, bg: 'bg-indigo-50',  iconBg: 'bg-indigo-100',  iconColor: 'text-indigo-600'  },
      { to: '/savings-goals',label: 'Goals',       icon: Target,     bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
      { to: '/investments',  label: 'Investments', icon: BarChart2,  bg: 'bg-blue-50',    iconBg: 'bg-blue-100',    iconColor: 'text-blue-600',   pro: true },
    ],
  },
  {
    label: 'Owe & Lend',
    items: [
      { to: '/credit-cards', label: 'Credit Cards', icon: CreditCard, bg: 'bg-violet-50', iconBg: 'bg-violet-100', iconColor: 'text-violet-600', pro: true },
      { to: '/hand-loans',   label: 'Hand Loans',   icon: HandCoins,  bg: 'bg-teal-50',   iconBg: 'bg-teal-100',   iconColor: 'text-teal-600',   pro: true },
    ],
  },
  {
    label: 'Together',
    items: [
      { to: '/trips',          label: 'Planning',      icon: Plane,  bg: 'bg-cyan-50',  iconBg: 'bg-cyan-100',  iconColor: 'text-cyan-600',  pro: true },
      { to: '/group-expenses', label: 'Group Spend',   icon: Scale,  bg: 'bg-amber-50', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', pro: true },
      { to: '/circle',         label: 'Family Circle', icon: Users,  bg: 'bg-pink-50',  iconBg: 'bg-pink-100',  iconColor: 'text-pink-600',  pro: true },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/fire',  label: 'FIRE Calc',    icon: Flame,  bg: 'bg-rose-50',  iconBg: 'bg-rose-100',  iconColor: 'text-rose-600'  },
      { to: '/admin', label: 'Admin Portal',  icon: Shield, bg: 'bg-stone-50', iconBg: 'bg-stone-100', iconColor: 'text-stone-600' },
    ],
  },
];

const ALL_MORE = MORE_GROUPS.flatMap(g => g.items);

const Navigation = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout } = useAuth();
  const { triggerUpgrade } = useUpgrade();
  const { dark, toggleDark } = useTheme();
  const [moreOpen,      setMoreOpen]      = useState(false);
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [feedbackOpen,  setFeedbackOpen]  = useState(false);
  const [bugOpen,       setBugOpen]       = useState(false);

  const isActive      = (to) => location.pathname === to;
  const anyMoreActive = ALL_MORE.some(i => location.pathname === i.to);

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <>
      {/* ── Desktop top bar ──────────────────────────────────────────────── */}
      <nav className="hidden lg:flex sticky top-0 z-50 bg-white/95 dark:bg-stone-950/95 backdrop-blur-xl border-b border-stone-100 dark:border-stone-800 items-center px-5 h-14 shadow-sm relative">

        {/* Logo */}
        <div className="shrink-0">
          <Link to="/chatbot" className="flex items-center gap-2 w-fit">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm">
              <Wallet size={14} className="text-white" />
            </div>
            <span className="font-bold text-stone-800 dark:text-stone-100 text-sm tracking-tight">Budget <span className="text-orange-500">Mantra</span></span>
          </Link>
        </div>

        {/* Tabs — absolutely centered so logo/avatar widths don't affect position */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center h-full">
          {TABS.map(t => {
            const active = isActive(t.to);
            return (
              <Link key={t.to} to={t.to}
                className={`relative flex items-center gap-1.5 px-3 h-full text-sm font-semibold transition-colors ${
                  active ? 'text-orange-500' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}>
                {active && <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-orange-500" />}
                <t.icon size={14} />
                {t.label}
              </Link>
            );
          })}

          {/* More */}
          <button onClick={() => setMoreOpen(o => !o)}
            className={`relative flex items-center gap-1.5 px-3 h-full text-sm font-semibold transition-colors ${
              anyMoreActive || moreOpen ? 'text-orange-500' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}>
            {(anyMoreActive || moreOpen) && <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-orange-500" />}
            <LayoutGrid size={14} />
            More
          </button>
        </div>

        {/* Pinned: Calendar + Statement Hub + Avatar */}
        <div className="ml-auto shrink-0 flex items-center gap-1">
          <Link to="/calendar"
            className={`flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-xs font-semibold transition-colors ${
              isActive('/calendar') ? 'bg-orange-100 text-orange-500' : 'text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800'
            }`}>
            <CalendarDays size={13} /> Calendar
          </Link>
          <Link to="/data"
            className={`flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-xs font-semibold transition-colors ${
              isActive('/data') || isActive('/upi-parser') ? 'bg-orange-100 text-orange-500' : 'text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800'
            }`}>
            <FileText size={13} /> Statements
          </Link>
          <button
            onClick={toggleDark}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={() => setProfileOpen(true)}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold shadow-sm ml-1">
            {user?.name?.[0]?.toUpperCase() || <User size={14} />}
          </button>
        </div>
      </nav>

      {/* ── Mobile top bar ────────────────────────────────────────────────── */}
      <div className="lg:hidden sticky top-0 z-50 bg-white/95 dark:bg-stone-950/95 backdrop-blur-xl border-b border-stone-100 dark:border-stone-800 flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <Wallet size={12} className="text-white" />
          </div>
          <span className="font-bold text-stone-800 dark:text-stone-100 text-sm tracking-tight">
            Budget <span className="text-orange-500">Mantra</span>
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={toggleDark} title={dark ? 'Light mode' : 'Dark mode'}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-400 transition-colors">
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <Link to="/calendar" title="Calendar"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isActive('/calendar') ? 'bg-orange-100 text-orange-500' : 'text-stone-400'
            }`}>
            <CalendarDays size={14} />
          </Link>
          <Link to="/data" title="Statements"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isActive('/data') || isActive('/upi-parser') ? 'bg-orange-100 text-orange-500' : 'text-stone-400'
            }`}>
            <FileText size={14} />
          </Link>
          <button onClick={() => setProfileOpen(true)}
            className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-bold ml-0.5">
            {user?.name?.[0]?.toUpperCase() || <User size={12} />}
          </button>
        </div>
      </div>

      {/* ── Mobile bottom tab bar (5 tabs) ───────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-stone-950/95 backdrop-blur-xl border-t border-stone-100 dark:border-stone-800">
        <div className="flex items-center h-[62px] px-1">
          {TABS.map(t => {
            const active = isActive(t.to);
            return (
              <Link key={t.to} to={t.to}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full active:scale-90 transition-transform">
                <div className={`flex items-center justify-center w-10 h-7 rounded-xl transition-all ${
                  active ? 'bg-orange-500 shadow-sm shadow-orange-200' : ''
                }`}>
                  <t.icon size={18} className={active ? 'text-white' : 'text-stone-400'} />
                </div>
                <span className={`text-[9px] font-semibold tracking-tight ${active ? 'text-orange-500' : 'text-stone-400'}`}>
                  {t.label}
                </span>
              </Link>
            );
          })}

          {/* More */}
          <button onClick={() => setMoreOpen(o => !o)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full active:scale-90 transition-transform">
            <div className={`flex items-center justify-center w-10 h-7 rounded-xl transition-all ${
              anyMoreActive ? 'bg-orange-500 shadow-sm shadow-orange-200' : ''
            }`}>
              <LayoutGrid size={18} className={anyMoreActive ? 'text-white' : 'text-stone-400'} />
            </div>
            <span className={`text-[9px] font-semibold tracking-tight ${anyMoreActive ? 'text-orange-500' : 'text-stone-400'}`}>
              More
            </span>
          </button>
        </div>
      </nav>

      {/* ── Bottom spacer ─────────────────────────────────────────────────── */}
      <div className="lg:hidden h-[62px]" />

      {/* ── More drawer ───────────────────────────────────────────────────── */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[201] lg:bottom-auto lg:top-[57px] lg:left-1/2 lg:-translate-x-1/2 lg:w-[26rem] rounded-t-3xl lg:rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-200 lg:slide-in-from-top-2 max-h-[85vh] overflow-y-auto overflow-x-hidden bg-gradient-to-br from-orange-50 to-white dark:from-stone-900 dark:to-stone-900">

            {/* Header — branded orange */}
            <div className="px-5 pt-5 pb-4 bg-gradient-to-r from-orange-500 to-orange-600 rounded-t-3xl lg:rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <Wallet size={17} className="text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-base leading-tight">All Features</p>
                    <p className="text-xs text-orange-100 mt-0.5">Budget Mantra</p>
                  </div>
                </div>
                <button onClick={() => setMoreOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                  <X size={15} className="text-white" />
                </button>
              </div>
            </div>

            {/* Grouped sections */}
            <div className="px-4 pt-4 pb-2 space-y-4">
              {MORE_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 px-1">{group.label}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.items.map(item => {
                      const active = isActive(item.to);
                      const locked = item.pro && !user?.is_pro;
                      const sharedClass = `relative flex flex-col items-center gap-2 p-3 rounded-2xl text-center transition-all active:scale-95 ${
                        active
                          ? 'bg-orange-100 dark:bg-orange-500/20 ring-2 ring-orange-300'
                          : `${item.bg} dark:bg-stone-800 hover:brightness-95 dark:hover:brightness-110`
                      }`;
                      const inner = (
                        <>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            active ? 'bg-orange-500' : item.iconBg
                          }`}>
                            <item.icon size={18} className={active ? 'text-white' : item.iconColor} />
                          </div>
                          <span className={`text-[11px] font-semibold leading-tight ${
                            active ? 'text-orange-600 dark:text-orange-400' : 'text-stone-700 dark:text-stone-200'
                          }`}>{item.label}</span>
                          {locked && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
                              <Crown size={9} className="text-white" />
                            </span>
                          )}
                        </>
                      );
                      return locked ? (
                        <button key={item.to} onClick={() => { setMoreOpen(false); triggerUpgrade(); }}
                          className={sharedClass}>
                          {inner}
                        </button>
                      ) : (
                        <Link key={item.to} to={item.to}
                          onClick={() => setMoreOpen(false)}
                          className={sharedClass}>
                          {inner}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Feedback + Bug report footer */}
            <div className="px-4 pb-5 pt-1 grid grid-cols-2 gap-2 border-t border-stone-100 dark:border-stone-800 mt-1 pt-4">
              <button
                onClick={() => { setMoreOpen(false); setFeedbackOpen(true); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-orange-50 dark:bg-stone-800 hover:bg-orange-100 dark:hover:bg-stone-700 transition-colors"
              >
                <MessageSquarePlus size={15} className="text-orange-500" />
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">Give Feedback</span>
              </button>
              <button
                onClick={() => { setMoreOpen(false); setBugOpen(true); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-red-50 dark:bg-stone-800 hover:bg-red-100 dark:hover:bg-stone-700 transition-colors"
              >
                <Bug size={15} className="text-red-500" />
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">Report a Bug</span>
              </button>
            </div>

          </div>
        </>
      )}

      {/* ── Feedback / Bug modals ──────────────────────────────────────────── */}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
      {bugOpen      && <BugReportModal onClose={() => setBugOpen(false)} />}

      {/* ── Profile drawer ────────────────────────────────────────────────── */}
      <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} onLogout={handleLogout} />
    </>
  );
};

export default Navigation;
