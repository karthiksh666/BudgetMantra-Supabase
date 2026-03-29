import { useState, useEffect, useCallback } from "react";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/context/AuthContext";
import { API } from "@/App";
import axios from "axios";
import { useStaleData } from "@/hooks/useStaleData";
import { toast } from "sonner";
import { PiggyBank as PiggyIcon, Plus, Minus, Trash2, Coins, TrendingUp, TrendingDown, Wallet, Edit3, Check, X } from "lucide-react";
import YearPicker from "@/components/YearPicker";

const fmtINR = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 10000000) return `₹${(a / 10000000).toFixed(1)}Cr`;
  if (a >= 100000)   return `₹${(a / 100000).toFixed(1)}L`;
  if (a >= 1000)     return `₹${(a / 1000).toFixed(1)}K`;
  return `₹${a.toLocaleString("en-IN")}`;
};

const JAR_EMOJIS = ["🐷", "💰", "🏦", "🫙", "👜", "💼", "🧧", "🎁", "🏠", "🚗"];
const TODAY = new Date().toISOString().slice(0, 10);

export default function PiggyBankPage() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [jars, setJars] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Add jar form
  const [showAddJar, setShowAddJar] = useState(false);
  const [jarName, setJarName] = useState("");
  const [jarEmoji, setJarEmoji] = useState("🐷");
  const [jarInitial, setJarInitial] = useState("");

  // Transaction form
  const [txJar, setTxJar] = useState(null); // jar id
  const [txType, setTxType] = useState("deposit");
  const [txAmount, setTxAmount] = useState("");
  const [txNote, setTxNote] = useState("");
  const [txDate, setTxDate] = useState(TODAY);

  // Edit jar name inline
  const [editJarId, setEditJarId] = useState(null);
  const [editJarName, setEditJarName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());

  const save = useCallback(async (newJars, newTxns) => {
    try {
      await axios.put(`${API}/piggy-bank`, { jars: newJars, transactions: newTxns }, { headers });
    } catch { toast.error("Failed to save"); }
  }, [token]); // eslint-disable-line

  const fetchPiggyBank = useCallback(async () => {
    const r = await axios.get(`${API}/piggy-bank`, { headers });
    return r.data || {};
  }, [token]); // eslint-disable-line

  const { data: piggyData, loading } = useStaleData(
    "bm_piggy_bank_cache",
    fetchPiggyBank,
    { errorMsg: "Failed to load piggy bank", fallback: {} }
  );

  useEffect(() => {
    if (piggyData && (piggyData.jars || piggyData.transactions)) {
      setJars(piggyData.jars || []);
      setTransactions(piggyData.transactions || []);
    }
  }, [piggyData]);

  const addJar = () => {
    if (!jarName.trim()) { toast.error("Enter a jar name"); return; }
    const newJar = {
      id: Date.now().toString(),
      name: jarName.trim(),
      emoji: jarEmoji,
      balance: parseFloat(jarInitial) || 0,
    };
    const newJars = [...jars, newJar];
    const newTxns = parseFloat(jarInitial) > 0
      ? [...transactions, { id: Date.now().toString(), jar_id: newJar.id, type: "deposit", amount: parseFloat(jarInitial), note: "Opening balance", date: TODAY }]
      : transactions;
    setJars(newJars); setTransactions(newTxns);
    save(newJars, newTxns);
    setShowAddJar(false); setJarName(""); setJarEmoji("🐷"); setJarInitial("");
    toast.success(`${jarEmoji} ${newJar.name} created!`);
  };

  const deleteJar = (id) => {
    const newJars = jars.filter(j => j.id !== id);
    const newTxns = transactions.filter(t => t.jar_id !== id);
    setJars(newJars); setTransactions(newTxns);
    save(newJars, newTxns);
    toast.success("Jar removed");
  };

  const addTransaction = () => {
    if (!txJar) { toast.error("Select a jar"); return; }
    const amt = parseFloat(txAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const jar = jars.find(j => j.id === txJar);
    if (txType === "withdraw" && amt > jar.balance) { toast.error("Not enough cash in this jar!"); return; }
    const newTx = { id: Date.now().toString(), jar_id: txJar, type: txType, amount: amt, note: txNote.trim(), date: txDate || TODAY };
    const newJars = jars.map(j => j.id === txJar
      ? { ...j, balance: j.balance + (txType === "deposit" ? amt : -amt) }
      : j
    );
    const newTxns = [newTx, ...transactions];
    setJars(newJars); setTransactions(newTxns);
    save(newJars, newTxns);
    setTxAmount(""); setTxNote(""); setTxJar(null); setTxDate(TODAY);
    toast.success(`${txType === "deposit" ? "+" : "-"}₹${amt.toLocaleString("en-IN")} recorded!`);
  };

  const saveJarName = (id) => {
    if (!editJarName.trim()) return;
    const newJars = jars.map(j => j.id === id ? { ...j, name: editJarName.trim() } : j);
    setJars(newJars); save(newJars, transactions);
    setEditJarId(null);
  };

  const totalCash = jars.reduce((s, j) => s + (j.balance || 0), 0);
  const totalIn   = transactions.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalOut  = transactions.filter(t => t.type === "withdraw").reduce((s, t) => s + t.amount, 0);

  if (loading) return (
    <div className="min-h-screen bg-[#fffaf5]"><Navigation />
      <div className="lg:pl-64 flex items-center justify-center min-h-screen">
        <div className="text-center"><div className="text-5xl mb-3 animate-bounce">🐷</div><p className="text-stone-400 text-sm">Loading your piggy bank…</p></div>
      </div>
    </div>
  );

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-[#fffaf5]">
        <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">

          {/* Hero */}
          <div className="rounded-2xl p-5 mb-5 text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)" }}>
            <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <PiggyIcon size={20} className="opacity-90" />
                <span className="text-sm font-semibold opacity-90 font-['Outfit']">Piggy Bank</span>
                <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">FREE</span>
              </div>
              <p className="text-2xl font-bold font-['Outfit'] mb-3">Your cash at hand</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-75 mb-0.5">Total Cash</p>
                  <p className="font-bold text-sm">{fmtINR(totalCash)}</p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-75 mb-0.5">Total In</p>
                  <p className="font-bold text-sm text-green-200">{fmtINR(totalIn)}</p>
                </div>
                <div className="bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="text-xs opacity-75 mb-0.5">Total Out</p>
                  <p className="font-bold text-sm text-red-200">{fmtINR(totalOut)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Jars */}
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-stone-800 text-sm">Your Jars ({jars.length})</p>
            <button onClick={() => setShowAddJar(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-colors">
              <Plus size={13} /> Add Jar
            </button>
          </div>

          {jars.length === 0 && !showAddJar && (
            <div className="bg-white rounded-2xl border border-stone-100 p-8 text-center mb-4">
              <div className="text-5xl mb-3">🐷</div>
              <p className="text-stone-500 font-medium text-sm">No jars yet</p>
              <p className="text-xs text-stone-400 mt-1">Create a jar for your wallet, home safe, or any cash stash</p>
            </div>
          )}

          {/* Add jar form */}
          {showAddJar && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4 mb-4 shadow-sm space-y-3">
              <p className="font-bold text-stone-800 text-sm">New Cash Jar</p>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {JAR_EMOJIS.map(e => (
                  <button key={e} onClick={() => setJarEmoji(e)}
                    className={`w-9 h-9 rounded-xl text-xl transition-all ${jarEmoji === e ? 'bg-orange-100 ring-2 ring-orange-400' : 'bg-stone-50 hover:bg-stone-100'}`}>
                    {e}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Jar name (e.g. Home Safe, Wallet)" value={jarName}
                onChange={e => setJarName(e.target.value)}
                className="w-full h-10 border border-stone-200 rounded-xl px-3 text-sm focus:outline-none focus:border-orange-400" />
              <input type="number" placeholder="Opening balance ₹ (optional)" value={jarInitial}
                onChange={e => setJarInitial(e.target.value)}
                className="w-full h-10 border border-stone-200 rounded-xl px-3 text-sm focus:outline-none focus:border-orange-400" />
              <div className="flex gap-2">
                <button onClick={() => setShowAddJar(false)}
                  className="flex-1 py-2 border border-stone-200 rounded-xl text-sm text-stone-500 hover:bg-stone-50">Cancel</button>
                <button onClick={addJar}
                  className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold transition-colors">
                  Create Jar
                </button>
              </div>
            </div>
          )}

          <div className={`grid gap-3 mb-5 ${jars.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {jars.map(jar => (
              <div key={jar.id} className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-3xl">{jar.emoji}</span>
                  <button onClick={() => deleteJar(jar.id)} className="p-1 text-stone-300 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
                {editJarId === jar.id ? (
                  <div className="flex items-center gap-1 mb-1">
                    <input value={editJarName} onChange={e => setEditJarName(e.target.value)}
                      className="flex-1 h-7 border border-orange-400 rounded-lg px-2 text-xs focus:outline-none" />
                    <button onClick={() => saveJarName(jar.id)} className="p-1 text-emerald-500"><Check size={13}/></button>
                    <button onClick={() => setEditJarId(null)} className="p-1 text-stone-400"><X size={13}/></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mb-1">
                    <p className="text-xs font-semibold text-stone-700 truncate flex-1">{jar.name}</p>
                    <button onClick={() => { setEditJarId(jar.id); setEditJarName(jar.name); }} className="p-0.5 text-stone-300 hover:text-stone-500">
                      <Edit3 size={11}/>
                    </button>
                  </div>
                )}
                <p className="text-lg font-bold text-stone-900">{fmtINR(jar.balance)}</p>
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => { setTxJar(jar.id); setTxType("deposit"); }}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-[11px] font-bold transition-colors">
                    <Plus size={11}/> Add
                  </button>
                  <button onClick={() => { setTxJar(jar.id); setTxType("withdraw"); }}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-[11px] font-bold transition-colors">
                    <Minus size={11}/> Use
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick transaction panel */}
          {txJar && (
            <div className="bg-white rounded-2xl border border-orange-200 p-4 mb-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-stone-800 text-sm">
                  {txType === "deposit" ? "➕ Add Cash to" : "➖ Use Cash from"} — {jars.find(j => j.id === txJar)?.emoji} {jars.find(j => j.id === txJar)?.name}
                </p>
                <button onClick={() => setTxJar(null)} className="text-stone-400 hover:text-stone-600"><X size={16}/></button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTxType("deposit")}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${txType === "deposit" ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-500'}`}>
                  <TrendingUp size={12} className="inline mr-1" /> Deposit
                </button>
                <button onClick={() => setTxType("withdraw")}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${txType === "withdraw" ? 'bg-red-500 text-white' : 'bg-stone-100 text-stone-500'}`}>
                  <TrendingDown size={12} className="inline mr-1" /> Withdraw
                </button>
              </div>
              <input type="number" placeholder="Amount ₹" value={txAmount}
                onChange={e => setTxAmount(e.target.value)}
                className="w-full h-10 border border-stone-200 rounded-xl px-3 text-sm focus:outline-none focus:border-orange-400" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="Note (optional)" value={txNote}
                  onChange={e => setTxNote(e.target.value)}
                  className="h-10 border border-stone-200 rounded-xl px-3 text-sm focus:outline-none focus:border-orange-400" />
                <input type="date" value={txDate}
                  onChange={e => setTxDate(e.target.value)}
                  className="h-10 border border-stone-200 rounded-xl px-3 text-sm focus:outline-none focus:border-orange-400" />
              </div>
              <button onClick={addTransaction}
                className={`w-full py-2.5 rounded-xl text-sm font-bold text-white transition-colors ${txType === "deposit" ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}>
                {txType === "deposit" ? "+ Add Cash" : "- Use Cash"}
              </button>
            </div>
          )}

          {/* Recent transactions */}
          {transactions.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-stone-50 flex items-center justify-between">
                <p className="font-bold text-stone-800 text-sm">Recent Transactions</p>
                <YearPicker year={year} onChange={setYear} />
              </div>
              {(() => {
                const filteredTxns = transactions.filter(t => t.date?.startsWith(String(year)));
                return (
              <div className="divide-y divide-stone-50 max-h-80 overflow-y-auto">
                {filteredTxns.slice(0, 30).map(tx => {
                  const jar = jars.find(j => j.id === tx.jar_id);
                  return (
                    <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${tx.type === "deposit" ? "bg-emerald-50" : "bg-red-50"}`}>
                          {tx.type === "deposit"
                            ? <TrendingUp size={14} className="text-emerald-500" />
                            : <TrendingDown size={14} className="text-red-500" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-stone-700">{jar?.emoji} {jar?.name || "—"}</p>
                          <p className="text-[10px] text-stone-400">{tx.note || tx.type} · {tx.date}</p>
                        </div>
                      </div>
                      <p className={`text-sm font-bold ${tx.type === "deposit" ? "text-emerald-600" : "text-red-500"}`}>
                        {tx.type === "deposit" ? "+" : "−"}₹{tx.amount?.toLocaleString("en-IN")}
                      </p>
                    </div>
                  );
                })}
              </div>
                );
              })()}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
