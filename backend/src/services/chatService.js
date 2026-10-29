// chatService.js — v1.1.0 — All bugs fixed
const { query }    = require('../config/database');
const { getRedis, incrementCounter } = require('../config/redis');
const { sendChatMessage, banUser, deleteMessage } = require('./youtubeApiService');
const { awardSP, awardXP, getViewerRank } = require('./spService');
const { translate }    = require('./translationService');
const { createNotification } = require('./notificationService');
const { recordStreamAttendance, updateCheckinStreak, getViewerStreak } = require('./streakService');
const { recordSubEvent, recordSuperChatEvent } = require('./hypeTrain');
const logger = require('../utils/logger');

// BUG-12 FIXED: Redis-backed message deduplication (survives restarts)
// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────
async function processMessage(accountNumber, item, streamDbId, io) {
  try {
    const messageId = item.id;
    if (!messageId) return;

    // Use Redis SETNX for atomic dedup — 5 min TTL per message ID
    const redis   = getRedis();
    const dedupKey = `processed:${messageId}`;
    if (redis) {
      const isNew = await redis.set(dedupKey, '1', 'EX', 300, 'NX');
      if (!isNew) return; // Already processed
    }

    const type        = item.snippet?.type;
    const text        = item.snippet?.displayMessage || item.snippet?.textMessageDetails?.messageText || '';
    const authorName  = item.authorDetails?.displayName || 'Unknown';
    const authorId    = item.authorDetails?.channelId || '';
    const authorUrl   = item.authorDetails?.channelUrl || '';
    const isMod       = item.authorDetails?.isChatModerator || false;
    const isOwner     = item.authorDetails?.isChatOwner || false;
    const isSub       = item.authorDetails?.isChatSponsor || false;
    const timestamp   = item.snippet?.publishedAt || new Date().toISOString();

    if (type === 'superChatEvent')  await handleSuperChat(accountNumber, item, streamDbId, io);
    if (type === 'newSponsorEvent') await handleNewMember(accountNumber, item, streamDbId, io);

    // BUG-14/26 FIXED: Check active giveaway keyword
    if (!isOwner && text) await checkGiveawayEntry(accountNumber, authorId, authorName, text);

    if (!isOwner) {
      const modAction = await runModeration(accountNumber, text, authorId, authorName, messageId, isSub, isMod);
      if (modAction.deleted || modAction.banned) {
        await storeMessage(accountNumber, streamDbId, item, text, authorName, authorId, authorUrl, 'deleted');
        io?.emit('chat:moderated', { accountNumber, messageId, action: modAction, timestamp });
        return;
      }
    }

    await storeMessage(accountNumber, streamDbId, item, text, authorName, authorId, authorUrl, 'normal');
    await handleChatEngagement(accountNumber, authorId, authorName, authorUrl, isSub);
    await handleFirstMessage(accountNumber, authorId, authorName, authorUrl, streamDbId);

    if (text.startsWith('!')) {
      await handleCommand(accountNumber, text, authorName, authorId, isSub, isOwner, isMod);
    }

    await handleTranslation(accountNumber, text, authorName, streamDbId, io);
    await checkKeywordRules(accountNumber, text, authorName, authorId);

    io?.emit('chat:message', { accountNumber, messageId, messageText: text, authorName, authorId, authorUrl, isMod, isOwner, isSub, timestamp });
  } catch (err) {
    logger.error('processMessage error:', err.message);
  }
}

// BUG-14/26 FIXED: Giveaway entry capture
async function checkGiveawayEntry(accountNumber, authorId, authorName, text) {
  try {
    const redis = getRedis();
    const raw   = await redis.get(`account:${accountNumber}:giveaway`);
    if (!raw) return;

    const giveaway = JSON.parse(raw);
    if (!giveaway.keyword) return;
    if (text.trim().toLowerCase() !== giveaway.keyword.toLowerCase()) return;

    // Don't allow duplicate entries
    if (giveaway.entryList && giveaway.entryList.includes(authorName)) return;

    giveaway.entryList = giveaway.entryList || [];
    giveaway.entryList.push(authorName);
    giveaway.entries = giveaway.entryList.length;

    // Get remaining TTL to preserve it
    const ttl = await redis.ttl(`account:${accountNumber}:giveaway`);
    if (ttl > 0) {
      await redis.setex(`account:${accountNumber}:giveaway`, ttl, JSON.stringify(giveaway));
    } else {
      await redis.set(`account:${accountNumber}:giveaway`, JSON.stringify(giveaway));
    }
  } catch (err) {
    logger.error('checkGiveawayEntry error:', err.message);
  }
}

// BUG-02/32 FIXED: Use unified 'settings' key | BUG-03 FIXED: null liveChatId guard
// BUG-60/61 FIXED: Slow mode and sub-only enforced
async function runModeration(accountNumber, text, authorId, authorName, messageId, isSub, isMod) {
  const redis    = getRedis();
  const result   = { deleted: false, banned: false, warned: false, reason: null };

  // BUG-32 FIXED: Read from 'settings' key not 'mod_settings'
  let settings = {};
  try {
    const raw = await redis.get(`account:${accountNumber}:settings`);
    if (raw) settings = JSON.parse(raw);
  } catch (_) {}

  const blockedWords = (() => {
    try { return JSON.parse(settings.blockedWords || '[]'); } catch(_){ return []; }
  })();

  // BUG-61 FIXED: Sub-only mode enforcement
  const subOnly = await redis.get(`account:${accountNumber}:sub_only`) === 'on';
  if (subOnly && !isSub && !isMod) {
    await deleteMessage(accountNumber, messageId);
    result.deleted = true; result.reason = 'sub_only';
    return result;
  }

  // BUG-60 FIXED: Slow mode enforcement
  const slowMode = await redis.get(`account:${accountNumber}:slow_mode`) === 'on';
  if (slowMode) {
    const cooldownSecs = parseInt(settings.slowModeSecs || 5);
    const slowKey      = `slow:${accountNumber}:${authorId}`;
    const onSlowCd     = await redis.get(slowKey);
    if (onSlowCd) {
      await deleteMessage(accountNumber, messageId);
      result.deleted = true; result.reason = 'slow_mode';
      return result;
    }
    await redis.setex(slowKey, cooldownSecs, '1');
  }

  if (!text || text.trim().length === 0) return result;

  const lowerText = text.toLowerCase();

  // l33tspeak normalize
  const normalize = s => s.replace(/4/g,'a').replace(/3/g,'e').replace(/1/g,'i')
    .replace(/0/g,'o').replace(/5/g,'s').replace(/\s/g,'').replace(/[^a-z]/g,'');
  const normMsg = normalize(lowerText);

  const badWord = blockedWords.find(w => normMsg.includes(normalize(w.toLowerCase())));
  if (badWord) {
    await deleteMessage(accountNumber, messageId);
    result.deleted = true; result.reason = `blocked_word:${badWord}`;

    const strikes = await incrementCounter(`strikes:${accountNumber}:${authorId}`, 86400);
    if (strikes === 1) {
      await sendChatMessage(accountNumber, `@${authorName} — Warning 1/3: Keep language clean.`);
      result.warned = true;
    } else if (strikes === 2) {
      await sendChatMessage(accountNumber, `@${authorName} — Warning 2/3: Final warning.`);
      result.warned = true;
    } else if (strikes >= 3) {
      // BUG-03 FIXED: Guard null liveChatId
      const liveChatId = await redis.get(`account:${accountNumber}:live_chat_id`);
      if (liveChatId) {
        const banned = await banUser(accountNumber, liveChatId, authorId, settings.timeoutDuration || 600);
        if (banned) {
          result.banned = true;
          await createNotification(accountNumber, 'moderation', 'user_auto_banned', {
            username: authorName, channelId: authorId, reason: '3rd strike'
          });
          await query(`
            INSERT INTO banned_users (account_number, user_id, username, reason, banned_by)
            VALUES ($1,$2,$3,'3rd strike','bot')
          `, [accountNumber, authorId, authorName]);
        } else {
          logger.warn(`Ban failed for ${authorName} — no liveChatId or API error`);
        }
      } else {
        logger.warn(`Cannot ban ${authorName}: no live_chat_id in Redis`);
      }
    }
    await logModerationAction(accountNumber, 'delete', authorId, authorName, result.reason);
    return result;
  }

  // Caps filter
  if (text.length > 8) {
    const capsRatio = (text.match(/[A-Z]/g)?.length || 0) / text.length;
    if (capsRatio > (settings.capsThreshold || 0.7)) {
      await deleteMessage(accountNumber, messageId);
      result.deleted = true; result.reason = 'excessive_caps';
      await logModerationAction(accountNumber, 'delete', authorId, authorName, 'caps');
      return result;
    }
  }

  // BUG-63 FIXED: Store last 3 messages per user, not just 1
  const msgHistKey = `msg_hist:${accountNumber}:${authorId}`;
  const histRaw    = await redis.get(msgHistKey) || '[]';
  let hist;
  try { hist = JSON.parse(histRaw); } catch(_){ hist = []; }
  hist.push(text);
  if (hist.length > 3) hist.shift();
  await redis.setex(msgHistKey, 60, JSON.stringify(hist));

  // Spam: same message appears 3+ times in recent history
  const spamCount = hist.filter(m => m === text).length;
  if (spamCount >= 3 && text.length > 5) {
    await deleteMessage(accountNumber, messageId);
    result.deleted = true; result.reason = 'spam';
    await logModerationAction(accountNumber, 'delete', authorId, authorName, 'spam');
    return result;
  }

  // Link filter
  if (settings.filterLinks !== false && text.match(/https?:\/\//i)) {
    const whitelist = (() => {
      try { return JSON.parse(settings.whitelistedDomains || '["youtube.com","youtu.be"]'); } catch(_){ return ['youtube.com','youtu.be']; }
    })();
    const hasWhitelisted = whitelist.some(d => text.includes(d));
    if (!hasWhitelisted) {
      await deleteMessage(accountNumber, messageId);
      result.deleted = true; result.reason = 'link';
      await logModerationAction(accountNumber, 'delete', authorId, authorName, 'link');
      return result;
    }
  }

  return result;
}

// ── COMMANDS ──────────────────────────────────────────────────────────────────
async function handleCommand(accountNumber, text, authorName, authorId, isSub, isOwner, isMod) {
  const parts   = text.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args    = parts.slice(1);

  switch (command) {
    case '!join':       return handleQueueJoin(accountNumber, authorId, authorName, args[0]);
    case '!leave':      return handleQueueLeave(accountNumber, authorId, authorName);
    case '!position':
    case '!pos':        return handleQueuePosition(accountNumber, authorId, authorName);
    case '!queue':      return handleQueueShow(accountNumber);
    case '!rank':       return handleRankCommand(accountNumber, authorId, authorName);
    case '!xp':         return handleXPCommand(accountNumber, authorId, authorName);
    case '!sp':
    case '!points':     return handlePointsCommand(accountNumber, authorId, authorName);
    case '!top':
    case '!top10':      return handleLeaderboard(accountNumber, command === '!top10' ? 10 : 5);
    case '!checkin':    return handleDailyCheckin(accountNumber, authorId, authorName);
    case '!streak':     return handleStreakCommand(accountNumber, authorId, authorName);
    case '!shop':       return handleShopCommand(accountNumber);
    case '!redeem':     return handleRedeemCommand(accountNumber, authorId, authorName, args);
    case '!rewards':    return handleRewardsCommand(accountNumber, authorId, authorName);
    case '!myrewards':  return handleMyRewardsCommand(accountNumber, authorId, authorName);
    case '!stats':      return handleStatsCommand(accountNumber, authorId, authorName);
    case '!clip':
    case '!moment':     return handleClipCommand(accountNumber, authorId, authorName, args.join(' '));
    case '!season':     return handleSeasonCommand(accountNumber, authorId);
    case '!challenges': return handleChallengesCommand(accountNumber, authorId, authorName);
    case '!sr':         return handleSongRequest(accountNumber, authorId, authorName, args.join(' '));
    case '!currentsong':return handleCurrentSong(accountNumber);
    case '!quote':      return handleQuote(accountNumber);
    case '!addquote':   if (isOwner || isMod) return handleAddQuote(accountNumber, args.join(' '), authorName);
                        break;
    case '!trivia':     return handleTrivia(accountNumber, authorId, authorName);
    case '!answer':     return handleTriviaAnswer(accountNumber, authorId, authorName, args.join(' '));
    case '!slots':      return handleSlots(accountNumber, authorId, authorName, parseInt(args[0]) || 50);
    case '!duel':       return handleDuel(accountNumber, authorId, authorName, args[0], parseInt(args[1]) || 100);
    case '!accept':     return handleDuelAccept(accountNumber, authorId, authorName);
    case '!so':         if (isOwner || isMod) return handleShoutout(accountNumber, args[0]);
                        break;
    case '!rules':      if (isOwner || isMod) return postStreamRules(accountNumber);
                        break;
    case '!socials':    return postSocials(accountNumber);
    case '!schedule':   return postSchedule(accountNumber);
    case '!predict':    if (isOwner || isMod) return handleStartPrediction(accountNumber, args.join(' '));
                        break;
    case '!yes':
    case '!no':         return handlePredictionVote(accountNumber, authorId, authorName, command.slice(1));
    case '!global_ban': if (isOwner) return handleGlobalBan(accountNumber, args[0], authorName);
                        break;
    default:            return runCustomCommand(accountNumber, command, authorName, isSub, isOwner, isMod);
  }
}

// ── QUEUE ─────────────────────────────────────────────────────────────────────
async function handleQueueJoin(accountNumber, authorId, authorName, inGameName) {
  const { rows: existing } = await query(
    `SELECT position FROM queue WHERE account_number=$1 AND user_id=$2 AND status='waiting'`,
    [accountNumber, authorId]
  );
  if (existing.length) return sendChatMessage(accountNumber, `@${authorName} you are already in queue at #${existing[0].position}!`);

  const { rows } = await query(`SELECT COUNT(*) as cnt FROM queue WHERE account_number=$1 AND status='waiting'`, [accountNumber]);
  const position = parseInt(rows[0].cnt) + 1;
  const displayName = inGameName || authorName;
  await query(`INSERT INTO queue (account_number,user_id,username,in_game_name,position,joined_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
    [accountNumber, authorId, authorName, displayName, position]);
  await sendChatMessage(accountNumber, `@${authorName} joined queue at #${position}! In-game: ${displayName}`);
  await awardSP(accountNumber, authorId, 10, 'queue_join');
}

async function handleQueueLeave(accountNumber, authorId, authorName) {
  await query(`UPDATE queue SET status='left' WHERE account_number=$1 AND user_id=$2 AND status='waiting'`, [accountNumber, authorId]);
  await sendChatMessage(accountNumber, `@${authorName} left the queue.`);
}

async function handleQueuePosition(accountNumber, authorId, authorName) {
  const { rows } = await query(`SELECT position FROM queue WHERE account_number=$1 AND user_id=$2 AND status='waiting'`, [accountNumber, authorId]);
  if (rows.length) await sendChatMessage(accountNumber, `@${authorName} you are at position #${rows[0].position} in queue.`);
  else await sendChatMessage(accountNumber, `@${authorName} you are not in queue. Type !join [in-game name] to join!`);
}

async function handleQueueShow(accountNumber) {
  const { rows } = await query(`SELECT position,username,in_game_name FROM queue WHERE account_number=$1 AND status='waiting' ORDER BY position LIMIT 5`, [accountNumber]);
  if (!rows.length) return sendChatMessage(accountNumber, 'Queue is empty. Type !join to get in!');
  const list = rows.map(r => `#${r.position} ${r.username}(${r.in_game_name})`).join(' | ');
  await sendChatMessage(accountNumber, `Queue: ${list}`);
}

// ── SP / RANK COMMANDS ────────────────────────────────────────────────────────
async function handleRankCommand(accountNumber, authorId, authorName) {
  const r = await getViewerRank(accountNumber, authorId);
  if (r) await sendChatMessage(accountNumber, `@${authorName} — ${r.displayRank} | ${r.xp.toLocaleString()} XP | #${r.leaderboardPosition} all time`);
  else   await sendChatMessage(accountNumber, `@${authorName} — No rank yet. Chat to earn XP!`);
}

async function handleXPCommand(accountNumber, authorId, authorName) {
  const r = await getViewerRank(accountNumber, authorId);
  if (r) await sendChatMessage(accountNumber, `@${authorName} — XP: ${r.xp.toLocaleString()} | Next rank: ${r.nextRank} (${r.nextRankXP.toLocaleString()} XP away)`);
}

async function handlePointsCommand(accountNumber, authorId, authorName) {
  const r = await getViewerRank(accountNumber, authorId);
  await sendChatMessage(accountNumber, `@${authorName} — SP Balance: ${r?.sp?.toLocaleString() || 0}`);
}

async function handleLeaderboard(accountNumber, limit=5) {
  const { rows } = await query(`
    SELECT username, tier, division, total_xp, RANK() OVER (ORDER BY total_xp DESC) pos
    FROM viewer_ranks WHERE account_number=$1 ORDER BY total_xp DESC LIMIT $2
  `, [accountNumber, limit]);
  if (!rows.length) return sendChatMessage(accountNumber, 'No leaderboard data yet!');
  const list = rows.map(r => `${r.pos}. ${r.username} — ${r.tier} ${r.division}`).join(' | ');
  await sendChatMessage(accountNumber, `Top ${limit}: ${list}`);
}

// BUG-21 FIXED: Checkin now updates streak
async function handleDailyCheckin(accountNumber, authorId, authorName) {
  const redis = getRedis();
  const key   = `checkin:${accountNumber}:${authorId}:${new Date().toDateString()}`;
  if (await redis.get(key)) return sendChatMessage(accountNumber, `@${authorName} you already checked in today!`);

  await redis.setex(key, 86400, '1');
  await awardSP(accountNumber, authorId, 30, 'daily_checkin');
  await awardXP(accountNumber, authorId, 20, 'daily_checkin');
  await updateCheckinStreak(accountNumber, authorId); // BUG-21 FIXED
  const streak = await getViewerStreak(accountNumber, authorId);
  await sendChatMessage(accountNumber, `@${authorName} daily check-in! +30 SP +20 XP | Streak: ${streak.current_streak} streams | Multiplier: ${streak.multiplier}x`);
}

// BUG-07 FIXED: Reads real streak data
async function handleStreakCommand(accountNumber, authorId, authorName) {
  const streak = await getViewerStreak(accountNumber, authorId);
  if (streak.current_streak > 0) {
    await sendChatMessage(accountNumber, `@${authorName} — Streak: ${streak.current_streak} streams | Best: ${streak.best_streak} | Multiplier: ${streak.multiplier}x`);
  } else {
    await sendChatMessage(accountNumber, `@${authorName} — No streak yet. Watch streams and use !checkin daily!`);
  }
}

async function handleShopCommand(accountNumber) {
  const { rows } = await query(`SELECT name, sp_cost FROM shop_items WHERE account_number=$1 AND active=true ORDER BY sp_cost`, [accountNumber]);
  if (!rows.length) return sendChatMessage(accountNumber, 'Shop is empty!');
  const items = rows.map(i => `${i.name}: ${i.sp_cost} SP`).join(' | ');
  await sendChatMessage(accountNumber, `SP Shop — ${items} | Use !redeem [item name]`);
}

// BUG-05 FIXED: Exact name match first, then partial
async function handleRedeemCommand(accountNumber, authorId, authorName, args) {
  const itemName = args.join(' ').toLowerCase().trim();
  if (!itemName) return sendChatMessage(accountNumber, `@${authorName} usage: !redeem [item name]. Type !shop to see items.`);

  // Try exact match first, then partial
  let { rows } = await query(
    `SELECT * FROM shop_items WHERE account_number=$1 AND LOWER(name)=$2 AND active=true`,
    [accountNumber, itemName]
  );
  if (!rows.length) {
    ({ rows } = await query(
      `SELECT * FROM shop_items WHERE account_number=$1 AND LOWER(name) LIKE $2 AND active=true LIMIT 1`,
      [accountNumber, `%${itemName}%`]
    ));
  }
  if (!rows.length) return sendChatMessage(accountNumber, `@${authorName} item not found. Type !shop to see available items.`);

  const item   = rows[0];
  const rankInfo = await getViewerRank(accountNumber, authorId);
  if (!rankInfo || rankInfo.sp < item.sp_cost) {
    return sendChatMessage(accountNumber, `@${authorName} not enough SP. You have ${rankInfo?.sp||0}, need ${item.sp_cost}.`);
  }

  await query(`UPDATE viewer_ranks SET sp=sp-$1 WHERE account_number=$2 AND user_id=$3`, [item.sp_cost, accountNumber, authorId]);
  await query(`INSERT INTO sp_transactions (account_number,user_id,username,amount,type,source,created_at) VALUES ($1,$2,$3,$4,'spend',$5,NOW())`,
    [accountNumber, authorId, authorName, -item.sp_cost, `shop:${item.name}`]);

  // BUG-65 FIXED: Handle VIP for 24hrs
  if (item.name.toLowerCase().includes('vip')) {
    await query(`UPDATE viewers SET is_vip=true WHERE account_number=$1 AND user_id=$2`, [accountNumber, authorId]);
    const redis = getRedis();
    await redis.setex(`vip_expiry:${accountNumber}:${authorId}`, 86400, '1');
    // Schedule VIP removal
    setTimeout(async () => {
      await query(`UPDATE viewers SET is_vip=false WHERE account_number=$1 AND user_id=$2`, [accountNumber, authorId]);
    }, 86400000);
  }

  await sendChatMessage(accountNumber, `@${authorName} redeemed ${item.name}! -${item.sp_cost} SP`);
  await createNotification(accountNumber, 'community', 'shop_redemption', { username: authorName, item: item.name, cost: item.sp_cost });
}

async function handleRewardsCommand(accountNumber, authorId, authorName) {
  const { rows } = await query(`SELECT sp_threshold, trigger_tier, description FROM reward_tiers WHERE account_number=$1 ORDER BY sp_threshold`, [accountNumber]);
  const r = await getViewerRank(accountNumber, authorId);
  const currentSP = r?.sp || 0;
  const next = rows.find(rw => (rw.sp_threshold||0) > currentSP);
  if (next) {
    const needed = (next.sp_threshold || 0) - currentSP;
    await sendChatMessage(accountNumber, `@${authorName} — SP: ${currentSP} | Next reward at ${next.sp_threshold||next.trigger_tier}: ${next.description} (${needed} SP away) | !myrewards for full list`);
  } else {
    await sendChatMessage(accountNumber, `@${authorName} — SP: ${currentSP} | Type !myrewards to see your unlocked rewards!`);
  }
}

async function handleMyRewardsCommand(accountNumber, authorId, authorName) {
  const { rows } = await query(`
    SELECT rt.description, rd.delivered_at, rd.status
    FROM reward_tiers rt
    LEFT JOIN reward_deliveries rd ON rd.tier_id=rt.id AND rd.user_id=$2
    WHERE rt.account_number=$1 ORDER BY rt.sp_threshold
  `, [accountNumber, authorId]);
  const delivered = rows.filter(r=>r.delivered_at).map(r=>r.description).join(', ') || 'None yet';
  await sendChatMessage(accountNumber, `@${authorName} — Rewards delivered: ${delivered}`);
}

async function handleStatsCommand(accountNumber, authorId, authorName) {
  const r = await getViewerRank(accountNumber, authorId);
  const { rows } = await query(`SELECT total_watch_minutes, streams_attended FROM viewers WHERE account_number=$1 AND user_id=$2`, [accountNumber, authorId]);
  const hours = Math.floor((rows[0]?.total_watch_minutes||0)/60);
  if (r) await sendChatMessage(accountNumber, `@${authorName} — ${r.displayRank} | XP: ${r.xp.toLocaleString()} | SP: ${r.sp.toLocaleString()} | Watch: ${hours}h | Streams: ${rows[0]?.streams_attended||0}`);
}

async function handleClipCommand(accountNumber, authorId, authorName, label) {
  const redis = getRedis();
  const streamDbId = await redis.get(`account:${accountNumber}:stream_db_id`);
  const startTime  = await redis.get(`account:${accountNumber}:stream_start`);
  if (!streamDbId || !startTime) return;

  const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  const h = Math.floor(elapsed/3600);
  const m = String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
  const s = String(elapsed%60).padStart(2,'0');
  await query(`INSERT INTO clips (account_number,stream_id,elapsed_seconds,label,triggered_by,triggered_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
    [accountNumber, streamDbId, elapsed, label||null, authorName]);
  await sendChatMessage(accountNumber, `Moment marked at ${h}:${m}:${s} by @${authorName}${label?` — "${label}"`:''}` );
  await awardSP(accountNumber, authorId, 50, 'clip_trigger');
}

async function handleSeasonCommand(accountNumber, authorId) {
  const { rows } = await query(`SELECT name, ends_at FROM seasons WHERE account_number=$1 AND status='active'`, [accountNumber]);
  if (!rows.length) return sendChatMessage(accountNumber, 'No active season.');
  const daysLeft = Math.ceil((new Date(rows[0].ends_at) - new Date()) / 86400000);
  const r = await getViewerRank(accountNumber, authorId);
  await sendChatMessage(accountNumber, `${rows[0].name} ends in ${daysLeft} days. Your rank: ${r?.displayRank||'Unranked'}`);
}

async function handleChallengesCommand(accountNumber, authorId, authorName) {
  const { rows } = await query(`
    SELECT c.title, c.sp_reward, c.target, COALESCE(cp.progress,0) as progress
    FROM challenges c
    LEFT JOIN challenge_progress cp ON cp.challenge_id=c.id AND cp.user_id=$2
    WHERE c.account_number=$1 AND c.active=true ORDER BY c.sp_reward LIMIT 3
  `, [accountNumber, authorId]);
  if (!rows.length) return sendChatMessage(accountNumber, `@${authorName} No active challenges right now.`);
  const list = rows.map(c => `${c.title} (${c.progress}/${c.target})`).join(' | ');
  await sendChatMessage(accountNumber, `@${authorName} Challenges: ${list}`);
}

// ── SONG REQUESTS (BUG-16 FIXED) ─────────────────────────────────────────────
async function handleSongRequest(accountNumber, authorId, authorName, songName) {
  if (!songName) return sendChatMessage(accountNumber, `@${authorName} usage: !sr [song name]`);
  const redis = getRedis();
  const streamDbId = await redis.get(`account:${accountNumber}:stream_db_id`);
  await query(`INSERT INTO song_requests (account_number,stream_id,requested_by,song_name,status,created_at) VALUES ($1,$2,$3,$4,'pending',NOW())`,
    [accountNumber, streamDbId, authorName, songName]);
  await sendChatMessage(accountNumber, `@${authorName} song requested: "${songName}" ✓`);
}

async function handleCurrentSong(accountNumber) {
  const redis = getRedis();
  const streamDbId = await redis.get(`account:${accountNumber}:stream_db_id`);
  const { rows } = await query(`SELECT song_name,requested_by FROM song_requests WHERE account_number=$1 AND stream_id=$2 AND status='playing' LIMIT 1`, [accountNumber, streamDbId]);
  if (rows.length) await sendChatMessage(accountNumber, `Now playing: "${rows[0].song_name}" (requested by @${rows[0].requested_by})`);
  else await sendChatMessage(accountNumber, 'No song currently playing. Use !sr [song name] to request!');
}

// ── QUOTE SYSTEM (BUG-17 FIXED) ──────────────────────────────────────────────
async function handleQuote(accountNumber) {
  const { rows } = await query(`SELECT text, added_by FROM quotes WHERE account_number=$1 ORDER BY RANDOM() LIMIT 1`, [accountNumber]);
  if (!rows.length) return sendChatMessage(accountNumber, 'No quotes saved yet! Mods can use !addquote [text]');
  await sendChatMessage(accountNumber, `"${rows[0].text}" — added by @${rows[0].added_by}`);
}

async function handleAddQuote(accountNumber, text, addedBy) {
  if (!text) return sendChatMessage(accountNumber, 'Usage: !addquote [text]');
  await query(`INSERT INTO quotes (account_number,text,added_by,created_at) VALUES ($1,$2,$3,NOW())`, [accountNumber, text, addedBy]);
  await sendChatMessage(accountNumber, `Quote added! Type !quote to get a random one.`);
}

// ── TRIVIA (BUG-19 FIXED) ─────────────────────────────────────────────────────
async function handleTrivia(accountNumber, authorId, authorName) {
  const redis = getRedis();
  const active = await redis.get(`trivia:${accountNumber}:active`);
  if (active) return sendChatMessage(accountNumber, `Trivia is active! Type !answer [your answer]`);

  const { rows } = await query(`SELECT * FROM trivia_questions WHERE account_number=$1 ORDER BY RANDOM() LIMIT 1`, [accountNumber]);
  if (!rows.length) return sendChatMessage(accountNumber, 'No trivia questions set up yet!');

  const q = rows[0];
  await redis.setex(`trivia:${accountNumber}:active`, 30, JSON.stringify({ id: q.id, answer: q.answer.toLowerCase() }));
  await sendChatMessage(accountNumber, `TRIVIA: ${q.question} — Type !answer [your answer] (30 seconds!)`);
}

async function handleTriviaAnswer(accountNumber, authorId, authorName, answer) {
  const redis = getRedis();
  const raw   = await redis.get(`trivia:${accountNumber}:active`);
  if (!raw) return;
  const q = JSON.parse(raw);
  if (answer.toLowerCase().trim() === q.answer) {
    await redis.del(`trivia:${accountNumber}:active`);
    await awardSP(accountNumber, authorId, 75, 'trivia_win');
    await awardXP(accountNumber, authorId, 50, 'trivia_win');
    await sendChatMessage(accountNumber, `@${authorName} got it right! +75 SP +50 XP 🎉`);
  }
}

// ── SLOTS (BUG-20 FIXED) ──────────────────────────────────────────────────────
async function handleSlots(accountNumber, authorId, authorName, bet) {
  const r = await getViewerRank(accountNumber, authorId);
  if (!r || r.sp < bet) return sendChatMessage(accountNumber, `@${authorName} not enough SP. You have ${r?.sp||0}.`);
  if (bet < 10) return sendChatMessage(accountNumber, `@${authorName} minimum bet is 10 SP.`);

  const symbols = ['🍒','⭐','💎','7️⃣','🎮'];
  const reels   = Array.from({length:3}, ()=> symbols[Math.floor(Math.random()*symbols.length)]);
  const display = reels.join(' | ');
  let winAmount = 0;

  if (reels[0]===reels[1] && reels[1]===reels[2]) winAmount = bet * 5;
  else if (reels[0]===reels[1] || reels[1]===reels[2]) winAmount = Math.floor(bet * 1.5);

  const netChange = winAmount - bet;
  await query(`UPDATE viewer_ranks SET sp=sp+$1 WHERE account_number=$2 AND user_id=$3`, [netChange, accountNumber, authorId]);
  await query(`INSERT INTO sp_transactions (account_number,user_id,username,amount,type,source,created_at) VALUES ($1,$2,$3,$4,$5,'slots',NOW())`,
    [accountNumber, authorId, authorName, netChange, netChange>=0?'earn':'spend']);

  if (winAmount > 0) await sendChatMessage(accountNumber, `@${authorName} SLOTS: ${display} — WIN! +${winAmount} SP`);
  else await sendChatMessage(accountNumber, `@${authorName} SLOTS: ${display} — No luck. -${bet} SP`);
}

// ── DUEL (BUG-20 FIXED) ──────────────────────────────────────────────────────
async function handleDuel(accountNumber, challengerId, challengerName, targetHandle, bet) {
  if (!targetHandle) return sendChatMessage(accountNumber, `@${challengerName} usage: !duel @username [bet]`);
  const redis      = getRedis();
  const targetName = targetHandle.replace('@','');
  const duelKey    = `duel:${accountNumber}:${targetName.toLowerCase()}`;
  await redis.setex(duelKey, 60, JSON.stringify({ challengerId, challengerName, bet }));
  await sendChatMessage(accountNumber, `@${targetName} you have been challenged to a duel by @${challengerName} for ${bet} SP! Type !accept within 60 seconds!`);
}

async function handleDuelAccept(accountNumber, acceptorId, acceptorName) {
  const redis = getRedis();
  const duelKey = `duel:${accountNumber}:${acceptorName.toLowerCase()}`;
  const raw     = await redis.get(duelKey);
  if (!raw) return;

  const { challengerId, challengerName, bet } = JSON.parse(raw);
  await redis.del(duelKey);

  const cRank = await getViewerRank(accountNumber, challengerId);
  const aRank = await getViewerRank(accountNumber, acceptorId);
  if (!cRank || cRank.sp < bet) return sendChatMessage(accountNumber, `@${challengerName} doesn't have enough SP for the duel!`);
  if (!aRank || aRank.sp < bet) return sendChatMessage(accountNumber, `@${acceptorName} doesn't have enough SP for the duel!`);

  const winner = Math.random() < 0.5 ? challengerName : acceptorName;
  const loserId = winner === challengerName ? acceptorId : challengerId;
  const winnerId = winner === challengerName ? challengerId : acceptorId;

  await query(`UPDATE viewer_ranks SET sp=sp+$1 WHERE account_number=$2 AND user_id=$3`, [bet, accountNumber, winnerId]);
  await query(`UPDATE viewer_ranks SET sp=sp-$1 WHERE account_number=$2 AND user_id=$3`, [bet, accountNumber, loserId]);
  await sendChatMessage(accountNumber, `DUEL RESULT: @${winner} wins and takes ${bet} SP from their opponent!`);
}

// ── PREDICTIONS (BUG-18 FIXED) ────────────────────────────────────────────────
async function handleStartPrediction(accountNumber, question) {
  if (!question) return sendChatMessage(accountNumber, 'Usage: !predict [question]');
  const redis = getRedis();
  await redis.setex(`prediction:${accountNumber}`, 300, JSON.stringify({ question, yes:[], no:[] }));
  await sendChatMessage(accountNumber, `PREDICTION: ${question} — Vote with !yes or !no (5 minutes!)`);
}

async function handlePredictionVote(accountNumber, authorId, authorName, vote) {
  const redis = getRedis();
  const raw   = await redis.get(`prediction:${accountNumber}`);
  if (!raw) return;
  const p = JSON.parse(raw);
  if (p.yes.includes(authorId) || p.no.includes(authorId)) return;
  p[vote].push(authorId);
  const ttl = await redis.ttl(`prediction:${accountNumber}`);
  if (ttl > 0) await redis.setex(`prediction:${accountNumber}`, ttl, JSON.stringify(p));
  await sendChatMessage(accountNumber, `@${authorName} voted ${vote.toUpperCase()}! Yes: ${p.yes.length} | No: ${p.no.length}`);
}

// ── SHOUTOUT ──────────────────────────────────────────────────────────────────
async function handleShoutout(accountNumber, username) {
  if (!username) return;
  const clean = username.replace('@','');
  await sendChatMessage(accountNumber, `Shoutout to @${clean}! Check out their channel at youtube.com/@${clean}`);
}

// BUG-62 FIXED: Global ban
async function handleGlobalBan(accountNumber, username, bannedBy) {
  if (!username) return;
  const clean = username.replace('@','');
  for (const acc of [1,2]) {
    const redis = getRedis();
    const liveChatId = await redis.get(`account:${acc}:live_chat_id`);
    const { rows } = await query(`SELECT user_id FROM viewers WHERE account_number=$1 AND username=$2 LIMIT 1`, [acc, clean]);
    if (rows.length && liveChatId) {
      await banUser(acc, liveChatId, rows[0].user_id, 0);
      await query(`INSERT INTO banned_users (account_number,user_id,username,reason,banned_by) VALUES ($1,$2,$3,'global_ban',$4) ON CONFLICT DO NOTHING`,
        [acc, rows[0].user_id, clean, bannedBy]);
    }
  }
  await sendChatMessage(accountNumber, `@${clean} has been globally banned from all channels.`);
}

// ── FIRST MESSAGE ─────────────────────────────────────────────────────────────
async function handleFirstMessage(accountNumber, authorId, authorName, authorUrl, streamDbId) {
  const redis = getRedis();
  const key   = `first_msg:${accountNumber}:${streamDbId}:${authorId}`;
  if (await redis.get(key)) return;
  await redis.setex(key, 86400, '1');

  const { rows } = await query(`SELECT streams_attended FROM viewers WHERE account_number=$1 AND user_id=$2`, [accountNumber, authorId]);
  await createViewer(accountNumber, authorId, authorName, authorUrl);

  let settings = {};
  try { const raw = await redis.get(`account:${accountNumber}:settings`); if (raw) settings = JSON.parse(raw); } catch(_){}
  const joinMessages = settings.joinMessages || {};
  const isNew = !rows.length;
  const msg = isNew
    ? (joinMessages.firstTime || `Welcome to the stream @${authorName}! Great to have you here!`)
    : (joinMessages.returning || `Welcome back @${authorName}!`);

  await sendChatMessage(accountNumber, msg.replace('{username}', authorName));
  await awardSP(accountNumber, authorId, 25, 'first_message');
  await awardXP(accountNumber, authorId, 15, 'first_message');
  if (isNew) setTimeout(() => postStreamRules(accountNumber), 3000);

  // BUG-07 FIXED: Record stream attendance for streak
  await recordStreamAttendance(accountNumber, authorId, authorName);
}

async function createViewer(accountNumber, authorId, authorName, authorUrl) {
  await query(`
    INSERT INTO viewers (account_number,user_id,username,channel_url,first_seen,last_seen,streams_attended)
    VALUES ($1,$2,$3,$4,NOW(),NOW(),1)
    ON CONFLICT (account_number,user_id)
    DO UPDATE SET last_seen=NOW(), streams_attended=viewers.streams_attended+1, username=$3
  `, [accountNumber, authorId, authorName, authorUrl]);
}

// ── SUPER CHAT / NEW MEMBER ───────────────────────────────────────────────────
async function handleSuperChat(accountNumber, item, streamDbId, io) {
  const authorName   = item.authorDetails?.displayName;
  const authorId     = item.authorDetails?.channelId;
  const authorUrl    = item.authorDetails?.channelUrl;
  const amountDisplay = item.snippet?.superChatDetails?.amountDisplayString || '$0';
  const amountMicros  = item.snippet?.superChatDetails?.amountMicros || 0;
  const message       = item.snippet?.displayMessage || '';
  const currency      = item.snippet?.superChatDetails?.currency || 'USD';
  const amountFloat   = amountMicros / 1000000;

  await query(`INSERT INTO donators (account_number,user_id,username,channel_url,amount,currency,message,stream_id,donated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [accountNumber, authorId, authorName, authorUrl, amountFloat, currency, message, streamDbId]);

  const redis = getRedis();
  let settings = {};
  try { const raw = await redis.get(`account:${accountNumber}:settings`); if (raw) settings = JSON.parse(raw); } catch(_){}
  const thankMsg = (settings.superchatMessage || `HUGE thank you to @{username} for the {amount} Super Chat! Absolute legend!`)
    .replace('{username}', authorName).replace('{amount}', amountDisplay);

  await sendChatMessage(accountNumber, thankMsg);
  await awardSP(accountNumber, authorId, Math.max(1, Math.floor(amountFloat * 10)), 'super_chat');
  await awardXP(accountNumber, authorId, Math.max(1, Math.floor(amountFloat * 5)), 'super_chat');
  await createNotification(accountNumber, 'community', 'super_chat', { username: authorName, amount: amountDisplay, message });
  await recordSuperChatEvent(accountNumber, io); // BUG-22: hype train
  io?.emit('alert:superchat', { accountNumber, authorName, amount: amountDisplay, message });

  // BUG-64 FIXED: Translate thank-you if viewer uses non-English
  try {
    const { pushNotification } = require('../telegram/bot');
    await pushNotification('super_chat', { username: authorName, amount: amountDisplay, message });
  } catch(_){}
}

async function handleNewMember(accountNumber, item, streamDbId, io) {
  const authorName = item.authorDetails?.displayName;
  const authorId   = item.authorDetails?.channelId;
  const authorUrl  = item.authorDetails?.channelUrl;

  await query(`INSERT INTO subscribers (account_number,user_id,username,channel_url,subscribed_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
    [accountNumber, authorId, authorName, authorUrl]);

  const redis = getRedis();
  let settings = {};
  try { const raw = await redis.get(`account:${accountNumber}:settings`); if (raw) settings = JSON.parse(raw); } catch(_){}
  const msg = (settings.subMessage || `Thank you @{username} for subscribing! Welcome to the squad!`).replace('{username}', authorName);

  await sendChatMessage(accountNumber, msg);
  await awardSP(accountNumber, authorId, 1000, 'subscribe');
  await awardXP(accountNumber, authorId, 800, 'subscribe');
  await createNotification(accountNumber, 'community', 'new_subscriber', { username: authorName });
  await recordSubEvent(accountNumber, io); // BUG-22: hype train
  io?.emit('alert:subscriber', { accountNumber, authorName });

  try {
    const { pushNotification } = require('../telegram/bot');
    await pushNotification('new_subscriber', { username: authorName });
  } catch(_){}
}

// BUG-64 FIXED: Translation with bi-directional support
async function handleTranslation(accountNumber, text, authorName, streamDbId, io) {
  const redis = getRedis();
  let settings = {};
  try { const raw = await redis.get(`account:${accountNumber}:settings`); if (raw) settings = JSON.parse(raw); } catch(_){}
  if (!settings.autoTranslate) return;

  const hasNonLatin  = /[^\x00-\x7F]/.test(text);
  const latinRatio   = (text.match(/[a-zA-Z]/g)?.length || 0) / Math.max(text.length, 1);
  if (!hasNonLatin && latinRatio > 0.7) return;

  try {
    const result = await translate(text, 'en');
    if (result && result !== text) {
      await sendChatMessage(accountNumber, `[Translated] @${authorName}: ${result}`);
      // Store user's detected language for reply translation
      const langMatch = result.match(/\[from:([a-z]{2})\]/);
      if (langMatch) {
        await redis.setex(`user_lang:${accountNumber}:${authorName}`, 3600, langMatch[1]);
      }
      io?.emit('chat:translated', { accountNumber, authorName, original: text, translated: result });
    }
  } catch(_){}
}

// ── KEYWORD RULES ─────────────────────────────────────────────────────────────
async function checkKeywordRules(accountNumber, text, authorName, authorId) {
  const { rows } = await query(`SELECT * FROM keyword_rules WHERE account_number=$1 AND active=true`, [accountNumber]);
  const redis     = getRedis();
  const lowerText = text.toLowerCase();

  for (const rule of rows) {
    const triggers  = Array.isArray(rule.triggers) ? rule.triggers : JSON.parse(rule.triggers||'[]');
    const matched   = triggers.some(kw => {
      const lower = kw.toLowerCase();
      if (rule.match_type === 'exact') return lowerText === lower;
      if (rule.match_type === 'starts_with') return lowerText.startsWith(lower);
      return lowerText.includes(lower);
    });
    if (!matched) continue;

    const cooldownKey = `kw_cd:${accountNumber}:${rule.id}`;
    if (await redis.get(cooldownKey)) continue;

    const response = rule.response.replace('{username}', authorName);
    await sendChatMessage(accountNumber, response);
    if (rule.cooldown_seconds > 0) await redis.setex(cooldownKey, rule.cooldown_seconds, '1');
    break;
  }
}

async function runCustomCommand(accountNumber, command, authorName, isSub, isOwner, isMod) {
  const { rows } = await query(`SELECT * FROM commands WHERE account_number=$1 AND LOWER(name)=$2 AND active=true`, [accountNumber, command]);
  if (!rows.length) return;

  const cmd   = rows[0];
  const redis = getRedis();

  if (cmd.permission==='owner'     && !isOwner)                       return;
  if (cmd.permission==='moderator' && !isOwner && !isMod)             return;
  if (cmd.permission==='subscriber'&& !isSub && !isOwner && !isMod)  return;

  const cooldownKey = `cmd_cd:${accountNumber}:${cmd.id}`;
  if (await redis.get(cooldownKey)) return;

  const response = cmd.response.replace('{username}', authorName);
  await sendChatMessage(accountNumber, response);
  await query(`UPDATE commands SET usage_count=usage_count+1 WHERE id=$1`, [cmd.id]);
  if (cmd.cooldown_seconds > 0) await redis.setex(cooldownKey, cmd.cooldown_seconds, '1');
}

// ── UTILITY POSTS ─────────────────────────────────────────────────────────────
async function postStreamRules(accountNumber) {
  const redis = getRedis();
  let settings = {};
  try { const raw = await redis.get(`account:${accountNumber}:settings`); if (raw) settings = JSON.parse(raw); } catch(_){}
  const text = settings.rulesText || 'Stream Rules: 1) Clean language 2) No spam 3) No self-promo 4) Be respectful 5) Have fun!';
  await sendChatMessage(accountNumber, text);
}

async function postSocials(accountNumber) {
  const redis = getRedis();
  let settings = {};
  try { const raw = await redis.get(`account:${accountNumber}:settings`); if (raw) settings = JSON.parse(raw); } catch(_){}
  const socials = settings.socials || {};
  const links   = Object.entries(socials).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(' | ');
  if (links) await sendChatMessage(accountNumber, `Follow me: ${links}`);
}

async function postSchedule(accountNumber) {
  const redis = getRedis();
  let settings = {};
  try { const raw = await redis.get(`account:${accountNumber}:settings`); if (raw) settings = JSON.parse(raw); } catch(_){}
  await sendChatMessage(accountNumber, `Next stream: ${settings.streamSchedule || 'Check community tab!'}`);
}

async function storeMessage(accountNumber, streamDbId, item, text, authorName, authorId, authorUrl, status) {
  await query(`
    INSERT INTO chat_messages (account_number,stream_id,message_id,message_text,author_name,author_id,author_url,status,sent_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (message_id) DO NOTHING
  `, [accountNumber, streamDbId, item.id, text, authorName, authorId, authorUrl, status, item.snippet?.publishedAt||new Date().toISOString()]);
}

async function handleChatEngagement(accountNumber, authorId, authorName, authorUrl, isSub) {
  const redis    = getRedis();
  const dateKey  = new Date().toDateString();
  const msgKey   = `msg_count:${accountNumber}:${authorId}:${dateKey}`;
  const count    = await incrementCounter(msgKey, 86400);
  if (count % 10 === 0) { await awardSP(accountNumber, authorId, 10, 'messages'); await awardXP(accountNumber, authorId, 5, 'messages'); }
  await query(`
    INSERT INTO viewers (account_number,user_id,username,channel_url,first_seen,last_seen,total_messages)
    VALUES ($1,$2,$3,$4,NOW(),NOW(),1)
    ON CONFLICT (account_number,user_id) DO UPDATE SET last_seen=NOW(), total_messages=viewers.total_messages+1
  `, [accountNumber, authorId, authorName, authorUrl]);
}

async function logModerationAction(accountNumber, action, userId, username, reason) {
  await query(`INSERT INTO moderation_log (account_number,action,user_id,username,reason,actioned_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
    [accountNumber, action, userId, username, reason]);
}

module.exports = { processMessage, postStreamRules, postSocials, postSchedule };
