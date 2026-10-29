const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getChannelStats, getLiveStatus, sendChatMessage, pollAccount } = require('../services/youtubeService');
const { query } = require('../config/database');

router.get('/status', requireAuth, async (req, res) => {
  try {
    const account = parseInt(req.query.account) || 1;
    const [stats, liveStatus] = await Promise.all([
      getChannelStats(account),
      getLiveStatus(account)
    ]);
    res.json({ stats, liveStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const account = parseInt(req.query.account) || 1;
    const stats = await getChannelStats(account);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/live', requireAuth, async (req, res) => {
  try {
    const account = parseInt(req.query.account) || 1;
    const liveStatus = await getLiveStatus(account);
    res.json(liveStatus);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/say', requireAuth, async (req, res) => {
  try {
    const { account = 1, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const sent = await sendChatMessage(parseInt(account), message);
    res.json({ success: sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/videos', requireAuth, async (req, res) => {
  try {
    const account = parseInt(req.query.account) || 1;
    const { rows } = await query(
      `SELECT * FROM videos WHERE account_number = $1 ORDER BY published_at DESC LIMIT 20`,
      [account]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
