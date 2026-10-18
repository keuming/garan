/**
 * Client HTTP du back-office.
 * - Jeton d'accès en mémoire, jeton de rafraîchissement en localStorage.
 * - Sur 401, un seul rafraîchissement est tenté (requêtes concurrentes mutualisées).
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api/v1';
const REFRESH_KEY = 'garan.admin.refresh';

let accessToken = null;
let refreshing = null;
let onLogout = () => {};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const session = {
  setTokens({ access_token: a, refresh_token: r }) {
    accessToken = a;
    try {
      if (r) localStorage.setItem(REFRESH_KEY, r);
    } catch {
      /* stockage indisponible */
    }
  },
  getRefresh() {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
  onLogout(fn) {
    onLogout = fn;
  }
};

async function refresh() {
  const token = session.getRefresh();
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée');
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: token })
  });
  if (!res.ok) {
    session.clear();
    onLogout();
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée');
  }
  session.setTokens(await res.json());
}

export async function ensureSession() {
  if (accessToken) return true;
  if (!session.getRefresh()) return false;
  try {
    refreshing ??= refresh().finally(() => (refreshing = null));
    await refreshing;
    return true;
  } catch {
    return false;
  }
}

async function raw(path, { method = 'GET', body, auth = true, retry = true, as = 'json' } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 401 && auth && retry && session.getRefresh()) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    await refreshing;
    return raw(path, { method, body, auth, retry: false, as });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error?.code ?? 'HTTP_ERROR', err.error?.message ?? `Erreur ${res.status}`, err.error?.details);
  }
  if (res.status === 204) return null;
  return as === 'blob' ? res.blob() : res.json();
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (path, params) => raw(path + qs(params)),
  post: (path, body) => raw(path, { method: 'POST', body: body ?? {} }),
  patch: (path, body) => raw(path, { method: 'PATCH', body }),
  del: (path) => raw(path, { method: 'DELETE' }),
  blob: (path, params) => raw(path + qs(params), { as: 'blob' }),
  public: (path, opts = {}) => raw(path, { ...opts, auth: false })
};

export async function login(email, password) {
  const out = await raw('/auth/admin/login', { method: 'POST', body: { email, password }, auth: false });
  session.setTokens(out);
  return out.admin;
}

export async function logout() {
  const token = session.getRefresh();
  session.clear();
  if (token) await raw('/auth/logout', { method: 'POST', body: { refresh_token: token }, auth: false }).catch(() => {});
}
