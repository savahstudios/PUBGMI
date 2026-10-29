// BUG-33 FIXED: Watchdog now monitors actual service health, not just heartbeat
// BUG-54 FIXED: createNotification wrapped in try-catch for pre-DB startup safety
const logger = require('../utils/logger');

let restartCount  = 0;
let startTime     = Date.now();
let dbReady       = false;
let watchdogTimer = null;

function markDatabaseReady() { dbReady = true; }

function startWatchdog(server) {
  logger.info('Watchdog: monitoring service health');

  // BUG-33 FIXED: Monitor actual service indicators
  watchdogTimer = setInterval(async () => {
    try {
      // Check PostgreSQL
      const { pool }  = require('../config/database');
      await pool.query('SELECT 1');

      // Check Redis
      const { getRedis } = require('../config/redis');
      await getRedis().ping();

      // Check Telegram bot is polling
      const { getBot } = require('../telegram/bot');
      const bot = getBot();
      if (bot && !bot.isPolling()) {
        logger.warn('Watchdog: Telegram polling stopped — attempting restart');
        bot.startPolling();
      }

    } catch (err) {
      logger.error('Watchdog health check failed:', err.message);
      restartCount++;

      // BUG-54 FIXED: Only notify if DB is ready
      if (dbReady) {
        try {
          const { createNotification } = require('./notificationService');
          await createNotification(1, 'system', 'bot_restart', {
            reason: err.message, restartCount
          });
        } catch (_) {}
      }
    }
  }, 30000); // Check every 30 seconds

  // Graceful shutdown
  process.on('SIGTERM', () => {
    if (watchdogTimer) clearInterval(watchdogTimer);
    logger.info('Watchdog stopped');
  });

  // BUG-54 FIXED: Wrap uncaughtException notification in safety check
  process.on('uncaughtException', async (err) => {
    logger.error('Uncaught exception:', err);
    restartCount++;
    if (dbReady) {
      try {
        const { createNotification } = require('./notificationService');
        await createNotification(1, 'system', 'bot_restart', { reason: err.message, restartCount });
      } catch (_) {}
    }
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });
}

function getWatchdogStats() {
  return {
    uptime:       Math.floor((Date.now() - startTime) / 1000),
    restartCount,
    lastHeartbeat: new Date().toISOString(),
    memoryUsage:  process.memoryUsage(),
    cpuUsage:     process.cpuUsage()
  };
}

module.exports = { startWatchdog, getWatchdogStats, markDatabaseReady };
