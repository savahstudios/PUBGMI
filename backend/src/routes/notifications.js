const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getNotifications, markAllRead, getUnreadCount } = require('../services/notificationService');
const { query } = require('../config/database');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { account = 1, category, unread, limit = 50, offset = 0 } = req.query;
    const notifications = await getNotifications(parseInt(account), {
      category, unreadOnly: unread === 'true', limit: parseInt(limit), offset: parseInt(offset)
    });
    const unreadCount = await getUnreadCount(parseInt(account));
    res.json({ notifications, unreadCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/mark-read', requireAuth, async (req, res) => {
  try {
    const { account = 1, id } = req.body;
    if (id) {
      await query(`UPDATE notifications SET read_at = NOW() WHERE id = $1`, [id]);
    } else {
      await markAllRead(parseInt(account));
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const count = await getUnreadCount(parseInt(account));
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
