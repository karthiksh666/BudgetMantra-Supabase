import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

/**
 * Stale-while-revalidate data hook for every page.
 *
 * Usage:
 *   const { data, loading, reload } = useStaleData("bm_income_cache", fetchFn);
 *
 * @param {string}   cacheKey  - localStorage key (use a unique key per page/endpoint)
 * @param {Function} fetchFn   - async function that returns the fresh data object
 * @param {object}   [options]
 * @param {string}   [options.errorMsg]  - toast message on failure (default: "Failed to load data")
 * @param {any}      [options.fallback]  - default value when no cache exists (default: null)
 *
 * Returns: { data, loading, reload }
 *   - data:    current value (cache or fresh)
 *   - loading: true only on very first load (no cache yet)
 *   - reload:  call to force a fresh fetch
 */
export function useStaleData(cacheKey, fetchFn, { errorMsg = "Failed to load data", fallback = null } = {}) {
  const readCache = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const [data,    setData]    = useState(() => readCache() ?? fallback);
  const [loading, setLoading] = useState(() => readCache() === null);
  const isMounted = useRef(true);

  const fetch_ = useCallback(async () => {
    try {
      const fresh = await fetchFn();
      if (!isMounted.current) return;
      setData(fresh);
      try { localStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch {}
    } catch {
      if (!isMounted.current) return;
      const cached = readCache();
      if (!cached) toast.error(errorMsg);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [fetchFn, cacheKey, errorMsg]);

  useEffect(() => {
    isMounted.current = true;
    fetch_();
    return () => { isMounted.current = false; };
  }, [fetch_]);

  return { data, loading, reload: fetch_ };
}
