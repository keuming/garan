import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const BASE = `${String(Constants.expoConfig?.extra?.apiUrl ?? '').replace(/\/$/, '')}/api/v1`;
const REFRESH_KEY = 'garan.refresh';

let accessToken = null;
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

export const tokens = {
  async set({ access_token: a, refresh_token: r }) {
    accessToken = a;
    if (r) await SecureStore.setItemAsync(REFRESH_KEY, r);
  },
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  async clear() {
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
  onSessionLost(fn) {
    onSessionLost = fn;
  }
};

async function doRefresh() {
  const token = await tokens.getRefresh();
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée');
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: token })
  });
  if (!res.ok) {
    await tokens.clear();
    onSessionLost();
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée, reconnectez-vous');
  }
  await tokens.set(await res.json());
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
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body))
    });
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

export const api = {
  get: (path, params) => request(path + qs(params)),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  publicPost: (path, body) => request(path, { method: 'POST', body, auth: false }),

  /** Téléverse une photo de pièce d'identité ; renvoie la clé de stockage. */
  async uploadIdPhoto(uri) {
    const form = new FormData();
    form.append('file', { uri, name: 'piece.jpg', type: 'image/jpeg' });
    const { key } = await request('/uploads/id-document', { method: 'POST', form });
    return key;
  }
};
