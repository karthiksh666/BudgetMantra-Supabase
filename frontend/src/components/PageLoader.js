import { useEffect, useState } from "react";
import { IndianRupee } from "lucide-react";

/**
 * Full-page loading state with contextual rotating tips.
 * Usage: <PageLoader message="Loading your portfolio..." tips={["Calculating net worth", "Checking insurance cover"]} />
 */
const PageLoader = ({ message = "Loading...", tips = [] }) => {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (tips.length < 2) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % tips.length);
        setVisible(true);
      }, 300);
    }, 2200);
    return () => clearInterval(interval);
  }, [tips.length]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 select-none">
      {/* Branding mark */}
      <div className="p-3.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow-lg shadow-orange-500/30 mb-7">
        <IndianRupee size={26} className="text-white" />
      </div>

      {/* Spinner */}
      <div className="relative w-11 h-11 mb-6">
        <div className="absolute inset-0 rounded-full border-[3px] border-orange-100" />
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-orange-500 animate-spin" />
      </div>

      {/* Primary message */}
      <p className="text-stone-700 font-semibold text-base font-['Outfit'] text-center">
        {message}
      </p>

      {/* Rotating tip */}
      {tips.length > 0 && (
        <p
          className="text-stone-400 text-sm mt-2 text-center max-w-[260px] leading-relaxed transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {tips[idx]}
        </p>
      )}
    </div>
  );
};

export default PageLoader;
