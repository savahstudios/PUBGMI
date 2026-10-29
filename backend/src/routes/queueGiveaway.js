const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../config/database');
const { getRedis } = require('../config/redis');
const { sendChatMessage } = require('../services/youtubeService');

// Queue routes
const queueRouter = express.Router();

queueRouter.get('/', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(
      `SELECT *, EXTRACT(EPOCH FROM (NOW() - joined_at)) as wait_seconds 
       FROM queue WHERE account_number = $1 AND status = 'waiting' ORDER BY position`,
      [parseInt(account)]
    );
    const redis = getRedis();
    const queueOpen = await redis.get(`account:${account}:queue_open`) !== 'closed';
    res.json({ queue: rows, queueOpen });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

queueRouter.post('/accept-next', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.body;
    const { rows } = await query(
      `SELECT * FROM queue WHERE account_number = $1 AND status = 'waiting' ORDER BY position LIMIT 1`,
      [parseInt(account)]
    );
    if (!rows.length) return res.json({ success: false, message: 'Queue is empty' });

    const player = rows[0];
    await query(`UPDATE queue SET status='accepted', accepted_at=NOW() WHERE id=$1`, [player.id]);
    await sendChatMessage(parseInt(account), `@${player.username} you are up! Join squad — in-game: ${player.in_game_name}`);
    res.json({ success: true, player });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

queueRouter.post('/toggle', requireAuth, async (req, res) => {
  try {
    const { account = 1, state } = req.body;
    const redis = getRedis();
    await redis.set(`account:${account}:queue_open`, state);
    await sendChatMessage(parseInt(account), `Squad queue is now ${state.toUpperCase()}${state === 'open' ? ' — type !join [in-game name]!' : ''}`);
    res.json({ success: true, state });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

queueRouter.post('/clear', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.body;
    await query(`UPDATE queue SET status='cleared' WHERE account_number=$1 AND status='waiting'`, [parseInt(account)]);
    await sendChatMessage(parseInt(account), 'Squad queue cleared');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

queueRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    await query(`UPDATE queue SET status='removed' WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Giveaway routes
const giveawayRouter = express.Router();

giveawayRouter.get('/active', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const redis = getRedis();
    const data = await redis.get(`account:${account}:giveaway`);
    res.json(data ? JSON.parse(data) : null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

giveawayRouter.post('/start', requireAuth, async (req, res) => {
  try {
    const { account = 1, keyword, durationMinutes = 5 } = req.body;
    const redis = getRedis();
    const endsAt = new Date(Date.now() + durationMinutes * 60000).toISOString();

    const giveawayData = {
      keyword, durationMinutes, endsAt,
      entries: 0, entryList: [],
      startedAt: new Date().toISOString()
    };

    await redis.setex(`account:${account}:giveaway`, durationMinutes * 60, JSON.stringify(giveawayData));
    await sendChatMessage(parseInt(account), `GIVEAWAY! Type "${keyword}" to enter! Ends in ${durationMinutes} minutes!`);
    res.json({ success: true, giveaway: giveawayData });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

giveawayRouter.post('/pick-winner', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.body;
    const redis = getRedis();
    const data = await redis.get(`account:${account}:giveaway`);

    if (!data) return res.status(404).json({ error: 'No active giveaway' });

    const giveaway = JSON.parse(data);
    if (!giveaway.entryList?.length) return res.status(400).json({ error: 'No entries' });

    const winner = giveaway.entryList[Math.floor(Math.random() * giveaway.entryList.length)];
    await redis.del(`account:${account}:giveaway`);

    await query(
      `INSERT INTO giveaways (account_number, keyword, entries, winner_username, ended_at) VALUES ($1,$2,$3,$4,NOW())`,
      [parseInt(account), giveaway.keyword, giveaway.entryList.length, winner]
    );

    await sendChatMessage(parseInt(account), `WINNER: @${winner} Congratulations! Please respond within 2 minutes!`);
    res.json({ success: true, winner, entries: giveaway.entryList.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

giveawayRouter.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.body;
    const redis = getRedis();
    await redis.del(`account:${account}:giveaway`);
    await sendChatMessage(parseInt(account), 'Giveaway cancelled');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

giveawayRouter.get('/history', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(
      `SELECT * FROM giveaways WHERE account_number=$1 ORDER BY ended_at DESC LIMIT 20`, [parseInt(account)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { queueRouter, giveawayRouter };
