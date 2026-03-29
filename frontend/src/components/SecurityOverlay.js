import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShieldAlert } from 'lucide-react';

export default function SecurityOverlay() {
  const { user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);

  // PrintScreen / Ctrl+P detection → warning modal
  useEffect(() => {
    const handleKey = (e) => {
      const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
      const isCtrlP = (e.ctrlKey || e.metaKey) && e.key === 'p';
      if (isPrintScreen || isCtrlP) {
        e.preventDefault();
        setShowWarning(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Right-click block while logged in
  useEffect(() => {
    if (!user) return;
    const block = (e) => e.preventDefault();
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, [user]);

  if (!user || !showWarning) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={() => setShowWarning(false)}
    >
      <div
        className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={28} className="text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-stone-800 mb-2">Screenshot Restricted</h3>
        <p className="text-stone-500 text-sm mb-5">
          Capturing financial data is restricted for your security.
        </p>
        <button
          onClick={() => setShowWarning(false)}
          className="w-full py-2.5 bg-stone-800 hover:bg-stone-900 text-white font-semibold rounded-xl transition-colors"
        >
          I Understand
        </button>
      </div>
    </div>
  );
}
