const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../config/database');
const { awardSP, awardXP, getViewerRank, RANK_TIERS } = require('../services/spService');
const { getRedis } = require('../config/redis');

// Get leaderboard
router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const { account = 1, type = 'alltime', limit = 50 } = req.query;
    let q;

    if (type === 'season') {
      const { rows: season } = await query(
        `SELECT id FROM seasons WHERE account_number = $1 AND status = 'active'`, [parseInt(account)]
      );
      if (season.length) {
        const { rows } = await query(`
          SELECT sr.user_id, sr.xp, v.username, v.channel_url, vr.tier, vr.division, vr.sp,
                 RANK() OVER (ORDER BY sr.xp DESC) as position
          FROM season_rankings sr
          LEFT JOIN viewers v ON v.user_id = sr.user_id AND v.account_number = sr.account_number
          LEFT JOIN viewer_ranks vr ON vr.user_id = sr.user_id AND vr.account_number = sr.account_number
          WHERE sr.season_id = $1
          ORDER BY sr.xp DESC LIMIT $2
        `, [season[0].id, parseInt(limit)]);
        return res.json(rows);
      }
    }

    const { rows } = await query(`
      SELECT vr.user_id, vr.sp, vr.total_xp, vr.tier, vr.division,
             v.username, v.channel_url, v.total_watch_minutes, v.streams_attended,
             RANK() OVER (ORDER BY vr.total_xp DESC) as position
      FROM viewer_ranks vr
      LEFT JOIN viewers v ON v.account_number = vr.account_number AND v.user_id = vr.user_id
      WHERE vr.account_number = $1
      ORDER BY vr.total_xp DESC LIMIT $2
    `, [parseInt(account), parseInt(limit)]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get viewer rank
router.get('/rank/:userId', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const rank = await getViewerRank(parseInt(account), req.params.userId);
    res.json(rank);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Award SP manually
router.post('/award', requireAuth, async (req, res) => {
  try {
    const { account = 1, userId, amount, source = 'manual_award', type = 'sp' } = req.body;
    if (type === 'xp') {
      await awardXP(parseInt(account), userId, parseInt(amount), source);
    } else {
      await awardSP(parseInt(account), userId, parseInt(amount), source);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SP transactions log
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const { account = 1, userId, limit = 50, offset = 0 } = req.query;
    let whereClause = 'WHERE account_number = $1';
    const params = [parseInt(account)];
    let pCount = 1;

    if (userId) { pCount++; whereClause += ` AND user_id = $${pCount}`; params.push(userId); }
    pCount++; params.push(parseInt(limit));
    pCount++; params.push(parseInt(offset));

    const { rows } = await query(
      `SELECT * FROM sp_transactions ${whereClause} ORDER BY created_at DESC LIMIT $${pCount-1} OFFSET $${pCount}`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Seasons
router.get('/seasons', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(
      `SELECT * FROM seasons WHERE account_number = $1 ORDER BY started_at DESC`,
      [parseInt(account)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/seasons/reset', requireAuth, async (req, res) => {
  try {
    const { account = 1, resetType = 'soft' } = req.body;

    // Close current season
    await query(
      `UPDATE seasons SET status = 'ended', ends_at = NOW() WHERE account_number = $1 AND status = 'active'`,
      [parseInt(account)]
    );

    if (resetType === 'full') {
      // Full reset — everyone back to Bronze V
      await query(`UPDATE viewer_ranks SET total_xp = 0, tier = 'Bronze', division = 'V' WHERE account_number = $1`, [parseInt(account)]);
    } else if (resetType === 'soft') {
      // Soft reset — reduce based on rank
      const resetMap = {
        'Conqueror': 75000, 'Ace Dominator': 75000, 'Ace Master': 75000,
        'Ace': 15000, 'Crown': 5000, 'Diamond': 1000, 'Platinum': 1000,
        'Gold': 0, 'Silver': 0, 'Bronze': 0
      };
      const { rows } = await query(`SELECT user_id, tier FROM viewer_ranks WHERE account_number = $1`, [parseInt(account)]);
      for (const row of rows) {
        const newXP = resetMap[row.tier] || 0;
        await query(`UPDATE viewer_ranks SET total_xp = $1 WHERE account_number = $2 AND user_id = $3`, [newXP, parseInt(account), row.user_id]);
      }
    }

    // Create new season
    const seasonCount = await query(`SELECT COUNT(*) FROM seasons WHERE account_number = $1`, [parseInt(account)]);
    const newSeasonNum = parseInt(seasonCount.rows[0].count) + 1;

    await query(`
      INSERT INTO seasons (account_number, name, status, reset_type, ends_at)
      VALUES ($1, $2, 'active', $3, NOW() + INTERVAL '90 days')
    `, [parseInt(account), `Season ${newSeasonNum}`, resetType]);

    res.json({ success: true, newSeason: `Season ${newSeasonNum}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rank tiers info
router.get('/rank-tiers', (req, res) => {
  res.json(RANK_TIERS);
});

// Reward tiers
router.get('/reward-tiers', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(
      `SELECT * FROM reward_tiers WHERE account_number = $1 ORDER BY sp_threshold`,
      [parseInt(account)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reward deliveries
router.get('/reward-deliveries', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(`
      SELECT rd.*, rt.description, rt.trigger_tier, v.username, v.channel_url
      FROM reward_deliveries rd
      LEFT JOIN reward_tiers rt ON rt.id = rd.tier_id
      LEFT JOIN viewers v ON v.user_id = rd.user_id AND v.account_number = rd.account_number
      WHERE rd.account_number = $1
      ORDER BY rd.unlocked_at DESC
    `, [parseInt(account)]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/reward-deliveries/:id/deliver', requireAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    await query(
      `UPDATE reward_deliveries SET status = 'delivered', delivered_at = NOW(), notes = $2 WHERE id = $1`,
      [req.params.id, notes]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Multiplier events
router.post('/multiplier', requireAuth, async (req, res) => {
  try {
    const { account = 1, multiplier, durationMinutes } = req.body;
    const redis = getRedis();
    await redis.setex(
      `multiplier_event:${account}`,
      durationMinutes * 60,
      JSON.stringify({ multiplier, startedAt: new Date().toISOString() })
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Shop items
router.get('/shop', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(
      `SELECT * FROM shop_items WHERE account_number = $1 ORDER BY sp_cost`,
      [parseInt(account)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/shop', requireAuth, async (req, res) => {
  try {
    const { account = 1, name, description, spCost } = req.body;
    const { rows } = await query(
      `INSERT INTO shop_items (account_number, name, description, sp_cost) VALUES ($1,$2,$3,$4) RETURNING *`,
      [parseInt(account), name, description, spCost]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/shop/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, spCost, active } = req.body;
    const { rows } = await query(
      `UPDATE shop_items SET name=$2, description=$3, sp_cost=$4, active=$5 WHERE id=$1 RETURNING *`,
      [req.params.id, name, description, spCost, active]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
