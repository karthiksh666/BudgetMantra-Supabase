import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { BACKEND_URL } from "@/App";
import { Shield, TrendingDown, Wallet, CreditCard, TrendingUp, Target } from "lucide-react";

const fmt = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

const SharedDashboard = () => {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/shared/${token}`)
      .then(r => setData(r.data))
      .catch(() => setError(true));
  }, [token]);

  if (error) return (
    <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center">
      <div className="text-center space-y-2">
        <Shield size={40} className="text-stone-300 mx-auto" />
        <p className="font-bold text-stone-700">Invalid or expired link</p>
        <p className="text-sm text-stone-400">This dashboard link is no longer active.</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center">
      <div className="animate-pulse text-stone-400 text-sm">Loading...</div>
    </div>
  );

  const sections = data.sections || ["budget", "emis"];
  const hasBudget = sections.includes("budget");
  const hasEmis = sections.includes("emis");
  const hasInvestments = sections.includes("investments");
  const hasSavingsGoals = sections.includes("savings_goals");

  const spentPct = hasBudget && data.total_expenses > 0 ? Math.min((data.total_spent / data.total_expenses) * 100, 100) : 0;
  const overBudget = hasBudget && data.total_spent > data.total_expenses;

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-600 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            <Shield size={12} /> Read-only · Shared View
          </div>
          <h1 className="text-2xl font-bold text-stone-900 font-['Outfit']">
            {data.name}'s Dashboard
          </h1>
          <p className="text-stone-400 text-sm mt-1">
            {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Budget section */}
        {hasBudget && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { label: 'Income', value: fmt(data.total_income), icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                { label: 'Budgeted', value: fmt(data.total_expenses), icon: TrendingDown, color: 'text-stone-600', bg: 'bg-stone-50', border: 'border-stone-100' },
                { label: 'Spent', value: fmt(data.total_spent), icon: TrendingDown, color: overBudget ? 'text-red-600' : 'text-orange-600', bg: overBudget ? 'bg-red-50' : 'bg-orange-50', border: overBudget ? 'border-red-100' : 'border-orange-100' },
                ...(hasEmis ? [{ label: 'EMIs', value: fmt(data.total_emi), icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' }] : []),
              ].map(({ label, value, icon: Icon, color, bg, border }) => (
                <div key={label} className={`${bg} border ${border} rounded-2xl p-4`}>
                  <Icon size={16} className={`${color} mb-2`} />
                  <p className={`text-lg font-bold font-['Outfit'] ${color}`}>{value}</p>
                  <p className="text-xs text-stone-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Spent vs Budget bar */}
            <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm mb-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-semibold text-stone-700">Spending Progress</span>
                <span className={`text-xs font-bold ${overBudget ? 'text-red-500' : 'text-orange-600'}`}>
                  {Math.round(spentPct)}% used
                </span>
              </div>
              <div className="h-3 bg-stone-100 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${overBudget ? 'bg-gradient-to-r from-red-400 to-red-500' : 'bg-gradient-to-r from-orange-400 to-orange-500'}`}
                  style={{ width: `${spentPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-stone-400">
                <span>{fmt(data.total_spent)} spent</span>
                <span>{fmt(Math.max(0, data.total_expenses - data.total_spent))} remaining</span>
              </div>
            </div>

            {/* Category breakdown */}
            {data.categories?.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm mb-5">
                <h3 className="text-sm font-bold text-stone-800 mb-4">Category Breakdown</h3>
                <div className="space-y-3">
                  {data.categories.map((cat) => {
                    const pct = cat.allocated > 0 ? Math.min((cat.spent / cat.allocated) * 100, 100) : 0;
                    const over = cat.spent > cat.allocated;
                    return (
                      <div key={cat.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-stone-600">{cat.name}</span>
                          <span className={`font-semibold ${over ? 'text-red-500' : 'text-stone-700'}`}>
                            {fmt(cat.spent)} / {fmt(cat.allocated)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${over ? 'bg-red-400' : 'bg-orange-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* EMIs section (when budget not shown, show summary card alone) */}
        {hasEmis && !hasBudget && (
          <div className="grid grid-cols-1 gap-3 mb-5">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <CreditCard size={16} className="text-blue-600 mb-2" />
              <p className="text-lg font-bold font-['Outfit'] text-blue-600">{fmt(data.total_emi)}</p>
              <p className="text-xs text-stone-500 mt-0.5">Total Monthly EMIs</p>
            </div>
          </div>
        )}

        {/* EMI list */}
        {hasEmis && data.emis?.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm mb-5">
            <h3 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2">
              <CreditCard size={15} className="text-blue-500" /> Active EMIs
            </h3>
            <div className="space-y-3">
              {data.emis.map((emi) => (
                <div key={emi.name} className="flex justify-between items-center py-2 border-b border-stone-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-stone-700">{emi.name}</p>
                    {emi.remaining_months > 0 && (
                      <p className="text-xs text-stone-400">{emi.remaining_months} months left</p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-blue-600">{fmt(emi.amount)}/mo</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Investments section */}
        {hasInvestments && (
          <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm mb-5">
            <h3 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2">
              <TrendingUp size={15} className="text-emerald-500" /> Investments
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-xs text-stone-500 mb-0.5">Invested</p>
                <p className="text-base font-bold text-emerald-700 font-['Outfit']">{fmt(data.total_invested)}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs text-stone-500 mb-0.5">Current Value</p>
                <p className="text-base font-bold text-blue-700 font-['Outfit']">{fmt(data.total_current_value)}</p>
              </div>
            </div>
            {data.investments?.length > 0 && (
              <div className="space-y-2">
                {data.investments.map((inv) => {
                  const gain = inv.current - inv.invested;
                  return (
                    <div key={inv.name} className="flex justify-between items-center py-2 border-b border-stone-50 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-stone-700">{inv.name}</p>
                        <p className="text-xs text-stone-400 capitalize">{inv.type.replace(/_/g, ' ')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-stone-700">{fmt(inv.current)}</p>
                        <p className={`text-xs font-semibold ${gain >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {gain >= 0 ? '+' : ''}{fmt(gain)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Savings Goals section */}
        {hasSavingsGoals && data.savings_goals?.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm mb-5">
            <h3 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2">
              <Target size={15} className="text-orange-500" /> Savings Goals
            </h3>
            <div className="space-y-4">
              {data.savings_goals.map((goal) => {
                const pct = goal.target > 0 ? Math.min((goal.saved / goal.target) * 100, 100) : 0;
                return (
                  <div key={goal.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-stone-700 font-semibold">{goal.name}</span>
                      <span className="text-stone-500">{fmt(goal.saved)} / {fmt(goal.target)}</span>
                    </div>
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-stone-400 mt-1">
                      <span>{Math.round(pct)}% saved</span>
                      {goal.target_date && <span>Target: {goal.target_date}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-stone-300 mt-8">Powered by BudgetMantra</p>
      </div>
    </div>
  );
};

export default SharedDashboard;
