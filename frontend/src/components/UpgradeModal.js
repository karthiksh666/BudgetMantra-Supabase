import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Check, X } from "lucide-react";
import axios from "axios";
import { API } from "@/App";
import { useAuth } from "@/context/AuthContext";

const COMPARISON = [
  { feature: "Budget Categories",  free: "5 max",      pro: "Unlimited" },
  { feature: "EMIs",               free: "3 max",      pro: "Unlimited" },
  { feature: "Savings Goals",      free: "1 max",      pro: "Unlimited" },
  { feature: "AI Messages",        free: "20/month",   pro: "Unlimited" },
  { feature: "Investments",        free: false,        pro: true        },
  { feature: "Trip Planner",       free: false,        pro: true        },
  { feature: "Group Expenses",     free: false,        pro: true        },
  { feature: "Hand Loans",         free: false,        pro: true        },
  { feature: "Credit Cards",       free: false,        pro: true        },
  { feature: "UPI Import",         free: false,        pro: true        },
  { feature: "WhatsApp Alerts",    free: false,        pro: true        },
  { feature: "Family Sharing",     free: false,        pro: true        },
];

const RESOURCE_LABEL = {
  categories:    "budget categories",
  emis:          "EMIs",
  savings_goals: "savings goals",
  ai_messages:   "AI messages",
};

const UpgradeModal = ({ open, onClose, resource, limit }) => {
  const { refreshUser } = useAuth();
  const [simulating, setSimulating] = useState(false);
  const resourceLabel = RESOURCE_LABEL[resource] || resource;

  const handleSimulateUpgrade = async () => {
    setSimulating(true);
    try {
      await axios.post(`${API}/auth/toggle-pro`);
      await refreshUser();
      onClose();
    } catch {
      // silently ignore
    } finally {
      setSimulating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="p-0 overflow-hidden max-w-md rounded-2xl border-0 shadow-2xl"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {/* Orange gradient header */}
        <div className="relative bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 px-6 pt-6 pb-8 text-white overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 shadow-md">
              <Crown size={24} className="text-white" />
            </div>
            <h2 className="text-xl font-bold font-['Outfit'] leading-snug">
              {resource ? "You've reached your free limit" : "Unlock Budget Mantra Pro"}
            </h2>
            {resource ? (
              limit != null && (
                <p className="text-white/80 text-sm mt-1.5">
                  Free plan allows up to{" "}
                  <span className="text-white font-semibold">
                    {limit} {resourceLabel}
                  </span>
                  . Upgrade for unlimited access.
                </p>
              )
            ) : (
              <p className="text-white/80 text-sm mt-1.5">
                Everything you need to take full control of your finances.
              </p>
            )}
          </div>
        </div>

        {/* Comparison table */}
        <div className="px-6 pt-5 pb-4">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            What's included
          </p>
          <div className="rounded-xl border border-stone-100 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-3 bg-stone-50 px-4 py-2.5 border-b border-stone-100">
              <span className="text-xs font-semibold text-stone-500">Feature</span>
              <span className="text-xs font-semibold text-stone-400 text-center">Free</span>
              <span className="text-xs font-semibold text-orange-600 text-center">Pro</span>
            </div>
            {/* Rows */}
            {COMPARISON.map(({ feature, free, pro }, i) => (
              <div
                key={feature}
                className={`grid grid-cols-3 px-4 py-2.5 items-center ${
                  i < COMPARISON.length - 1 ? "border-b border-stone-50" : ""
                }`}
              >
                <span className="text-sm text-stone-700 font-medium">{feature}</span>
                <div className="flex justify-center">
                  {free === false ? (
                    <X size={14} className="text-stone-300" />
                  ) : (
                    <span className="text-xs text-stone-500">{free}</span>
                  )}
                </div>
                <div className="flex justify-center">
                  {pro === true ? (
                    <Check size={14} className="text-orange-500" />
                  ) : (
                    <span className="text-xs font-semibold text-orange-600">{pro}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-2.5">
          <a href="mailto:mantrabudget@gmail.com?subject=Pro Upgrade" className="block">
            <Button className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md shadow-orange-300/40 font-semibold text-sm h-11">
              <Crown size={15} className="mr-2" /> Upgrade to Pro
            </Button>
          </a>

          <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-600 transition-colors py-1">
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
