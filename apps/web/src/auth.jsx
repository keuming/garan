import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ensureSession, login as apiLogin, logout as apiLogout, session } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    session.onLogout(() => setAdmin(null));
    (async () => {
      if (await ensureSession()) {
        try {
          const { admin: a } = await api.get('/admin/me');
          setAdmin(a);
        } catch {
          session.clear();
        }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (email, password) => setAdmin(await apiLogin(email, password)), []);
  const logout = useCallback(async () => {
    await apiLogout();
    qc.clear();
    setAdmin(null);
  }, [qc]);

  const value = useMemo(
    () => ({ admin, ready, login, logout, setAdmin, can: (...roles) => Boolean(admin && roles.includes(admin.role)) }),
    [admin, ready, login, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
