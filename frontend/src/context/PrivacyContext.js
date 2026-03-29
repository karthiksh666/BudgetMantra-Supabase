import { createContext, useContext, useState } from 'react';

const PrivacyContext = createContext(null);

export const PrivacyProvider = ({ children }) => {
  // Start blurred — user taps eye to reveal
  const [hidden, setHidden] = useState(false);
  const togglePrivacy = () => setHidden(h => !h);

  return (
    <PrivacyContext.Provider value={{ hidden, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => useContext(PrivacyContext);

/**
 * Wrap any sensitive amount/value with this component.
 * When privacy mode is on it renders "••••" blurred in place of the real value.
 */
export const PrivacyAmount = ({ children, amount, format, className = '' }) => {
  const { hidden } = usePrivacy();
  const display = children ?? (format ? format(amount) : amount);
  if (hidden) {
    return (
      <span
        className={`select-none ${className}`}
        style={{ filter: 'blur(6px)', userSelect: 'none', letterSpacing: '0.1em' }}
        aria-hidden="true">
        {display}
      </span>
    );
  }
  return <span className={className}>{display}</span>;
};
