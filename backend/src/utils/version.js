const VERSION = { major: 1, minor: 1, patch: 0, label: 'stable', releaseDate: '2026-05-25' };

const CHANGELOG = [
  {
    version: '1.1.0', date: '2026-05-25', type: 'minor',
    changes: [
      'SECURITY: Added Telegram HMAC hash verification on login',
      'SECURITY: Added rate limiting to all auth endpoints',
      'SECURITY: Fixed SQL injection in analytics revenue query',
      'SECURITY: Changed cookie sameSite to lax for OAuth compatibility',
      'FIXED: getNotifications SQL template literal bug — notifications now work',
      'FIXED: Giveaway entry capture added to processMessage — giveaways now functional',
      'FIXED: Slow mode and sub-only mode now enforced in runModeration',
      'FIXED: Moderation settings cache key unified (mod_settings → settings)',
      'FIXED: banUser null liveChatId guard — strikes no longer increment on failed bans',
      'FIXED: Streak tracking now writes to viewer_streaks on stream join and checkin',
      'FIXED: Conqueror rank now limited to top 10 viewers by XP',
      'FIXED: Clip VOD links now generated using youtube_stream_id',
      'FIXED: Timed messages service reads from database and sends on schedule',
      'FIXED: awaitedStates persisted to Redis — survives bot restart',
      'FIXED: Giveaway timer uses Redis TTL expiry instead of setTimeout',
      'NEW: Song request system (!sr, !currentsong, !skip, !clearqueue)',
      'NEW: Quote system (!quote, !addquote, !delquote)',
      'NEW: Trivia system with question bank',
      'NEW: Prediction/voting system',
      'NEW: Slot machine and duel mini-games',
      'NEW: Streak multiplier system fully operational',
      'NEW: Daily challenge progress tracking',
      'NEW: VIP expiry system (24hr VIP from shop)',
      'NEW: Global ban across both accounts',
      'NEW: Hype train detection on sub/donation spikes',
      'NEW: Counter overlays in OBS browser source',
      'NEW: Reply translation (owner replies auto-translated to viewer language)',
      'NEW: WebSub retry logic with exponential backoff',
      'NEW: Database indexes for performance',
      'NEW: Env var validation at startup',
      'IMPROVED: Mock analytics replaced with real DB data',
      'IMPROVED: All 20 dashboard pages built out (no more stubs)',
      'IMPROVED: React ErrorBoundary added',
      'IMPROVED: Account switcher click-outside handler',
      'IMPROVED: Active account persisted to localStorage',
      'IMPROVED: Socket events wired to Home page for real-time updates',
      'IMPROVED: Light mode fully functional with CSS variables',
      'IMPROVED: Request body limit reduced to 1MB',
      'IMPROVED: CORS validated at startup',
    ]
  },
  {
    version: '1.0.1', date: '2026-05-23', type: 'patch',
    changes: [
      'Fixed circular dependency between youtubeService and chatService',
      'Fixed dynamic require inside Telegram bot handlers',
      'Fixed uuid require inside overlay token handler',
      'Fixed getViewerRank SQL window function',
      'Fixed App.jsx import/export mismatches',
      'Added versioning system'
    ]
  },
  {
    version: '1.0.0', date: '2026-05-22', type: 'major',
    changes: ['Initial release — full PUBGMI bot system']
  }
];

function getVersion()     { return `${VERSION.major}.${VERSION.minor}.${VERSION.patch}`; }
function getFullVersion() {
  const label = VERSION.label !== 'stable' ? `-${VERSION.label}` : '';
  return `v${getVersion()}${label} (${VERSION.releaseDate})`;
}
function getLatestChanges() { return CHANGELOG[0]; }

module.exports = { VERSION, CHANGELOG, getVersion, getFullVersion, getLatestChanges };
