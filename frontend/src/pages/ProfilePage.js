import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import { API } from '@/App';
import { User, Mail, Phone, Lock, Flame, Save, Eye, EyeOff, CheckCircle, Shield, Key, Copy, RefreshCw, Bell, AtSign, AlertTriangle, Crown, Zap, Trash2 } from 'lucide-react';

const ProfilePage = () => {
  const { user, token, refreshUser, logout } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [streak, setStreak] = useState(0);
  const [lastActivity, setLastActivity] = useState('');
  const [profileLocked, setProfileLocked] = useState(false);
  const [lockToggling, setLockToggling] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [generatingPin, setGeneratingPin] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState({
    whatsapp_enabled: true, email_enabled: false, notify_via_chat: true,
    notify_emi: true, notify_subscriptions: true, notify_birthdays: true,
    notify_budget_summary: true, notify_savings_goals: true,
    notify_hand_loans: true, notify_salary: true, notify_when_to_buy: true,
    reminder_days_before: 3,
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [deleteStep, setDeleteStep]   = useState(0); // 0=idle, 1=confirm, 2=deleting
  const [deleteInput, setDeleteInput] = useState('');
  const [cancelStep, setCancelStep]   = useState(0); // 0=idle, 1=confirm

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || '', phone: user.phone || '' });
      setStreak(user.streak || 0);
      setLastActivity(user.last_activity_date || '');
      setProfileLocked(user.profile_locked || false);
      setPdfPassword(user.pdf_password || '');
    }
  }, [user]);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/notifications/preferences`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setNotifPrefs(p => ({ ...p, ...r.data })))
      .catch(() => {});
  }, [token]);

  const handleSaveNotifPrefs = async () => {
    setSavingNotif(true);
    try {
      await axios.put(`${API}/notifications/preferences`, notifPrefs, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Notification preferences saved!');
    } catch { toast.error('Failed to save preferences'); }
    finally { setSavingNotif(false); }
  };

  const toggleNotif = (key) => setNotifPrefs(p => ({ ...p, [key]: !p[key] }));

  const handleToggleLock = async () => {
    setLockToggling(true);
    try {
      const r = await axios.post(`${API}/auth/toggle-profile-lock`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setProfileLocked(r.data.profile_locked);
      toast.success(r.data.profile_locked ? '🔒 Profile locked' : '🔓 Profile unlocked');
      refreshUser?.();
    } catch { toast.error('Failed to toggle lock'); }
    finally { setLockToggling(false); }
  };

  const handleGeneratePin = async () => {
    setGeneratingPin(true);
    try {
      const r = await axios.post(`${API}/auth/generate-pdf-password`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setPdfPassword(r.data.pdf_password);
      toast.success('New PDF PIN generated!');
    } catch { toast.error('Failed to generate PIN'); }
    finally { setGeneratingPin(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/auth/profile`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Profile updated!');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (pwForm.newPw !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    if (pwForm.newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSavingPw(true);
    try {
      await axios.post(`${API}/auth/change-password`, {
        current_password: pwForm.current,
        new_password: pwForm.newPw,
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Password changed successfully!');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change password');
    } finally {
      setSavingPw(false);
    }
  };

  const handleCancelPro = async () => {
    try {
      await axios.post(`${API}/auth/toggle-pro`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Pro subscription cancelled. You now have the free plan.');
      refreshUser?.();
      setCancelStep(0);
    } catch { toast.error('Could not cancel subscription. Please contact support.'); }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput.trim().toLowerCase() !== 'delete') {
      toast.error('Please type "delete" to confirm');
      return;
    }
    setDeleteStep(2);
    try {
      await axios.delete(`${API}/auth/account`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Account deleted. Goodbye!');
      logout?.();
    } catch {
      toast.error('Could not delete account. Please contact support@budgetmantra.in');
      setDeleteStep(1);
    }
  };

  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const streakLabel = streak === 0 ? 'No streak yet'
    : streak === 1 ? '1 day streak 🔥'
    : `${streak} day streak 🔥`;

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      <Navigation />
      <div className="max-w-2xl mx-auto px-4 py-8 pb-28 lg:pb-8 space-y-6">

        {/* Avatar + streak */}
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
          <div className="relative flex items-center gap-5">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-bold font-['Outfit'] backdrop-blur-sm border-2 border-white/30">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold font-['Outfit']">{user?.name}</h1>
              <p className="text-white/70 text-sm">{user?.email}</p>
              <div className="flex items-center gap-1.5 mt-2 bg-white/20 rounded-full px-3 py-1 w-fit">
                <Flame size={14} className="text-orange-200" />
                <span className="text-sm font-semibold">{streakLabel}</span>
              </div>
            </div>
          </div>
          {streak > 0 && (
            <div className="relative mt-5 pt-4 border-t border-white/20">
              <p className="text-white/60 text-xs mb-2">Activity streak — keep adding data daily!</p>
              <div className="flex gap-1.5">
                {[...Array(Math.min(streak, 7))].map((_, i) => (
                  <div key={i} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm border border-white/20">
                    <CheckCircle size={14} className="text-emerald-300" />
                  </div>
                ))}
                {streak < 7 && [...Array(7 - streak)].map((_, i) => (
                  <div key={i} className="w-8 h-8 bg-white/10 rounded-lg border border-white/10" />
                ))}
              </div>
              {lastActivity && <p className="text-white/50 text-xs mt-2">Last active: {lastActivity}</p>}
            </div>
          )}
        </div>

        {/* Personal Info */}
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm space-y-5">
          <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
            <User size={18} className="text-orange-500" /> Personal Information
          </h2>

          <div className="space-y-1.5">
            <Label className="text-stone-600 text-sm font-medium flex items-center gap-1.5">
              <User size={13} className="text-stone-400" /> Full Name
            </Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Your full name"
              className="h-11 bg-stone-50 border-stone-200 focus:border-orange-400 rounded-xl" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-stone-600 text-sm font-medium flex items-center gap-1.5">
              <Mail size={13} className="text-stone-400" /> Email Address
            </Label>
            <Input value={user?.email || ''} disabled
              className="h-11 bg-stone-100 border-stone-200 rounded-xl text-stone-400 cursor-not-allowed" />
            <p className="text-xs text-stone-400">Email cannot be changed</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-stone-600 text-sm font-medium flex items-center gap-1.5">
              <Phone size={13} className="text-stone-400" /> Phone Number
            </Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="+91 98765 43210" type="tel"
              className="h-11 bg-stone-50 border-stone-200 focus:border-orange-400 rounded-xl" />
            <p className="text-xs text-stone-400">Used for EMI reminders and notifications</p>
          </div>

          {profileLocked && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs">
              <Lock size={13} /> Profile is locked — toggle the lock in Security settings to edit
            </div>
          )}
          <Button onClick={handleSave} disabled={saving || profileLocked}
            className="w-full h-11 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
            <Save size={15} className="mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm space-y-5">
          <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
            <Lock size={18} className="text-orange-500" /> Change Password
          </h2>

          {[
            { label: 'Current Password', key: 'current', placeholder: 'Your current password' },
            { label: 'New Password', key: 'newPw', placeholder: 'At least 8 characters' },
            { label: 'Confirm New Password', key: 'confirm', placeholder: 'Re-enter new password' },
          ].map(({ label, key, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-stone-600 text-sm font-medium">{label}</Label>
              <div className="relative">
                <Input type={showPw ? 'text' : 'password'} placeholder={placeholder}
                  value={pwForm[key]} onChange={e => setPwForm({ ...pwForm, [key]: e.target.value })}
                  className="h-11 bg-stone-50 border-stone-200 focus:border-orange-400 rounded-xl pr-10" />
                {key === 'current' && (
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-orange-500">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
            </div>
          ))}

          <Button onClick={handlePasswordChange} disabled={savingPw || !pwForm.current || !pwForm.newPw || !pwForm.confirm}
            variant="outline"
            className="w-full h-11 border-2 border-stone-200 hover:border-orange-400 hover:text-orange-600 rounded-xl font-semibold transition-all">
            {savingPw ? 'Changing...' : 'Change Password'}
          </Button>
        </div>

        {/* Profile Lock + PDF PIN */}
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm space-y-5">
          <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
            <Shield size={18} className="text-orange-500" /> Security & Privacy
          </h2>

          {/* Profile Lock */}
          <div className="flex items-center justify-between gap-4 p-4 bg-stone-50 rounded-xl border border-stone-100">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${profileLocked ? 'bg-rose-100' : 'bg-emerald-100'}`}>
                <Lock size={16} className={profileLocked ? 'text-rose-500' : 'text-emerald-500'} />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-700">Profile Lock</p>
                <p className="text-xs text-stone-400">{profileLocked ? 'Locked — no profile edits allowed' : 'Unlocked — profile edits enabled'}</p>
              </div>
            </div>
            <button onClick={handleToggleLock} disabled={lockToggling}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${profileLocked ? 'bg-rose-500' : 'bg-stone-300'} disabled:opacity-50`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${profileLocked ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* PDF PIN */}
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-100">
            <div className="flex items-center gap-2 mb-3">
              <Key size={15} className="text-orange-500" />
              <p className="text-sm font-semibold text-stone-700">PDF Export PIN</p>
            </div>
            <p className="text-xs text-stone-400 mb-3 leading-relaxed">
              This PIN is printed on every PDF you export — only you know it, making your exports verifiable. Keep it safe.
            </p>
            {pdfPassword ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2.5 font-mono text-lg font-bold text-stone-800 tracking-widest">
                  {pdfPassword}
                </div>
                <button onClick={() => { navigator.clipboard.writeText(pdfPassword); toast.success('PIN copied!'); }}
                  className="p-2.5 rounded-xl bg-white border border-stone-200 text-stone-500 hover:text-orange-500 hover:border-orange-300 transition-colors">
                  <Copy size={14} />
                </button>
                <button onClick={handleGeneratePin} disabled={generatingPin}
                  className="p-2.5 rounded-xl bg-white border border-stone-200 text-stone-500 hover:text-orange-500 hover:border-orange-300 transition-colors" title="Regenerate PIN">
                  <RefreshCw size={14} className={generatingPin ? 'animate-spin' : ''} />
                </button>
              </div>
            ) : (
              <button onClick={handleGeneratePin} disabled={generatingPin}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-stone-200 text-stone-500 text-sm font-medium hover:border-orange-400 hover:text-orange-500 transition-colors">
                {generatingPin ? 'Generating…' : '+ Generate PDF PIN'}
              </button>
            )}
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm space-y-5">
          <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
            <Bell size={18} className="text-orange-500" /> Notification Preferences
          </h2>

          {/* Channel toggles */}
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Delivery Channels</p>
            <div className="space-y-3">
              {[
                { key: 'email_enabled', icon: <AtSign size={15} className="text-blue-600" />, label: 'Email', desc: user?.email || 'your email address', color: 'bg-blue-100', warn: false },
              ].map(({ key, icon, label, desc, color, warn }) => (
                <div key={key} className="flex items-center justify-between gap-4 p-3.5 bg-stone-50 rounded-xl border border-stone-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center`}>{icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-stone-700">{label}</p>
                      <p className="text-xs text-stone-400 truncate max-w-[180px]">{desc}</p>
                      {warn && <p className="text-[10px] text-amber-600 mt-0.5">Add phone number above first</p>}
                    </div>
                  </div>
                  <button onClick={() => toggleNotif(key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notifPrefs[key] ? 'bg-orange-500' : 'bg-stone-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notifPrefs[key] ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Reminder lead time */}
          <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-100">
            <div>
              <p className="text-sm font-semibold text-stone-700">Remind me</p>
              <p className="text-xs text-stone-400">Days before EMI / subscription / loan due</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setNotifPrefs(p => ({ ...p, reminder_days_before: Math.max(1, p.reminder_days_before - 1) }))}
                className="w-7 h-7 rounded-lg bg-white border border-stone-200 text-stone-600 font-bold text-lg flex items-center justify-center hover:border-orange-300">−</button>
              <span className="w-6 text-center font-bold text-stone-800 text-sm">{notifPrefs.reminder_days_before}</span>
              <button onClick={() => setNotifPrefs(p => ({ ...p, reminder_days_before: Math.min(14, p.reminder_days_before + 1) }))}
                className="w-7 h-7 rounded-lg bg-white border border-stone-200 text-stone-600 font-bold text-lg flex items-center justify-center hover:border-orange-300">+</button>
              <span className="text-xs text-stone-400 ml-1">days</span>
            </div>
          </div>

          {/* Delivery channel — chat toggle */}
          <div className="flex items-center justify-between px-3.5 py-3 bg-amber-50 rounded-xl border border-amber-100">
            <div className="flex items-center gap-2.5">
              <span className="text-base">🔔</span>
              <div>
                <p className="text-sm font-medium text-stone-700">Notify via Chanakya chat</p>
                <p className="text-xs text-stone-400">Reminders appear in your chat feed</p>
              </div>
            </div>
            <button onClick={() => toggleNotif('notify_via_chat')}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${notifPrefs.notify_via_chat ? 'bg-orange-500' : 'bg-stone-300'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${notifPrefs.notify_via_chat ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Feature toggles */}
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Notify me about</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { key: 'notify_emi',            label: 'EMI & Loan due dates',        emoji: '⏰' },
                { key: 'notify_subscriptions',  label: 'Subscription renewals',       emoji: '📺' },
                { key: 'notify_birthdays',      label: 'Birthdays & anniversaries',   emoji: '🎂' },
                { key: 'notify_savings_goals',  label: 'Savings goal deadlines',      emoji: '🎯' },
                { key: 'notify_when_to_buy',    label: 'When-to-Buy item is ready',   emoji: '🛍️' },
                { key: 'notify_hand_loans',     label: 'Hand loan due dates',         emoji: '🤝' },
                { key: 'notify_salary',         label: 'Salary / paycheck day',       emoji: '💰' },
                { key: 'notify_budget_summary', label: 'Monthly budget summary',      emoji: '📊' },
              ].map(({ key, label, emoji }) => (
                <div key={key} className="flex items-center justify-between px-3.5 py-3 bg-stone-50 rounded-xl border border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{emoji}</span>
                    <p className="text-sm text-stone-700">{label}</p>
                  </div>
                  <button onClick={() => toggleNotif(key)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${notifPrefs[key] ? 'bg-orange-500' : 'bg-stone-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${notifPrefs[key] ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSaveNotifPrefs} disabled={savingNotif}
            className="w-full h-11 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/20">
            <Save size={15} className="mr-2" />
            {savingNotif ? 'Saving…' : 'Save Notification Preferences'}
          </Button>
        </div>

        {/* Pro upgrade banner (testing phase — remove before full launch) */}
        {!user?.is_pro && (
          <div className="relative overflow-hidden rounded-2xl p-5"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #a855f7 100%)' }}>
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <div className="relative flex items-start gap-4">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                <Crown size={18} className="text-yellow-300" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-white text-base font-['Outfit']">Upgrade to Budget Mantra Pro</p>
                <p className="text-purple-200 text-xs mt-1 leading-relaxed">
                  Unlock Gold Tracker, Trip Planner, Group Expenses, Hand Loans, Credit Cards and more. Currently in beta — <strong className="text-white">free for early users.</strong>
                </p>
                <button
                  onClick={async () => {
                    try {
                      await axios.post(`${API}/auth/toggle-pro`, {}, { headers: { Authorization: `Bearer ${token}` } });
                      refreshUser?.();
                      toast.success('You now have Pro access! Enjoy all features.');
                    } catch { toast.error('Could not activate Pro.'); }
                  }}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-white text-purple-700 font-bold text-sm rounded-xl hover:bg-purple-50 transition-colors shadow-lg">
                  <Zap size={14} className="text-yellow-500" /> Activate Pro — Free during beta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Streak info */}
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={18} className="text-orange-500" />
            <h3 className="font-bold text-stone-800 font-['Outfit']">Activity Streak</h3>
          </div>
          <p className="text-stone-500 text-sm leading-relaxed">
            Your streak increases every day you add an expense or transaction. Adding data daily keeps your Financial Health Score accurate and helps Chanakya give you better advice.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="px-3 py-1.5 bg-orange-100 rounded-full">
              <span className="text-orange-700 font-bold text-sm">{streak} day{streak !== 1 ? 's' : ''}</span>
            </div>
            <span className="text-stone-400 text-xs">current streak</span>
          </div>
        </div>

        {/* ── Subscription / Danger Zone ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-stone-100">
            <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
              <AlertTriangle size={18} className="text-rose-500" /> Account & Subscription
            </h2>
            <p className="text-stone-400 text-xs mt-0.5">Manage your plan or permanently delete your account</p>
          </div>

          {/* Cancel subscription (Pro users only) */}
          {user?.is_pro && (
            <div className="px-6 py-4 border-b border-stone-100">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
                    <Crown size={16} className="text-violet-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-700">Budget Mantra Pro</p>
                    <p className="text-xs text-stone-400">Your active plan · All features unlocked</p>
                  </div>
                </div>
                {cancelStep === 0 ? (
                  <button onClick={() => setCancelStep(1)}
                    className="text-xs font-semibold text-stone-400 hover:text-rose-500 transition-colors border border-stone-200 hover:border-rose-200 px-3 py-1.5 rounded-xl">
                    Cancel plan
                  </button>
                ) : (
                  <div className="text-right">
                    <p className="text-xs text-rose-600 font-semibold mb-2">Lose access to Pro features?</p>
                    <div className="flex gap-2">
                      <button onClick={() => setCancelStep(0)} className="text-xs px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 font-semibold hover:bg-stone-200 transition-colors">
                        Keep Pro
                      </button>
                      <button onClick={handleCancelPro} className="text-xs px-3 py-1.5 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 transition-colors">
                        Yes, cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Delete account */}
          <div className="px-6 py-4">
            {deleteStep === 0 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
                    <Trash2 size={16} className="text-rose-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-700">Delete Account</p>
                    <p className="text-xs text-stone-400">Permanently remove all your data</p>
                  </div>
                </div>
                <button onClick={() => setDeleteStep(1)}
                  className="text-xs font-semibold text-rose-500 border border-rose-200 px-3 py-1.5 rounded-xl hover:bg-rose-50 transition-colors">
                  Delete
                </button>
              </div>
            )}

            {deleteStep >= 1 && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="text-rose-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-rose-700">This action is irreversible</p>
                    <p className="text-xs text-rose-600 mt-0.5 leading-relaxed">
                      All your transactions, budgets, EMIs, savings goals, and personal data will be permanently erased. This cannot be undone.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-rose-700">Type <strong>delete</strong> to confirm</label>
                  <input
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value)}
                    placeholder="delete"
                    className="w-full h-10 px-3 rounded-xl border-2 border-rose-200 bg-white text-sm text-stone-800 focus:outline-none focus:border-rose-400"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setDeleteStep(0); setDeleteInput(''); }}
                    className="flex-1 py-2.5 rounded-xl bg-white border border-stone-200 text-stone-600 text-sm font-semibold hover:bg-stone-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleDeleteAccount} disabled={deleteStep === 2}
                    className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                    <Trash2 size={13} /> {deleteStep === 2 ? 'Deleting…' : 'Delete my account'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProfilePage;
