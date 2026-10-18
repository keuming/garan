import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, tokens } from './api';

export const VARIANT = Constants.expoConfig?.extra?.variant ?? 'shop';
export const IS_SUPERVISOR_APP = VARIANT === 'supervisor';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const loadProfile = useCallback(async () => {
    const { user: u } = await api.get('/auth/me');
    setUser(u);
    return u;
  }, []);

  useEffect(() => {
    tokens.onSessionLost(() => setUser(null));
    (async () => {
      try {
        if (await tokens.getRefresh()) {
          await refreshSession();
          await loadProfile();
        }
      } catch {
        // pas de session valide : écran de connexion
      } finally {
        setReady(true);
      }
    })();
  }, [loadProfile]);

  const accept = useCallback(async (out) => {
    if (IS_SUPERVISOR_APP && out.user.role !== 'owner') {
      throw new Error('L’application Superviseur est réservée au compte principal. Utilisez gaRAN Magasin.');
    }
    await tokens.set(out);
    setUser(out.user);
  }, []);

  const login = useCallback(async (phone, pin) => accept(await api.publicPost('/auth/login', { phone, pin })), [accept]);
  const register = useCallback(async (payload) => accept(await api.publicPost('/auth/register', payload)), [accept]);

  const logout = useCallback(async () => {
    const r = await tokens.getRefresh();
    await tokens.clear();
    if (r) api.publicPost('/auth/logout', { refresh_token: r }).catch(() => {});
    qc.clear();
    setUser(null);
  }, [qc]);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, reload: loadProfile, isOwner: user?.role === 'owner' }),
    [user, ready, login, register, logout, loadProfile]
  );
  return createElement(AuthContext.Provider, { value }, children);
}

export const useAuth = () => useContext(AuthContext);
