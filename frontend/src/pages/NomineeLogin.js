import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ShieldCheck, Mail, Phone, KeyRound, ArrowLeft } from 'lucide-react';

export default function NomineeLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = enter details, 2 = enter OTP
  const [form, setForm] = useState({ owner_email: '', phone: '', otp: '' });
  const [loading, setLoading] = useState(false);
  const [debugOtp, setDebugOtp] = useState(''); // remove in production

  const handleRequestOtp = async () => {
    if (!form.owner_email || !form.phone) {
      toast.error('Please enter both the account email and your phone number');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/nominee-login/request`, {
        owner_email: form.owner_email.trim(),
        phone: form.phone.trim(),
      });
      toast.success('OTP generated! Ask the account holder or check WhatsApp.');
      // Demo: show OTP (remove in production when Twilio is configured)
      if (res.data.otp) setDebugOtp(res.data.otp);
      setStep(2);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!form.otp) { toast.error('Enter the OTP'); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/nominee-login/verify`, {
        owner_email: form.owner_email.trim(),
        phone: form.phone.trim(),
        otp: form.otp.trim(),
      });
      const { access_token, nominee_name, owner_name } = res.data;
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      toast.success(`Welcome, ${nominee_name}! Viewing ${owner_name}'s dashboard.`);
      navigate('/dashboard');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-stone-50 p-6">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
            <ShieldCheck size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800 font-['Outfit']">Nominee Access</h1>
          <p className="text-stone-500 text-sm mt-1.5">
            Access a trusted account you've been nominated to view
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-stone-200/60 p-6 space-y-4">

          {step === 1 ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-stone-600 text-sm font-medium flex items-center gap-1.5">
                  <Mail size={13} className="text-stone-400" /> Account Holder's Email
                </Label>
                <Input
                  type="email"
                  placeholder="owner@example.com"
                  value={form.owner_email}
                  onChange={e => setForm({ ...form, owner_email: e.target.value })}
                  className="h-11 bg-stone-50 border-stone-200 focus:border-teal-400 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-stone-600 text-sm font-medium flex items-center gap-1.5">
                  <Phone size={13} className="text-stone-400" /> Your WhatsApp Phone Number
                </Label>
                <Input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="h-11 bg-stone-50 border-stone-200 focus:border-teal-400 rounded-xl"
                />
                <p className="text-xs text-stone-400">Must match the number the account holder added as nominee</p>
              </div>

              <Button
                onClick={handleRequestOtp}
                disabled={loading}
                className="w-full h-11 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl"
              >
                {loading ? 'Sending OTP…' : 'Send OTP via WhatsApp'}
              </Button>
            </>
          ) : (
            <>
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-sm text-teal-700">
                OTP sent to <strong>{form.phone}</strong> for account <strong>{form.owner_email}</strong>
              </div>

              {debugOtp && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                  <strong>Demo OTP (remove in production):</strong> {debugOtp}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-stone-600 text-sm font-medium flex items-center gap-1.5">
                  <KeyRound size={13} className="text-stone-400" /> 6-digit OTP
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={form.otp}
                  onChange={e => setForm({ ...form, otp: e.target.value.replace(/\D/g, '') })}
                  className="h-11 bg-stone-50 border-stone-200 focus:border-teal-400 rounded-xl text-center text-lg tracking-[0.4em] font-mono"
                />
              </div>

              <Button
                onClick={handleVerify}
                disabled={loading || form.otp.length < 6}
                className="w-full h-11 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl"
              >
                {loading ? 'Verifying…' : 'Access Dashboard'}
              </Button>

              <button
                onClick={() => { setStep(1); setDebugOtp(''); }}
                className="w-full text-center text-sm text-stone-500 hover:text-teal-600 py-1"
              >
                ← Back
              </button>
            </>
          )}
        </div>

        {/* Back to login */}
        <button
          onClick={() => navigate('/login')}
          className="mt-5 flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mx-auto transition-colors"
        >
          <ArrowLeft size={14} /> Back to Login
        </button>
      </div>
    </div>
  );
}
