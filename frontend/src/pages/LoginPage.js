import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Wallet, Mail, Lock, Eye, EyeOff, TrendingUp, Shield, MessageSquare } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, loginWithGoogle, verifyLoginOtp, resendOtp } = useAuth();

  // form state
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // OTP step: null | { email, masked_email }
  const [otpPending, setOtpPending] = useState(null);
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const countdownRef = useRef(null);

  const containerRef = useRef(null);
  const [googleBtnWidth, setGoogleBtnWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setGoogleBtnWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const startCountdown = () => {
    setCountdown(60);
    setCanResend(false);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(countdownRef.current); setCanResend(true); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
      toast.success('Welcome back!');
      navigate('/chatbot', { replace: true });
    } catch {
      toast.error('Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(formData.email, formData.password);
      if (result?.pending) {
        setOtpPending({ email: result.email, masked_email: result.masked_email });
        setOtp('');
        startCountdown();
      } else {
        toast.success('Welcome back!');
        navigate('/chatbot');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return toast.error('Please enter the 6-digit code.');
    setLoading(true);
    try {
      await verifyLoginOtp(otpPending.email, otp);
      toast.success('Welcome back!');
      navigate('/chatbot', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;
    try {
      await resendOtp(otpPending.email);
      startCountdown();
      toast.success('OTP resent!');
    } catch {
      toast.error('Failed to resend OTP.');
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf5]" data-testid="login-page">
      <div className="grid lg:grid-cols-2 min-h-screen">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex bg-gradient-to-br from-stone-900 via-stone-800 to-orange-900 p-12 flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-400/20 rounded-full blur-3xl"></div>
          <div className="relative">
            <Link to="/" className="flex items-center gap-3 mb-16" data-testid="auth-logo">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                <Wallet size={28} className="text-white" />
              </div>
              <span className="text-2xl font-bold text-white font-['Outfit']">Budget Mantra</span>
            </Link>
            <h2 className="text-4xl font-bold text-white mb-4 font-['Outfit'] leading-tight">
              From your first<br/>payslip to your<br/>
              <span className="text-amber-300">latest trip.</span>
            </h2>
            <p className="text-white/70 text-base max-w-md leading-relaxed">
              One app to track everything that matters — your salary, EMIs, goals, investments, and every rupee in between.
            </p>
          </div>
          <div className="relative space-y-4">
            <div className="flex items-center gap-4 text-white/90">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm"><TrendingUp size={20} /></div>
              <span>Track your budget in real-time</span>
            </div>
            <div className="flex items-center gap-4 text-white/90">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm"><Shield size={20} /></div>
              <span>Monitor your financial health</span>
            </div>
            <div className="flex items-center gap-4 text-white/90">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm"><MessageSquare size={20} /></div>
              <span>Get advice from Chanakya AI</span>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="flex items-center justify-center p-8 lg:p-12">
          <div className="w-full max-w-md">
            <div className="lg:hidden mb-8">
              <Link to="/" className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/25">
                  <Wallet size={24} className="text-white" />
                </div>
                <span className="text-xl font-bold text-stone-800 font-['Outfit']">Budget Mantra</span>
              </Link>
            </div>

            {/* OTP step */}
            {otpPending ? (
              <>
                <div className="mb-8">
                  <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                    <Mail size={26} className="text-orange-500" />
                  </div>
                  <h1 className="text-3xl font-bold text-stone-900 mb-2 font-['Outfit']">Check your email</h1>
                  <p className="text-stone-500 text-sm">
                    We sent a 6-digit code to <span className="font-semibold text-stone-700">{otpPending.masked_email}</span>
                  </p>
                  <p className="text-stone-400 text-xs mt-1">The code expires in 10 minutes.</p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-stone-700 font-medium">Verification Code</Label>
                    <Input
                      type="text" inputMode="numeric" placeholder="000000" maxLength={6}
                      value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="h-14 bg-white border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl px-4 text-center text-2xl font-bold tracking-[0.4em]"
                      autoFocus required />
                  </div>

                  <Button type="submit" disabled={loading || otp.length !== 6}
                    className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25 transition-all duration-300 disabled:opacity-50">
                    {loading
                      ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying...</span>
                      : 'Verify & Sign In'
                    }
                  </Button>

                  <div className="text-center text-sm text-stone-400">
                    Didn't receive it?{' '}
                    {canResend
                      ? <button type="button" onClick={handleResendOtp} className="text-orange-600 hover:text-orange-700 font-medium">Resend OTP</button>
                      : <span>Resend in {countdown}s</span>
                    }
                  </div>

                  <button type="button" onClick={() => { setOtpPending(null); setOtp(''); }}
                    className="w-full text-center text-sm text-stone-400 hover:text-stone-600 transition-colors">
                    ← Back to login
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-stone-900 mb-2 font-['Outfit']">Login to your account</h1>
                  <p className="text-stone-500">
                    Don't have an account?{' '}
                    <Link to="/signup" className="text-orange-600 hover:text-orange-700 font-semibold" data-testid="signup-link">Sign up</Link>
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
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
                        placeholder="Enter your password" value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required autoComplete="current-password"
                        className="h-12 bg-white border-stone-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl px-4 pr-12" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-orange-500 transition-colors"
                        data-testid="toggle-password">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <Link to="/forgot-password" className="text-sm text-orange-600 hover:text-orange-700 font-medium">Forgot password?</Link>
                  </div>

                  <Button type="submit" disabled={loading} data-testid="login-button"
                    className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-all duration-300">
                    {loading
                      ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Logging in...</span>
                      : 'Login'
                    }
                  </Button>
                </form>

                <div className="mt-6">
                  <div className="relative flex items-center gap-3 mb-5">
                    <div className="flex-1 h-px bg-stone-200" />
                    <span className="text-xs text-stone-400 font-medium">or continue with</span>
                    <div className="flex-1 h-px bg-stone-200" />
                  </div>
                  <div className="w-full flex justify-center overflow-hidden" ref={containerRef}>
                    {googleBtnWidth > 0 && (
                      <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => toast.error('Google sign-in failed')}
                        theme="outline" size="large" shape="rectangular" text="signin_with"
                        width={String(googleBtnWidth)} />
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-stone-200 text-center">
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

export default LoginPage;
