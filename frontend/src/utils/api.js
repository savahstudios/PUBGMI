// Centralised API helper — all fetch calls go through here
const BASE = import.meta.env.VITE_BACKEND_URL || '';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });

  if (res.status === 401) {
    // Session expired — redirect to login
    window.location.href = '/session-expired';
    return null;
  }
  if (res.status === 403) {
    window.location.href = '/403';
    return null;
  }
  if (res.status === 503) {
    window.location.href = '/maintenance';
    return null;
  }

  return res;
}

export const api = {
  get:    (path)         => apiFetch(path),
  post:   (path, body)   => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)   => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (path)         => apiFetch(path, { method: 'DELETE' }),
  json:   async (path)   => { const r = await apiFetch(path); return r?.ok ? r.json() : null; },
  postJson: async (path, body) => {
    const r = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
    return r?.ok ? r.json() : null;
  }
};

export default api;
