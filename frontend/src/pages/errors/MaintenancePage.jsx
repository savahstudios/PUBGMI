import React from 'react';
import ErrorLayout from './ErrorLayout';

export default function MaintenancePage() {
  return (
    <ErrorLayout
      accentColor="#00FF88" subtitle="Maintenance"
      icon={<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00FF88" strokeWidth="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>}
      title="Under Maintenance"
      message="The dashboard is temporarily offline for updates. Bot operations continue normally during this time. Check Telegram for updates."
      actions={[
        { label:'Check @PUBGMIROBOT', onClick:()=>window.open('https://t.me/PUBGMIROBOT','_blank') },
        { label:'Refresh',            onClick:()=>window.location.reload() }
      ]}
    />
  );
}
