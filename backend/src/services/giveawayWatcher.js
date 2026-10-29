// BUG-35 FIXED: Polling-based giveaway expiry — survives bot restarts
const { getRedis } = require('../config/redis');
const { query }    = require('../config/database');
const { sendChatMessage } = require('./youtubeApiService');
const { createNotification } = require('./notificationService');
const logger = require('../utils/logger');

let watcherInterval = null;

function startGiveawayWatcher(io) {
  // Check every 15 seconds for expired giveaways
  watcherInterval = setInterval(async () => {
    await checkExpiredGiveaways(io);
  }, 15000);
  logger.info('Giveaway watcher started');
}

async function checkExpiredGiveaways(io) {
  const redis = getRedis();
  if (!redis) return;

  for (const accountNumber of [1, 2]) {
    try {
      const raw = await redis.get(`account:${accountNumber}:giveaway`);
      if (!raw) continue;

      const giveaway = JSON.parse(raw);
      const endsAt   = new Date(giveaway.endsAt);

      if (Date.now() < endsAt.getTime()) continue; // Not expired yet

      // Giveaway has expired — pick winner
      logger.info(`Giveaway expired for account ${accountNumber}, picking winner...`);
      await pickAndAnnounceWinner(accountNumber, giveaway, redis, io);
    } catch (err) {
      logger.error(`Giveaway watcher error account ${accountNumber}:`, err.message);
    }
  }
}

async function pickAndAnnounceWinner(accountNumber, giveaway, redis, io) {
  // Remove from Redis first to prevent double-pick
  await redis.del(`account:${accountNumber}:giveaway`);

  const entries = giveaway.entryList || [];

  if (!entries.length) {
    await sendChatMessage(accountNumber, `Giveaway ended with no entries. Better luck next time!`);
    logger.info(`Giveaway ended with no entries for account ${accountNumber}`);
    return;
  }

  const winner = entries[Math.floor(Math.random() * entries.length)];

  // Store in database
  try {
    await query(`
      INSERT INTO giveaways (account_number, keyword, entries, winner_username, ended_at)
      VALUES ($1,$2,$3,$4,NOW())
    `, [accountNumber, giveaway.keyword, entries.length, winner]);
  } catch (err) {
    logger.error('Giveaway DB insert error:', err.message);
  }

  await sendChatMessage(accountNumber,
    `GIVEAWAY ENDED! WINNER: @${winner} Congratulations! You won! Please respond within 2 minutes to claim your prize!`
  );

  await createNotification(accountNumber, 'community', 'giveaway_winner', {
    winner,
    entries: entries.length,
    keyword: giveaway.keyword
  });

  // Emit to dashboard
  io?.emit('giveaway:winner', { accountNumber, winner, entries: entries.length });

  // Push Telegram notification
  try {
    const { pushNotification } = require('../telegram/bot');
    await pushNotification('giveaway_winner', { winner, entries: entries.length });
  } catch (_) {}

  logger.info(`Giveaway winner picked: ${winner} (${entries.length} entries) for account ${accountNumber}`);
}

function stopGiveawayWatcher() {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
  }
}

module.exports = { startGiveawayWatcher, stopGiveawayWatcher };
