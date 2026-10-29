import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ErrorLayout({ icon, title, subtitle, message, actions, accentColor='#00D4FF', errorId }) {
  const ts = new Date().toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-primary)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', fontFamily:'Inter,system-ui,sans-serif' }}>
      {/* Grid background */}
      <div style={{ position:'absolute', inset:0, opacity:.05,
        backgroundImage:`linear-gradient(${accentColor}50 1px,transparent 1px),linear-gradient(90deg,${accentColor}50 1px,transparent 1px)`,
        backgroundSize:'60px 60px' }}/>
      {/* Glow */}
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div style={{ width:320, height:320, borderRadius:'50%', opacity:.06, background:`radial-gradient(circle,${accentColor} 0%,transparent 70%)` }}/>
      </div>
      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:520, margin:'0 16px', textAlign:'center' }}>
        <div style={{ background:'var(--glass-bg)', border:`1px solid ${accentColor}20`, borderRadius:20, padding:48, backdropFilter:'blur(12px)' }}>
          <div style={{ width:80, height:80, borderRadius:16, margin:'0 auto 24px', display:'flex', alignItems:'center', justifyContent:'center', background:`${accentColor}10`, border:`1px solid ${accentColor}30` }}>
            {icon}
          </div>
          {subtitle && (
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'4px 12px', borderRadius:99, fontSize:12, fontFamily:'monospace', marginBottom:16, background:`${accentColor}10`, color:accentColor, border:`1px solid ${accentColor}20` }}>
              {subtitle}
            </div>
          )}
          <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text-primary)', marginBottom:12 }}>{title}</h1>
          <p style={{ fontSize:14, color:'var(--text-muted)', lineHeight:1.7, marginBottom:32 }}>{message}</p>
          <div style={{ display:'flex', flexDirection:'column', gap:12, alignItems:'center' }}>
            {actions.map((action,i) => (
              <button key={i} onClick={action.onClick}
                style={i === 0 ? {
                  background:`linear-gradient(135deg,${accentColor},#8B5CF6)`, color:'#fff',
                  border:'none', borderRadius:10, padding:'11px 28px', fontSize:14,
                  fontWeight:600, cursor:'pointer', width:'100%', maxWidth:280
                } : {
                  background:'transparent', color:'var(--text-muted)',
                  border:'1px solid var(--border-color)', borderRadius:10,
                  padding:'11px 28px', fontSize:14, fontWeight:600, cursor:'pointer',
                  width:'100%', maxWidth:280
                }}>
                {action.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop:32, paddingTop:24, borderTop:'1px solid var(--border-color)' }}>
            {errorId && <p style={{ color:'rgba(255,255,255,.15)', fontSize:11, fontFamily:'monospace', marginBottom:4 }}>Error ID: {errorId}</p>}
            <p style={{ color:'rgba(255,255,255,.15)', fontSize:11, fontFamily:'monospace' }}>{ts}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
