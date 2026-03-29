import { useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Drop-in reset button for any page.
 * Props:
 *   feature  — API slug, e.g. "transactions", "emis", "gold", "luxury-items"
 *   label    — Human label shown in dialog, e.g. "all transactions"
 *   onReset  — callback after successful reset (re-fetch data)
 */
export default function ResetDataButton({ feature, label, onReset, className }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState('');

  const CONFIRM_PHRASE = 'DELETE';

  const handleReset = async () => {
    if (confirmed.trim().toUpperCase() !== CONFIRM_PHRASE) {
      toast.error(`Type ${CONFIRM_PHRASE} to confirm`);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.delete(`${API}/reset/${feature}`);
      toast.success(`Deleted ${res.data.deleted} ${label} entries`);
      setOpen(false);
      setConfirmed('');
      onReset?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className || "inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-rose-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20"}
        title={`Reset all ${label}`}>
        <Trash2 size={13} />
        Reset
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center">
                <AlertTriangle size={18} className="text-rose-500" />
              </div>
              <button onClick={() => { setOpen(false); setConfirmed(''); }}
                className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>
            <h3 className="font-bold text-stone-800 dark:text-stone-100 text-lg font-['Outfit'] mb-1">
              Delete all {label}?
            </h3>
            <p className="text-stone-500 dark:text-stone-400 text-sm mb-4 leading-relaxed">
              This will permanently remove <strong>all your {label}</strong>. This action cannot be undone.
            </p>
            <div className="mb-4">
              <p className="text-xs text-stone-500 mb-1.5">Type <strong className="text-rose-500">DELETE</strong> to confirm:</p>
              <input
                value={confirmed}
                onChange={e => setConfirmed(e.target.value)}
                placeholder="DELETE"
                className="w-full h-9 rounded-lg border border-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-400"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleReset()}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setOpen(false); setConfirmed(''); }}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 text-sm font-semibold hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleReset} disabled={loading || confirmed.trim().toUpperCase() !== CONFIRM_PHRASE}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {loading ? 'Deleting…' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
