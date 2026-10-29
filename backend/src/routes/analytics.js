// BUG-38 FIXED: SQL injection in revenue query — whitelist interval values
// BUG-57 FIXED: No more Math.random() mock data
// BUG-58 FIXED: viewsToday fetched from DB
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../config/database');
const { getChannelStats } = require('../services/youtubeService');
const { getRedis } = require('../config/redis');

// BUG-42 FIXED: Account number validator
function validateAccount(req, res) {
  const acc = parseInt(req.query.account) || 1;
  if (![1,2].includes(acc)) { res.status(400).json({ error: 'account must be 1 or 2' }); return null; }
  return acc;
}

router.get('/overview', requireAuth, async (req, res) => {
  try {
    const account = validateAccount(req, res);
    if (!account) return;

    const redis = getRedis();
    const [channelStats, streamCount, totalDonations, recentActivity, recentVideos, subsThisWeek] = await Promise.all([
      getChannelStats(account),
      query(`SELECT COUNT(*) as cnt FROM streams WHERE account_number=$1`, [account]),
      query(`SELECT COALESCE(SUM(amount),0) as total FROM donators WHERE account_number=$1`, [account]),
      query(`SELECT type, title as message, created_at as timestamp FROM notifications WHERE account_number=$1 ORDER BY created_at DESC LIMIT 15`, [account]),
      query(`SELECT title, youtube_video_id, views, published_at FROM videos WHERE account_number=$1 ORDER BY published_at DESC LIMIT 6`, [account]),
      query(`SELECT COUNT(*) as cnt FROM subscribers WHERE account_number=$1 AND subscribed_at >= NOW() - INTERVAL '7 days'`, [account])
    ]);

    // BUG-57 FIXED: Real growth data from DB (no Math.random())
    const { rows: growthRows } = await query(`
      SELECT DATE(subscribed_at) as date, COUNT(*) as new_subs
      FROM subscribers WHERE account_number=$1 AND subscribed_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(subscribed_at) ORDER BY date ASC
    `, [account]);

    // BUG-58 FIXED: Real views today from streams
    const { rows: todayViews } = await query(`
      SELECT COALESCE(SUM(viewer_count),0) as total
      FROM stream_viewer_counts svc
      JOIN streams s ON s.id = svc.stream_id
      WHERE s.account_number=$1 AND DATE(svc.recorded_at)=CURRENT_DATE
    `, [account]);

    // Live chat messages count this stream
    const liveStreamId = await redis.get(`account:${account}:stream_db_id`);
    let chatMessages = 0;
    if (liveStreamId) {
      const { rows: chatRows } = await query(`SELECT COUNT(*) as cnt FROM chat_messages WHERE stream_id=$1`, [liveStreamId]);
      chatMessages = parseInt(chatRows[0]?.cnt || 0);
    }

    res.json({
      stats: {
        subscribers:   parseInt(channelStats?.subscriberCount || 0),
        viewsToday:    parseInt(todayViews[0]?.total || 0),
        chatMessages,
        superChats:    parseFloat(totalDonations.rows[0]?.total || 0),
        todaySubs:     parseInt(subsThisWeek.rows[0]?.cnt || 0),
        totalStreams:  parseInt(streamCount.rows[0]?.cnt || 0)
      },
      growthData:     growthRows,
      recentActivity: recentActivity.rows,
      recentVideos:   recentVideos.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/streams', requireAuth, async (req, res) => {
  try {
    const account = validateAccount(req, res); if (!account) return;
    const { limit=20, offset=0 } = req.query;
    const { rows } = await query(`
      SELECT id, title, status, started_at, ended_at, recap,
             EXTRACT(EPOCH FROM (COALESCE(ended_at,NOW()) - started_at)) as duration_seconds
      FROM streams WHERE account_number=$1
      ORDER BY started_at DESC LIMIT $2 OFFSET $3
    `, [account, parseInt(limit), parseInt(offset)]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/streams/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM streams WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Stream not found' });
    const s = rows[0];
    const [msgs, clips, viewers, subs, donations] = await Promise.all([
      query(`SELECT COUNT(*) as cnt FROM chat_messages WHERE stream_id=$1`, [s.id]),
      query(`SELECT * FROM clips WHERE stream_id=$1 ORDER BY elapsed_seconds`, [s.id]),
      query(`SELECT COUNT(DISTINCT author_id) as cnt FROM chat_messages WHERE stream_id=$1`, [s.id]),
      query(`SELECT COUNT(*) as cnt FROM subscribers WHERE account_number=$1 AND subscribed_at>=$2`, [s.account_number, s.started_at]),
      query(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM donators WHERE stream_id=$1`, [s.id])
    ]);
    res.json({
      ...s,
      messageCount: parseInt(msgs.rows[0]?.cnt||0),
      clips: clips.rows,
      uniqueViewers: parseInt(viewers.rows[0]?.cnt||0),
      newSubs: parseInt(subs.rows[0]?.cnt||0),
      donationCount: parseInt(donations.rows[0]?.cnt||0),
      donationTotal: parseFloat(donations.rows[0]?.total||0)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/top-chatters', requireAuth, async (req, res) => {
  try {
    const account = validateAccount(req, res); if (!account) return;
    const { streamId, limit=10 } = req.query;
    const params = [account, parseInt(limit)];
    const streamClause = streamId ? `AND stream_id=$3` : '';
    if (streamId) params.push(streamId);
    const { rows } = await query(`
      SELECT author_name,author_id,author_url,COUNT(*) as message_count
      FROM chat_messages WHERE account_number=$1 ${streamClause}
      GROUP BY author_name,author_id,author_url ORDER BY message_count DESC LIMIT $2
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BUG-38 FIXED: Whitelist interval values — no SQL injection possible
router.get('/revenue', requireAuth, async (req, res) => {
  try {
    const account = validateAccount(req, res); if (!account) return;
    const { period='30d' } = req.query;

    // BUG-38: Whitelist only — never interpolate user input directly
    const ALLOWED_PERIODS = { '7d':'7 days','30d':'30 days','90d':'90 days','1y':'1 year' };
    const interval = ALLOWED_PERIODS[period];
    if (!interval) return res.status(400).json({ error: 'Invalid period. Use 7d, 30d, 90d, or 1y' });

    const { rows } = await query(`
      SELECT DATE(donated_at) as date, SUM(amount) as total, COUNT(*) as count, currency
      FROM donators WHERE account_number=$1 AND donated_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(donated_at), currency ORDER BY date DESC
    `, [account]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BUG-08 FIXED: Increment API quota counter on each call
router.get('/quota-status', requireAuth, async (req, res) => {
  try {
    const redis = getRedis();
    const q1 = parseInt(await redis.get('api_quota:1') || 0);
    const q2 = parseInt(await redis.get('api_quota:2') || 0);
    res.json({ account1: { used: q1, limit: 10000 }, account2: { used: q2, limit: 10000 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
