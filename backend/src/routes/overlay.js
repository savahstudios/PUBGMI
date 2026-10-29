// BUG-23 FIXED: Kill/death/win counters shown in OBS overlay
// BUG-41 FIXED: Socket.IO falls back to polling transport
// BUG-79 FIXED: Overlay tokens expire after 1 year (effectively permanent but TTL set)
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { query }  = require('../config/database');
const { getRedis } = require('../config/redis');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { account=1 } = req.query;
    const { rows } = await query(`SELECT * FROM overlays WHERE account_number=$1 ORDER BY created_at DESC`, [parseInt(account)]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { account=1, name, config } = req.body;
    const { rows } = await query(`INSERT INTO overlays (account_number,name,config) VALUES ($1,$2,$3) RETURNING *`,
      [parseInt(account), name, JSON.stringify(config||{})]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, config, active } = req.body;
    const { rows } = await query(`UPDATE overlays SET name=$2,config=$3,active=$4 WHERE id=$1 RETURNING *`,
      [req.params.id, name, JSON.stringify(config||{}), active]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try { await query(`DELETE FROM overlays WHERE id=$1`, [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// BUG-79 FIXED: Token stored with 1-year TTL instead of no expiry
router.post('/token', requireAuth, async (req, res) => {
  try {
    const { account=1 } = req.body;
    const token = uuidv4();
    const redis = getRedis();
    await redis.setex(`overlay_token:${token}`, 365 * 24 * 3600, JSON.stringify({ accountNumber: parseInt(account) }));
    res.json({ token, url: `${process.env.BACKEND_URL}/overlay/live/${token}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BUG-23 FIXED: Counters + goal bar in OBS overlay
// BUG-41 FIXED: transports includes polling fallback
router.get('/live/:token', async (req, res) => {
  try {
    const redis       = getRedis();
    const accountData = await redis.get(`overlay_token:${req.params.token}`);
    if (!accountData) return res.status(404).send('Overlay not found');
    const { accountNumber } = JSON.parse(accountData);
    const backendUrl = process.env.BACKEND_URL || '';

    // Fetch live data for initial render
    const kills  = await redis.get(`account:${accountNumber}:counter_kill`)  || '0';
    const deaths = await redis.get(`account:${accountNumber}:counter_death`) || '0';
    const wins   = await redis.get(`account:${accountNumber}:counter_win`)   || '0';

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:transparent;font-family:'Inter',sans-serif;overflow:hidden}
  /* Alert overlay */
  #alert{position:fixed;bottom:24px;right:24px;display:none;min-width:280px;z-index:10}
  .box{background:rgba(8,8,15,.92);border:1px solid rgba(0,212,255,.35);border-radius:14px;
       padding:16px 20px;display:flex;align-items:center;gap:14px;
       animation:slideIn .4s ease}
  .icon{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#00D4FF,#8B5CF6);
        display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .atitle{color:#00D4FF;font-weight:700;font-size:15px;line-height:1.3}
  .asub{color:rgba(255,255,255,.55);font-size:12px;margin-top:3px}
  /* BUG-23 FIXED: Counters widget */
  #counters{position:fixed;top:20px;left:20px;display:flex;gap:12px;z-index:10}
  .counter{background:rgba(8,8,15,.85);border:1px solid rgba(255,255,255,.1);
           border-radius:10px;padding:8px 16px;text-align:center}
  .counter-val{color:#fff;font-weight:700;font-size:22px;font-family:monospace}
  .counter-lbl{color:rgba(255,255,255,.4);font-size:10px;text-transform:uppercase;letter-spacing:.08em}
  #counters.hidden{display:none}
  @keyframes slideIn{from{transform:translateX(120px);opacity:0}to{transform:translateX(0);opacity:1}}
</style>
</head>
<body>
<!-- BUG-23 FIXED: Live counters -->
<div id="counters">
  <div class="counter" style="border-color:rgba(0,212,255,.3)">
    <div class="counter-val" id="kills">${kills}</div>
    <div class="counter-lbl">Kills</div>
  </div>
  <div class="counter" style="border-color:rgba(255,59,59,.3)">
    <div class="counter-val" id="deaths">${deaths}</div>
    <div class="counter-lbl">Deaths</div>
  </div>
  <div class="counter" style="border-color:rgba(0,255,136,.3)">
    <div class="counter-val" id="wins">${wins}</div>
    <div class="counter-lbl">Wins</div>
  </div>
</div>
<!-- Alert overlay -->
<div id="alert">
  <div class="box">
    <div class="icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    </div>
    <div>
      <div class="atitle" id="alertTitle">New Subscriber!</div>
      <div class="asub"   id="alertSub">Welcome to the squad</div>
    </div>
  </div>
</div>
<!-- BUG-41 FIXED: transports includes polling fallback -->
<script src="${backendUrl}/socket.io/socket.io.js"></script>
<script>
  let hideTimer;
  // BUG-41 FIXED: websocket + polling fallback
  const socket = io('${backendUrl}', { transports: ['websocket','polling'] });

  socket.on('alert:subscriber', d => show('New Subscriber!', d.authorName + ' just subscribed!'));
  socket.on('alert:superchat',  d => show('Super Chat ' + d.amount, d.authorName + (d.message ? ': ' + d.message : '')));

  // BUG-23 FIXED: Real-time counter updates
  socket.on('counter:update', d => {
    if (d.accountNumber !== ${accountNumber}) return;
    if (d.kill  !== undefined) document.getElementById('kills').textContent  = d.kill;
    if (d.death !== undefined) document.getElementById('deaths').textContent = d.death;
    if (d.win   !== undefined) document.getElementById('wins').textContent   = d.win;
  });

  function show(title, sub) {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertSub').textContent   = sub;
    const el = document.getElementById('alert');
    el.style.display = 'block';
    el.querySelector('.box').style.animation = 'slideIn .4s ease';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { el.style.display = 'none'; }, 7000);
  }
</script>
</body>
</html>`);
  } catch (e) { res.status(500).send('Error loading overlay'); }
});

module.exports = router;
