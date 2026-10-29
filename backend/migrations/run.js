require('dotenv').config();
const { query } = require('../src/config/database');

const migrations = [
  // Auth
  `CREATE TABLE IF NOT EXISTS session_log (
    id SERIAL PRIMARY KEY, session_id TEXT UNIQUE NOT NULL,
    telegram_user_id BIGINT NOT NULL, device TEXT, ip TEXT,
    login_time TIMESTAMPTZ DEFAULT NOW(), logout_time TIMESTAMPTZ, expires_at TIMESTAMPTZ)`,

  // Settings
  `CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL UNIQUE,
    rules_text TEXT, stream_schedule TEXT, sub_message TEXT,
    socials JSONB DEFAULT '{}', join_messages JSONB DEFAULT '{}',
    auto_translate BOOLEAN DEFAULT false, filter_links BOOLEAN DEFAULT true,
    whitelisted_domains JSONB DEFAULT '["youtube.com","youtu.be"]',
    caps_threshold FLOAT DEFAULT 0.7, timeout_duration INT DEFAULT 600,
    guide_interval INT DEFAULT 600, superchat_message TEXT,
    slow_mode_secs INT DEFAULT 5, updated_at TIMESTAMPTZ DEFAULT NOW())`,

  // Viewers
  `CREATE TABLE IF NOT EXISTS viewers (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, user_id TEXT NOT NULL,
    username TEXT, channel_url TEXT, is_vip BOOLEAN DEFAULT false,
    is_mod BOOLEAN DEFAULT false, trust_score INT DEFAULT 50, notes TEXT,
    first_seen TIMESTAMPTZ DEFAULT NOW(), last_seen TIMESTAMPTZ DEFAULT NOW(),
    streams_attended INT DEFAULT 0, total_messages INT DEFAULT 0,
    total_watch_minutes INT DEFAULT 0, UNIQUE(account_number,user_id))`,

  // Viewer Ranks
  `CREATE TABLE IF NOT EXISTS viewer_ranks (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, user_id TEXT NOT NULL,
    sp BIGINT DEFAULT 0, total_xp BIGINT DEFAULT 0,
    tier TEXT DEFAULT 'Bronze', division TEXT DEFAULT 'V',
    updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(account_number,user_id))`,

  // SP Transactions
  `CREATE TABLE IF NOT EXISTS sp_transactions (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, user_id TEXT NOT NULL,
    username TEXT, amount INT NOT NULL, type TEXT NOT NULL, source TEXT,
    description TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,

  // XP Transactions
  `CREATE TABLE IF NOT EXISTS xp_transactions (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, user_id TEXT NOT NULL,
    amount INT NOT NULL, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Subscribers
  `CREATE TABLE IF NOT EXISTS subscribers (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, user_id TEXT,
    username TEXT, channel_url TEXT, tier TEXT DEFAULT 'standard',
    subscribed_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(account_number,user_id))`,

  // Donators
  `CREATE TABLE IF NOT EXISTS donators (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, user_id TEXT,
    username TEXT, channel_url TEXT, amount NUMERIC(10,2), currency TEXT DEFAULT 'USD',
    message TEXT, stream_id INT, donated_at TIMESTAMPTZ DEFAULT NOW())`,

  // Streams
  `CREATE TABLE IF NOT EXISTS streams (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, youtube_stream_id TEXT,
    title TEXT, live_chat_id TEXT, status TEXT DEFAULT 'live',
    started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, recap JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Stream viewer counts
  `CREATE TABLE IF NOT EXISTS stream_viewer_counts (
    id SERIAL PRIMARY KEY, stream_id INT, viewer_count INT,
    recorded_at TIMESTAMPTZ DEFAULT NOW())`,

  // Chat Messages
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, stream_id INT,
    message_id TEXT UNIQUE NOT NULL, message_text TEXT, author_name TEXT,
    author_id TEXT, author_url TEXT, status TEXT DEFAULT 'normal',
    sent_at TIMESTAMPTZ DEFAULT NOW())`,

  // Commands
  `CREATE TABLE IF NOT EXISTS commands (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, name TEXT NOT NULL,
    response TEXT NOT NULL, permission TEXT DEFAULT 'everyone',
    cooldown_seconds INT DEFAULT 0, active BOOLEAN DEFAULT true,
    usage_count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(account_number,name))`,

  // Keyword Rules
  `CREATE TABLE IF NOT EXISTS keyword_rules (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, triggers JSONB NOT NULL,
    response TEXT NOT NULL, match_type TEXT DEFAULT 'contains',
    cooldown_seconds INT DEFAULT 60, action TEXT DEFAULT 'reply',
    active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Timed Messages
  `CREATE TABLE IF NOT EXISTS timed_messages (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL UNIQUE,
    messages JSONB NOT NULL, interval_seconds INT DEFAULT 600,
    active BOOLEAN DEFAULT true, last_sent TIMESTAMPTZ)`,

  // Queue
  `CREATE TABLE IF NOT EXISTS queue (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, user_id TEXT,
    username TEXT, in_game_name TEXT, position INT,
    status TEXT DEFAULT 'waiting', joined_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ)`,

  // Giveaways
  `CREATE TABLE IF NOT EXISTS giveaways (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, keyword TEXT,
    entries INT DEFAULT 0, winner_username TEXT, winner_id TEXT,
    stream_id INT, started_at TIMESTAMPTZ DEFAULT NOW(), ended_at TIMESTAMPTZ)`,

  // Clips
  `CREATE TABLE IF NOT EXISTS clips (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, stream_id INT,
    elapsed_seconds INT, label TEXT, triggered_by TEXT,
    vod_url TEXT, triggered_at TIMESTAMPTZ DEFAULT NOW())`,

  // Notifications
  `CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, category TEXT,
    type TEXT, icon TEXT, title TEXT, message TEXT,
    data JSONB DEFAULT '{}', read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Moderation Log
  `CREATE TABLE IF NOT EXISTS moderation_log (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, action TEXT,
    user_id TEXT, username TEXT, reason TEXT,
    actioned_by TEXT DEFAULT 'bot', actioned_at TIMESTAMPTZ DEFAULT NOW())`,

  // Bot Activity Log
  `CREATE TABLE IF NOT EXISTS bot_activity_log (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, action TEXT,
    details JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Seasons
  `CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, name TEXT,
    status TEXT DEFAULT 'active', reset_type TEXT DEFAULT 'soft',
    started_at TIMESTAMPTZ DEFAULT NOW(), ends_at TIMESTAMPTZ)`,

  // Season Rankings
  `CREATE TABLE IF NOT EXISTS season_rankings (
    id SERIAL PRIMARY KEY, season_id INT NOT NULL,
    account_number INT NOT NULL, user_id TEXT NOT NULL,
    xp BIGINT DEFAULT 0, UNIQUE(season_id,user_id))`,

  // Challenges
  `CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, title TEXT,
    description TEXT, type TEXT, target INT,
    sp_reward INT, xp_reward INT, active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Challenge Progress
  `CREATE TABLE IF NOT EXISTS challenge_progress (
    id SERIAL PRIMARY KEY, challenge_id INT NOT NULL,
    account_number INT NOT NULL, user_id TEXT NOT NULL,
    progress INT DEFAULT 0, completed_at TIMESTAMPTZ,
    UNIQUE(challenge_id,user_id))`,

  // Warnings
  `CREATE TABLE IF NOT EXISTS warnings (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    user_id TEXT, username TEXT, reason TEXT,
    strike_number INT, warned_at TIMESTAMPTZ DEFAULT NOW())`,

  // Banned Users
  `CREATE TABLE IF NOT EXISTS banned_users (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    user_id TEXT, username TEXT, channel_url TEXT,
    reason TEXT, banned_by TEXT DEFAULT 'bot',
    banned_at TIMESTAMPTZ DEFAULT NOW(), unbanned_at TIMESTAMPTZ)`,

  // Reward Tiers
  `CREATE TABLE IF NOT EXISTS reward_tiers (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    sp_threshold BIGINT, trigger_tier TEXT,
    trigger_type TEXT DEFAULT 'tier', description TEXT, active BOOLEAN DEFAULT true)`,

  // Reward Deliveries
  `CREATE TABLE IF NOT EXISTS reward_deliveries (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    user_id TEXT, tier_id INT, status TEXT DEFAULT 'pending',
    notes TEXT, unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ, UNIQUE(tier_id,user_id))`,

  // Shop Items
  `CREATE TABLE IF NOT EXISTS shop_items (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    name TEXT, description TEXT, sp_cost INT, active BOOLEAN DEFAULT true)`,

  // Viewer Streaks
  `CREATE TABLE IF NOT EXISTS viewer_streaks (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, user_id TEXT NOT NULL,
    current_streak INT DEFAULT 0, best_streak INT DEFAULT 0,
    multiplier FLOAT DEFAULT 1.0, last_stream_date DATE,
    UNIQUE(account_number,user_id))`,

  // Quotes
  `CREATE TABLE IF NOT EXISTS quotes (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    text TEXT, added_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Videos
  `CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    youtube_video_id TEXT UNIQUE, title TEXT,
    type TEXT DEFAULT 'video', views BIGINT DEFAULT 0,
    likes INT DEFAULT 0, comments INT DEFAULT 0,
    published_at TIMESTAMPTZ, synced_at TIMESTAMPTZ DEFAULT NOW())`,

  // Stream Presets
  `CREATE TABLE IF NOT EXISTS stream_presets (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, name TEXT,
    config JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Goals
  `CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, type TEXT,
    title TEXT, target INT, current INT DEFAULT 0,
    active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Overlays
  `CREATE TABLE IF NOT EXISTS overlays (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, name TEXT,
    config JSONB DEFAULT '{}', active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Song Requests (BUG-16)
  `CREATE TABLE IF NOT EXISTS song_requests (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, stream_id INT,
    requested_by TEXT, song_name TEXT, status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Notes
  `CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY, account_number INT,
    content TEXT, pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,

  // Community Posts (BUG-30 FIXED)
  `CREATE TABLE IF NOT EXISTS community_posts (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL, content TEXT,
    type TEXT DEFAULT 'announcement', status TEXT DEFAULT 'draft',
    scheduled_at TIMESTAMPTZ, posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Trivia Questions (BUG-27 FIXED)
  `CREATE TABLE IF NOT EXISTS trivia_questions (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    question TEXT NOT NULL, answer TEXT NOT NULL,
    category TEXT DEFAULT 'general', difficulty TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW())`,

  // Predictions (BUG-28 FIXED)
  `CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY, account_number INT NOT NULL,
    stream_id INT, question TEXT, yes_count INT DEFAULT 0,
    no_count INT DEFAULT 0, result TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(), ended_at TIMESTAMPTZ)`,

  // BUG-77 FIXED: Performance indexes
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_stream_id   ON chat_messages(stream_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_author_id   ON chat_messages(author_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_sent_at     ON chat_messages(sent_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sp_transactions_user_id   ON sp_transactions(user_id, account_number)`,
  `CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_id   ON xp_transactions(user_id, account_number)`,
  `CREATE INDEX IF NOT EXISTS idx_viewer_ranks_xp           ON viewer_ranks(account_number, total_xp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_account     ON notifications(account_number, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_unread      ON notifications(account_number, read_at)`,
  `CREATE INDEX IF NOT EXISTS idx_subscribers_account       ON subscribers(account_number, subscribed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_donators_account          ON donators(account_number, donated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_streams_account           ON streams(account_number, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_queue_account_status      ON queue(account_number, status)`,
  `CREATE INDEX IF NOT EXISTS idx_clips_stream              ON clips(stream_id)`,
  `CREATE INDEX IF NOT EXISTS idx_viewer_streaks_account    ON viewer_streaks(account_number, current_streak DESC)`
];

async function runMigrations() {
  console.log('Running database migrations...');
  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
      const isIndex = migrations[i].includes('CREATE INDEX');
      if (!isIndex) console.log(`Migration ${i+1}/${migrations.length} OK`);
    } catch (err) {
      console.error(`Migration ${i+1} failed:`, err.message);
      throw err;
    }
  }
  console.log('All migrations completed + indexes created');
  process.exit(0);
}

runMigrations().catch(err => { console.error('Fatal:', err); process.exit(1); });
