// BUG-22: Hype train detection on sub/donation spikes
const { getRedis } = require('../config/redis');
const { sendChatMessage } = require('./youtubeApiService');
const { createNotification } = require('./notificationService');
const logger = require('../utils/logger');

const HYPE_THRESHOLDS = { subs: 3, superchats: 2, combined: 4 };
const HYPE_COOLDOWN_SECONDS = 300; // 5 minute cooldown between hype trains

const HYPE_MESSAGES = [
  'HYPE TRAIN IS GOING! This community is incredible! 🔥🔥🔥',
  'THE SQUAD IS GOING CRAZY! Keep it coming! 🚂💨',
  'INSANE SUPPORT! You all are absolute legends! 🏆',
  'HYPE TRAIN! This is what PUBGMI is all about! 🎮🔥'
];

async function recordSubEvent(accountNumber, io) {
  await incrementSpike(accountNumber, 'subs', io);
}

async function recordSuperChatEvent(accountNumber, io) {
  await incrementSpike(accountNumber, 'superchats', io);
}

async function incrementSpike(accountNumber, type, io) {
  try {
    const redis   = getRedis();
    const isLive  = await redis.get(`account:${accountNumber}:live`) === 'true';
    if (!isLive) return;

    // Increment spike counter with 60s window
    const key   = `hype:${accountNumber}:${type}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);

    // Check combined
    const subCount  = parseInt(await redis.get(`hype:${accountNumber}:subs`)         || 0);
    const scCount   = parseInt(await redis.get(`hype:${accountNumber}:superchats`)   || 0);
    const combined  = subCount + scCount;

    const shouldFire =
      subCount   >= HYPE_THRESHOLDS.subs        ||
      scCount    >= HYPE_THRESHOLDS.superchats   ||
      combined   >= HYPE_THRESHOLDS.combined;

    if (!shouldFire) return;

    // Check cooldown
    const cooldownKey  = `hype:${accountNumber}:cooldown`;
    const onCooldown   = await redis.get(cooldownKey);
    if (onCooldown) return;

    // Fire hype train
    await redis.setex(cooldownKey, HYPE_COOLDOWN_SECONDS, '1');
    await redis.del(`hype:${accountNumber}:subs`);
    await redis.del(`hype:${accountNumber}:superchats`);

    const msg = HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)];
    await sendChatMessage(accountNumber, msg);

    const triggerType = subCount >= HYPE_THRESHOLDS.subs ? 'subscriber' : 'superchat';
    await createNotification(accountNumber, 'community', 'hype_train', { triggerType, subCount, scCount });
    io?.emit('hype:train', { accountNumber, triggerType });
    logger.info(`Hype train fired account ${accountNumber}`);
  } catch (err) {
    logger.error('hypeTrain error:', err.message);
  }
}

module.exports = { recordSubEvent, recordSuperChatEvent };
