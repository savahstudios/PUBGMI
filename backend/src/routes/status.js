const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../config/database');
const { getRedis } = require('../config/redis');
const { getWatchdogStats } = require('../services/watchdogService');
const { getFullVersion, CHANGELOG } = require('../utils/version');

// Public health check — Railway pings this
router.get('/ping', (req, res) => {
  res.json({ pong: true, latency: Date.now(), timestamp: new Date().toISOString(), version: getFullVersion() });
});

// Full status — authenticated
router.get('/', requireAuth, async (req, res) => {
  const redis = getRedis();
  const stats = getWatchdogStats();

  // DB latency
  let dbStatus = 'online', dbLatency = 0;
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    dbLatency = Date.now() - t0;
  } catch { dbStatus = 'offline'; }

  // Redis latency
  let redisStatus = 'online', redisLatency = 0;
  try {
    const t0 = Date.now();
    await redis.ping();
    redisLatency = Date.now() - t0;
  } catch { redisStatus = 'offline'; }

  const account1Live = await redis.get('account:1:live') === 'true';
  const account2Live = await redis.get('account:2:live') === 'true';

  const mem     = stats.memoryUsage;
  const memMB   = Math.floor(mem.heapUsed   / 1024 / 1024);
  const memTot  = Math.floor(mem.heapTotal  / 1024 / 1024);

  // API quota usage
  const quota1 = parseInt(await redis.get('api_quota:1') || '0');
  const quota2 = parseInt(await redis.get('api_quota:2') || '0');

  res.json({
    timestamp:  new Date().toISOString(),
    version:    getFullVersion(),
    latestChanges: CHANGELOG[0],
    bot: {
      status:        'online',
      uptime:        stats.uptime,
      restartCount:  stats.restartCount,
      lastHeartbeat: stats.lastHeartbeat
    },
    youtube: {
      account1: { connected: !!process.env.YOUTUBE_REFRESH_TOKEN_1, live: account1Live, quota: quota1 },
      account2: { connected: !!process.env.YOUTUBE_REFRESH_TOKEN_2, live: account2Live, quota: quota2 }
    },
    database:  { status: dbStatus,    latencyMs: dbLatency },
    redis:     { status: redisStatus, latencyMs: redisLatency },
    system:    { memoryUsedMB: memMB, memoryTotalMB: memTot }
  });
});

module.exports = router;
