// BUG-15 FIXED: Reads timed_messages from DB and sends on schedule
const { query } = require('../config/database');
const { getRedis } = require('../config/redis');
const { sendChatMessage } = require('./youtubeApiService');
const logger = require('../utils/logger');

let timedIntervals = {};
let messageIndexes = { 1: 0, 2: 0 };

async function startTimedMessageService() {
  logger.info('Timed message service starting...');
  await loadAndSchedule(1);
  await loadAndSchedule(2);
  // Reload settings every 5 minutes in case they changed
  setInterval(() => { loadAndSchedule(1); loadAndSchedule(2); }, 300000);
}

async function loadAndSchedule(accountNumber) {
  try {
    const { rows } = await query(`
      SELECT messages, interval_seconds FROM timed_messages
      WHERE account_number=$1 AND active=true LIMIT 1
    `, [accountNumber]);

    if (!rows.length) return;
    const { messages, interval_seconds } = rows[0];
    const parsedMessages = Array.isArray(messages) ? messages : JSON.parse(messages || '[]');
    if (!parsedMessages.length) return;

    scheduleForAccount(accountNumber, parsedMessages, interval_seconds);
  } catch (err) {
    logger.error(`timedMessageService loadAndSchedule ${accountNumber}:`, err.message);
  }
}

function scheduleForAccount(accountNumber, messages, intervalSeconds) {
  if (timedIntervals[accountNumber]) {
    clearInterval(timedIntervals[accountNumber]);
  }
  timedIntervals[accountNumber] = setInterval(async () => {
    try {
      const redis  = getRedis();
      const isLive = await redis.get(`account:${accountNumber}:live`) === 'true';
      if (!isLive) return;

      const msg = messages[messageIndexes[accountNumber] % messages.length];
      messageIndexes[accountNumber]++;
      await sendChatMessage(accountNumber, msg);
      logger.info(`Timed message sent account ${accountNumber}`);
    } catch (err) {
      logger.error(`timedMessage interval ${accountNumber}:`, err.message);
    }
  }, (intervalSeconds || 600) * 1000);
}

async function updateTimedMessages(accountNumber, messages, intervalSeconds) {
  await query(`
    INSERT INTO timed_messages (account_number, messages, interval_seconds, active)
    VALUES ($1,$2,$3,true)
    ON CONFLICT DO NOTHING
  `, [accountNumber, JSON.stringify(messages), intervalSeconds]);
  await query(`
    UPDATE timed_messages SET messages=$2, interval_seconds=$3, active=true WHERE account_number=$1
  `, [accountNumber, JSON.stringify(messages), intervalSeconds]);
  scheduleForAccount(accountNumber, messages, intervalSeconds);
}

module.exports = { startTimedMessageService, updateTimedMessages };
