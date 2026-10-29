const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../config/database');

// Subscribers
router.get('/subscribers', requireAuth, async (req, res) => {
  try {
    const { account = 1, limit = 50, offset = 0, search } = req.query;
    let where = 'WHERE s.account_number = $1';
    const params = [parseInt(account)];
    let pc = 1;
    if (search) { pc++; where += ` AND s.username ILIKE $${pc}`; params.push(`%${search}%`); }
    pc++; params.push(parseInt(limit));
    pc++; params.push(parseInt(offset));

    const { rows } = await query(`
      SELECT s.*, v.total_watch_minutes, v.streams_attended, v.channel_url,
             vr.sp, vr.total_xp, vr.tier, vr.division
      FROM subscribers s
      LEFT JOIN viewers v ON v.user_id = s.user_id AND v.account_number = s.account_number
      LEFT JOIN viewer_ranks vr ON vr.user_id = s.user_id AND vr.account_number = s.account_number
      ${where} ORDER BY s.subscribed_at DESC LIMIT $${pc-1} OFFSET $${pc}
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Donators
router.get('/donators', requireAuth, async (req, res) => {
  try {
    const { account = 1, limit = 50, offset = 0 } = req.query;
    const { rows } = await query(`
      SELECT d.*, SUM(d.amount) OVER (PARTITION BY d.user_id) as total_donated
      FROM donators d
      WHERE d.account_number = $1
      ORDER BY d.donated_at DESC LIMIT $2 OFFSET $3
    `, [parseInt(account), parseInt(limit), parseInt(offset)]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stream archive
router.get('/streams', requireAuth, async (req, res) => {
  try {
    const { account = 1, limit = 20, offset = 0 } = req.query;
    const { rows } = await query(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM chat_messages WHERE stream_id = s.id) as message_count,
        (SELECT COUNT(*) FROM clips WHERE stream_id = s.id) as clip_count
      FROM streams s WHERE s.account_number = $1
      ORDER BY s.started_at DESC LIMIT $2 OFFSET $3
    `, [parseInt(account), parseInt(limit), parseInt(offset)]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Viewers database
router.get('/viewers', requireAuth, async (req, res) => {
  try {
    const { account = 1, limit = 50, offset = 0, search } = req.query;
    let where = 'WHERE v.account_number = $1';
    const params = [parseInt(account)];
    let pc = 1;
    if (search) { pc++; where += ` AND v.username ILIKE $${pc}`; params.push(`%${search}%`); }
    pc++; params.push(parseInt(limit));
    pc++; params.push(parseInt(offset));

    const { rows } = await query(`
      SELECT v.*, vr.sp, vr.total_xp, vr.tier, vr.division,
             (SELECT COUNT(*) FROM warnings WHERE user_id = v.user_id AND account_number = v.account_number) as warning_count
      FROM viewers v
      LEFT JOIN viewer_ranks vr ON vr.user_id = v.user_id AND vr.account_number = v.account_number
      ${where} ORDER BY v.last_seen DESC LIMIT $${pc-1} OFFSET $${pc}
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update viewer notes
router.put('/viewers/:userId/notes', requireAuth, async (req, res) => {
  try {
    const { account = 1, notes } = req.body;
    await query(`UPDATE viewers SET notes=$1 WHERE account_number=$2 AND user_id=$3`, [notes, parseInt(account), req.params.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chat archive
router.get('/chat', requireAuth, async (req, res) => {
  try {
    const { account = 1, streamId, search, limit = 100, offset = 0 } = req.query;
    let where = 'WHERE account_number = $1';
    const params = [parseInt(account)];
    let pc = 1;
    if (streamId) { pc++; where += ` AND stream_id = $${pc}`; params.push(streamId); }
    if (search) { pc++; where += ` AND message_text ILIKE $${pc}`; params.push(`%${search}%`); }
    pc++; params.push(parseInt(limit));
    pc++; params.push(parseInt(offset));

    const { rows } = await query(
      `SELECT * FROM chat_messages ${where} ORDER BY sent_at DESC LIMIT $${pc-1} OFFSET $${pc}`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
