import React from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorLayout from './ErrorLayout';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <ErrorLayout
      accentColor="#00D4FF" subtitle="404"
      icon={<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="11"/><line x1="11" y1="14" x2="11.01" y2="14"/></svg>}
      title="Target Not Found"
      message="The page you are looking for does not exist or has been moved."
      actions={[
        { label:'Return to Dashboard', onClick:()=>navigate('/dashboard') },
        { label:'Go to Login',         onClick:()=>navigate('/login') }
      ]}
    />
  );
}
