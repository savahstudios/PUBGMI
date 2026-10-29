import React from 'react';
import { useNavigate } from 'react-router-dom';

function ComingSoonPage({ title, description, icon, buildPath }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-96" style={{ animation:'fadeIn .3s ease' }}>
      <div className="glass-card p-12 text-center max-w-lg">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background:'rgba(0,212,255,.1)', border:'1px solid rgba(0,212,255,.2)' }}>
          <span className="text-3xl">{icon}</span>
        </div>
        <h1 className="text-xl font-bold mb-3" style={{ color:'var(--text-primary)' }}>{title}</h1>
        <p className="text-sm leading-relaxed mb-6" style={{ color:'var(--text-muted)' }}>{description}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate('/dashboard')} className="btn-ghost text-sm">← Back to Dashboard</button>
        </div>
        <p className="text-xs font-mono mt-8" style={{ color:'var(--text-dim)' }}>
          {new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })}
        </p>
      </div>
    </div>
  );
}

export const LiveControlPage    = () => <ComingSoonPage title="Live Control"     icon="📡" description="Full stream control panel — manage counters, break mode, soundboard, squad status, stream presets, and all live session tools. Being built in v1.2.0."/>;
export const ChatManagerPage    = () => <ComingSoonPage title="Chat Manager"     icon="💬" description="Real-time chat moderation — keyword rules, blocked words, slow mode enforcement, trust scores, and full chat archive with search."/>;
export const CommandsPage       = () => <ComingSoonPage title="Commands"         icon="⚡" description="Manage custom commands with response editor, permission levels, cooldowns, and usage analytics."/>;
export const ViewersPage        = () => <ComingSoonPage title="Viewers"          icon="👥" description="Complete viewer database with SP/XP profiles, rank history, watch time, streak data, and private notes."/>;
export const LeaderboardPage    = () => <ComingSoonPage title="Leaderboard"      icon="🏆" description="All-time, season, and weekly leaderboards. Track top viewers by XP, SP, and watch time."/>;
export const EventsPage         = () => <ComingSoonPage title="Events & Games"   icon="🎉" description="Giveaways, predictions, trivia, slot machine, duels, and mini-games management."/>;
export const SquadManagerPage   = () => <ComingSoonPage title="Squad Manager"    icon="🎮" description="Live squad queue — view queue, accept or skip players, session history, and queue stats."/>;
export const OverlaysPage       = () => <ComingSoonPage title="Alerts & Overlays"icon="🎬" description="Design stream overlays — subscriber alerts, super chats, goal bars, counter widgets, and OBS browser source links."/>;
export const VideosPage         = () => <ComingSoonPage title="Videos & Shorts"  icon="▶️"  description="Unified comment inbox, video analytics, Shorts performance, auto-reply rules, and playlist manager."/>;
export const CalendarPage       = () => <ComingSoonPage title="Content Calendar" icon="📅" description="Visual calendar for streams, videos, Shorts, and community posts. Drag to reschedule."/>;
export const ClipsPage          = () => <ComingSoonPage title="Clips Gallery"    icon="✂️"  description="All marked moments from every stream with timestamps, clickable VOD links, viewer reactions, and labels."/>;
export const AnnouncementsPage  = () => <ComingSoonPage title="Announcements"    icon="📢" description="Schedule community posts, going-live notifications, stream recaps, and Discord webhooks."/>;
export const TemplatePage       = () => <ComingSoonPage title="Templates"        icon="📋" description="All reusable message templates — commands, welcome messages, sub/donation replies, and announcements."/>;
export const AnalyticsPage      = () => <ComingSoonPage title="Analytics"        icon="📊" description="Deep channel analytics — growth graphs, stream heatmaps, revenue tracking, and audience insights."/>;
export const GoalsPage          = () => <ComingSoonPage title="Goals & Milestones" icon="🎯" description="Set subscriber, view, and revenue goals — track progress with live bars and milestone history."/>;
export const RecordsPage        = () => <ComingSoonPage title="Records"          icon="🗄️"  description="Complete data archive — chat logs, subscribers, donators, stream history, and viewer database."/>;
export const ModerationPage     = () => <ComingSoonPage title="Moderation Center" icon="🛡️" description="Active bans, timeout countdowns, warning history, strike logs, and full moderation action trail."/>;
export const NotificationsPage  = () => <ComingSoonPage title="Notifications"    icon="🔔" description="Complete notification history — all events logged with timestamps, categories, and quick actions."/>;
export const StatusPage         = () => <ComingSoonPage title="Status Monitor"   icon="📡" description="Real-time bot health — service status, API quota, uptime, latency, and incident log."/>;
export const NotesPage          = () => <ComingSoonPage title="Quick Notes"      icon="📝" description="Private scratchpad — pin video ideas, stream notes, and reminders. All auto-timestamped."/>;
export const SettingsPage       = () => <ComingSoonPage title="Settings"         icon="⚙️"  description="Complete bot configuration — all customization, messages, socials, security, and integrations."/>;
export const AccountsPage       = () => <ComingSoonPage title="Accounts"         icon="👤" description="Manage both YouTube accounts — connection status, independent settings, and account switcher."/>;

export default LiveControlPage;
