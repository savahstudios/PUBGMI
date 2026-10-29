import React from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorLayout from './ErrorLayout';

export default function ServerErrorPage() {
  const navigate = useNavigate();
  const errorId  = `ERR-${new Date().toISOString().replace(/[-T:.Z]/g,'').slice(0,14)}`;
  return (
    <ErrorLayout
      accentColor="#FF6B35" subtitle="500"
      icon={<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
      title="System Error"
      message="Something went wrong on our end. The error has been logged automatically. Bot operations continue normally."
      errorId={errorId}
      actions={[
        { label:'Retry',              onClick:()=>window.location.reload() },
        { label:'Return to Dashboard',onClick:()=>navigate('/dashboard') }
      ]}
    />
  );
}
