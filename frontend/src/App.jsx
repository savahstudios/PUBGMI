// BUG-46 FIXED: Socket only connects after auth
// BUG-70 FIXED: activeAccount persisted to localStorage
import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { socket, connectSocket, disconnectSocket } from './utils/socket';
import ErrorBoundary from './components/ErrorBoundary'; // BUG-48

// Pages
import LoginPage from './pages/auth/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import HomePage from './pages/Home';
import LiveControlPage from './pages/LiveControl';
import ChatManagerPage from './pages/ChatManager';
import CommandsPage from './pages/Commands';
import ViewersPage from './pages/Viewers';
import AnalyticsPage from './pages/Analytics';
import RecordsPage from './pages/Records';
import NotificationsPage from './pages/Notifications';
import ModerationPage from './pages/Moderation';
import EventsPage from './pages/Events';
import OverlaysPage from './pages/Overlays';
import VideosPage from './pages/Videos';
import AnnouncementsPage from './pages/Announcements';
import GoalsPage from './pages/Goals';
import ClipsPage from './pages/Clips';
import StatusPage from './pages/Status';
import SettingsPage from './pages/Settings';
import AccountsPage from './pages/Accounts';
import LeaderboardPage from './pages/Leaderboard';
import SquadManagerPage from './pages/SquadManager';
import TemplatePage from './pages/Templates';
import NotesPage from './pages/Notes';
import CalendarPage from './pages/Calendar';

// Error Pages
import NotFoundPage from './pages/errors/NotFoundPage';
import { ForbiddenPage }     from './pages/errors/index';
import { ServerErrorPage }   from './pages/errors/index';
import { SessionExpiredPage }  from './pages/errors/index';
import { SessionReplacedPage } from './pages/errors/index';
import { MaintenancePage }   from './pages/errors/index';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

export default function App() {
  const [user,          setUser]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [theme,         setTheme]         = useState(() => localStorage.getItem('pubgmi_theme') || 'dark');
  // BUG-70 FIXED: Persist active account
  const [activeAccount, setActiveAccountState] = useState(() => parseInt(localStorage.getItem('pubgmi_account') || '1'));
  const [isLive,        setIsLive]        = useState({ 1: false, 2: false });
  const [notifications, setNotifications] = useState([]);
  const [toasts,        setToasts]        = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);

  function setActiveAccount(acc) {
    setActiveAccountState(acc);
    localStorage.setItem('pubgmi_account', String(acc)); // BUG-70
  }

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('pubgmi_theme', theme);
  }, [theme]);

  useEffect(() => { checkAuth(); }, []);

  useEffect(() => {
    if (!user) return;

    // BUG-46 FIXED: Only connect after auth confirmed
    connectSocket();
    socket.emit('join:account', activeAccount);

    socket.on('stream:live',     d => { setIsLive(p => ({ ...p, [d.accountNumber]: true }));  addToast(`Account ${d.accountNumber} is now LIVE!`, 'blue'); });
    socket.on('stream:ended',    d => { setIsLive(p => ({ ...p, [d.accountNumber]: false })); });
    socket.on('alert:subscriber',d => addToast(`New sub: ${d.authorName}`, 'green'));
    socket.on('alert:superchat', d => addToast(`Super Chat: ${d.authorName} — ${d.amount}`, 'orange'));
    socket.on('notification:new',() => setUnreadCount(n => n + 1));

    // Fetch initial unread count
    fetch(`${BACKEND}/notifications/unread-count?account=${activeAccount}`, { credentials: 'include' })
      .then(r => r.json()).then(d => setUnreadCount(d.count || 0)).catch(() => {});

    return () => {
      socket.off('stream:live'); socket.off('stream:ended');
      socket.off('alert:subscriber'); socket.off('alert:superchat');
      socket.off('notification:new');
      disconnectSocket();
    };
  }, [user, activeAccount]);

  async function checkAuth() {
    try {
      const res = await fetch(`${BACKEND}/auth/me`, { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setUser(d.user); }
    } catch (_) {} finally { setLoading(false); }
  }

  function addToast(message, type = 'blue') {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }

  const toastColors = { blue: '#00D4FF', green: '#00FF88', orange: '#FF6B35', red: '#FF3B3B' };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#08080F' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:48, height:48, borderRadius:'50%', border:'2px solid #00D4FF', borderTopColor:'transparent', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }}/>
        <p style={{ color:'rgba(255,255,255,0.3)', fontFamily:'monospace', fontSize:13 }}>Loading PUBGMI...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const ctx = { user, setUser, theme, setTheme: t => setTheme(t), activeAccount, setActiveAccount, isLive, setIsLive, notifications, setNotifications, socket, addToast, unreadCount, setUnreadCount };

  return (
    <AppContext.Provider value={ctx}>
      {/* BUG-48 FIXED: Wrap everything in ErrorBoundary */}
      <ErrorBoundary>
        <BrowserRouter>
          {/* Toast stack */}
          <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, display:'flex', flexDirection:'column', gap:8 }}>
            {toasts.map(t => (
              <div key={t.id} className="toast" style={{ borderLeft: `3px solid ${toastColors[t.type]||'#00D4FF'}` }}>
                {t.message}
              </div>
            ))}
          </div>
          <Routes>
            <Route path="/login"             element={user ? <Navigate to="/dashboard"/> : <LoginPage/>}/>
            <Route path="/403"               element={<ForbiddenPage/>}/>
            <Route path="/500"               element={<ServerErrorPage/>}/>
            <Route path="/session-expired"   element={<SessionExpiredPage/>}/>
            <Route path="/session-replaced"  element={<SessionReplacedPage/>}/>
            <Route path="/maintenance"       element={<MaintenancePage/>}/>
            <Route path="/dashboard" element={user ? <DashboardLayout/> : <Navigate to="/login"/>}>
              <Route index                   element={<HomePage/>}/>
              <Route path="live"             element={<LiveControlPage/>}/>
              <Route path="chat"             element={<ChatManagerPage/>}/>
              <Route path="commands"         element={<CommandsPage/>}/>
              <Route path="viewers"          element={<ViewersPage/>}/>
              <Route path="leaderboard"      element={<LeaderboardPage/>}/>
              <Route path="events"           element={<EventsPage/>}/>
              <Route path="squad"            element={<SquadManagerPage/>}/>
              <Route path="overlays"         element={<OverlaysPage/>}/>
              <Route path="videos"           element={<VideosPage/>}/>
              <Route path="calendar"         element={<CalendarPage/>}/>
              <Route path="clips"            element={<ClipsPage/>}/>
              <Route path="announcements"    element={<AnnouncementsPage/>}/>
              <Route path="templates"        element={<TemplatePage/>}/>
              <Route path="analytics"        element={<AnalyticsPage/>}/>
              <Route path="goals"            element={<GoalsPage/>}/>
              <Route path="records"          element={<RecordsPage/>}/>
              <Route path="moderation"       element={<ModerationPage/>}/>
              <Route path="notifications"    element={<NotificationsPage/>}/>
              <Route path="status"           element={<StatusPage/>}/>
              <Route path="notes"            element={<NotesPage/>}/>
              <Route path="settings"         element={<SettingsPage/>}/>
              <Route path="accounts"         element={<AccountsPage/>}/>
            </Route>
            <Route path="/"  element={<Navigate to={user ? '/dashboard' : '/login'}/>}/>
            <Route path="*"  element={<NotFoundPage/>}/>
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </AppContext.Provider>
  );
}
