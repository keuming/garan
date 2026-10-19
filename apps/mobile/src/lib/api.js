import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// Stockage des jetons : SecureStore sur mobile, localStorage sur le web (PWA).
const webStore = {
  getItemAsync: async (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  setItemAsync: async (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* indisponible */ } },
  deleteItemAsync: async (k) => { try { window.localStorage.removeItem(k); } catch { /* indisponible */ } }
};
const store = Platform.OS === 'web' ? webStore : SecureStore;

const BASE = `${String(Constants.expoConfig?.extra?.apiUrl ?? '').replace(/\/$/, '')}/api/v1`;
const REFRESH_KEY = 'garan.refresh';
const KIND_KEY = 'garan.kind'; // 'merchant' (marchand/super marchand) | 'consumer' (usager)

let accessToken = null;
let kind = null;
let refreshing = null;
let onSessionLost = () => {};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const REFRESH_PATH = { merchant: '/auth/refresh', consumer: '/consumer/auth/refresh' };
export const LOGOUT_PATH = { merchant: '/auth/logout', consumer: '/consumer/auth/logout' };

export const tokens = {
  async set(k, { access_token: a, refresh_token: r }) {
    kind = k;
    accessToken = a;
    await store.setItemAsync(KIND_KEY, k);
    if (r) await store.setItemAsync(REFRESH_KEY, r);
  },
  getKind: () => (kind ? Promise.resolve(kind) : store.getItemAsync(KIND_KEY)),
  getRefresh: () => store.getItemAsync(REFRESH_KEY),
  async clear() {
    accessToken = null;
    kind = null;
    await store.deleteItemAsync(REFRESH_KEY);
    await store.deleteItemAsync(KIND_KEY);
  },
  onSessionLost(fn) {
    onSessionLost = fn;
  }
};

async function doRefresh() {
  const [k, token] = await Promise.all([tokens.getKind(), tokens.getRefresh()]);
  if (!k || !token) throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée');
  const res = await fetch(`${BASE}${REFRESH_PATH[k]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: token })
  });
  if (!res.ok) {
    await tokens.clear();
    onSessionLost();
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée, reconnectez-vous');
  }
  await tokens.set(k, await res.json());
}

export function refreshSession() {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request(path, { method = 'GET', body, form, auth = true, retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Pas de connexion internet. Vérifiez votre réseau et réessayez.');
  }
  if (res.status === 401 && auth && retry && (await tokens.getRefresh())) {
    await refreshSession();
    return request(path, { method, body, form, auth, retry: false });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error?.code ?? 'HTTP_ERROR', err.error?.message ?? `Erreur ${res.status}`, err.error?.details);
  }
  return res.status === 204 ? null : res.json();
}

const qs = (params = {}) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v instanceof Date ? v.toISOString() : v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

async function uploadTo(path, uri) {
  const f = new FormData();
  f.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' });
  const { key } = await request(path, { method: 'POST', form: f });
  return key;
}

export const api = {
  get: (path, params) => request(path + qs(params)),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  publicPost: (path, body) => request(path, { method: 'POST', body, auth: false }),
  uploadIdPhoto: (uri) => uploadTo('/uploads/id-document', uri),
  uploadConsumerDoc: (uri) => uploadTo('/consumer/uploads', uri),
  uploadListingPhoto: (uri) => uploadTo('/org/listings/photo', uri)
};

/** URL absolue d'une photo d'article servie publiquement par l'API. */
export const mediaUrl = (key) => (key ? `${BASE}/public/media?key=${encodeURIComponent(key)}` : null);
/** URL publique de la vitrine d'une boutique (partage réseaux). */
export const shopPublicUrl = (shopId) => {
  const web = String(Constants.expoConfig?.extra?.publicWebUrl ?? '').replace(/\/$/, '');
  return `${web}/boutique/${shopId}`;
};
