import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

// Day = 06:00–18:59, Night = 19:00–05:59
const isNightTime = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
};

const MANUAL_KEY = 'bm-theme-manual'; // 'dark' | 'light' | null (auto)

export const ThemeProvider = ({ children }) => {
  const [manual, setManual] = useState(() => localStorage.getItem(MANUAL_KEY)); // null = auto
  const [auto, setAuto] = useState(() => isNightTime()); // tracks time-based value

  // Derived: what dark actually is
  const dark = manual !== null ? manual === 'dark' : auto;

  // ── Apply to DOM ──────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [dark]);

  // ── Time-based auto update every 60 s ────────────────────────────
  useEffect(() => {
    const tick = () => setAuto(isNightTime());
    tick(); // run immediately
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Toggle: manual override; clicking again while already manual
  //    in that state → reset to auto ────────────────────────────────
  const toggleDark = useCallback(() => {
    setManual(prev => {
      const next = dark ? 'light' : 'dark'; // what we'd switch to
      // If already manually set to that value, clicking again resets to auto
      if (prev === next) {
        localStorage.removeItem(MANUAL_KEY);
        return null;
      }
      localStorage.setItem(MANUAL_KEY, next);
      return next;
    });
  }, [dark]);

  // ── Explicitly reset to auto ──────────────────────────────────────
  const resetToAuto = useCallback(() => {
    localStorage.removeItem(MANUAL_KEY);
    setManual(null);
  }, []);

  const isAuto = manual === null;

  return (
    <ThemeContext.Provider value={{ dark, toggleDark, resetToAuto, isAuto }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
