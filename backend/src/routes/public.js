const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { getRedis } = require('../config/redis');

// Public schedule page for viewers — no auth required
router.get('/schedule', async (req, res) => {
  try {
    const redis = getRedis();
    const isLive1 = await redis.get('account:1:live') === 'true';
    const isLive2 = await redis.get('account:2:live') === 'true';
    const isLive = isLive1 || isLive2;

    const { rows: settings } = await query(
      `SELECT stream_schedule, socials FROM settings WHERE account_number = 1`
    );
    const { rows: videos } = await query(
      `SELECT title, youtube_video_id, published_at FROM videos 
       WHERE account_number = 1 ORDER BY published_at DESC LIMIT 5`
    );

    const schedule = settings[0]?.stream_schedule || 'Check back soon!';
    const socials = settings[0]?.socials ? JSON.parse(settings[0].socials) : {};

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="PUBGMI — Stream Schedule">
<title>PUBGMI — Stream Info</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #08080F; color: #fff; font-family: 'Inter', sans-serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 16px; }
  .container { width: 100%; max-width: 560px; }
  .logo { text-align: center; margin-bottom: 32px; }
  .logo h1 { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #00D4FF, #8B5CF6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .logo p { color: rgba(255,255,255,0.3); font-size: 13px; margin-top: 4px; }
  .card { background: rgba(15,15,30,0.6); border: 1px solid rgba(0,212,255,0.15); border-radius: 16px; padding: 24px; margin-bottom: 16px; }
  .live-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,59,59,0.15); border: 1px solid rgba(255,59,59,0.3); border-radius: 99px; padding: 6px 14px; margin-bottom: 16px; }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #FF3B3B; animation: pulse 1.5s infinite; }
  .offline-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 99px; padding: 6px 14px; margin-bottom: 16px; }
  .offline-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.2); }
  .status-text { font-size: 14px; font-weight: 600; color: ${isLive ? '#FF3B3B' : 'rgba(255,255,255,0.4)'}; }
  h2 { font-size: 15px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; font-size: 11px; }
  .schedule-text { color: rgba(255,255,255,0.8); font-size: 15px; line-height: 1.6; }
  .socials { display: flex; flex-wrap: wrap; gap: 10px; }
  .social-link { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2); border-radius: 8px; color: #00D4FF; text-decoration: none; font-size: 13px; font-weight: 500; transition: all 0.2s; }
  .social-link:hover { background: rgba(0,212,255,0.15); }
  .video-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .video-item:last-child { border-bottom: none; }
  .video-title { color: rgba(255,255,255,0.7); font-size: 13px; flex: 1; }
  .video-link { color: #00D4FF; font-size: 12px; text-decoration: none; }
  .footer { text-align: center; color: rgba(255,255,255,0.15); font-size: 12px; margin-top: 24px; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
</style>
</head>
<body>
<div class="container">
  <div class="logo">
    <h1>PUBGMI</h1>
    <p>Stream Info & Schedule</p>
  </div>

  <div class="card">
    ${isLive
      ? '<div class="live-badge"><div class="live-dot"></div><span class="status-text">LIVE RIGHT NOW</span></div>'
      : '<div class="offline-badge"><div class="offline-dot"></div><span class="status-text">Currently Offline</span></div>'
    }
    <h2>Next Stream</h2>
    <p class="schedule-text">${schedule}</p>
  </div>

  ${Object.values(socials).some(v => v) ? `
  <div class="card">
    <h2>Follow Everywhere</h2>
    <div class="socials">
      ${Object.entries(socials).filter(([,v]) => v).map(([k, v]) =>
        `<a href="${v}" target="_blank" class="social-link">${k}</a>`
      ).join('')}
    </div>
  </div>` : ''}

  ${videos.length ? `
  <div class="card">
    <h2>Recent Videos</h2>
    ${videos.map(v => `
      <div class="video-item">
        <span class="video-title">${v.title}</span>
        <a href="https://youtube.com/watch?v=${v.youtube_video_id}" target="_blank" class="video-link">Watch →</a>
      </div>
    `).join('')}
  </div>` : ''}

  <div class="footer">
    <p>Updated: ${new Date().toLocaleString('en-GB')}</p>
  </div>
</div>
</body>
</html>`);
  } catch (e) {
    res.status(500).send('Error loading schedule');
  }
});

module.exports = router;
