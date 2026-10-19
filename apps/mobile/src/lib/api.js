import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

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
    await SecureStore.setItemAsync(KIND_KEY, k);
    if (r) await SecureStore.setItemAsync(REFRESH_KEY, r);
  },
  getKind: () => (kind ? Promise.resolve(kind) : SecureStore.getItemAsync(KIND_KEY)),
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  async clear() {
    accessToken = null;
    kind = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(KIND_KEY);
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
  publicPost: (path, body) => request(path, { method: 'POST', body, auth: false }),
  uploadIdPhoto: (uri) => uploadTo('/uploads/id-document', uri),
  uploadConsumerDoc: (uri) => uploadTo('/consumer/uploads', uri)
};
