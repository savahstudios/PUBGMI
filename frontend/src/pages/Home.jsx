// BUG-69 FIXED: Socket events wired for real-time updates
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import { Users, Eye, MessageSquare, DollarSign, Radio, Gift, List,
         Megaphone, Volume2, VolumeX, UserCheck, Scissors, Star,
         AlertTriangle, Trophy, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

function StatCard({ icon: Icon, label, value, sub, color='#00D4FF', trend }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background:`${color}15`, border:`1px solid ${color}25` }}>
          <Icon size={16} color={color}/>
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-mono ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? '+' : ''}{trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold font-mono" style={{ color:'var(--text-primary)' }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
      {sub && <p className="text-xs mt-1" style={{ color:'var(--text-dim)' }}>{sub}</p>}
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, color='#00D4FF', active }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-150 group"
      style={{ borderColor: active ? `${color}40` : 'var(--border-color)', background: active ? `${color}10` : 'transparent' }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background:`${color}15`, border:`1px solid ${color}20` }}>
        <Icon size={18} color={color}/>
      </div>
      <span className="text-xs text-center leading-tight" style={{ color:'var(--text-muted)' }}>{label}</span>
    </button>
  );
}

export default function HomePage() {
  const { activeAccount, isLive, addToast, socket } = useApp();
  const navigate = useNavigate();
  const [stats,        setStats]        = useState(null);
  const [liveStatus,   setLiveStatus]   = useState(null);
  const [activity,     setActivity]     = useState([]);
  const [growthData,   setGrowthData]   = useState([]);
  const [recentVideos, setRecentVideos] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [slowMode,     setSlowMode]     = useState(false);
  const [subOnly,      setSubOnly]      = useState(false);
  const [liveMessages, setLiveMessages] = useState([]);

  const ts = new Date().toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });

  const loadData = useCallback(async () => {
    try {
      const [statusRes, analyticsRes] = await Promise.all([
        fetch(`${BACKEND}/status`, { credentials:'include' }),
        fetch(`${BACKEND}/analytics/overview?account=${activeAccount}`, { credentials:'include' })
      ]);
      if (statusRes.ok)   { const d = await statusRes.json();   setLiveStatus(d); }
      if (analyticsRes.ok){ const d = await analyticsRes.json();
        setStats(d.stats); setActivity(d.recentActivity||[]); setGrowthData(d.growthData||[]);
        setRecentVideos(d.recentVideos||[]);
      }
    } catch(_) {} finally { setLoading(false); }
  }, [activeAccount]);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, [loadData]);

  // BUG-69 FIXED: Socket real-time updates
  useEffect(() => {
    if (!socket) return;

    const onMessage = (d) => {
      if (d.accountNumber !== activeAccount) return;
      setLiveMessages(prev => {
        const next = [{ ...d, id: Date.now() }, ...prev].slice(0, 50);
        return next;
      });
    };
    const onStatsUpdate = (d) => {
      if (d.accountNumber !== activeAccount) return;
      setStats(prev => prev ? { ...prev, chatMessages: (prev.chatMessages||0) + 1 } : prev);
    };
    const onSubscriber = (d) => {
      if (d.accountNumber !== activeAccount) return;
      setStats(prev => prev ? { ...prev, todaySubs: (prev.todaySubs||0) + 1, subscribers: (prev.subscribers||0) + 1 } : prev);
      setActivity(prev => [{ type:'subscriber', message:`New sub: ${d.authorName}`, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0,15));
    };
    const onSuperChat = (d) => {
      if (d.accountNumber !== activeAccount) return;
      setStats(prev => prev ? { ...prev, superChats: (prev.superChats||0) + parseFloat(d.amount?.replace(/[^0-9.]/g,'')||0) } : prev);
      setActivity(prev => [{ type:'superchat', message:`Super Chat ${d.amount} from ${d.authorName}`, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0,15));
    };
    const onStreamLive = () => { loadData(); };

    socket.on('chat:message',     onMessage);
    socket.on('stats:update',     onStatsUpdate);
    socket.on('alert:subscriber', onSubscriber);
    socket.on('alert:superchat',  onSuperChat);
    socket.on('stream:live',      onStreamLive);
    socket.on('stream:ended',     onStreamLive);

    return () => {
      socket.off('chat:message',     onMessage);
      socket.off('stats:update',     onStatsUpdate);
      socket.off('alert:subscriber', onSubscriber);
      socket.off('alert:superchat',  onSuperChat);
      socket.off('stream:live',      onStreamLive);
      socket.off('stream:ended',     onStreamLive);
    };
  }, [socket, activeAccount, loadData]);

  async function quickAction(action) {
    try {
      await fetch(`${BACKEND}/chat/${action}`, {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ account: activeAccount })
      });
      addToast(`${action} triggered`, 'blue');
    } catch(_) { addToast('Action failed','red'); }
  }

  const currentlyLive = isLive[activeAccount];

  const activityIcons = {
    subscriber: <Star size={12} color="#00D4FF"/>,
    superchat:  <DollarSign size={12} color="#00FF88"/>,
    ban:        <AlertTriangle size={12} color="#FF3B3B"/>,
    clip:       <Scissors size={12} color="#8B5CF6"/>,
    rank_up:    <Trophy size={12} color="#FF6B35"/>
  };

  return (
    <div className="space-y-6" style={{ animation:'fadeIn .3s ease' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Dashboard</h1>
          <p className="text-xs font-mono mt-0.5" style={{ color:'var(--text-dim)' }}>{ts}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={currentlyLive ? 'live-dot' : 'w-2 h-2 rounded-full'} style={!currentlyLive?{background:'rgba(255,255,255,.2)'}:{}}/>
          <span className="text-sm font-mono font-medium" style={{ color: currentlyLive ? '#FF3B3B' : 'var(--text-dim)' }}>
            Account {activeAccount} — {currentlyLive ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Live / Offline Banner */}
      {currentlyLive ? (
        <div className="glass-card cursor-pointer" style={{ borderLeft:'3px solid #FF3B3B', borderColor:'rgba(255,59,59,.3)' }}
          onClick={() => navigate('/dashboard/live')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="live-dot"/>
              <div>
                <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>Stream is LIVE</p>
                <p className="text-xs font-mono mt-0.5" style={{ color:'var(--text-dim)' }}>
                  {liveStatus?.youtube?.[`account${activeAccount}`]?.live ? 'Connected' : 'Polling...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              {[
                { label:'Viewers', val: stats?.liveViewers || '—' },
                { label:'New Subs', val: stats?.todaySubs || 0 },
                { label:'Messages', val: stats?.chatMessages || 0 }
              ].map(item => (
                <div key={item.label} className="text-center">
                  <p className="font-bold text-lg font-mono" style={{ color:'var(--text-primary)' }}>{item.val}</p>
                  <p className="text-xs" style={{ color:'var(--text-dim)' }}>{item.label}</p>
                </div>
              ))}
              <span className="text-sm font-medium" style={{ color:'#00D4FF' }}>Open Control →</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full" style={{ background:'rgba(255,255,255,.2)' }}/>
              <div>
                <p className="font-medium text-sm" style={{ color:'var(--text-muted)' }}>Not currently live</p>
                <p className="text-xs font-mono mt-0.5" style={{ color:'var(--text-dim)' }}>Bot monitoring — detects stream within 60 seconds</p>
              </div>
            </div>
            <button onClick={() => navigate('/dashboard/calendar')}
              className="text-sm font-medium transition-colors" style={{ color:'#00D4FF' }}>
              View Schedule →
            </button>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({length:4}).map((_,i) => <div key={i} className="skeleton h-28 rounded-xl"/>)
        ) : (
          <>
            <StatCard icon={Users}        label="Subscribers"  value={stats?.subscribers?.toLocaleString()||'—'} sub={`+${stats?.todaySubs||0} today`} trend={stats?.todaySubs} color="#00D4FF"/>
            <StatCard icon={Eye}          label="Views Today"  value={stats?.viewsToday?.toLocaleString()||'0'} color="#8B5CF6"/>
            <StatCard icon={MessageSquare}label="Chat Messages" value={stats?.chatMessages?.toLocaleString()||'0'} sub="This stream" color="#FF6B35"/>
            <StatCard icon={DollarSign}   label="Super Chats"  value={`$${(stats?.superChats||0).toFixed(2)}`} sub="This stream" color="#00FF88"/>
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>Quick Actions</h2>
          <p className="text-xs font-mono" style={{ color:'var(--text-dim)' }}>{ts}</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <QuickAction icon={Gift}     label="Start Giveaway" onClick={() => navigate('/dashboard/events')} color="#FF6B35"/>
          <QuickAction icon={List}     label="Post Rules"     onClick={() => quickAction('rules')}           color="#00D4FF"/>
          <QuickAction icon={Users}    label="Open Queue"     onClick={() => navigate('/dashboard/squad')}   color="#8B5CF6"/>
          <QuickAction icon={Megaphone}label="Announcement"   onClick={() => navigate('/dashboard/announcements')} color="#00FF88"/>
          <QuickAction icon={slowMode ? VolumeX : Volume2}
            label="Slow Mode" active={slowMode}
            onClick={() => { setSlowMode(s=>!s); quickAction('toggle-slow'); }} color={slowMode?'#FF3B3B':'#00D4FF'}/>
          <QuickAction icon={UserCheck} label="Sub Only" active={subOnly}
            onClick={() => { setSubOnly(s=>!s); quickAction('toggle-subonly'); }} color={subOnly?'#FF3B3B':'#00D4FF'}/>
        </div>
      </div>

      {/* Activity + Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <div className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>Activity Feed</h2>
            <button onClick={() => navigate('/dashboard/notifications')}
              className="text-xs transition-colors" style={{ color:'#00D4FF' }}>View all →</button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {activity.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp size={28} color="rgba(255,255,255,.1)" className="mx-auto mb-3"/>
                <p className="text-sm" style={{ color:'var(--text-dim)' }}>No recent activity</p>
                <p className="text-xs font-mono mt-1" style={{ color:'rgba(255,255,255,.1)' }}>Activity appears here when live</p>
              </div>
            ) : (
              activity.slice(0,10).map((item,i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg transition-all hover:bg-white/3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background:'rgba(255,255,255,.05)' }}>
                    {activityIcons[item.type] || <Radio size={12} color="rgba(255,255,255,.3)"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed" style={{ color:'var(--text-muted)' }}>{item.message}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color:'var(--text-dim)' }}>{item.timestamp}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Growth Chart */}
        <div className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>Subscriber Growth</h2>
            <p className="text-xs font-mono" style={{ color:'var(--text-dim)' }}>Last 30 days</p>
          </div>
          {loading ? (
            <div className="skeleton h-44 rounded-xl"/>
          ) : growthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={growthData}>
                <defs>
                  <linearGradient id="subGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00D4FF" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#00D4FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide/>
                <YAxis hide/>
                <Tooltip
                  contentStyle={{ background:'rgba(15,15,30,.9)', border:'1px solid rgba(0,212,255,.2)', borderRadius:'8px' }}
                  labelStyle={{ color:'rgba(255,255,255,.4)', fontSize:11 }}
                  itemStyle={{ color:'#00D4FF', fontSize:12 }}
                  formatter={(v) => [v, 'New Subs']}
                />
                <Area type="monotone" dataKey="new_subs" stroke="#00D4FF" strokeWidth={2}
                  fill="url(#subGrad)" dot={false} activeDot={{ r:4, fill:'#00D4FF' }}/>
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-44">
              <p className="text-sm" style={{ color:'var(--text-dim)' }}>No growth data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Live Chat Preview */}
      {currentlyLive && liveMessages.length > 0 && (
        <div className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>Live Chat</h2>
            <button onClick={() => navigate('/dashboard/chat')}
              className="text-xs" style={{ color:'#00D4FF' }}>Full chat →</button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {liveMessages.slice(0,15).map(msg => (
              <div key={msg.id} className="flex items-start gap-2 py-1">
                <span className="text-xs font-medium flex-shrink-0" style={{ color:'#00D4FF' }}>{msg.authorName}</span>
                <span className="text-xs" style={{ color:'var(--text-muted)' }}>{msg.messageText}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Videos */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>Recent Videos</h2>
          <button onClick={() => navigate('/dashboard/videos')}
            className="text-xs" style={{ color:'#00D4FF' }}>View all →</button>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Array.from({length:3}).map((_,i)=><div key={i} className="skeleton h-16 rounded-xl"/>)}
          </div>
        ) : recentVideos.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm" style={{ color:'var(--text-dim)' }}>No videos synced yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentVideos.slice(0,6).map((video,i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl border transition-all hover:bg-white/3"
                style={{ borderColor:'var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(139,92,246,.15)' }}>
                  <Radio size={14} color="#8B5CF6"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate" style={{ color:'var(--text-muted)' }}>{video.title}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color:'var(--text-dim)' }}>
                    {video.views?.toLocaleString()||0} views
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
