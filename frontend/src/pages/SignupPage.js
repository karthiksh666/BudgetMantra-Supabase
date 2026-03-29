import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Wallet, Mail, Lock, User, Eye, EyeOff, CheckCircle, Sparkles, Shield, ArrowLeft } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

/* ─── Animated left-panel illustration ─────────────────────────── */
function FinanceAnimation() {
  return (
    <>
      <style>{`
        @keyframes floatA {
          0%,100%{transform:translateY(0px) rotate(-1deg)}
          50%{transform:translateY(-14px) rotate(1deg)}
        }
        @keyframes floatB {
          0%,100%{transform:translateY(0px) rotate(1.5deg)}
          50%{transform:translateY(-10px) rotate(-1deg)}
        }
        @keyframes floatC {
          0%,100%{transform:translateY(0px) rotate(-0.5deg)}
          50%{transform:translateY(-18px) rotate(0.5deg)}
        }
        @keyframes pulseRing {
          0%,100%{stroke-dashoffset:56}
          50%{stroke-dashoffset:20}
        }
        @keyframes barGrow {
          0%{width:0%} 100%{width:72%}
        }
        @keyframes barGrow2 {
          0%{width:0%} 100%{width:45%}
        }
        @keyframes fadeUp {
          0%{opacity:0;transform:translateY(20px)} 100%{opacity:1;transform:translateY(0)}
        }
        @keyframes blinkDot {
          0%,100%{opacity:1} 50%{opacity:0.2}
        }
        .card-a { animation: floatA 5s ease-in-out infinite; }
        .card-b { animation: floatB 6.5s ease-in-out infinite; animation-delay: -2s; }
        .card-c { animation: floatC 4.8s ease-in-out infinite; animation-delay: -1s; }
        .fade-up-1 { animation: fadeUp 0.8s ease both; animation-delay: 0.1s; }
        .fade-up-2 { animation: fadeUp 0.8s ease both; animation-delay: 0.3s; }
        .fade-up-3 { animation: fadeUp 0.8s ease both; animation-delay: 0.5s; }
        .live-dot { animation: blinkDot 1.6s ease-in-out infinite; }
      `}</style>

      <div className="relative w-full h-80 select-none pointer-events-none">

        {/* Paycheck card */}
        <div className="card-a absolute left-0 top-4 w-56"
          style={{ background: 'linear-gradient(135deg, #78350f, #b45309)', borderRadius: 16, padding: '14px 16px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>💰</div>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600 }}>MONTHLY TAKE-HOME</span>
          </div>
          <div style={{ color: '#fff', fontSize: 24, fontWeight: 900, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.5px' }}>₹82,450</div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 4 }}>Infosys · March 2026</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            {[['Gross','₹95K','rgba(255,255,255,0.15)'],['TDS','₹9K','rgba(220,38,38,0.4)'],['PF','₹3.5K','rgba(255,255,255,0.15)']].map(([l,v,bg]) => (
              <div key={l} style={{ background: bg, borderRadius: 8, padding: '4px 7px', flex: 1 }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>{l}</div>
                <div style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Health score card */}
        <div className="card-b absolute right-0 top-0 w-44"
          style={{ background: 'linear-gradient(135deg, #064e3b, #047857)', borderRadius: 16, padding: '14px 16px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 11 }}>🛡️</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Financial Health</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="54" height="54" viewBox="0 0 54 54">
              <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
              <circle cx="27" cy="27" r="22" fill="none" stroke="#34d399" strokeWidth="6"
                strokeDasharray="138" strokeDashoffset="34"
                strokeLinecap="round" transform="rotate(-90 27 27)" />
              <text x="27" y="32" textAnchor="middle" fill="white" fontSize="13" fontWeight="900" fontFamily="Outfit,sans-serif">78</text>
            </svg>
            <div>
              <div style={{ color: '#34d399', fontSize: 12, fontWeight: 700 }}>Good ✓</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, lineHeight: 1.4 }}>EMI burden<br/>within limits</div>
            </div>
          </div>
        </div>

        {/* Trip card */}
        <div className="card-c absolute left-10 bottom-0 w-60"
          style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', borderRadius: 16, padding: '14px 16px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>✈️</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600 }}>Bali Trip Plan</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa' }} />
              <span style={{ color: '#a78bfa', fontSize: 9, fontWeight: 600 }}>AI</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[['Budget','₹1.2L'],['Days','7'],['Saved','₹45K']].map(([l,v]) => (
              <div key={l} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '5px 8px', textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9 }}>{l}</div>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 10px', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
            📍 Day 1: Arrive Ngurah Rai · Seminyak Beach · Dinner at Ku De Ta
          </div>
        </div>

        {/* Decorative dots */}
        {[[10,'#f59e0b'],[60,'#34d399'],[110,'#a78bfa'],[160,'#fb923c']].map(([top, c]) => (
          <div key={top} style={{ position:'absolute', right: 12, top, width: 6, height: 6, borderRadius: '50%', background: c, opacity: 0.5 }} />
        ))}
      </div>
    </>
  );
}

/* ─── OTP verification step ─────────────────────────────────────── */
function OtpStep({ email, name, onVerified, onBack }) {
  const { verifyOtp, resendOtp } = useAuth();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleVerify = useCallback(async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      await verifyOtp(email, otp);
      toast.success(`Welcome to Budget Mantra, ${name}! 🎉`);
      onVerified();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [otp, email, name, verifyOtp, onVerified]);

  const handleResend = async () => {
    if (!canResend) return;
    try {
      await resendOtp(email);
      setCountdown(60);
      setCanResend(false);
      toast.success('New OTP sent to your email!');
    } catch {
      toast.error('Failed to resend OTP. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-md">
      <button onClick={onBack} className="flex items-center gap-1.5 text-stone-500 hover:text-orange-600 text-sm font-medium mb-6 transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="mb-8">
        <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mb-4">
          <Mail size={26} className="text-orange-500" />
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mb-1.5 font-['Outfit']">Verify your email</h1>
        <p className="text-stone-500 text-sm">
          We sent a 6-digit code to <span className="font-semibold text-stone-700">{email}</span>.<br/>
          Enter it below to activate your account.
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="otp" className="text-stone-700 font-medium">Verification Code</Label>
          <Input
            id="otp"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            className="h-14 bg-white border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl px-4 text-center text-2xl font-bold tracking-[0.5em] text-stone-900"
          />
        </div>

        <Button type="submit" disabled={loading || otp.length !== 6}
          className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25 transition-all duration-300">
          {loading
            ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying...</span>
            : 'Verify & Create Account'}
        </Button>
      </form>

      <p className="text-sm text-stone-500 text-center mt-5">
        Didn't receive it?{' '}
        {canResend
          ? <button onClick={handleResend} className="text-orange-600 hover:text-orange-700 font-semibold">Resend OTP</button>
          : <span className="text-stone-400">Resend in {countdown}s</span>
        }
      </p>
    </div>
  );
}

/* ─── Main signup page ──────────────────────────────────────────── */
const SignupPage = () => {
  const navigate = useNavigate();
  const { register, loginWithGoogle } = useAuth();
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpPending, setOtpPending] = useState(null); // { email, name } when awaiting OTP
  const containerRef = useRef(null);
  const [googleBtnWidth, setGoogleBtnWidth] = useState(400);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setGoogleBtnWidth(containerRef.current.offsetWidth);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const passwordRules = [
    { label: 'At least 8 characters',       test: (p) => p.length >= 8 },
    { label: 'One uppercase letter (A–Z)',   test: (p) => /[A-Z]/.test(p) },
    { label: 'One lowercase letter (a–z)',   test: (p) => /[a-z]/.test(p) },
    { label: 'One number (0–9)',             test: (p) => /[0-9]/.test(p) },
    { label: 'One special character (!@#$)', test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];
  const passed = passwordRules.filter(r => r.test(formData.password)).length;
  const strength = passed <= 1 ? 'Weak' : passed <= 3 ? 'Fair' : passed === 4 ? 'Good' : 'Strong';
  const strengthColor = passed <= 1 ? 'bg-red-500' : passed <= 3 ? 'bg-amber-500' : passed === 4 ? 'bg-blue-500' : 'bg-emerald-500';
  const strengthText = passed <= 1 ? 'text-red-500' : passed <= 3 ? 'text-amber-500' : passed === 4 ? 'text-blue-500' : 'text-emerald-500';

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
      toast.success('Welcome to BudgetMantra!');
      navigate('/chatbot');
    } catch {
      toast.error('Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passed < 5) { toast.error('Please meet all password requirements'); return; }
    setLoading(true);
    try {
      const result = await register(formData.email, formData.password, formData.name);
      if (result?.pending) {
        setOtpPending({ email: result.email, name: result.name });
      } else {
        toast.success('Account created successfully!');
        navigate('/chatbot');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf5]" data-testid="signup-page">
      <div className="grid lg:grid-cols-2 min-h-screen">

        {/* Left Side - Branding + Animation */}
        <div className="hidden lg:flex bg-gradient-to-br from-stone-900 via-stone-800 to-orange-900 p-12 flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl" />

          {/* Logo */}
          <div className="relative">
            <Link to="/" className="flex items-center gap-3 mb-12" data-testid="auth-logo">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                <Wallet size={28} className="text-white" />
              </div>
              <span className="text-2xl font-bold text-white font-['Outfit']">Budget Mantra</span>
            </Link>

            {/* Headline */}
            <h2 className="text-4xl font-bold text-white mb-4 font-['Outfit'] leading-tight">
              Your financial journey<br/>starts <span className="text-amber-300">right here.</span>
            </h2>
            <p className="text-white/60 text-sm max-w-sm leading-relaxed mb-8">
              Payslips, trips, EMIs, goals — everything in one place, beautifully designed for Indians.
            </p>

            {/* Animated cards illustration */}
            <FinanceAnimation />
          </div>

          {/* Bottom feature bullets */}
          <div className="relative space-y-3 mt-4">
            <div className="flex items-center gap-4 text-white/80">
              <div className="p-2 bg-white/15 rounded-lg backdrop-blur-sm"><CheckCircle size={18} /></div>
              <span className="text-sm">Free forever, no credit card required</span>
            </div>
            <div className="flex items-center gap-4 text-white/80">
              <div className="p-2 bg-white/15 rounded-lg backdrop-blur-sm"><Sparkles size={18} /></div>
              <span className="text-sm">Set up in less than 2 minutes</span>
            </div>
            <div className="flex items-center gap-4 text-white/80">
              <div className="p-2 bg-white/15 rounded-lg backdrop-blur-sm"><Shield size={18} /></div>
              <span className="text-sm">Your data is secure and private</span>
            </div>
          </div>
        </div>

        {/* Right Side - Form or OTP Step */}
        <div className="flex items-center justify-center px-5 py-8 lg:p-12">
          <div className="w-full max-w-md">
          {otpPending ? (
            <OtpStep
              email={otpPending.email}
              name={otpPending.name}
              onVerified={() => navigate('/chatbot')}
              onBack={() => setOtpPending(null)}
            />
          ) : (
            <>
            <div className="lg:hidden mb-5">
              <Link to="/" className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/25">
                  <Wallet size={22} className="text-white" />
                </div>
                <span className="text-lg font-bold text-stone-800 font-['Outfit']">Budget Mantra</span>
              </Link>
            </div>

            <div className="mb-5 lg:mb-8">
              <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mb-1.5 font-['Outfit']">Create your account</h1>
              <p className="text-stone-500 text-sm">
                Already have an account?{' '}
                <Link to="/login" className="text-orange-600 hover:text-orange-700 font-semibold" data-testid="login-link">Login</Link>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" data-testid="signup-form">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-stone-700 font-medium flex items-center gap-2">
                  <User size={16} className="text-stone-400" /> Full Name
                </Label>
                <Input id="name" type="text" data-testid="name-input" placeholder="John Doe"
                  value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required autoComplete="name"
                  className="h-12 bg-white border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl px-4" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-stone-700 font-medium flex items-center gap-2">
                  <Mail size={16} className="text-stone-400" /> Email Address
                </Label>
                <Input id="email" type="email" data-testid="email-input" placeholder="you@example.com"
                  value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required autoComplete="email"
                  className="h-12 bg-white border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl px-4" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-stone-700 font-medium flex items-center gap-2">
                  <Lock size={16} className="text-stone-400" /> Password
                </Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} data-testid="password-input"
                    placeholder="At least 8 characters" value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required autoComplete="new-password" minLength={8}
                    className="h-12 bg-white border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl px-4 pr-12" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-orange-500 transition-colors"
                    data-testid="toggle-password">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {formData.password.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex gap-1">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= passed ? strengthColor : 'bg-stone-200'}`} />
                        ))}
                      </div>
                      <span className={`text-xs font-semibold ${strengthText}`}>{strength}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-0.5">
                      {passwordRules.map(rule => (
                        <p key={rule.label} className={`text-[11px] flex items-center gap-1.5 ${rule.test(formData.password) ? 'text-emerald-600' : 'text-stone-400'}`}>
                          <span>{rule.test(formData.password) ? '✓' : '○'}</span> {rule.label}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" disabled={loading} data-testid="signup-button"
                className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-all duration-300">
                {loading
                  ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating account...</span>
                  : 'Create Account'}
              </Button>

              <p className="text-xs text-stone-400 text-center">By signing up, you agree to our{' '}
                <Link to="/terms" className="hover:text-orange-500 underline">Terms of Service</Link> and{' '}
                <Link to="/privacy" className="hover:text-orange-500 underline">Privacy Policy</Link>
              </p>
            </form>

            <div className="mt-4">
              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-stone-200" />
                <span className="text-xs text-stone-400 font-medium">or continue with</span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>
              <div className="w-full overflow-hidden" ref={containerRef}>
                <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => toast.error('Google sign-in failed')}
                  theme="outline" size="large" shape="rectangular" text="signup_with"
                  width={String(googleBtnWidth)} />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-stone-200 text-center">
              <Link to="/" className="text-stone-500 hover:text-orange-600 text-sm font-medium transition-colors" data-testid="back-home">← Back to Home</Link>
            </div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
