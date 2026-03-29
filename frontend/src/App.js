import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider, useAuth, useUpgrade } from "@/context/AuthContext";
import { toast } from "sonner";
import { ThemeProvider } from "@/context/ThemeContext";
import { PrivacyProvider } from "@/context/PrivacyContext";
import UpgradeModal from "@/components/UpgradeModal";
import ChanakyaWidget from "@/components/ChanakyaWidget";
import NomineeLogin from "@/pages/NomineeLogin";
import SecurityOverlay from "@/components/SecurityOverlay";
import HandLoanTracker from "@/pages/HandLoanTracker";
import CreditCardTracker from "@/pages/CreditCardTracker";
import TripPlanner from "@/pages/TripPlanner";
import GroupExpenses from "@/pages/GroupExpenses";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import Dashboard from "@/pages/Dashboard";
import BudgetManager from "@/pages/BudgetManager";
import EMIManager from "@/pages/EMIManager";
import FamilyManagement from "@/pages/FamilyManagement";
import Chatbot from "@/pages/Chatbot";
import SavingsGoals from "@/pages/SavingsGoals";
import InvestmentTracker from "@/pages/InvestmentTracker";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import OnboardingPage from "@/pages/OnboardingPage";
import SharedDashboard from "@/pages/SharedDashboard";
import SharedTrip from "@/pages/SharedTrip";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import ProfilePage from "@/pages/ProfilePage";
import FireCalculator from "@/pages/FireCalculator";
import FinancialCalendar from "@/pages/FinancialCalendar";
import IncomePage from "@/pages/IncomePage";
import DataManagement from "@/pages/DataManagement";
import AdminPortal from "@/pages/AdminPortal";

import CirclePage from "@/pages/CirclePage";
import GiftTracker from "@/pages/GiftTracker";
import RecurringExpenses from "@/pages/RecurringExpenses";
import { Toaster } from "@/components/ui/sonner";
import { DashboardProvider } from "@/context/DashboardContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
export const API = `${BACKEND_URL}/api`;
export { BACKEND_URL };

// Protected Route Component
const ProtectedRoute = ({ children, skipOnboarding = false }) => {
  const { user, loading } = useAuth();
  const tokenExists = !!localStorage.getItem('token');

  // If loading OR token exists but user hasn't hydrated yet — wait
  if (loading || (tokenExists && !user)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect new users to onboarding (except from the onboarding page itself)
  if (!skipOnboarding && !user.onboarding_complete) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
};

// Public Route Component (redirect to chatbot if logged in — Chanakya is the entry point)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/chatbot" replace />;
  }

  return children;
};

// ── Inactivity auto-logout ────────────────────────────────────────────────────
const IDLE_WARN_MS   = 25 * 60 * 1000;      // warn at 25 min
const IDLE_OUT_MS    = 30 * 60 * 1000;      // logout at 30 min (while tab is open)
const MAX_SESSION_MS = 24 * 60 * 60 * 1000; // hard logout after 24 h since last activity
const CHECK_MS       = 30 * 1000;           // check every 30s
const LS_ACTIVITY    = 'bm_last_activity';
const LS_LOGIN_TIME  = 'bm_login_time';

function InactivityGuard() {
  const { user, logout } = useAuth();
  const warnShown    = useRef(false);
  const warnToastId  = useRef(null);

  useEffect(() => {
    if (!user) return;

    // ── Check 1: max session age since login ──────────────────────────────
    const loginTime = parseInt(localStorage.getItem(LS_LOGIN_TIME) || '0', 10);
    if (loginTime && Date.now() - loginTime >= MAX_SESSION_MS) {
      logout();
      toast.error("Session expired — please sign in again.", { duration: 6000 });
      return;
    }
    // First-time guard for existing sessions that predate this feature
    if (!loginTime) {
      localStorage.setItem(LS_LOGIN_TIME, String(Date.now()));
    }

    // ── Check 2: idle time since last interaction ─────────────────────────
    const stored = parseInt(localStorage.getItem(LS_ACTIVITY) || '0', 10);
    if (stored && Date.now() - stored >= MAX_SESSION_MS) {
      logout();
      toast.error("Session expired — please sign in again.", { duration: 6000 });
      return;
    }

    // Initialise / refresh the stored timestamp
    localStorage.setItem(LS_ACTIVITY, String(Date.now()));

    const reset = () => {
      localStorage.setItem(LS_ACTIVITY, String(Date.now()));
      if (warnShown.current) {
        toast.dismiss(warnToastId.current);
        warnShown.current = false;
      }
    };

    const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));

    const timer = setInterval(() => {
      const last = parseInt(localStorage.getItem(LS_ACTIVITY) || String(Date.now()), 10);
      const idle = Date.now() - last;
      if (idle >= IDLE_OUT_MS) {
        clearInterval(timer);
        toast.dismiss(warnToastId.current);
        logout();
        localStorage.removeItem(LS_ACTIVITY);
        toast.error("You've been signed out due to inactivity.", { duration: 6000 });
      } else if (idle >= IDLE_WARN_MS && !warnShown.current) {
        warnShown.current = true;
        const secsLeft = Math.round((IDLE_OUT_MS - idle) / 1000);
        warnToastId.current = toast.warning(
          `No activity detected. You'll be signed out in ${secsLeft} seconds.`,
          {
            duration: IDLE_OUT_MS - idle,
            action: { label: "Stay logged in", onClick: reset },
          }
        );
      }
    }, CHECK_MS);

    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, reset));
      clearInterval(timer);
    };
  }, [user, logout]);

  return null;
}

// App-level upgrade modal — rendered inside AuthProvider so useUpgrade works
function AppShell() {
  const { upgradeModal, clearUpgradeModal } = useUpgrade();

  return (
    <div className="App">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
          <Route path="/shared/:token" element={<SharedDashboard />} />
          <Route path="/nominee-login" element={<NomineeLogin />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/onboarding" element={<ProtectedRoute skipOnboarding><OnboardingPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

          {/* Protected Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/budget" element={<ProtectedRoute><BudgetManager /></ProtectedRoute>} />
          <Route path="/emis" element={<ProtectedRoute><EMIManager /></ProtectedRoute>} />
          <Route path="/transactions" element={<Navigate to="/budget" replace />} />
          <Route path="/sms-tracker" element={<Navigate to="/data" replace />} />
          <Route path="/when-to-buy" element={<Navigate to="/dashboard" replace />} />
          <Route path="/family" element={<ProtectedRoute><FamilyManagement /></ProtectedRoute>} />
          <Route path="/chatbot" element={<ProtectedRoute><Chatbot /></ProtectedRoute>} />
          <Route path="/savings-goals" element={<ProtectedRoute><SavingsGoals /></ProtectedRoute>} />
          <Route path="/investments" element={<ProtectedRoute><InvestmentTracker /></ProtectedRoute>} />
          <Route path="/gold" element={<Navigate to="/investments" replace />} />
          <Route path="/hand-loans" element={<ProtectedRoute><HandLoanTracker /></ProtectedRoute>} />
          <Route path="/credit-cards" element={<ProtectedRoute><CreditCardTracker /></ProtectedRoute>} />
          <Route path="/trips" element={<ProtectedRoute><TripPlanner /></ProtectedRoute>} />
          <Route path="/trips/shared/:token" element={<SharedTrip />} />
          <Route path="/group-expenses" element={<ProtectedRoute><GroupExpenses /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><FinancialCalendar /></ProtectedRoute>} />
          <Route path="/timeline" element={<Navigate to="/dashboard" replace />} />
          <Route path="/luxury" element={<Navigate to="/investments" replace />} />
          <Route path="/children" element={<Navigate to="/dashboard" replace />} />
          <Route path="/fire" element={<ProtectedRoute><FireCalculator /></ProtectedRoute>} />
          <Route path="/subscriptions" element={<Navigate to="/budget?tab=recurring" replace />} />
          <Route path="/recurring" element={<Navigate to="/budget" replace />} />
          <Route path="/income" element={<ProtectedRoute><IncomePage /></ProtectedRoute>} />
          <Route path="/upi-parser" element={<Navigate to="/data" replace />} />
          <Route path="/events" element={<Navigate to="/trips" replace />} />
          <Route path="/data" element={<ProtectedRoute><DataManagement /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminPortal />} />
          <Route path="/circle" element={<ProtectedRoute><CirclePage /></ProtectedRoute>} />
          <Route path="/gifts" element={<ProtectedRoute><GiftTracker /></ProtectedRoute>} />
          <Route path="/recurring" element={<ProtectedRoute><RecurringExpenses /></ProtectedRoute>} />
        </Routes>

        {/* Floating Chanakya chat widget — inside Router so useLocation works */}
        <ChanakyaWidget />
      </BrowserRouter>

      {/* Global upgrade modal — catches any 402 from any page */}
      <UpgradeModal
        open={upgradeModal.open}
        onClose={clearUpgradeModal}
        resource={upgradeModal.resource}
        limit={upgradeModal.limit}
      />

      {/* Inactivity auto-logout guard */}
      <InactivityGuard />

      {/* Security watermark + screenshot deterrence */}
      <SecurityOverlay />
    </div>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID || '1088916328823-9mef6vcg47bj1gfgml9ljp62mf4r9r60.apps.googleusercontent.com'}>
      <ThemeProvider>
        <PrivacyProvider>
        <AuthProvider>
          <DashboardProvider>
            <AppShell />
          </DashboardProvider>
        </AuthProvider>
        </PrivacyProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
