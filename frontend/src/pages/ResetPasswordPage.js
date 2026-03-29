import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Wallet, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({ new_password: '', confirm_password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = searchParams.get('token');
    if (t) setToken(t);
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.new_password !== formData.confirm_password) return toast.error('Passwords do not match');
    if (formData.new_password.length < 8) return toast.error('Password must be at least 8 characters');
    if (!token) return toast.error('Invalid or missing reset token. Please use the link from your email.');
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token, new_password: formData.new_password });
      toast.success('Password reset! Please log in.');
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid or expired link. Please request a new one.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-stone-900 font-['Outfit']">Invalid reset link</h1>
          <p className="text-stone-500 text-sm">This link is invalid or has expired. Request a new one.</p>
          <Link to="/forgot-password">
            <Button className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl px-6">
              Request new link
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 mb-10">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/25">
            <Wallet size={24} className="text-white" />
          </div>
          <span className="text-xl font-bold text-stone-800 font-['Outfit']">Budget Mantra</span>
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-900 mb-2 font-['Outfit']">Set new password</h1>
          <p className="text-stone-500">Choose a strong password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-stone-700 font-medium flex items-center gap-2">
              <Lock size={16} className="text-stone-400" /> New Password
            </Label>
            <div className="relative">
              <Input type={showPassword ? 'text' : 'password'} placeholder="At least 8 characters"
                value={formData.new_password}
                onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                required className="h-12 bg-white border-stone-200 focus:border-orange-400 rounded-xl px-4 pr-12" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-orange-500">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-stone-700 font-medium flex items-center gap-2">
              <Lock size={16} className="text-stone-400" /> Confirm Password
            </Label>
            <Input type={showPassword ? 'text' : 'password'} placeholder="Repeat new password"
              value={formData.confirm_password}
              onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
              required className="h-12 bg-white border-stone-200 focus:border-orange-400 rounded-xl px-4" />
          </div>

          <Button type="submit" disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-lg shadow-orange-500/25">
            {loading
              ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Resetting...</span>
              : 'Reset Password'
            }
          </Button>
        </form>

        <div className="mt-8 text-center">
          <Link to="/login" className="text-stone-500 hover:text-orange-600 text-sm font-medium flex items-center justify-center gap-1">
            <ArrowLeft size={14} /> Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
