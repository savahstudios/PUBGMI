// BUG-48 FIXED: React ErrorBoundary prevents blank screen on component crash
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      errorId: `ERR-${Date.now()}`
    };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', background: '#08080F', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          background: 'rgba(15,15,30,0.8)', border: '1px solid rgba(255,107,53,0.3)',
          borderRadius: '16px', padding: '48px', maxWidth: '480px', textAlign: 'center'
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px', margin: '0 auto 24px',
            background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>
            Something went wrong
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            An unexpected error occurred. The error has been logged automatically.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'linear-gradient(135deg,#00D4FF,#8B5CF6)', color: '#fff',
              border: 'none', borderRadius: '8px', padding: '10px 24px',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginRight: '12px'
            }}>
            Reload Page
          </button>
          <button
            onClick={() => window.location.href = '/dashboard'}
            style={{
              background: 'transparent', color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
              padding: '10px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer'
            }}>
            Go to Dashboard
          </button>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontFamily: 'monospace', marginTop: '24px' }}>
            Error ID: {this.state.errorId}
          </p>
        </div>
      </div>
    );
  }
}
