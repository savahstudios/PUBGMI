// BUG-74 FIXED: Only sends for accounts that have credentials configured
const { getRedis } = require('../config/redis');
const { sendChatMessage } = require('./youtubeApiService');
const logger = require('../utils/logger');

const DEFAULT_GUIDE_MESSAGES = [
  'Type !rank to see your PUBG Mobile rank — climb from Bronze to Conqueror!',
  'Want to play with me? Type !join [your in-game name] to join the squad queue!',
  'Type !sp to check your Stream Points | !shop to see what you can redeem!',
  'Earn SP by chatting and watching! Use !checkin for your daily bonus!',
  'Type !top to see the leaderboard — can you reach Conqueror rank?',
  'Type !challenges to see your daily, weekly, and monthly missions!',
  'Type !socials for all my links | !schedule for the next stream!',
  'Top viewers earn real rewards — squad invites, shoutouts and more! Type !rewards!',
  'Type !streak to check your watch streak — longer streaks = more SP!',
  'Conqueror is held by the TOP 10 only — type !rank to see your progress!'
];

let guideIntervals = {};
let messageIndexes = { 1: 0, 2: 0 };

function isAccountConfigured(accountNumber) {
  // BUG-74 FIXED: Only run for accounts that have credentials
  const token = accountNumber === 2
    ? process.env.YOUTUBE_REFRESH_TOKEN_2
    : process.env.YOUTUBE_REFRESH_TOKEN_1;
  return !!token;
}

async function startBotGuideScheduler() {
  const intervalSeconds = parseInt(process.env.BOT_GUIDE_INTERVAL || '600');
  logger.info(`Bot guide scheduler — interval: ${intervalSeconds}s`);
  for (const accountNumber of [1, 2]) {
    if (!isAccountConfigured(accountNumber)) {
      logger.info(`Bot guide skipped for account ${accountNumber} — credentials not configured`);
      continue;
    }
    scheduleGuideForAccount(accountNumber, intervalSeconds);
  }
}

function scheduleGuideForAccount(accountNumber, intervalSeconds) {
  if (guideIntervals[accountNumber]) clearInterval(guideIntervals[accountNumber]);

  guideIntervals[accountNumber] = setInterval(async () => {
    try {
      const redis  = getRedis();
      const isLive = await redis.get(`account:${accountNumber}:live`) === 'true';
      if (!isLive) return;

      const messages = await getGuideMessages(accountNumber);
      const msg      = messages[messageIndexes[accountNumber] % messages.length];
      messageIndexes[accountNumber]++;
      await sendChatMessage(accountNumber, msg);
    } catch (err) {
      logger.error(`Bot guide error account ${accountNumber}:`, err.message);
    }
  }, intervalSeconds * 1000);
}

async function getGuideMessages(accountNumber) {
  try {
    const redis = getRedis();
    const raw   = await redis.get(`account:${accountNumber}:guide_messages`);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p; }
  } catch (_) {}
  return DEFAULT_GUIDE_MESSAGES;
}

async function updateGuideInterval(accountNumber, newIntervalSeconds) {
  scheduleGuideForAccount(accountNumber, newIntervalSeconds);
}

async function stopGuideForAccount(accountNumber) {
  if (guideIntervals[accountNumber]) { clearInterval(guideIntervals[accountNumber]); delete guideIntervals[accountNumber]; }
}

module.exports = { startBotGuideScheduler, updateGuideInterval, stopGuideForAccount };
