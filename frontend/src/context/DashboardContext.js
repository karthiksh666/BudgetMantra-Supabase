import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import axios from "axios";
import { API } from "@/App";
import { useAuth } from "@/context/AuthContext";

// Cache is invalidated automatically after any write (POST/PUT/DELETE) anywhere in the app.
const CACHE_TTL = 20 * 60 * 1000; // 20 min — only reached if user makes no mutations

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const { user } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const lastFetch = useRef(0);
  const inflight  = useRef(false);

  const fetchAll = useCallback(async ({ force = false } = {}) => {
    if (!user) return;
    const now = Date.now();
    if (!force && lastFetch.current > 0 && (now - lastFetch.current) < CACHE_TTL) return;
    if (inflight.current) return;
    inflight.current = true;
    setLoading(prev => lastFetch.current === 0 ? true : prev); // spinner only on first load
    try {
      const [sumRes, emisRes, txnRes, scoreRes, goalsRes, loansRes, invRes, ccRes] = await Promise.allSettled([
        axios.get(`${API}/budget-summary`),
        axios.get(`${API}/emis`),
        axios.get(`${API}/transactions?limit=5`),
        axios.get(`${API}/financial-score`),
        axios.get(`${API}/savings-goals-summary`),
        axios.get(`${API}/hand-loans`),
        axios.get(`${API}/investments`),
        axios.get(`${API}/credit-cards`),
      ]);
      setData({
        summary:      sumRes.status   === "fulfilled" ? sumRes.value.data                                    : null,
        emis:         emisRes.status  === "fulfilled" ? emisRes.value.data || []                             : [],
        recent:       txnRes.status   === "fulfilled" ? (txnRes.value.data?.transactions?.slice(0, 5) || []) : [],
        score:        scoreRes.status === "fulfilled" ? scoreRes.value.data                                  : null,
        goals:        goalsRes.status === "fulfilled" ? goalsRes.value.data                                  : null,
        loans:        loansRes.status === "fulfilled" ? loansRes.value.data || []                            : [],
        investments:  invRes.status   === "fulfilled" ? invRes.value.data || []                              : [],
        creditCards:  ccRes.status    === "fulfilled" ? (ccRes.value.data || []).filter(c => c.is_active)   : [],
      });
      lastFetch.current = Date.now();
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }, [user]); // stable — uses refs for cache check, no data dependency

  // Invalidate when Chanakya logs something
  useEffect(() => {
    const onLog = () => { lastFetch.current = 0; fetchAll({ force: true }); };
    window.addEventListener("chanakya-logged", onLog);
    return () => window.removeEventListener("chanakya-logged", onLog);
  }, [fetchAll]);

  // ── Global axios interceptor — re-fetch dashboard after ANY write ──────────
  // Covers every page: EMI, Goals, Investments, Hand Loans, Transactions, etc.
  useEffect(() => {
    const id = axios.interceptors.response.use((response) => {
      const method = (response.config.method || "").toUpperCase();
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        lastFetch.current = 0;
        fetchAll({ force: true }); // re-fetch immediately in the background
      }
      return response;
    });
    return () => axios.interceptors.response.eject(id);
  }, [fetchAll]);

  // Re-fetch when the browser tab becomes visible (user returns from another tab)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchAll]);

  // Reset when user logs out
  useEffect(() => {
    if (!user) { setData(null); lastFetch.current = 0; }
  }, [user]);

  return (
    <DashboardContext.Provider value={{ data, loading, prefetch: fetchAll }}>
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);
