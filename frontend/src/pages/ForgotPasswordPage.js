import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Wallet, Mail, ArrowLeft } from 'lucide-react';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, { email });
      setSent(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 mb-10">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/25">
            <Wallet size={24} className="text-white" />
          </div>
          <span className="text-xl font-bold text-stone-800 font-['Outfit']">Budget Mantra</span>
        </Link>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto">
              <Mail size={30} className="text-orange-500" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900 font-['Outfit']">Check your inbox</h1>
            <p className="text-stone-500 text-sm leading-relaxed">
              We sent a password reset link to <span className="font-semibold text-stone-700">{email}</span>.
              <br />The link expires in 1 hour.
            </p>
            <p className="text-stone-400 text-xs">Didn't receive it? Check your spam folder or try again.</p>
            <button onClick={() => setSent(false)} className="text-orange-600 hover:text-orange-700 text-sm font-medium">
              Try a different email
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-stone-900 mb-2 font-['Outfit']">Forgot password?</h1>
              <p className="text-stone-500">Enter your email and we'll send you a reset link.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-stone-700 font-medium flex items-center gap-2">
                  <Mail size={16} className="text-stone-400" /> Email Address
                </Label>
                <Input id="email" type="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="h-12 bg-white border-stone-200 focus:border-orange-400 rounded-xl px-4" />
              </div>

              <Button type="submit" disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25">
                {loading
                  ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</span>
                  : 'Send Reset Link'
                }
              </Button>
            </form>
          </>
        )}

        <div className="mt-8 text-center">
          <Link to="/login" className="text-stone-500 hover:text-orange-600 text-sm font-medium transition-colors flex items-center justify-center gap-1">
            <ArrowLeft size={14} /> Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
