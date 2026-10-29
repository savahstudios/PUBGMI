import React from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorLayout from './ErrorLayout';

export default function SessionExpiredPage() {
  const navigate = useNavigate();
  return (
    <ErrorLayout
      accentColor="#8B5CF6" subtitle="Session Expired"
      icon={<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
      title="Session Expired"
      message="Your session has ended for security reasons. Please log in again to continue managing your stream."
      actions={[{ label:'Login Again', onClick:()=>navigate('/login') }]}
    />
  );
}
