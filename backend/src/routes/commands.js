const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../config/database');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { account = 1 } = req.query;
    const { rows } = await query(
      `SELECT * FROM commands WHERE account_number = $1 ORDER BY name`,
      [parseInt(account)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { account = 1, name, response, permission = 'everyone', cooldownSeconds = 0 } = req.body;
    const { rows } = await query(`
      INSERT INTO commands (account_number, name, response, permission, cooldown_seconds)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [parseInt(account), name.toLowerCase(), response, permission, cooldownSeconds]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, response, permission, cooldownSeconds, active } = req.body;
    const { rows } = await query(`
      UPDATE commands SET name=$2, response=$3, permission=$4, cooldown_seconds=$5, active=$6
      WHERE id=$1 RETURNING *
    `, [req.params.id, name, response, permission, cooldownSeconds, active]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM commands WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
