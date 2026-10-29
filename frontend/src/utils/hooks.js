// BUG-80 FIXED: useApi hook dependency array - path is explicit dep
import { useState, useEffect, useCallback, useRef } from 'react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

export function useApi(path, options = {}) {
  const { deps = [], refreshInterval = 0, skip = false } = options;
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(!skip);
  const [error,   setError]   = useState(null);
  const mountedRef = useRef(true);

  // BUG-80 FIXED: path is explicitly in useCallback deps, not spread into array
  const fetchData = useCallback(async () => {
    if (skip || !path) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}${path}`, { credentials:'include' });
      if (!mountedRef.current) return;
      if (res.status === 401) { window.location.href = '/session-expired'; return; }
      if (res.status === 403) { window.location.href = '/403'; return; }
      if (res.status === 503) { window.location.href = '/maintenance'; return; }
      if (res.ok) {
        const json = await res.json();
        if (mountedRef.current) { setData(json); setError(null); }
      } else {
        if (mountedRef.current) setError(`HTTP ${res.status}`);
      }
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, skip, ...deps]); // BUG-80: path is first explicit dep

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    let id;
    if (refreshInterval > 0) id = setInterval(fetchData, refreshInterval);
    return () => {
      mountedRef.current = false;
      if (id) clearInterval(id);
    };
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

export function useTimestamp(updateEvery = 1000) {
  const [ts, setTs] = useState('');
  useEffect(() => {
    const format = () => new Date().toLocaleString('en-GB', {
      day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
    setTs(format());
    const id = setInterval(() => setTs(format()), updateEvery);
    return () => clearInterval(id);
  }, [updateEvery]);
  return ts;
}

export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try { const stored = localStorage.getItem(key); return stored ? JSON.parse(stored) : defaultValue; }
    catch(_) { return defaultValue; }
  });
  const set = (val) => {
    setValue(val);
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(_){}
  };
  return [value, set];
}
