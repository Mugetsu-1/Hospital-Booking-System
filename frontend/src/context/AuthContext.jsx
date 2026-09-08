import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function boot() {
      if (!localStorage.getItem('token')) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        if (!active) return;
        const u = res.data.user;
        setUser(u);
        localStorage.setItem('user', JSON.stringify(u));
      } catch {
        if (!active) return;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    boot();
    return () => {
      active = false;
    };
  }, []);

  function persist(t, u) {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  }

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    const { token, user: u } = res.data;
    persist(token, u);
    return u;
  }

  async function register(payload) {
    const res = await api.post('/auth/register', payload);
    const { token, user: u } = res.data;
    persist(token, u);
    return u;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  function patchUser(u) {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  }

  const value = { user, loading, login, register, logout, patchUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
