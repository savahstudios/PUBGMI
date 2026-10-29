import React from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorLayout from './ErrorLayout';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <ErrorLayout
      accentColor="#FF3B3B" subtitle="403"
      icon={<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF3B3B" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
      title="Access Restricted"
      message="You are not authorized to access this system. This attempt has been logged and recorded."
      actions={[{ label:'Return to Login', onClick:()=>navigate('/login') }]}
    />
  );
}
