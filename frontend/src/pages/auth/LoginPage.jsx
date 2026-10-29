// BUG-45 FIXED: window.onTelegramAuth assigned BEFORE script append
// BUG-81 FIXED: Same
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

export default function LoginPage() {
  const { setUser }  = useApp();
  const navigate     = useNavigate();
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState('');
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    setParticles(Array.from({length:18}, (_,i) => ({
      id: i, x: Math.random()*100,
      delay: Math.random()*8, duration: 6+Math.random()*6, size: 2+Math.random()*3
    })));

    // BUG-45/81 FIXED: Assign callback BEFORE appending script
    window.onTelegramAuth = async (user) => { await handleTelegramLogin(user); };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'PUBGMIROBOT');
    script.setAttribute('data-size',        'large');
    script.setAttribute('data-radius',      '8');
    script.setAttribute('data-onauth',      'onTelegramAuth(user)');
    script.setAttribute('data-request-access','write');
    script.async = true;

    const container = document.getElementById('telegram-widget');
    if (container) container.appendChild(script);

    return () => { delete window.onTelegramAuth; };
  }, []);

  async function handleTelegramLogin(telegramUser) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND}/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(telegramUser)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setUser(data.user);
        navigate('/dashboard');
      } else if (data.error === 'access_denied' || data.error === 'invalid_signature') {
        navigate('/403');
      } else if (data.error === 'auth_expired') {
        setError('Authentication expired. Please try again.');
      } else {
        setError('Authentication failed. Please try again.');
      }
    } catch (_) {
      setError('Connection error. Check your internet and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background:'var(--bg-primary)' }}>

      {/* Grid */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(rgba(0,212,255,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.3) 1px,transparent 1px)',
        backgroundSize: '50px 50px'
      }}/>

      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} className="absolute rounded-full opacity-20"
          style={{ left:`${p.x}%`, bottom:'-10px', width:p.size, height:p.size,
            background:'#00D4FF',
            animation:`particleFloat ${p.duration}s ${p.delay}s linear infinite` }}/>
      ))}
      <style>{`@keyframes particleFloat{0%,100%{transform:translateY(0) rotate(0);opacity:0}10%{opacity:.2}90%{opacity:.2}100%{transform:translateY(-100vh) rotate(360deg);opacity:0}}`}</style>

      {/* Glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full opacity-10"
          style={{ background:'radial-gradient(circle,#00D4FF 0%,transparent 70%)' }}/>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="glass p-10 rounded-2xl" style={{ boxShadow:'0 0 60px rgba(0,212,255,.08),0 0 120px rgba(139,92,246,.05)' }}>

          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background:'linear-gradient(135deg,rgba(0,212,255,.2),rgba(139,92,246,.2))', border:'1px solid rgba(0,212,255,.3)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="1.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color:'var(--text-primary)' }}>PUBGMI</h1>
            <p className="text-sm mt-1 font-mono" style={{ color:'var(--text-dim)' }}>Stream Control System</p>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <div className="flex-1 h-px" style={{ background:'var(--border-color)' }}/>
            <p className="text-xs font-mono uppercase tracking-widest" style={{ color:'var(--text-dim)' }}>Private Access</p>
            <div className="flex-1 h-px" style={{ background:'var(--border-color)' }}/>
          </div>

          <div className="flex flex-col items-center gap-4">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor:'#00D4FF', borderTopColor:'transparent' }}/>
                <p className="text-sm font-mono" style={{ color:'var(--text-dim)' }}>Verifying identity...</p>
              </div>
            ) : (
              <div id="telegram-widget" className="flex justify-center"/>
            )}
            {error && (
              <div className="w-full px-4 py-3 rounded-lg text-sm text-center text-red-400"
                style={{ background:'rgba(255,59,59,.1)', border:'1px solid rgba(255,59,59,.2)' }}>
                {error}
              </div>
            )}
          </div>

          <p className="text-xs text-center mt-8 font-mono" style={{ color:'rgba(255,255,255,.1)' }}>
            Restricted system — unauthorized access is logged
          </p>
        </div>
        <p className="text-xs text-center mt-4 font-mono" style={{ color:'rgba(255,255,255,.12)' }}>
          {new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })}
        </p>
      </div>
    </div>
  );
}
