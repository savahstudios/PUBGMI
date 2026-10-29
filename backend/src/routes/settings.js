// BUG-32 FIXED: Cache key unified — always 'account:X:settings'
// BUG-43 FIXED: Dashboard moderation actions now logged
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query }    = require('../config/database');
const { getRedis } = require('../config/redis');

router.get('/', requireAuth, async (req, res) => {
  try {
    const account = validateAccount(req.query.account);
    const { rows } = await query('SELECT * FROM settings WHERE account_number=$1', [account]);
    res.json(rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const { account=1, ...s } = req.body;
    const acc = validateAccount(account);

    await query(`
      INSERT INTO settings (account_number,rules_text,stream_schedule,sub_message,socials,
        join_messages,auto_translate,filter_links,guide_interval,superchat_message,
        caps_threshold,timeout_duration,slow_mode_secs)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (account_number) DO UPDATE SET
        rules_text=$2,stream_schedule=$3,sub_message=$4,socials=$5,
        join_messages=$6,auto_translate=$7,filter_links=$8,
        guide_interval=$9,superchat_message=$10,
        caps_threshold=$11,timeout_duration=$12,slow_mode_secs=$13,
        updated_at=NOW()
    `, [acc, s.rulesText, s.streamSchedule, s.subMessage,
        JSON.stringify(s.socials||{}), JSON.stringify(s.joinMessages||{}),
        s.autoTranslate, s.filterLinks, s.guideInterval, s.superchatMessage,
        s.capsThreshold||0.7, s.timeoutDuration||600, s.slowModeSecs||5]);

    // BUG-32 FIXED: Save under 'settings' key (unified)
    const redis = getRedis();
    await redis.set(`account:${acc}:settings`, JSON.stringify({
      ...s, rulesText: s.rulesText, streamSchedule: s.streamSchedule,
      filterLinks: s.filterLinks !== false,
      autoTranslate: !!s.autoTranslate,
      blockedWords: s.blockedWords || '[]',
      whitelistedDomains: s.whitelistedDomains || '["youtube.com","youtu.be"]',
      capsThreshold: s.capsThreshold || 0.7,
      timeoutDuration: s.timeoutDuration || 600,
      slowModeSecs: s.slowModeSecs || 5
    }));

    // Log settings change to audit trail
    await query(`INSERT INTO bot_activity_log (account_number,action,details,created_at) VALUES ($1,'settings_updated',$2,NOW())`,
      [acc, JSON.stringify({ changedBy: 'dashboard', timestamp: new Date().toISOString() })]);

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function validateAccount(val) {
  const acc = parseInt(val) || 1;
  return [1,2].includes(acc) ? acc : 1;
}

module.exports = router;
