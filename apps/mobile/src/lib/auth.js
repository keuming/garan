import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, LOGOUT_PATH, refreshSession, tokens } from './api';

/**
 * Une seule application, trois profils choisis à l'inscription et à la connexion :
 *  - marchand        (commerçant, une boutique)
 *  - super_marchand  (grossiste, supervise ses sous-marchands)
 *  - usager          (propriétaire final d'un téléphone)
 * Les marchands et super marchands partagent le même compte (table users) ;
 * les usagers ont leur propre compte (table consumers).
 */
const AuthContext = createContext(null);

// Côté réseau : 'merchant' = marchand + super marchand ; 'consumer' = usager.
const kindOfProfile = (profile) => (profile === 'consumer' ? 'consumer' : 'merchant');

export function AuthProvider({ children }) {
  const [kind, setKind] = useState(null); // 'merchant' | 'consumer'
  const [user, setUser] = useState(null); // commerçant (users)
  const [consumer, setConsumer] = useState(null); // usager
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const loadMe = useCallback(async (k) => {
    if (k === 'consumer') {
      const { consumer: c } = await api.get('/consumer/me');
      setConsumer(c);
      setUser(null);
    } else {
      const { user: u } = await api.get('/auth/me');
      setUser(u);
      setConsumer(null);
    }
    setKind(k);
  }, []);

  useEffect(() => {
    tokens.onSessionLost(() => {
      setUser(null);
      setConsumer(null);
      setKind(null);
    });
    (async () => {
      try {
        const k = await tokens.getKind();
        if (k && (await tokens.getRefresh())) {
          await refreshSession();
          await loadMe(k);
        }
      } catch {
        /* pas de session */
      } finally {
        setReady(true);
      }
    })();
  }, [loadMe]);

  const accept = useCallback(async (k, out) => {
    await tokens.set(k, out);
    if (k === 'consumer') {
      setConsumer(out.consumer);
      setUser(null);
    } else {
      setUser(out.user);
      setConsumer(null);
    }
    setKind(k);
  }, []);

  /** profile ∈ {'merchant','super_merchant','consumer'} */
  const login = useCallback(
    async (profile, phone, pin) => {
      const k = kindOfProfile(profile);
      const out = await api.publicPost(k === 'consumer' ? '/consumer/auth/login' : '/auth/login', { phone, pin });
      // Vérifie la cohérence du profil choisi pour un commerçant
      if (k === 'merchant' && out.user.organization.type !== profile) {
        const real = out.user.organization.type === 'super_merchant' ? 'Super marchand' : 'Marchand';
        throw new Error(`Ce compte est un compte « ${real} ». Choisissez ce profil pour vous connecter.`);
      }
      await accept(k, out);
    },
    [accept]
  );

  const registerMerchant = useCallback(
    async (type, payload) => accept('merchant', await api.publicPost('/auth/register', { ...payload, type })),
    [accept]
  );
  const registerConsumer = useCallback(
    async (payload) => accept('consumer', await api.publicPost('/consumer/auth/register', payload)),
    [accept]
  );

  const logout = useCallback(async () => {
    const [k, r] = await Promise.all([tokens.getKind(), tokens.getRefresh()]);
    await tokens.clear();
    if (r && k) api.publicPost(LOGOUT_PATH[k], { refresh_token: r }).catch(() => {});
    qc.clear();
    setUser(null);
    setConsumer(null);
    setKind(null);
  }, [qc]);

  const reloadConsumer = useCallback(async () => {
    const { consumer: c } = await api.get('/consumer/me');
    setConsumer(c);
    return c;
  }, []);

  const value = useMemo(
    () => ({
      ready,
      kind,
      user,
      consumer,
      isConsumer: kind === 'consumer',
      isMerchant: kind === 'merchant',
      orgType: user?.organization?.type ?? null,
      role: user?.role ?? null,
      isOwner: user?.role === 'owner',
      isSuperMerchant: user?.organization?.type === 'super_merchant',
      login,
      registerMerchant,
      registerConsumer,
      logout,
      reloadConsumer,
      reloadUser: () => loadMe('merchant')
    }),
    [ready, kind, user, consumer, login, registerMerchant, registerConsumer, logout, reloadConsumer, loadMe]
  );
  return createElement(AuthContext.Provider, { value }, children);
}

export const useAuth = () => useContext(AuthContext);
