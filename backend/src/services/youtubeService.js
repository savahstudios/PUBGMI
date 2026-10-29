// youtubeService.js — v1.1.0
// BUG-66 FIXED: VOD links generated for clips
// BUG-71 FIXED: Parallel account polling with Promise.all
const { getChannel1Client, getChannel2Client } = require('../config/youtube');
const { sendChatMessage, banUser, deleteMessage, incrementQuota } = require('./youtubeApiService');
const { query }  = require('../config/database');
const { getRedis, setCache, getCache } = require('../config/redis');
const { createNotification } = require('./notificationService');
const { awardSP, awardXP } = require('./spService');
const logger = require('../utils/logger');

let pollingIntervals  = {};
let activeChatPollers = {};
let io;

async function startYouTubePoller(socketIo) {
  io = socketIo;
  // BUG-71 FIXED: Poll both accounts in parallel
  await Promise.all([pollAccount(1), pollAccount(2)]);
  pollingIntervals[1] = setInterval(() => pollAccount(1), 60000);
  pollingIntervals[2] = setInterval(() => pollAccount(2), 60000);

  // Watch-time XP every minute
  setInterval(() => {
    const { awardWatchTimeXP } = require('./spService');
    Promise.all([awardWatchTimeXP(1), awardWatchTimeXP(2)]);
  }, 60000);
}

async function pollAccount(accountNumber) {
  try {
    const client = accountNumber === 2 ? getChannel2Client() : getChannel1Client();
    const redis  = getRedis();

    const broadcastRes = await client.youtube.liveBroadcasts.list({
      part: ['snippet','contentDetails','status','statistics'],
      broadcastStatus: 'active',
      broadcastType: 'all'
    });
    await incrementQuota(accountNumber, 1);

    const wasLive        = await redis.get(`account:${accountNumber}:live`) === 'true';
    const activeBroadcast = broadcastRes.data.items?.[0];

    if (activeBroadcast && !wasLive) {
      await onStreamStart(accountNumber, activeBroadcast);
    } else if (!activeBroadcast && wasLive) {
      await onStreamEnd(accountNumber);
    }

    if (activeBroadcast) {
      await redis.set(`account:${accountNumber}:live`, 'true');
      await redis.set(`account:${accountNumber}:broadcast`, JSON.stringify(activeBroadcast));
      await updateLiveStats(accountNumber, activeBroadcast);
    } else {
      await redis.set(`account:${accountNumber}:live`, 'false');
    }
  } catch (err) {
    logger.error(`pollAccount ${accountNumber}:`, err.message);
  }
}

async function onStreamStart(accountNumber, broadcast) {
  const redis       = getRedis();
  const liveChatId  = broadcast.snippet?.liveChatId;
  const streamTitle = broadcast.snippet?.title || 'Untitled Stream';
  const ytStreamId  = broadcast.id;
  const startTime   = new Date().toISOString();

  logger.info(`Stream LIVE account ${accountNumber}: ${streamTitle}`);

  const { rows } = await query(`
    INSERT INTO streams (account_number,youtube_stream_id,title,live_chat_id,started_at,status)
    VALUES ($1,$2,$3,$4,$5,'live') RETURNING id
  `, [accountNumber, ytStreamId, streamTitle, liveChatId, startTime]);

  const dbStreamId = rows[0].id;
  await redis.set(`account:${accountNumber}:stream_db_id`, dbStreamId);
  await redis.set(`account:${accountNumber}:stream_start`, startTime);
  await redis.set(`account:${accountNumber}:live_chat_id`, liveChatId || '');
  await redis.set(`account:${accountNumber}:yt_stream_id`, ytStreamId);

  await createNotification(accountNumber, 'stream', 'stream_live', { title: streamTitle, streamId: dbStreamId });
  if (liveChatId) startChatPoller(accountNumber, liveChatId, dbStreamId);

  io?.emit('stream:live', { accountNumber, streamTitle, streamId: dbStreamId, startTime });

  try { const { pushNotification } = require('../telegram/bot'); await pushNotification('stream_live', { title: streamTitle }); } catch(_){}
}

async function onStreamEnd(accountNumber) {
  const redis      = getRedis();
  const dbStreamId = await redis.get(`account:${accountNumber}:stream_db_id`);
  const startTime  = await redis.get(`account:${accountNumber}:stream_start`);
  const ytStreamId = await redis.get(`account:${accountNumber}:yt_stream_id`);

  if (activeChatPollers[accountNumber]) {
    clearInterval(activeChatPollers[accountNumber]);
    delete activeChatPollers[accountNumber];
  }

  if (dbStreamId) {
    const endTime = new Date().toISOString();
    const recap   = await generateStreamRecap(accountNumber, dbStreamId, startTime, endTime);

    await query(`UPDATE streams SET ended_at=$1,status='ended',recap=$2 WHERE id=$3`,
      [endTime, JSON.stringify(recap), dbStreamId]);

    // BUG-66 FIXED: Generate VOD links for all clips in this stream
    if (ytStreamId) await generateClipVodLinks(dbStreamId, ytStreamId);

    await createNotification(accountNumber, 'stream', 'stream_ended', { recap, dbStreamId });
    io?.emit('stream:ended', { accountNumber, recap });
    try { const { pushNotification } = require('../telegram/bot'); await pushNotification('stream_ended', { recap }); } catch(_){}
  }

  await redis.del(`account:${accountNumber}:stream_db_id`);
  await redis.del(`account:${accountNumber}:stream_start`);
  await redis.del(`account:${accountNumber}:live_chat_id`);
  await redis.del(`account:${accountNumber}:yt_stream_id`);
  await redis.set(`account:${accountNumber}:live`, 'false');
}

// BUG-66 FIXED: Generate VOD links after stream ends
async function generateClipVodLinks(streamDbId, ytStreamId) {
  const { rows } = await query(`SELECT id, elapsed_seconds FROM clips WHERE stream_id=$1 AND vod_url IS NULL`, [streamDbId]);
  for (const clip of rows) {
    const vodUrl = `https://www.youtube.com/watch?v=${ytStreamId}&t=${clip.elapsed_seconds}s`;
    await query(`UPDATE clips SET vod_url=$1 WHERE id=$2`, [vodUrl, clip.id]);
  }
  logger.info(`Generated ${rows.length} VOD links for stream ${streamDbId}`);
}

function startChatPoller(accountNumber, liveChatId, dbStreamId) {
  let pageToken = null;
  const client  = accountNumber === 2 ? getChannel2Client() : getChannel1Client();
  let polling   = false;

  const pollChat = async () => {
    if (polling) return; // BUG-72: prevent overlapping polls
    polling = true;
    try {
      const params = { part:['snippet','authorDetails'], liveChatId, maxResults:200 };
      if (pageToken) params.pageToken = pageToken;

      const res = await client.youtube.liveChatMessages.list(params);
      await incrementQuota(accountNumber, 1);
      pageToken = res.data.nextPageToken;

      if (res.data.items?.length) {
        const { processMessage } = require('./chatService');
        for (const item of res.data.items) {
          await processMessage(accountNumber, item, dbStreamId, io);
        }
      }

      // Respect YouTube's polling interval
      const nextMs = Math.max(res.data.pollingIntervalMillis || 2000, 2000);
      if (activeChatPollers[accountNumber]) {
        clearInterval(activeChatPollers[accountNumber]);
        activeChatPollers[accountNumber] = setInterval(pollChat, nextMs);
      }
    } catch (err) {
      logger.error(`chatPoller account ${accountNumber}:`, err.message);
    } finally {
      polling = false;
    }
  };

  activeChatPollers[accountNumber] = setInterval(pollChat, 2000);
  pollChat();
}

async function updateLiveStats(accountNumber, broadcast) {
  const stats = { concurrentViewers: broadcast.statistics?.concurrentViewers || 0, updatedAt: new Date().toISOString() };
  await setCache(`account:${accountNumber}:live_stats`, stats, 30);
  io?.emit('stats:update', { accountNumber, stats });

  const redis = getRedis();
  const dbStreamId = await redis.get(`account:${accountNumber}:stream_db_id`);
  if (dbStreamId && stats.concurrentViewers > 0) {
    await query(`INSERT INTO stream_viewer_counts (stream_id,viewer_count) VALUES ($1,$2)`, [dbStreamId, stats.concurrentViewers]);
  }
}

async function generateStreamRecap(accountNumber, streamDbId, startTime, endTime) {
  const durationMs = new Date(endTime) - new Date(startTime);
  const hours      = Math.floor(durationMs / 3600000);
  const minutes    = Math.floor((durationMs % 3600000) / 60000);

  const [msgs, subs, sc, top, peak] = await Promise.all([
    query(`SELECT COUNT(*) as cnt FROM chat_messages WHERE stream_id=$1`, [streamDbId]),
    query(`SELECT COUNT(*) as cnt FROM subscribers WHERE account_number=$1 AND subscribed_at>=$2`, [accountNumber, startTime]),
    query(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM donators WHERE account_number=$1 AND donated_at>=$2`, [accountNumber, startTime]),
    query(`SELECT author_name, COUNT(*) as cnt FROM chat_messages WHERE stream_id=$1 GROUP BY author_name ORDER BY cnt DESC LIMIT 1`, [streamDbId]),
    query(`SELECT MAX(viewer_count) as mx FROM stream_viewer_counts WHERE stream_id=$1`, [streamDbId])
  ]);

  return {
    duration: `${hours}h ${minutes}m`, durationMs,
    totalMessages:  parseInt(msgs.rows[0]?.cnt  || 0),
    newSubscribers: parseInt(subs.rows[0]?.cnt  || 0),
    superChatCount: parseInt(sc.rows[0]?.cnt    || 0),
    superChatTotal: parseFloat(sc.rows[0]?.total || 0),
    topChatter:     top.rows[0]?.author_name    || 'Nobody',
    peakViewers:    parseInt(peak.rows[0]?.mx   || 0),
    startTime, endTime
  };
}

async function getChannelStats(accountNumber) {
  try {
    const cached = await getCache(`account:${accountNumber}:channel_stats`);
    if (cached) return cached;

    const client = accountNumber === 2 ? getChannel2Client() : getChannel1Client();
    const res    = await client.youtube.channels.list({ part:['statistics','snippet'], mine:true });
    await incrementQuota(accountNumber, 1);

    if (!res.data.items?.length) return null;
    const s = res.data.items[0].statistics;
    const n = res.data.items[0].snippet;
    const result = {
      subscriberCount: parseInt(s.subscriberCount||0),
      viewCount:       parseInt(s.viewCount||0),
      videoCount:      parseInt(s.videoCount||0),
      channelTitle:    n.title,
      thumbnailUrl:    n.thumbnails?.default?.url
    };
    await setCache(`account:${accountNumber}:channel_stats`, result, 120);
    return result;
  } catch (err) { logger.error('getChannelStats:', err.message); return null; }
}

async function getLiveStatus(accountNumber) {
  const redis  = getRedis();
  const isLive = await redis.get(`account:${accountNumber}:live`) === 'true';
  if (!isLive) return { isLive: false };

  const broadcast  = await redis.get(`account:${accountNumber}:broadcast`);
  const streamDbId = await redis.get(`account:${accountNumber}:stream_db_id`);
  const startTime  = await redis.get(`account:${accountNumber}:stream_start`);
  return { isLive: true, broadcast: broadcast ? JSON.parse(broadcast) : null, streamDbId, startTime };
}

module.exports = { startYouTubePoller, sendChatMessage, banUser, deleteMessage, getLiveStatus, getChannelStats, pollAccount };
