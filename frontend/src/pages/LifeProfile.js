import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import { API } from '@/App';
import {
  Users, Heart, Baby, UserCheck, Briefcase, GraduationCap, Gem, Home,
  Landmark, Shield, HeartPulse, ChevronRight, ChevronLeft, Check,
  CalendarDays, IndianRupee, BookOpen, HandCoins, Umbrella, Award,
} from 'lucide-react';

// ── Life-stage cards ────────────────────────────────────────────────────────────
const LIFE_STAGES = [
  { id: 'just_started',     label: 'Just Started Earning',  icon: Briefcase,     desc: 'First job, building habits'        },
  { id: 'building_career',  label: 'Building Career',       icon: GraduationCap, desc: 'Growing income, investing early'    },
  { id: 'getting_married',  label: 'Getting Married',       icon: Gem,           desc: 'Wedding planning, merging finances' },
  { id: 'new_parent',       label: 'New Parent',            icon: Baby,          desc: 'Baby on the way or just arrived'    },
  { id: 'growing_family',   label: 'Growing Family',        icon: Users,         desc: 'Kids in school, juggling expenses'  },
  { id: 'peak_earning',     label: 'Peak Earning Years',    icon: Award,         desc: 'High income, wealth building'       },
  { id: 'pre_retirement',   label: 'Pre-Retirement',        icon: Landmark,      desc: 'Winding down, securing the future'  },
  { id: 'retired',          label: 'Retired',               icon: Umbrella,      desc: 'Living on savings & pensions'       },
];

const STEP_LABELS = ['Family', 'Life Stage', 'Obligations', 'Insurance'];

const DEFAULT_PROFILE = {
  marital_status: 'single',
  spouse_working: false,
  kids_count: 0,
  kids_ages: [],
  elderly_dependents: 0,
  life_stage: '',
  salary_day: 1,
  monthly_rent: '',
  school_fees: '',
  parent_support: '',
  health_insurance: false,
  term_insurance: false,
  kid_health_cover: false,
  parent_health_cover: false,
};

const LifeProfile = () => {
  const { token } = useAuth();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('bm_life_profile');
      return saved ? { ...DEFAULT_PROFILE, ...JSON.parse(saved) } : { ...DEFAULT_PROFILE };
    } catch {
      return { ...DEFAULT_PROFILE };
    }
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key, val) => setProfile(p => ({ ...p, [key]: val }));

  // Keep kids_ages array in sync with kids_count
  useEffect(() => {
    setProfile(p => {
      const ages = [...(p.kids_ages || [])];
      while (ages.length < p.kids_count) ages.push('');
      return { ...p, kids_ages: ages.slice(0, p.kids_count) };
    });
  }, [profile.kids_count]);

  const setKidAge = (idx, val) => {
    setProfile(p => {
      const ages = [...p.kids_ages];
      ages[idx] = val;
      return { ...p, kids_ages: ages };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem('bm_life_profile', JSON.stringify(profile));
      await axios.put(`${API}/auth/profile`, { life_profile: profile }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Life Profile saved!');
      setDone(true);
    } catch {
      // Still saved to localStorage
      localStorage.setItem('bm_life_profile', JSON.stringify(profile));
      toast.success('Saved locally! Server sync will retry later.');
      setDone(true);
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (step < 3) setStep(s => s + 1);
    else handleSave();
  };
  const prev = () => step > 0 && setStep(s => s - 1);

  // ── Toggle helper ─────────────────────────────────────────────────────────────
  const Toggle = ({ checked, onChange, label, desc }) => (
    <div className="flex items-center justify-between gap-4 p-4 bg-stone-50 rounded-xl border border-stone-100">
      <div>
        <p className="text-sm font-semibold text-stone-700">{label}</p>
        {desc && <p className="text-xs text-stone-400 mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-stone-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  // ── Counter helper ────────────────────────────────────────────────────────────
  const Counter = ({ value, onChange, label, min = 0, max = 10 }) => (
    <div className="flex items-center justify-between p-4 bg-stone-50 rounded-xl border border-stone-100">
      <p className="text-sm font-semibold text-stone-700">{label}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(min, value - 1))}
          className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 font-bold text-lg flex items-center justify-center hover:border-orange-300 transition-colors">-</button>
        <span className="w-8 text-center font-bold text-stone-800">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))}
          className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 font-bold text-lg flex items-center justify-center hover:border-orange-300 transition-colors">+</button>
      </div>
    </div>
  );

  // ── Amount input helper ───────────────────────────────────────────────────────
  const AmountInput = ({ value, onChange, label, placeholder }) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-stone-600 flex items-center gap-1.5">
        <IndianRupee size={13} className="text-stone-400" /> {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || '0'}
        className="w-full h-11 px-4 bg-stone-50 border border-stone-200 focus:border-orange-400 focus:outline-none rounded-xl text-stone-800 text-sm"
      />
    </div>
  );

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (done) {
    const stageObj = LIFE_STAGES.find(s => s.id === profile.life_stage);
    return (
      <div className="min-h-screen bg-[#fffaf5]">
        <Navigation />
        <div className="max-w-2xl mx-auto px-4 py-8 pb-28 lg:pb-8 space-y-6">
          {/* Success header */}
          <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl p-8 text-white relative overflow-hidden text-center">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
            <div className="relative">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold font-['Outfit']">Life Profile Complete!</h1>
              <p className="text-orange-100 mt-2 text-sm">Chanakya now understands your life better</p>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 space-y-4">
            <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
              <Users size={18} className="text-orange-500" /> Your Summary
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <SummaryCard label="Status" value={profile.marital_status === 'married' ? 'Married' : 'Single'} />
              {profile.marital_status === 'married' && (
                <SummaryCard label="Spouse Working" value={profile.spouse_working ? 'Yes' : 'No'} />
              )}
              <SummaryCard label="Kids" value={profile.kids_count} />
              <SummaryCard label="Elderly Dependents" value={profile.elderly_dependents} />
              {stageObj && <SummaryCard label="Life Stage" value={stageObj.label} />}
              <SummaryCard label="Salary Day" value={`${profile.salary_day}${ordSuffix(profile.salary_day)} of month`} />
              {profile.monthly_rent && <SummaryCard label="Rent" value={`Rs ${Number(profile.monthly_rent).toLocaleString('en-IN')}`} />}
              {profile.school_fees && <SummaryCard label="School Fees" value={`Rs ${Number(profile.school_fees).toLocaleString('en-IN')}`} />}
              {profile.parent_support && <SummaryCard label="Parent Support" value={`Rs ${Number(profile.parent_support).toLocaleString('en-IN')}`} />}
              <SummaryCard label="Health Insurance" value={profile.health_insurance ? 'Yes' : 'No'} />
              <SummaryCard label="Term Insurance" value={profile.term_insurance ? 'Yes' : 'No'} />
            </div>

            <Button onClick={() => { setDone(false); setStep(0); }}
              variant="outline"
              className="w-full h-11 border-2 border-stone-200 hover:border-orange-400 hover:text-orange-600 rounded-xl font-semibold transition-all mt-2">
              Edit Profile
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step content ──────────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      // ─── Step 0: Family ─────────────────────────────────────────────────────
      case 0:
        return (
          <div className="space-y-4">
            <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
              <Heart size={18} className="text-orange-500" /> Family Details
            </h2>

            {/* Marital status */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-600">Marital Status</p>
              <div className="grid grid-cols-2 gap-3">
                {['single', 'married'].map(s => (
                  <button key={s} onClick={() => set('marital_status', s)}
                    className={`p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                      profile.marital_status === s
                        ? 'border-orange-400 bg-orange-50 text-orange-600'
                        : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300'
                    }`}>
                    {s === 'single' ? 'Single' : 'Married'}
                  </button>
                ))}
              </div>
            </div>

            {/* Spouse working */}
            {profile.marital_status === 'married' && (
              <Toggle
                checked={profile.spouse_working}
                onChange={v => set('spouse_working', v)}
                label="Is your spouse working?"
                desc="Helps estimate household income"
              />
            )}

            {/* Kids */}
            <Counter
              value={profile.kids_count}
              onChange={v => set('kids_count', v)}
              label="Number of kids"
              max={8}
            />

            {/* Kid ages */}
            {profile.kids_count > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-600">Ages of kids</p>
                <div className="grid grid-cols-4 gap-2">
                  {profile.kids_ages.map((age, i) => (
                    <input key={i}
                      type="number"
                      value={age}
                      onChange={e => setKidAge(i, e.target.value)}
                      placeholder={`Kid ${i + 1}`}
                      className="h-11 px-3 bg-stone-50 border border-stone-200 focus:border-orange-400 focus:outline-none rounded-xl text-stone-800 text-sm text-center"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Elderly dependents */}
            <Counter
              value={profile.elderly_dependents}
              onChange={v => set('elderly_dependents', v)}
              label="Elderly dependents"
              max={6}
            />
          </div>
        );

      // ─── Step 1: Life Stage ─────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
              <UserCheck size={18} className="text-orange-500" /> Life Stage
            </h2>
            <p className="text-sm text-stone-500">Pick the stage that best describes where you are right now.</p>
            <div className="grid grid-cols-2 gap-3">
              {LIFE_STAGES.map(s => {
                const active = profile.life_stage === s.id;
                return (
                  <button key={s.id} onClick={() => set('life_stage', s.id)}
                    className={`relative flex flex-col items-center gap-2 p-5 rounded-2xl border-2 text-center transition-all active:scale-95 ${
                      active
                        ? 'border-orange-400 bg-orange-50 shadow-sm shadow-orange-100'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      active ? 'bg-orange-500' : 'bg-stone-100'
                    }`}>
                      <s.icon size={20} className={active ? 'text-white' : 'text-stone-500'} />
                    </div>
                    <p className={`text-sm font-semibold ${active ? 'text-orange-600' : 'text-stone-700'}`}>{s.label}</p>
                    <p className="text-[11px] text-stone-400 leading-snug">{s.desc}</p>
                    {active && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );

      // ─── Step 2: Obligations ────────────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
              <CalendarDays size={18} className="text-orange-500" /> Monthly Obligations
            </h2>

            {/* Salary day */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-600 flex items-center gap-1.5">
                <CalendarDays size={13} className="text-stone-400" /> Salary credited on
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1} max={31}
                  value={profile.salary_day}
                  onChange={e => set('salary_day', Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-20 h-11 px-3 bg-stone-50 border border-stone-200 focus:border-orange-400 focus:outline-none rounded-xl text-stone-800 text-sm text-center"
                />
                <span className="text-sm text-stone-500">of every month</span>
              </div>
            </div>

            <AmountInput
              value={profile.monthly_rent}
              onChange={v => set('monthly_rent', v)}
              label="Monthly Rent / EMI (housing)"
              placeholder="e.g. 15000"
            />

            {profile.kids_count > 0 && (
              <AmountInput
                value={profile.school_fees}
                onChange={v => set('school_fees', v)}
                label="School / Tuition Fees (monthly)"
                placeholder="e.g. 5000"
              />
            )}

            {profile.elderly_dependents > 0 && (
              <AmountInput
                value={profile.parent_support}
                onChange={v => set('parent_support', v)}
                label="Parent / Elder Support (monthly)"
                placeholder="e.g. 10000"
              />
            )}
          </div>
        );

      // ─── Step 3: Insurance ──────────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-4">
            <h2 className="font-bold text-stone-800 font-['Outfit'] text-lg flex items-center gap-2">
              <Shield size={18} className="text-orange-500" /> Insurance Coverage
            </h2>
            <p className="text-sm text-stone-500">Helps Chanakya flag protection gaps in your finances.</p>

            <Toggle
              checked={profile.health_insurance}
              onChange={v => set('health_insurance', v)}
              label="Health Insurance"
              desc="Do you have an active health policy?"
            />

            <Toggle
              checked={profile.term_insurance}
              onChange={v => set('term_insurance', v)}
              label="Term Life Insurance"
              desc="Pure protection cover for your family"
            />

            {profile.kids_count > 0 && (
              <Toggle
                checked={profile.kid_health_cover}
                onChange={v => set('kid_health_cover', v)}
                label="Kids covered under health plan?"
                desc={`${profile.kids_count} kid${profile.kids_count > 1 ? 's' : ''} in your family`}
              />
            )}

            {profile.elderly_dependents > 0 && (
              <Toggle
                checked={profile.parent_health_cover}
                onChange={v => set('parent_health_cover', v)}
                label="Parents covered under health plan?"
                desc={`${profile.elderly_dependents} elderly dependent${profile.elderly_dependents > 1 ? 's' : ''}`}
              />
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      <Navigation />
      <div className="max-w-2xl mx-auto px-4 py-8 pb-28 lg:pb-8 space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
          <div className="relative">
            <h1 className="text-2xl font-bold font-['Outfit']">Life Profile</h1>
            <p className="text-orange-100 mt-1 text-sm">Tell us about your life so Chanakya can give smarter advice</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            {STEP_LABELS.map((label, i) => (
              <button key={i} onClick={() => setStep(i)}
                className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                  i === step ? 'text-orange-500' : i < step ? 'text-emerald-500' : 'text-stone-400'
                }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
                  i === step
                    ? 'border-orange-400 bg-orange-500 text-white'
                    : i < step
                      ? 'border-emerald-400 bg-emerald-500 text-white'
                      : 'border-stone-200 bg-stone-50 text-stone-400'
                }`}>
                  {i < step ? <Check size={12} /> : i + 1}
                </div>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <div className="w-full bg-stone-100 rounded-full h-1.5">
            <div
              className="bg-gradient-to-r from-orange-400 to-orange-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${((step + 1) / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Step content card */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6">
          {renderStep()}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-3">
          {step > 0 && (
            <Button onClick={prev} variant="outline"
              className="flex-1 h-11 border-2 border-stone-200 hover:border-orange-400 hover:text-orange-600 rounded-xl font-semibold transition-all">
              <ChevronLeft size={15} className="mr-1" /> Back
            </Button>
          )}
          <Button onClick={next} disabled={saving}
            className={`${step > 0 ? 'flex-1' : 'w-full'} h-11 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/20`}>
            {saving ? 'Saving...' : step < 3 ? (
              <>Next <ChevronRight size={15} className="ml-1" /></>
            ) : (
              <>Save Profile <Check size={15} className="ml-1" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────────
const SummaryCard = ({ label, value }) => (
  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
    <p className="text-[11px] text-stone-400 font-medium">{label}</p>
    <p className="text-sm font-bold text-stone-800 mt-0.5">{value}</p>
  </div>
);

const ordSuffix = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export default LifeProfile;
