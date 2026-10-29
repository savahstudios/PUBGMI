const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../config/database');
const { getRedis } = require('../config/redis');
const { sendChatMessage, banUser, deleteMessage } = require('../services/youtubeService');
const { createNotification } = require('../services/notificationService');
const { postStreamRules, postSocials } = require('../services/chatService');

// Get chat messages for a stream
router.get('/messages', requireAuth, async (req, res) => {
  try {
    const { account = 1, stream_id, limit = 100, offset = 0, search } = req.query;
    let whereClause = 'WHERE account_number = $1';
    const params = [parseInt(account)];
    let pCount = 1;

    if (stream_id) { pCount++; whereClause += ` AND stream_id = $${pCount}`; params.push(stream_id); }
    if (search) { pCount++; whereClause += ` AND (message_text ILIKE $${pCount} OR author_name ILIKE $${pCount})`; params.push(`%${search}%`); }

    pCount++; params.push(parseInt(limit));
    pCount++; params.push(parseInt(offset));

    const { rows } = await query(
      `SELECT * FROM chat_messages ${whereClause} ORDER BY sent_at DESC LIMIT $${pCount-1} OFFSET $${pCount}`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get moderation settings
router.get('/mod-settings', requireAuth, async (req, res) => {
  try {
    const account = parseInt(req.query.account) || 1;
    const { rows } = await query('SELECT * FROM settings WHERE account_number = $1', [account]);
    res.json(rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update moderation settings
router.put('/mod-settings', requireAuth, async (req, res) => {
  try {
    const { account = 1, ...settings } = req.body;
    await query(`
      UPDATE settings SET 
        filter_links = $2, caps_threshold = $3, timeout_duration = $4,
        whitelisted_domains = $5, auto_translate = $6, updated_at = NOW()
      WHERE account_number = $1
    `, [account, settings.filterLinks, settings.capsThreshold, settings.timeoutDuration,
        JSON.stringify(settings.whitelistedDomains), settings.autoTranslate]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get blocked words
router.get('/blocked-words', requireAuth, async (req, res) => {
  try {
    const account = parseInt(req.query.account) || 1;
    const redis = getRedis();
    const words = await redis.get(`account:${account}:blocked_words`);
    res.json(words ? JSON.parse(words) : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update blocked words
router.put('/blocked-words', requireAuth, async (req, res) => {
  try {
    const { account = 1, words } = req.body;
    const redis = getRedis();
    await redis.set(`account:${account}:blocked_words`, JSON.stringify(words));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle slow mode
router.post('/toggle-slow', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.body;
    const redis = getRedis();
    const key = `account:${account}:slow_mode`;
    const current = await redis.get(key) || 'off';
    const newState = current === 'off' ? 'on' : 'off';
    await redis.set(key, newState);
    await sendChatMessage(parseInt(account), `Slow mode ${newState === 'on' ? 'enabled' : 'disabled'}`);
    res.json({ state: newState });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle sub-only
router.post('/toggle-subonly', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.body;
    const redis = getRedis();
    const key = `account:${account}:sub_only`;
    const current = await redis.get(key) || 'off';
    const newState = current === 'off' ? 'on' : 'off';
    await redis.set(key, newState);
    await sendChatMessage(parseInt(account), `Subscriber-only mode ${newState === 'on' ? 'enabled' : 'disabled'}`);
    res.json({ state: newState });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Post rules
router.post('/rules', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.body;
    await postStreamRules(parseInt(account));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Post socials
router.post('/socials', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.body;
    await postSocials(parseInt(account));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get moderation log
router.get('/mod-log', requireAuth, async (req, res) => {
  try {
    const { account = 1, limit = 50, offset = 0 } = req.query;
    const { rows } = await query(
      `SELECT * FROM moderation_log WHERE account_number = $1 ORDER BY actioned_at DESC LIMIT $2 OFFSET $3`,
      [parseInt(account), parseInt(limit), parseInt(offset)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get banned users
router.get('/banned', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(
      `SELECT * FROM banned_users WHERE account_number = $1 AND unbanned_at IS NULL ORDER BY banned_at DESC`,
      [parseInt(account)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Unban user
router.post('/unban', requireAuth, async (req, res) => {
  try {
    const { account = 1, userId } = req.body;
    await query(
      `UPDATE banned_users SET unbanned_at = NOW() WHERE account_number = $1 AND user_id = $2`,
      [parseInt(account), userId]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Keyword rules
router.get('/keyword-rules', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(
      `SELECT * FROM keyword_rules WHERE account_number = $1 ORDER BY created_at DESC`,
      [parseInt(account)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/keyword-rules', requireAuth, async (req, res) => {
  try {
    const { account = 1, triggers, response, matchType = 'contains', cooldownSeconds = 60, action = 'reply' } = req.body;
    const { rows } = await query(`
      INSERT INTO keyword_rules (account_number, triggers, response, match_type, cooldown_seconds, action)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [parseInt(account), JSON.stringify(triggers), response, matchType, cooldownSeconds, action]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/keyword-rules/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM keyword_rules WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
