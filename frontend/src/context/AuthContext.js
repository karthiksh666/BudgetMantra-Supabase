import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
const UpgradeContext = createContext(null);

const API = process.env.REACT_APP_BACKEND_URL ? `${process.env.REACT_APP_BACKEND_URL}/api` : '/api';
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState({ open: false, resource: null, limit: null });

  const clearUpgradeModal = useCallback(() => {
    setUpgradeModal({ open: false, resource: null, limit: null });
  }, []);

  const triggerUpgrade = useCallback(() => {
    setUpgradeModal({ open: true, resource: null, limit: null });
  }, []);

  const clearUserCache = useCallback(() => {
    // Remove all bm_* keys (useStaleData caches, activity flags, etc.)
    Object.keys(localStorage)
      .filter(k => k.startsWith('bm_'))
      .forEach(k => localStorage.removeItem(k));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearUserCache();
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    window.location.replace('/login');
  }, [clearUserCache]);

  // Sync logout across tabs
  useEffect(() => {
    if (!token) return;
    const handleStorage = (e) => {
      if (e.key === 'token' && !e.newValue) {
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common['Authorization'];
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [token]);

  // Global axios interceptor for 402 Payment Required
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 402) {
          const detail = error.response.data?.detail || {};
          setUpgradeModal({
            open: true,
            resource: detail.resource || null,
            limit: detail.limit != null ? detail.limit : null,
          });
        }
        return Promise.reject(error);
      }
    );
    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      // Only clear the session on explicit 401 — network errors or server restarts
      // should NOT log the user out (they'd lose their session on every deployment)
      if (error.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    clearUserCache();
    const response = await axios.post(`${API}/auth/login`, { email, password });
    // OTP second factor: backend returns { pending: true, email, masked_email }
    if (response.data.pending) {
      return { pending: true, email: response.data.email, masked_email: response.data.masked_email };
    }
    const { access_token, user: userData } = response.data;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('token', access_token);
    localStorage.setItem('bm_login_time', String(Date.now()));
    localStorage.setItem('bm_last_activity', String(Date.now()));
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  const verifyLoginOtp = async (email, otp) => {
    const response = await axios.post(`${API}/auth/login-otp/verify`, { email, otp });
    const { access_token, user: userData } = response.data;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('token', access_token);
    localStorage.setItem('bm_login_time', String(Date.now()));
    localStorage.setItem('bm_last_activity', String(Date.now()));
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  const register = async (email, password, name) => {
    clearUserCache();
    const response = await axios.post(`${API}/auth/register`, { email, password, name });
    // OTP flow: backend returns { pending: true, email, name } instead of a token
    if (response.data.pending) {
      return { pending: true, email: response.data.email, name: response.data.name };
    }
    const { access_token, user: userData } = response.data;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('token', access_token);
    localStorage.setItem('bm_login_time', String(Date.now()));
    localStorage.setItem('bm_last_activity', String(Date.now()));
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  const verifyOtp = async (email, otp) => {
    const response = await axios.post(`${API}/auth/verify-otp`, { email, otp });
    const { access_token, user: userData } = response.data;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('token', access_token);
    localStorage.setItem('bm_login_time', String(Date.now()));
    localStorage.setItem('bm_last_activity', String(Date.now()));
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  const resendOtp = async (email) => {
    await axios.post(`${API}/auth/resend-otp`, { email });
  };

  const requestPhoneOtp = async (phone) => {
    const response = await axios.post(`${API}/auth/phone-otp/request`, { phone });
    return response.data; // { pending, email, masked_email } OR { needs_registration, phone }
  };

  const registerWithPhone = async (phone, email, name) => {
    const response = await axios.post(`${API}/auth/phone-otp/register`, { phone, email, name });
    return response.data; // { pending, email, name }
  };

  const loginWithPhone = async (idToken) => {
    clearUserCache();
    const response = await axios.post(`${API}/auth/phone`, { id_token: idToken });
    const { access_token, user: userData } = response.data;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('token', access_token);
    localStorage.setItem('bm_login_time', String(Date.now()));
    localStorage.setItem('bm_last_activity', String(Date.now()));
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  const loginWithGoogle = async (credential) => {
    clearUserCache();
    const response = await axios.post(`${API}/auth/google`, { credential });
    const { access_token, user: userData } = response.data;
    setToken(access_token);
    setUser(userData);
    localStorage.setItem('token', access_token);
    localStorage.setItem('bm_login_time', String(Date.now()));
    localStorage.setItem('bm_last_activity', String(Date.now()));
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  return (
    <AuthContext.Provider value={{ user, token, login, verifyLoginOtp, register, verifyOtp, resendOtp, requestPhoneOtp, registerWithPhone, loginWithGoogle, loginWithPhone, logout, loading, refreshUser: fetchUser }}>
      <UpgradeContext.Provider value={{ upgradeModal, clearUpgradeModal, triggerUpgrade }}>
        {children}
      </UpgradeContext.Provider>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const useUpgrade = () => {
  const context = useContext(UpgradeContext);
  if (!context) {
    throw new Error('useUpgrade must be used within AuthProvider');
  }
  return context;
};
