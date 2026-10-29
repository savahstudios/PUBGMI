// BUG-49 FIXED: Click-outside handler for account dropdown
// BUG-68 FIXED: Keyboard shortcuts implemented
import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../App';
import { getFullVersion } from '../../utils/version';
import {
  Home, Radio, MessageSquare, Terminal, Users, BarChart2,
  Database, Bell, ShieldOff, Gift, Layers, Video, Megaphone,
  Target, Scissors, Activity, Settings, UserCircle, Trophy,
  Users2, FileText, StickyNote, Calendar, ChevronLeft, ChevronRight,
  Sun, Moon, LogOut, RefreshCw, ChevronDown, Zap
} from 'lucide-react';

const SIDEBAR_SECTIONS = [
  { label: 'MAIN', items: [
    { label: 'Home',          icon: Home,        path: '/dashboard',              key: 'h' },
    { label: 'Live Control',  icon: Radio,       path: '/dashboard/live',         key: 'l' },
    { label: 'Notifications', icon: Bell,        path: '/dashboard/notifications',key: 'n', badge: true }
  ]},
  { label: 'MODERATION', items: [
    { label: 'Chat Manager',  icon: MessageSquare, path: '/dashboard/chat',       key: 'c' },
    { label: 'Moderation',    icon: ShieldOff,     path: '/dashboard/moderation'          },
    { label: 'Commands',      icon: Terminal,      path: '/dashboard/commands'             }
  ]},
  { label: 'COMMUNITY', items: [
    { label: 'Viewers',       icon: Users,     path: '/dashboard/viewers'                  },
    { label: 'Leaderboard',   icon: Trophy,    path: '/dashboard/leaderboard'              },
    { label: 'Events & Games',icon: Gift,      path: '/dashboard/events'                   },
    { label: 'Squad Manager', icon: Users2,    path: '/dashboard/squad'                    },
    { label: 'Overlays',      icon: Layers,    path: '/dashboard/overlays'                 }
  ]},
  { label: 'CONTENT', items: [
    { label: 'Videos & Shorts',icon: Video,     path: '/dashboard/videos'                  },
    { label: 'Calendar',       icon: Calendar,  path: '/dashboard/calendar'                },
    { label: 'Clips Gallery',  icon: Scissors,  path: '/dashboard/clips'                   },
    { label: 'Announcements',  icon: Megaphone, path: '/dashboard/announcements'            },
    { label: 'Templates',      icon: FileText,  path: '/dashboard/templates'               }
  ]},
  { label: 'GROWTH', items: [
    { label: 'Analytics',      icon: BarChart2, path: '/dashboard/analytics',     key: 'a' },
    { label: 'Goals',          icon: Target,    path: '/dashboard/goals'                   }
  ]},
  { label: 'DATA', items: [
    { label: 'Records',        icon: Database,  path: '/dashboard/records'                 }
  ]},
  { label: 'SYSTEM', items: [
    { label: 'Status Monitor', icon: Activity,  path: '/dashboard/status'                  },
    { label: 'Quick Notes',    icon: StickyNote,path: '/dashboard/notes'                   },
    { label: 'Settings',       icon: Settings,  path: '/dashboard/settings',      key: 's' },
    { label: 'Accounts',       icon: UserCircle,path: '/dashboard/accounts'                }
  ]}
];

export default function DashboardLayout() {
  const { user, setUser, theme, setTheme, activeAccount, setActiveAccount, isLive, unreadCount } = useApp();
  const [collapsed,        setCollapsed]        = useState(false);
  const [showAccountMenu,  setShowAccountMenu]  = useState(false);
  const accountMenuRef = useRef(null); // BUG-49: ref for click-outside
  const navigate  = useNavigate();
  const location  = useLocation();

  // BUG-49 FIXED: Close account dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setShowAccountMenu(false);
      }
    }
    if (showAccountMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountMenu]);

  // BUG-68 FIXED: Keyboard shortcuts
  useEffect(() => {
    let gPressed = false;
    let gTimer   = null;

    function handleKeyDown(e) {
      // Don't fire when typing in inputs
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

      if (e.key === 'g' || e.key === 'G') {
        gPressed = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 1000);
        return;
      }

      if (gPressed) {
        gPressed = false;
        clearTimeout(gTimer);
        const shortcuts = {
          h: '/dashboard',      l: '/dashboard/live',
          c: '/dashboard/chat', a: '/dashboard/analytics',
          s: '/dashboard/settings', n: '/dashboard/notifications',
          v: '/dashboard/viewers', r: '/dashboard/records'
        };
        const path = shortcuts[e.key.toLowerCase()];
        if (path) { navigate(path); return; }
      }

      // Single key shortcuts (no G prefix)
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // Focus global search if it exists
        document.getElementById('global-search')?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  async function handleLogout() {
    await fetch(`${import.meta.env.VITE_BACKEND_URL}/auth/logout`, { method:'POST', credentials:'include' });
    setUser(null);
    navigate('/login');
  }

  function isActive(path) {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  }

  const currentlyLive = isLive[activeAccount];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* ── SIDEBAR ────────────────────────────────────── */}
      <aside className={`flex flex-col border-r transition-all duration-300 flex-shrink-0 ${collapsed ? 'w-16' : 'w-56'}`}
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-color)', backdropFilter: 'blur(12px)' }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,rgba(0,212,255,.3),rgba(139,92,246,.3))', border: '1px solid rgba(0,212,255,.3)' }}>
            <Zap size={16} color="#00D4FF"/>
          </div>
          {!collapsed && (
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>PUBGMI</p>
              <p className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>{getFullVersion()}</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {SIDEBAR_SECTIONS.map(section => (
            <div key={section.label}>
              {!collapsed && (
                <p className="text-[10px] font-mono uppercase tracking-widest px-2 mb-1"
                  style={{ color: 'var(--text-dim)' }}>
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const Icon   = item.icon;
                  const active = isActive(item.path);
                  return (
                    <button key={item.path} onClick={() => navigate(item.path)}
                      title={collapsed ? item.label : undefined}
                      className={`sidebar-item w-full ${active ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`}>
                      <Icon size={16} className="flex-shrink-0"/>
                      {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                      {!collapsed && item.badge && unreadCount > 0 && (
                        <span className="ml-auto text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                      {!collapsed && item.key && (
                        <span className="text-[10px] font-mono opacity-30 ml-auto">G+{item.key.toUpperCase()}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t p-3" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all duration-150"
            style={{ color: 'var(--text-dim)' }}>
            {collapsed ? <ChevronRight size={16}/> : <><ChevronLeft size={16}/><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* TOP BAR */}
        <header className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
          style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-color)', backdropFilter: 'blur(12px)' }}>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={currentlyLive ? 'live-dot' : 'w-2 h-2 rounded-full'} style={!currentlyLive ? { background:'rgba(255,255,255,.2)' } : {}}/>
              <span className="text-xs font-mono font-medium" style={{ color: currentlyLive ? '#FF3B3B' : 'var(--text-dim)' }}>
                {currentlyLive ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            <div className="h-4 w-px" style={{ background: 'var(--border-color)' }}/>
            <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              {new Date().toLocaleTimeString('en-GB')}
            </span>
            <span className="text-xs font-mono hidden sm:inline" style={{ color: 'var(--text-dim)' }}>
              Press G then key for shortcuts
            </span>
          </div>

          <div className="flex items-center gap-2">

            {/* Account switcher — BUG-49 FIXED with ref */}
            <div className="relative" ref={accountMenuRef}>
              <button onClick={() => setShowAccountMenu(s => !s)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-all"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                <div className={`w-1.5 h-1.5 rounded-full ${isLive[activeAccount] ? 'bg-red-400' : ''}`}
                  style={!isLive[activeAccount] ? { background: 'var(--text-dim)' } : {}}/>
                <span className="font-medium">Account {activeAccount}</span>
                <ChevronDown size={12}/>
              </button>

              {showAccountMenu && (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border overflow-hidden z-50"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', backdropFilter: 'blur(12px)' }}>
                  {[1,2].map(acc => (
                    <button key={acc} onClick={() => { setActiveAccount(acc); setShowAccountMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                      style={{ color: activeAccount === acc ? '#00D4FF' : 'var(--text-muted)' }}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isLive[acc] ? 'bg-red-400' : ''}`}
                        style={!isLive[acc] ? { background: 'var(--border-color)' } : {}}/>
                      <span>Account {acc}</span>
                      {isLive[acc] && <span className="ml-auto text-[10px] text-red-400 font-mono">LIVE</span>}
                      {activeAccount === acc && <span className="ml-auto text-[10px] text-accent-blue">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => navigate('/dashboard/notifications')} className="relative p-2 rounded-lg transition-all"
              style={{ color: 'var(--text-muted)' }} title="Notifications (G+N)">
              <Bell size={16}/>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] flex items-center justify-center text-white font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg transition-all" style={{ color: 'var(--text-muted)' }}
              title="Toggle theme">
              {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
            </button>

            <button onClick={() => window.location.reload()}
              className="p-2 rounded-lg transition-all" style={{ color: 'var(--text-muted)' }} title="Refresh">
              <RefreshCw size={16}/>
            </button>

            <button onClick={handleLogout}
              className="p-2 rounded-lg transition-all hover:text-red-400 hover:bg-red-500/10"
              style={{ color: 'var(--text-muted)' }} title="Logout">
              <LogOut size={16}/>
            </button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* BUG-48: Each page also wrapped in ErrorBoundary */}
          <ErrorBoundary>
            <Outlet/>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
