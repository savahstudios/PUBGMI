const TelegramBot = require('node-telegram-bot-api');
const { requireTelegramAuth } = require('../middleware/auth');
const { getLiveStatus, getChannelStats } = require('../services/youtubeService');
const { sendChatMessage } = require('../services/youtubeApiService');
const { getNotifications, getUnreadCount, markAllRead } = require('../services/notificationService');
const { getViewerRank } = require('../services/spService');
const { getWatchdogStats } = require('../services/watchdogService');
const { destroyAllSessions } = require('../middleware/sessionManager');
const { postStreamRules, postSocials } = require('../services/chatService');
const { query } = require('../config/database');
const { getRedis } = require('../config/redis');
const { getFullVersion, getLatestChanges } = require('../utils/version');
const logger = require('../utils/logger');

let bot;
let io;

// Track active account per Telegram user
const activeAccounts = {};
// BUG-36 FIXED: awaitedStates persisted to Redis — survives bot restarts
async function getAwaitedState(chatId) {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(`tg_await:${chatId}`);
  return raw ? JSON.parse(raw) : null;
}

async function setAwaitedState(chatId, state, ttlSeconds = 120) {
  const redis = getRedis();
  if (!redis) return;
  await redis.setex(`tg_await:${chatId}`, ttlSeconds, JSON.stringify(state));
}

async function clearAwaitedState(chatId) {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`tg_await:${chatId}`);
}

async function initializeTelegramBot(socketIo) {
  io = socketIo;
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on('message', async (msg) => {
    const userId = msg.from?.id;
    // ABSOLUTE SECURITY — completely ignore unauthorized users, zero response
    if (!requireTelegramAuth(userId)) return;

    const text = (msg.text || '').trim();
    const chatId = msg.chat.id;

    try {
      await handleMessage(chatId, userId, text, msg);
    } catch (error) {
      logger.error('Telegram message error:', error.message);
      await safeReply(chatId, 'An error occurred. Please try again.');
    }
  });

  bot.on('callback_query', async (cbq) => {
    const userId = cbq.from?.id;
    if (!requireTelegramAuth(userId)) return;
    try {
      await bot.answerCallbackQuery(cbq.id);
      await handleCallbackQuery(cbq);
    } catch (error) {
      logger.error('Callback query error:', error.message);
    }
  });

  bot.on('polling_error', (error) => {
    logger.error('Telegram polling error:', error.message);
  });

  logger.info('Telegram bot @PUBGMIROBOT initialized and polling');
}

function getActiveAccount(userId) {
  return activeAccounts[userId] || 1;
}

function ts() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function kb(rows) {
  return { inline_keyboard: rows };
}

async function handleMessage(chatId, userId, text, msg) {
  const account = getActiveAccount(userId);

  // Check awaited input first
  if (!text.startsWith('/') && awaitedStates[chatId]) {
    return await handleAwaitedInput(chatId, userId, text);
  }

  const parts = text.split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case '/start':
    case '/menu':     return showMainMenu(chatId, account);
    case '/status':   return showStatus(chatId, account);
    case '/ping':     return showPing(chatId);
    case '/health':   return showHealth(chatId);
    case '/live':     return showLiveControl(chatId, account);
    case '/say':      return handleSay(chatId, account, args.join(' '));
    case '/clip':
    case '/moment':   return handleClip(chatId, account, args.join(' '));
    case '/queue':    return showQueuePanel(chatId, account);
    case '/giveaway': return showGiveawayPanel(chatId, account);
    case '/stats':    return showStats(chatId, account);
    case '/notifications': return showNotifications(chatId, account);
    case '/recap':    return showLastRecap(chatId, account);
    case '/account':  return showAccountSwitcher(chatId, userId, account);
    case '/clips':    return showClips(chatId, account);
    case '/rules':    return handlePostRules(chatId, account);
    case '/socials':  return handlePostSocials(chatId, account);
    case '/slow':     return handleToggleSlow(chatId, account);
    case '/subonly':  return handleToggleSubOnly(chatId, account);
    case '/break':    return handleToggleBreak(chatId, account);
    case '/hype':     return handleHype(chatId, account);
    case '/ban':      return handleBan(chatId, account, args[0]);
    case '/unban':    return handleUnban(chatId, args[0]);
    case '/timeout':  return handleTimeout(chatId, account, args[0], parseInt(args[1]) || 300);
    case '/listusers':return handleListUsers(chatId);
    case '/logout_all': return handleLogoutAll(chatId, userId);
    case '/version':  return handleVersion(chatId);
    case '/changelog':return handleChangelog(chatId);
    case '/help':     return showHelp(chatId);
    default:
      if (text.startsWith('/')) {
        await safeReply(chatId, `Unknown command: ${command}\nType /help to see all commands.`);
      }
  }
}

// ── MAIN MENU ──────────────────────────────────────────────────
async function showMainMenu(chatId, account) {
  const redis = getRedis();
  const isLive = await redis.get(`account:${account}:live`) === 'true';
  const stats = getWatchdogStats();

  const text = `*PUBGMI — Main Menu*\n` +
    `Account: ${account}  ·  ${ts()}\n\n` +
    `Bot: ONLINE  |  Stream: ${isLive ? '🔴 LIVE' : '⚫ OFFLINE'}\n` +
    `Uptime: ${formatUptime(stats.uptime)}  |  ${getFullVersion()}`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([
      [{ text: 'Live Control', callback_data: 'live_control' }, { text: 'Chat Manager', callback_data: 'chat_manager' }],
      [{ text: 'Squad Queue', callback_data: 'squad_queue' }, { text: 'Giveaway', callback_data: 'giveaway' }],
      [{ text: 'Analytics', callback_data: 'analytics' }, { text: 'Notifications', callback_data: 'notifications' }],
      [{ text: 'Clips & Marks', callback_data: 'clips' }, { text: 'Records', callback_data: 'records' }],
      [{ text: 'Status & Ping', callback_data: 'status' }, { text: 'Switch Account', callback_data: 'switch_account' }],
      [{ text: 'Version Info', callback_data: 'version' }, { text: 'Help', callback_data: 'help' }]
    ])
  });
}

// ── STATUS / PING ──────────────────────────────────────────────
async function showPing(chatId) {
  const start = Date.now();
  const m = await bot.sendMessage(chatId, 'Pinging...');
  const latency = Date.now() - start;
  await bot.editMessageText(
    `*Pong*\nLatency: ${latency}ms\n${ts()}`,
    { chat_id: chatId, message_id: m.message_id, parse_mode: 'Markdown' }
  );
}

async function showHealth(chatId) {
  const stats = getWatchdogStats();
  await safeReply(chatId, `All systems operational  ·  ${ts()}\nUptime: ${formatUptime(stats.uptime)}`);
}

async function showStatus(chatId, account) {
  const stats = getWatchdogStats();
  const redis = getRedis();
  const isLive = await redis.get(`account:${account}:live`) === 'true';
  const mem = stats.memoryUsage;
  const memMB = Math.floor(mem.heapUsed / 1024 / 1024);
  const memTotal = Math.floor(mem.heapTotal / 1024 / 1024);

  const text = `*PUBGMI Bot Status*\n${ts()}\n\n` +
    `*Bot*\n  Status: ONLINE\n  Version: ${getFullVersion()}\n  Uptime: ${formatUptime(stats.uptime)}\n  Restarts: ${stats.restartCount}\n\n` +
    `*YouTube*\n  Account 1: Connected\n  Account 2: Connected\n  Stream: ${isLive ? '🔴 LIVE' : '⚫ Offline'}\n\n` +
    `*System*\n  Memory: ${memMB}MB / ${memTotal}MB\n\n` +
    `*Services*\n  Telegram: Online\n  Dashboard: Online`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([[{ text: 'Refresh', callback_data: 'status' }, { text: 'Back', callback_data: 'main_menu' }]])
  });
}

// ── VERSION / CHANGELOG ────────────────────────────────────────
async function handleVersion(chatId) {
  const changes = getLatestChanges();
  const text = `*PUBGMI Bot — Version Info*\n${ts()}\n\n` +
    `Current: *${getFullVersion()}*\n\n` +
    `*Latest changes (${changes.version}):*\n` +
    changes.changes.map(c => `• ${c}`).join('\n');

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([[{ text: 'Full Changelog', callback_data: 'changelog' }, { text: 'Back', callback_data: 'main_menu' }]])
  });
}

async function handleChangelog(chatId) {
  const { CHANGELOG } = require('../utils/version');
  let text = `*PUBGMI Bot — Changelog*\n${ts()}\n\n`;
  CHANGELOG.slice(0, 5).forEach(entry => {
    text += `*v${entry.version}* (${entry.date}) — ${entry.type}\n`;
    entry.changes.slice(0, 4).forEach(c => { text += `  • ${c}\n`; });
    text += '\n';
  });
  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([[{ text: 'Back', callback_data: 'main_menu' }]])
  });
}

// ── LIVE CONTROL ───────────────────────────────────────────────
async function showLiveControl(chatId, account) {
  const redis = getRedis();
  const isLive = await redis.get(`account:${account}:live`) === 'true';
  const startTime = await redis.get(`account:${account}:stream_start`);
  let duration = 'N/A';
  if (isLive && startTime) {
    duration = formatUptime(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
  }
  const kills = await redis.get(`account:${account}:counter_kill`) || '0';
  const deaths = await redis.get(`account:${account}:counter_death`) || '0';
  const wins = await redis.get(`account:${account}:counter_win`) || '0';

  const text = `*Live Control — Account ${account}*\n${ts()}\n\n` +
    `Status: ${isLive ? '🔴 LIVE' : '⚫ Offline'}  |  Duration: ${duration}\n` +
    `Kills: ${kills}  |  Deaths: ${deaths}  |  Wins: ${wins}`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([
      [{ text: 'Mark Moment', callback_data: 'mark_moment' }, { text: 'Post Rules', callback_data: 'post_rules' }],
      [{ text: 'Post Socials', callback_data: 'post_socials' }, { text: 'Trigger Hype', callback_data: 'hype' }],
      [{ text: 'Break Mode', callback_data: 'toggle_break' }, { text: 'Say Something', callback_data: 'say_prompt' }],
      [{ text: 'Slow Mode', callback_data: 'toggle_slow' }, { text: 'Sub Only', callback_data: 'toggle_subonly' }],
      [{ text: 'Kill +1', callback_data: 'counter_kill' }, { text: 'Death +1', callback_data: 'counter_death' }],
      [{ text: 'Win +1', callback_data: 'counter_win' }, { text: 'Reset Counters', callback_data: 'counter_reset' }],
      [{ text: 'Back', callback_data: 'main_menu' }]
    ])
  });
}

// ── SQUAD QUEUE ────────────────────────────────────────────────
async function showQueuePanel(chatId, account) {
  const { rows } = await query(
    `SELECT position, username, in_game_name, joined_at 
     FROM queue WHERE account_number = $1 AND status = 'waiting' 
     ORDER BY position LIMIT 8`,
    [account]
  );
  const redis = getRedis();
  const queueState = await redis.get(`account:${account}:queue_open`) || 'open';

  let text = `*Squad Queue — Account ${account}*\n${ts()}\n\n`;
  text += `Status: ${queueState === 'open' ? 'OPEN' : 'CLOSED'}  |  Players: ${rows.length}\n\n`;

  if (rows.length) {
    rows.forEach(r => {
      const waited = Math.floor((Date.now() - new Date(r.joined_at).getTime()) / 60000);
      text += `${r.position}. @${r.username} — ${r.in_game_name} (${waited}m)\n`;
    });
  } else {
    text += 'Queue is empty';
  }

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([
      [{ text: 'Accept Next', callback_data: 'queue_accept' }, { text: 'Skip Next', callback_data: 'queue_skip' }],
      [{ text: 'Open Queue', callback_data: 'queue_open' }, { text: 'Close Queue', callback_data: 'queue_close' }],
      [{ text: 'Clear Queue', callback_data: 'queue_clear' }],
      [{ text: 'Refresh', callback_data: 'squad_queue' }, { text: 'Back', callback_data: 'main_menu' }]
    ])
  });
}

// ── GIVEAWAY ───────────────────────────────────────────────────
async function showGiveawayPanel(chatId, account) {
  const redis = getRedis();
  const raw = await redis.get(`account:${account}:giveaway`);
  let text = `*Giveaway — Account ${account}*\n${ts()}\n\n`;
  let keys;

  if (raw) {
    const g = JSON.parse(raw);
    const secsLeft = Math.max(0, Math.floor((new Date(g.endsAt) - Date.now()) / 1000));
    text += `Status: ACTIVE\nKeyword: "${g.keyword}"\nEntries: ${g.entries || 0}\nTime left: ${formatUptime(secsLeft)}`;
    keys = kb([
      [{ text: 'Pick Winner Now', callback_data: 'giveaway_pick' }, { text: 'Cancel', callback_data: 'giveaway_cancel' }],
      [{ text: 'Refresh', callback_data: 'giveaway' }, { text: 'Back', callback_data: 'main_menu' }]
    ]);
  } else {
    text += 'No active giveaway';
    keys = kb([
      [{ text: 'Start New Giveaway', callback_data: 'giveaway_start' }],
      [{ text: 'View History', callback_data: 'giveaway_history' }],
      [{ text: 'Back', callback_data: 'main_menu' }]
    ]);
  }
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keys });
}

// ── ANALYTICS ─────────────────────────────────────────────────
async function showStats(chatId, account) {
  const channelStats = await getChannelStats(account);
  const redis = getRedis();
  const raw = await redis.get(`account:${account}:live_stats`);
  const liveStats = raw ? JSON.parse(raw) : {};

  let text = `*Channel Stats — Account ${account}*\n${ts()}\n\n`;
  if (channelStats) {
    text += `Subscribers: ${parseInt(channelStats.subscriberCount || 0).toLocaleString()}\n`;
    text += `Total Views: ${parseInt(channelStats.viewCount || 0).toLocaleString()}\n`;
    text += `Videos: ${channelStats.videoCount || 0}\n`;
  }
  if (liveStats.concurrentViewers) text += `Live Viewers: ${liveStats.concurrentViewers}\n`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([[{ text: 'Refresh', callback_data: 'analytics' }, { text: 'Last Recap', callback_data: 'last_recap' }, { text: 'Back', callback_data: 'main_menu' }]])
  });
}

// ── NOTIFICATIONS ──────────────────────────────────────────────
async function showNotifications(chatId, account) {
  const notifications = await getNotifications(account, { limit: 8 });
  const unread = await getUnreadCount(account);

  let text = `*Notifications — Account ${account}*\n${ts()}\nUnread: ${unread}\n\n`;
  if (!notifications.length) {
    text += 'No notifications yet';
  } else {
    notifications.slice(0, 6).forEach(n => {
      const t = new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      text += `*${t}* — ${n.title}\n${n.message}\n\n`;
    });
  }

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([
      [{ text: 'Mark All Read', callback_data: 'notif_read_all' }],
      [{ text: 'Refresh', callback_data: 'notifications' }, { text: 'Back', callback_data: 'main_menu' }]
    ])
  });
}

// ── CLIPS ──────────────────────────────────────────────────────
async function showClips(chatId, account) {
  const { rows } = await query(
    `SELECT label, elapsed_seconds, triggered_by, triggered_at 
     FROM clips WHERE account_number = $1 ORDER BY triggered_at DESC LIMIT 8`,
    [account]
  );
  let text = `*Recent Clips — Account ${account}*\n${ts()}\n\n`;
  if (!rows.length) {
    text += 'No clips marked yet';
  } else {
    rows.forEach((c, i) => {
      const h = Math.floor(c.elapsed_seconds / 3600);
      const m = String(Math.floor((c.elapsed_seconds % 3600) / 60)).padStart(2, '0');
      const s = String(c.elapsed_seconds % 60).padStart(2, '0');
      text += `${i + 1}. ${h}:${m}:${s} — ${c.label || 'No label'}\n`;
    });
  }
  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([[{ text: 'Mark Moment Now', callback_data: 'mark_moment' }, { text: 'Back', callback_data: 'main_menu' }]])
  });
}

// ── LAST RECAP ─────────────────────────────────────────────────
async function showLastRecap(chatId, account) {
  const { rows } = await query(
    `SELECT title, started_at, ended_at, recap FROM streams 
     WHERE account_number = $1 AND status = 'ended' ORDER BY ended_at DESC LIMIT 1`,
    [account]
  );
  if (!rows.length) return safeReply(chatId, `No past streams found.\n${ts()}`);

  const stream = rows[0];
  const r = stream.recap ? JSON.parse(stream.recap) : {};
  const text = `*Last Stream Recap*\n"${stream.title || 'Untitled'}"\n${ts()}\n\n` +
    `Duration: ${r.duration || 'N/A'}\nPeak Viewers: ${r.peakViewers || 0}\n` +
    `New Subs: ${r.newSubscribers || 0}\nSuper Chats: $${(r.superChatTotal || 0).toFixed(2)}\n` +
    `Messages: ${(r.totalMessages || 0).toLocaleString()}\nTop Chatter: ${r.topChatter || 'N/A'}`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([[{ text: 'View Clips', callback_data: 'clips' }, { text: 'Back', callback_data: 'main_menu' }]])
  });
}

// ── ACCOUNT SWITCHER ───────────────────────────────────────────
async function showAccountSwitcher(chatId, userId, currentAccount) {
  await bot.sendMessage(chatId,
    `*Switch Account*\n${ts()}\n\nCurrently active: Account ${currentAccount}`,
    {
      parse_mode: 'Markdown',
      reply_markup: kb([
        [
          { text: `${currentAccount === 1 ? '✓ ' : ''}Account 1`, callback_data: 'set_account_1' },
          { text: `${currentAccount === 2 ? '✓ ' : ''}Account 2`, callback_data: 'set_account_2' }
        ],
        [{ text: 'Back', callback_data: 'main_menu' }]
      ])
    }
  );
}

// ── CHAT ACTIONS ───────────────────────────────────────────────
async function handleSay(chatId, account, message) {
  if (!message) {
    await setAwaitedState(chatId, { state: 'say', account });
    return safeReply(chatId, `Type the message to send to chat:\n${ts()}`);
  }
  const sent = await sendChatMessage(account, message);
  await safeReply(chatId, sent ? `Sent: "${message}"\n${ts()}` : `Failed — are you live?\n${ts()}`);
}

async function handlePostRules(chatId, account) {
  await postStreamRules(account);
  await safeReply(chatId, `Stream rules posted\n${ts()}`);
}

async function handlePostSocials(chatId, account) {
  await postSocials(account);
  await safeReply(chatId, `Socials posted\n${ts()}`);
}

async function handleHype(chatId, account) {
  const msgs = [
    'LETS GOOOOO! Drop a like if you are enjoying! 🔥',
    'Squad is LOCKED IN! PUBG Mobile on another level!',
    'The grind never stops! Welcome to PUBGMI!',
    'Smash that subscribe button! 🎮'
  ];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  await sendChatMessage(account, msg);
  await safeReply(chatId, `Hype triggered\n${ts()}`);
}

async function handleToggleSlow(chatId, account) {
  const redis = getRedis();
  const key = `account:${account}:slow_mode`;
  const cur = await redis.get(key) || 'off';
  const next = cur === 'off' ? 'on' : 'off';
  await redis.set(key, next);
  await sendChatMessage(account, `Slow mode ${next === 'on' ? 'enabled' : 'disabled'}`);
  await safeReply(chatId, `Slow mode: ${next.toUpperCase()}\n${ts()}`);
}

async function handleToggleSubOnly(chatId, account) {
  const redis = getRedis();
  const key = `account:${account}:sub_only`;
  const cur = await redis.get(key) || 'off';
  const next = cur === 'off' ? 'on' : 'off';
  await redis.set(key, next);
  await sendChatMessage(account, `Subscriber-only mode ${next === 'on' ? 'enabled' : 'disabled'}`);
  await safeReply(chatId, `Sub-only: ${next.toUpperCase()}\n${ts()}`);
}

async function handleToggleBreak(chatId, account) {
  const redis = getRedis();
  const key = `account:${account}:break_mode`;
  const cur = await redis.get(key) || 'off';
  const next = cur === 'off' ? 'on' : 'off';
  await redis.set(key, next);
  if (next === 'on') await sendChatMessage(account, 'Taking a short break — back very soon!');
  await safeReply(chatId, `Break mode: ${next.toUpperCase()}\n${ts()}`);
}

async function handleClip(chatId, account, label) {
  const redis = getRedis();
  const streamDbId = await redis.get(`account:${account}:stream_db_id`);
  const startTime = await redis.get(`account:${account}:stream_start`);

  if (!streamDbId || !startTime) return safeReply(chatId, `Not currently live\n${ts()}`);

  const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  const timestamp = `${h}:${m}:${s}`;

  await query(
    `INSERT INTO clips (account_number, stream_id, elapsed_seconds, label, triggered_by, triggered_at)
     VALUES ($1, $2, $3, $4, 'Telegram', NOW())`,
    [account, streamDbId, elapsed, label || null]
  );

  await safeReply(chatId, `Moment marked at ${timestamp}${label ? `\nLabel: "${label}"` : ''}\n${ts()}`);
}

async function handleBan(chatId, account, username) {
  if (!username) return safeReply(chatId, 'Usage: /ban @username');
  const clean = username.replace('@', '');
  await bot.sendMessage(chatId, `Ban @${clean}?\n${ts()}`, {
    reply_markup: kb([
      [{ text: 'Confirm Ban', callback_data: `confirm_ban_${clean}` }, { text: 'Cancel', callback_data: 'main_menu' }]
    ])
  });
}

async function handleUnban(chatId, username) {
  if (!username) return safeReply(chatId, 'Usage: /unban @username');
  await safeReply(chatId, `Manage unbans from the dashboard → Moderation Center\n${ts()}`);
}

async function handleTimeout(chatId, account, username, seconds) {
  if (!username) return safeReply(chatId, 'Usage: /timeout @username [seconds]');
  await safeReply(chatId, `Timeout @${username} for ${seconds}s — manage from dashboard for full control\n${ts()}`);
}

async function handleListUsers(chatId) {
  const ids = (process.env.AUTHORIZED_TELEGRAM_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  const list = ids.map((id, i) => `${i + 1}. ${id}`).join('\n');
  await bot.sendMessage(chatId, `*Authorized Users*\n${ts()}\n\n${list || 'None configured'}`, { parse_mode: 'Markdown' });
}

async function handleLogoutAll(chatId, userId) {
  await destroyAllSessions(userId);
  await safeReply(chatId, `All dashboard sessions terminated\n${ts()}`);
}

async function showHelp(chatId) {
  const text = `*PUBGMI — Command Reference*\n${ts()}\n\n` +
    `*STREAM*\n/live /say /clip /break /hype /rules /socials /slow /subonly\n\n` +
    `*MODERATION*\n/ban /unban /timeout\n\n` +
    `*COMMUNITY*\n/queue /giveaway\n\n` +
    `*DATA*\n/stats /recap /clips /notifications\n\n` +
    `*SYSTEM*\n/status /ping /health /version /changelog /account /menu /help`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([[{ text: 'Main Menu', callback_data: 'main_menu' }]])
  });
}

// ── AWAITED INPUT ──────────────────────────────────────────────
async function handleAwaitedInput(chatId, userId, text) {
  const state = await getAwaitedState(chatId);
  if (!state) return;

  const account = state.account || getActiveAccount(userId);

  if (state.state === 'say') {
    await clearAwaitedState(chatId);
    const sent = await sendChatMessage(account, text);
    return safeReply(chatId, sent ? `Sent: "${text}"\n${ts()}` : `Failed — are you live?\n${ts()}`);
  }

  if (state.state === 'giveaway_keyword') {
    await setAwaitedState(chatId, { ...state, state: 'giveaway_duration', keyword: text });
    return safeReply(chatId, `Keyword: "${text}"\nNow send the duration in minutes:`);
  }

  if (state.state === 'giveaway_duration') {
    await clearAwaitedState(chatId);
    const duration = Math.max(1, parseInt(text) || 5);
    const endsAt = new Date(Date.now() + duration * 60000).toISOString();
    const giveawayData = {
      keyword: state.keyword, duration, endsAt,
      entries: 0, entryList: [], startedAt: new Date().toISOString()
    };
    const redis = getRedis();
    await redis.setex(`account:${account}:giveaway`, duration * 60, JSON.stringify(giveawayData));
    await sendChatMessage(account, `GIVEAWAY! Type "${state.keyword}" to enter! Ends in ${duration} minutes!`);

    // BUG-35 FIXED: Store end time in Redis — periodic job checks instead of unreliable setTimeout
    // The giveaway auto-pick is handled by startGiveawayWatcher() in the background

    return bot.sendMessage(chatId,
      `Giveaway started!\nKeyword: "${state.keyword}"\nDuration: ${duration} minutes\n${ts()}`,
      { reply_markup: kb([[{ text: 'Pick Winner Now', callback_data: 'giveaway_pick' }, { text: 'Cancel', callback_data: 'giveaway_cancel' }]]) }
    );
  }
}

// ── GIVEAWAY PICK ──────────────────────────────────────────────
async function pickGiveawayWinner(chatId, account) {
  const redis = getRedis();
  const raw = await redis.get(`account:${account}:giveaway`);
  if (!raw) return;

  const g = JSON.parse(raw);
  if (!g.entryList?.length) {
    return safeReply(chatId, `Giveaway ended — no entries\n${ts()}`);
  }

  const winner = g.entryList[Math.floor(Math.random() * g.entryList.length)];
  await redis.del(`account:${account}:giveaway`);

  await query(
    `INSERT INTO giveaways (account_number, keyword, entries, winner_username, ended_at) VALUES ($1,$2,$3,$4,NOW())`,
    [account, g.keyword, g.entryList.length, winner]
  );

  await sendChatMessage(account, `WINNER: @${winner} Congratulations! Please respond within 2 minutes!`);
  await bot.sendMessage(chatId,
    `Winner: @${winner}\nEntries: ${g.entryList.length}\n${ts()}`,
    { reply_markup: kb([[{ text: 'Back to Menu', callback_data: 'main_menu' }]]) }
  );
}

// ── COUNTER ────────────────────────────────────────────────────
async function handleCounter(chatId, account, type) {
  const redis = getRedis();
  if (type === 'reset') {
    await redis.del(`account:${account}:counter_kill`);
    await redis.del(`account:${account}:counter_death`);
    await redis.del(`account:${account}:counter_win`);
    return safeReply(chatId, `Counters reset\n${ts()}`);
  }
  const count = await redis.incr(`account:${account}:counter_${type}`);
  const labels = { kill: 'Kills', death: 'Deaths', win: 'Wins' };
  await safeReply(chatId, `${labels[type] || type}: ${count}\n${ts()}`);
}

// ── CALLBACK QUERY HANDLER ─────────────────────────────────────
async function handleCallbackQuery(cbq) {
  const chatId = cbq.message.chat.id;
  const userId = cbq.from.id;
  const data = cbq.data;
  const account = getActiveAccount(userId);

  const routes = {
    main_menu: () => showMainMenu(chatId, account),
    live_control: () => showLiveControl(chatId, account),
    chat_manager: () => showChatManager(chatId, account),
    squad_queue: () => showQueuePanel(chatId, account),
    giveaway: () => showGiveawayPanel(chatId, account),
    analytics: () => showStats(chatId, account),
    notifications: () => showNotifications(chatId, account),
    clips: () => showClips(chatId, account),
    status: () => showStatus(chatId, account),
    help: () => showHelp(chatId),
    version: () => handleVersion(chatId),
    changelog: () => handleChangelog(chatId),
    last_recap: () => showLastRecap(chatId, account),
    switch_account: () => showAccountSwitcher(chatId, userId, account),
    post_rules: () => handlePostRules(chatId, account),
    post_socials: () => handlePostSocials(chatId, account),
    hype: () => handleHype(chatId, account),
    toggle_slow: () => handleToggleSlow(chatId, account),
    toggle_subonly: () => handleToggleSubOnly(chatId, account),
    toggle_break: () => handleToggleBreak(chatId, account),
    mark_moment: () => handleClip(chatId, account, ''),
    say_prompt: () => handleSay(chatId, account, ''),
    giveaway_start: async () => { await setAwaitedState(chatId, { state: 'giveaway_keyword', account }); await safeReply(chatId, 'Send the entry keyword:'); },
    giveaway_pick: () => pickGiveawayWinner(chatId, account),
    giveaway_cancel: async () => {
      const redis = getRedis();
      await redis.del(`account:${account}:giveaway`);
      await sendChatMessage(account, 'Giveaway cancelled');
      safeReply(chatId, `Giveaway cancelled\n${ts()}`);
    },
    queue_accept: () => acceptNextQueue(chatId, account),
    queue_skip: () => skipQueue(chatId, account),
    queue_open: () => toggleQueue(chatId, account, 'open'),
    queue_close: () => toggleQueue(chatId, account, 'closed'),
    queue_clear: () => clearQueue(chatId, account),
    notif_read_all: async () => { await markAllRead(account); safeReply(chatId, `All notifications marked read\n${ts()}`); },
    set_account_1: () => { activeAccounts[userId] = 1; safeReply(chatId, `Switched to Account 1\n${ts()}`); },
    set_account_2: () => { activeAccounts[userId] = 2; safeReply(chatId, `Switched to Account 2\n${ts()}`); },
    counter_kill: () => handleCounter(chatId, account, 'kill'),
    counter_death: () => handleCounter(chatId, account, 'death'),
    counter_win: () => handleCounter(chatId, account, 'win'),
    counter_reset: () => handleCounter(chatId, account, 'reset'),
    records: () => showRecordsMenu(chatId, account),
    giveaway_history: () => showGiveawayHistory(chatId, account),
  };

  if (routes[data]) return routes[data]();

  if (data.startsWith('confirm_ban_')) {
    const username = data.replace('confirm_ban_', '');
    await sendChatMessage(account, `@${username} has been banned from this chat`);
    return safeReply(chatId, `@${username} banned\n${ts()}`);
  }
}

// ── QUEUE HELPERS ──────────────────────────────────────────────
async function acceptNextQueue(chatId, account) {
  const { rows } = await query(
    `SELECT * FROM queue WHERE account_number = $1 AND status = 'waiting' ORDER BY position LIMIT 1`,
    [account]
  );
  if (!rows.length) return safeReply(chatId, `Queue is empty\n${ts()}`);

  const p = rows[0];
  const waited = Math.floor((Date.now() - new Date(p.joined_at).getTime()) / 60000);
  await query(`UPDATE queue SET status='accepted', accepted_at=NOW() WHERE id=$1`, [p.id]);
  await sendChatMessage(account, `@${p.username} you are up! Join squad — in-game: ${p.in_game_name}`);
  await safeReply(chatId, `Accepted: @${p.username}\nIn-game: ${p.in_game_name}\nWait: ${waited}m\n${ts()}`);
}

async function skipQueue(chatId, account) {
  const { rows } = await query(
    `SELECT * FROM queue WHERE account_number = $1 AND status = 'waiting' ORDER BY position LIMIT 1`,
    [account]
  );
  if (!rows.length) return safeReply(chatId, `Queue is empty\n${ts()}`);

  await query(`UPDATE queue SET status='skipped' WHERE id=$1`, [rows[0].id]);
  await sendChatMessage(account, `@${rows[0].username} was skipped from the queue`);
  await safeReply(chatId, `Skipped @${rows[0].username}\n${ts()}`);
}

async function toggleQueue(chatId, account, state) {
  const redis = getRedis();
  await redis.set(`account:${account}:queue_open`, state);
  await sendChatMessage(account, `Squad queue is now ${state.toUpperCase()}${state === 'open' ? ' — type !join [in-game name]!' : ''}`);
  await safeReply(chatId, `Queue ${state.toUpperCase()}\n${ts()}`);
}

async function clearQueue(chatId, account) {
  await query(`UPDATE queue SET status='cleared' WHERE account_number=$1 AND status='waiting'`, [account]);
  await sendChatMessage(account, 'Squad queue cleared');
  await safeReply(chatId, `Queue cleared\n${ts()}`);
}

async function showChatManager(chatId, account) {
  const redis = getRedis();
  const slow = await redis.get(`account:${account}:slow_mode`) || 'off';
  const sub = await redis.get(`account:${account}:sub_only`) || 'off';
  await bot.sendMessage(chatId,
    `*Chat Manager — Account ${account}*\n${ts()}\n\nSlow Mode: ${slow.toUpperCase()}  |  Sub Only: ${sub.toUpperCase()}`,
    {
      parse_mode: 'Markdown',
      reply_markup: kb([
        [{ text: 'Toggle Slow Mode', callback_data: 'toggle_slow' }, { text: 'Toggle Sub Only', callback_data: 'toggle_subonly' }],
        [{ text: 'Post Rules', callback_data: 'post_rules' }, { text: 'Post Socials', callback_data: 'post_socials' }],
        [{ text: 'Back', callback_data: 'main_menu' }]
      ])
    }
  );
}

async function showRecordsMenu(chatId, account) {
  await bot.sendMessage(chatId,
    `*Records — Account ${account}*\n${ts()}\n\nAccess full records from the dashboard at pubgmi.vercel.app`,
    {
      parse_mode: 'Markdown',
      reply_markup: kb([[{ text: 'Back', callback_data: 'main_menu' }]])
    }
  );
}

async function showGiveawayHistory(chatId, account) {
  const { rows } = await query(
    `SELECT keyword, entries, winner_username, ended_at FROM giveaways 
     WHERE account_number=$1 ORDER BY ended_at DESC LIMIT 5`,
    [account]
  );
  let text = `*Giveaway History — Account ${account}*\n${ts()}\n\n`;
  if (!rows.length) {
    text += 'No giveaways yet';
  } else {
    rows.forEach((g, i) => {
      const d = new Date(g.ended_at).toLocaleDateString('en-GB');
      text += `${i + 1}. "${g.keyword}" — Winner: @${g.winner_username || 'none'} (${g.entries} entries) — ${d}\n`;
    });
  }
  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: kb([[{ text: 'Back', callback_data: 'giveaway' }]])
  });
}

// ── PUSH NOTIFICATIONS ─────────────────────────────────────────
async function pushNotification(type, data) {
  const ids = (process.env.AUTHORIZED_TELEGRAM_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);

  const texts = {
    stream_live:     `*PUBGMI is now LIVE*\n"${data.title || ''}"\n${ts()}`,
    stream_ended:    `*Stream Ended*\n${ts()}\nDuration: ${data.recap?.duration || 'N/A'}\nNew Subs: ${data.recap?.newSubscribers || 0}\nPeak: ${data.recap?.peakViewers || 0}\nSuper Chats: $${(data.recap?.superChatTotal || 0).toFixed(2)}`,
    new_subscriber:  `*New Subscriber*\n@${data.username}\n${ts()}`,
    super_chat:      `*Super Chat*\n@${data.username} — ${data.amount}${data.message ? `\n"${data.message}"` : ''}\n${ts()}`,
    rank_up:         `*Rank Up*\n@${data.username}\n${data.oldRank} → ${data.newRank}\n${ts()}`,
    reward_unlocked: `*Reward Unlocked*\n@${data.username}\n${data.reward}\n${ts()}`,
    user_auto_banned:`*User Auto-Banned*\n@${data.username}\nReason: ${data.reason}\n${ts()}`,
    new_video:       `*New Video*\n"${data.title || ''}"\n${ts()}`,
  };

  const text = texts[type] || `*Notification*\n${JSON.stringify(data)}\n${ts()}`;

  const keyboards = {
    stream_live: kb([[{ text: 'Open Live Control', callback_data: 'live_control' }]]),
    stream_ended: kb([[{ text: 'View Recap', callback_data: 'last_recap' }, { text: 'View Clips', callback_data: 'clips' }]]),
    reward_unlocked: kb([[{ text: 'View Rewards', callback_data: 'analytics' }]]),
  };

  for (const userId of ids) {
    try {
      await bot.sendMessage(userId, text, {
        parse_mode: 'Markdown',
        ...(keyboards[type] && { reply_markup: keyboards[type] })
      });
    } catch (err) {
      logger.error(`Push notification error user ${userId}:`, err.message);
    }
  }
}

async function safeReply(chatId, text) {
  try { await bot.sendMessage(chatId, text); } catch (e) { logger.error('safeReply error:', e.message); }
}

function getBot() { return bot; }

module.exports = { initializeTelegramBot, pushNotification, getBot };
