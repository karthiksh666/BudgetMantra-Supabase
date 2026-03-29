import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import { API } from '@/App';
import {
  X, User, Mail, Phone, Lock,
  Save, Eye, EyeOff, LogOut, Crown, FlaskConical,
  Calendar, AlertCircle,
  Trash2, Bell, AtSign, AlertTriangle,
} from 'lucide-react';

const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

// ── Main drawer ───────────────────────────────────────────────────────────────
const ProfileDrawer = ({ open, onClose, onLogout }) => {
  const { user, token, refreshUser, logout } = useAuth();

  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '' });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [togglingPro, setTogglingPro] = useState(false);
  const [tab, setTab] = useState('info'); // 'info' | 'security' | 'notif'
  const [notifPrefs, setNotifPrefs] = useState({
    email_enabled: false,
    notify_emi: true, notify_subscriptions: true, notify_birthdays: true,
    notify_budget_summary: true, notify_savings_goals: true,
    notify_hand_loans: true, notify_salary: true, notify_when_to_buy: true,
    reminder_days_before: 3,
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0); // 0=idle 1=confirm 2=deleting
  const [deleteInput, setDeleteInput] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const handleTogglePro = async () => {
    setTogglingPro(true);
    try {
      await axios.post(`${API}/auth/toggle-pro`, {}, { headers });
      await refreshUser();
    } catch { /* silently ignore */ }
    finally { setTogglingPro(false); }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'delete') { toast.error('Type "delete" to confirm'); return; }
    setDeleteStep(2);
    try {
      await axios.delete(`${API}/auth/account`, { headers });
      toast.success('Account deleted. Goodbye!');
      logout();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete account');
      setDeleteStep(1);
    }
  };

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || '', email: user.email || '', phone: user.phone || '', dob: user.dob || '' });
    }
  }, [user]);

  useEffect(() => {
    if (open && tab === 'notif') {
      axios.get(`${API}/notifications/preferences`, { headers })
        .then(r => setNotifPrefs(p => ({ ...p, ...r.data })))
        .catch(() => {});
    }
  }, [open, tab]); // eslint-disable-line

  const toggleNotif = key => setNotifPrefs(p => ({ ...p, [key]: !p[key] }));

  const handleSaveNotifPrefs = async () => {
    setSavingNotif(true);
    try {
      await axios.put(`${API}/notifications/preferences`, notifPrefs, { headers });
      toast.success('Notification preferences saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSavingNotif(false); }
  };

  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/auth/profile`, form, { headers });
      await refreshUser();
      toast.success('Profile updated!');
    } catch { toast.error('Failed to update profile'); }
    finally { setSaving(false); }
  };

  const handlePasswordChange = async () => {
    if (pwForm.newPw !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    if (pwForm.newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSavingPw(true);
    try {
      await axios.post(`${API}/auth/change-password`, {
        current_password: pwForm.current,
        new_password: pwForm.newPw,
      }, { headers });
      toast.success('Password changed!');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change password');
    } finally { setSavingPw(false); }
  };

  if (!open) return null;

  const TABS = [
    ['info', 'Contact'],
    ['security', 'Security'],
    ['notif', '🔔 Alerts'],
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 z-[70] max-h-[94vh] overflow-y-auto
                      lg:inset-auto lg:right-0 lg:top-0 lg:bottom-0 lg:w-[400px] lg:max-h-none
                      bg-white rounded-t-3xl lg:rounded-none lg:rounded-l-3xl shadow-2xl
                      flex flex-col animate-in slide-in-from-bottom duration-300
                      lg:animate-in lg:slide-in-from-right">

        {/* ── Header ── */}
        <div className="relative overflow-hidden shrink-0"
          style={{ background: 'linear-gradient(135deg, #1c1917, #292524)' }}>
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
          <div className="relative p-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Your Profile</p>
              <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Avatar + name */}
            <div className="flex items-center gap-4">
              <label className="relative cursor-pointer group shrink-0">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-bold font-['Outfit'] backdrop-blur-sm border-2 border-white/30 overflow-hidden">
                  {user?.avatar_url
                    ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                    : initials}
                </div>
                <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-white text-[10px] font-bold">Change</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const dataUrl = ev.target.result;
                    try {
                      await axios.put(`${API}/auth/profile`, { avatar_url: dataUrl }, { headers });
                      await refreshUser();
                      toast.success('Profile photo updated!');
                    } catch { toast.error('Failed to upload photo'); }
                  };
                  reader.readAsDataURL(file);
                }} />
              </label>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-white font-['Outfit'] truncate">{user?.name}</h2>
                <p className="text-white/60 text-xs truncate">{user?.email}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {user?.is_pro ? (
                    <div className="flex items-center gap-1 bg-amber-400/30 border border-amber-300/40 rounded-full px-2.5 py-1">
                      <Crown size={11} className="text-amber-200" />
                      <span className="text-xs font-bold text-amber-100">Pro</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-white/10 border border-white/20 rounded-full px-2.5 py-1">
                      <span className="text-xs font-semibold text-white/60">Free</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 p-3 border-b border-stone-100 shrink-0">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === key ? 'bg-orange-500 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-100'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">

          {/* ── Contact Info ── */}
          {tab === 'info' && (
            <>
              <Field icon={<User size={13}/>} label="Full Name">
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Your full name" className="h-11 bg-stone-50 border-stone-200 focus:border-orange-400 rounded-xl" />
              </Field>

              <Field icon={<Mail size={13}/>} label="Email">
                <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com" type="email"
                  className="h-11 bg-stone-50 border-stone-200 focus:border-orange-400 rounded-xl" />
                <p className="text-xs text-stone-400">Used for email notifications</p>
              </Field>

              <Field icon={<Phone size={13}/>} label="Phone Number">
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="9876543210" type="tel"
                  className="h-11 bg-stone-50 border-stone-200 focus:border-orange-400 rounded-xl" />
                <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                  <span>📱</span> This is your WhatsApp number — enter 10 digits only (no +91)
                </p>
              </Field>

              <Field icon={<Calendar size={13}/>} label="Date of Birth">
                <Input value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })}
                  placeholder="YYYY-MM-DD" type="date"
                  className="h-11 bg-stone-50 border-stone-200 focus:border-orange-400 rounded-xl" />
              </Field>

              <SaveBtn onClick={handleSave} saving={saving} />
            </>
          )}


          {/* ── Security ── */}
          {tab === 'security' && (
            <>
              {[
                { label: 'Current Password', key: 'current', placeholder: 'Your current password' },
                { label: 'New Password',     key: 'newPw',   placeholder: 'At least 8 characters' },
                { label: 'Confirm Password', key: 'confirm', placeholder: 'Re-enter new password' },
              ].map(({ label, key, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-stone-600 text-sm font-medium flex items-center gap-1.5">
                    <Lock size={13} className="text-stone-400" /> {label}
                  </Label>
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

              <Button onClick={handlePasswordChange}
                disabled={savingPw || !pwForm.current || !pwForm.newPw || !pwForm.confirm}
                variant="outline"
                className="w-full h-11 border-2 border-stone-200 hover:border-orange-400 hover:text-orange-600 rounded-xl font-semibold transition-all">
                {savingPw ? 'Changing…' : 'Change Password'}
              </Button>
            </>
          )}

          {/* ── Notifications ── */}
          {tab === 'notif' && (
            <div className="space-y-4">
              {/* Channels */}
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Delivery Channels</p>
                <div className="space-y-2">
                  {[
                    { key: 'email_enabled', icon: <AtSign size={14} className="text-blue-600" />, label: 'Email', desc: user?.email || '', bg: 'bg-blue-100' },
                  ].map(({ key, icon, label, desc, bg }) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 ${bg} rounded-lg flex items-center justify-center`}>{icon}</div>
                        <div>
                          <p className="text-sm font-semibold text-stone-700">{label}</p>
                          <p className="text-[11px] text-stone-400 truncate max-w-[160px]">{desc}</p>
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

              {/* Remind days */}
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                <div>
                  <p className="text-sm font-semibold text-stone-700">Remind me</p>
                  <p className="text-[11px] text-stone-400">Days before EMI / subscription / loan</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setNotifPrefs(p => ({ ...p, reminder_days_before: Math.max(1, p.reminder_days_before - 1) }))}
                    className="w-7 h-7 rounded-lg bg-white border border-stone-200 text-stone-600 font-bold flex items-center justify-center hover:border-orange-300">−</button>
                  <span className="w-5 text-center font-bold text-stone-800 text-sm">{notifPrefs.reminder_days_before}</span>
                  <button onClick={() => setNotifPrefs(p => ({ ...p, reminder_days_before: Math.min(14, p.reminder_days_before + 1) }))}
                    className="w-7 h-7 rounded-lg bg-white border border-stone-200 text-stone-600 font-bold flex items-center justify-center hover:border-orange-300">+</button>
                  <span className="text-[11px] text-stone-400">days</span>
                </div>
              </div>

              {/* Feature toggles */}
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Notify me about</p>
                <div className="space-y-1.5">
                  {[
                    { key: 'notify_emi',            label: 'EMI & Loan due dates',      emoji: '⏰' },
                    { key: 'notify_subscriptions',  label: 'Subscription renewals',     emoji: '📺' },
                    { key: 'notify_birthdays',      label: 'Birthdays & anniversaries', emoji: '🎂' },
                    { key: 'notify_savings_goals',  label: 'Savings goal deadlines',    emoji: '🎯' },
                    { key: 'notify_when_to_buy',    label: 'When-to-Buy ready',         emoji: '🛍️' },
                    { key: 'notify_hand_loans',     label: 'Hand loan due dates',       emoji: '🤝' },
                    { key: 'notify_salary',         label: 'Salary / paycheck day',     emoji: '💰' },
                    { key: 'notify_budget_summary', label: 'Monthly budget summary',    emoji: '📊' },
                  ].map(({ key, label, emoji }) => (
                    <div key={key} className="flex items-center justify-between px-3 py-2.5 bg-stone-50 rounded-xl border border-stone-100">
                      <div className="flex items-center gap-2">
                        <span>{emoji}</span>
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

              <SaveBtn onClick={handleSaveNotifPrefs} saving={savingNotif} label="Save Preferences" />
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="p-4 border-t border-stone-100 shrink-0 space-y-2">
          {/* Beta switcher — always visible */}
          <div className="relative overflow-hidden rounded-2xl p-4"
            style={{ background: user?.is_pro
              ? 'linear-gradient(135deg, #064e3b 0%, #065f46 60%, #047857 100%)'
              : 'linear-gradient(135deg, #7c3aed 0%, #9333ea 60%, #a855f7 100%)' }}>
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative flex items-start gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                {user?.is_pro ? <FlaskConical size={16} className="text-emerald-300" /> : <Crown size={16} className="text-yellow-300" />}
              </div>
              <div className="flex-1 min-w-0">
                {user?.is_pro ? (
                  <>
                    <p className="font-bold text-white text-sm font-['Outfit']">You're on Premium</p>
                    <p className="text-emerald-200 text-[11px] mt-0.5 leading-relaxed">
                      All features unlocked. This is an MVP — <strong className="text-white">Premium is free during beta.</strong>
                    </p>
                    <button onClick={handleTogglePro} disabled={togglingPro}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl transition-colors">
                      <FlaskConical size={12} />
                      {togglingPro ? 'Switching…' : 'Switch to Free plan'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-white text-sm font-['Outfit']">Try Premium — It's Free!</p>
                    <p className="text-purple-200 text-[11px] mt-0.5 leading-relaxed">
                      We're in beta. Unlock Gold, Trips, Group Expenses + all Pro features — <strong className="text-white">no payment needed.</strong>
                    </p>
                    <button onClick={handleTogglePro} disabled={togglingPro}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-white text-purple-700 font-bold text-xs rounded-xl hover:bg-purple-50 transition-colors shadow">
                      <Crown size={12} className="text-yellow-500" />
                      {togglingPro ? 'Activating…' : 'Activate Premium — Free during beta'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-colors">
            <LogOut size={16} /> Sign out
          </button>

          {/* Delete account */}
          {deleteStep === 0 && (
            <button onClick={() => setDeleteStep(1)}
              className="w-full text-xs text-stone-400 hover:text-red-500 py-1 transition-colors">
              Delete account
            </button>
          )}
          {deleteStep === 1 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-700">Delete your account?</p>
                  <p className="text-xs text-red-600 mt-0.5 leading-relaxed">This permanently deletes all your data — budgets, EMIs, goals, investments, loans — everything. This cannot be undone.</p>
                </div>
              </div>
              <input
                type="text"
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder='Type "delete" to confirm'
                className="w-full h-10 bg-white border border-red-200 rounded-xl px-3 text-sm font-mono focus:outline-none focus:border-red-400"
              />
              <div className="flex gap-2">
                <button onClick={() => { setDeleteStep(0); setDeleteInput(''); }}
                  className="flex-1 py-2 border border-stone-200 rounded-xl text-sm text-stone-500 hover:bg-stone-100 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteInput !== 'delete' || deleteStep === 2}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5">
                  <Trash2 size={13} /> {deleteStep === 2 ? 'Deleting…' : 'Delete forever'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function Field({ icon, label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-stone-600 text-sm font-medium flex items-center gap-1.5">
        {icon && <span className="text-stone-400">{icon}</span>}
        {label}
      </Label>
      {children}
    </div>
  );
}

function SaveBtn({ onClick, saving, label = 'Save Changes' }) {
  return (
    <Button onClick={onClick} disabled={saving}
      className="w-full h-11 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/20">
      <Save size={15} className="mr-2" />
      {saving ? 'Saving…' : label}
    </Button>
  );
}

export default ProfileDrawer;
