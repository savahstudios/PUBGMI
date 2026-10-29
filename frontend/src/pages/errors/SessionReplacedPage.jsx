import React from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorLayout from './ErrorLayout';

export default function SessionReplacedPage() {
  const navigate = useNavigate();
  return (
    <ErrorLayout
      accentColor="#FF6B35" subtitle="Session Terminated"
      icon={<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
      title="Session Terminated"
      message="A new login was detected on another device. This session has been ended automatically for security. Only one active session is allowed at a time."
      actions={[{ label:'Login Again', onClick:()=>navigate('/login') }]}
    />
  );
}
