// websubService.js — v1.1.0
// BUG-24 FIXED: Warn if channel IDs missing
// BUG-67 FIXED: Retry with exponential backoff
const axios = require('axios');
const crypto = require('crypto');
const { createNotification } = require('./notificationService');
const logger = require('../utils/logger');

const WEBSUB_HUB       = 'https://pubsubhubbub.appspot.com/subscribe';
const YOUTUBE_FEED_BASE = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=';

const CHANNEL_IDS = {
  1: process.env.YOUTUBE_CHANNEL_ID_1,
  2: process.env.YOUTUBE_CHANNEL_ID_2
};

async function startWebSubService() {
  let subscribed = 0;
  for (const [accountNumber, channelId] of Object.entries(CHANNEL_IDS)) {
    if (!channelId) {
      // BUG-24 FIXED: Warn instead of silently skip
      logger.warn(`WebSub: YOUTUBE_CHANNEL_ID_${accountNumber} is not set — new video push notifications disabled for account ${accountNumber}. Add this to Railway env vars.`);
      continue;
    }
    await subscribeWithRetry(parseInt(accountNumber), channelId);
    subscribed++;
  }
  if (subscribed > 0) {
    // Re-subscribe every 9 days (subscriptions expire after 10 days)
    setInterval(async () => {
      for (const [accountNumber, channelId] of Object.entries(CHANNEL_IDS)) {
        if (channelId) await subscribeWithRetry(parseInt(accountNumber), channelId);
      }
    }, 9 * 24 * 60 * 60 * 1000);
  }
}

// BUG-67 FIXED: Retry with exponential backoff
async function subscribeWithRetry(accountNumber, channelId, attempt = 1) {
  const maxAttempts = 5;
  try {
    await subscribe(accountNumber, channelId);
  } catch (err) {
    if (attempt < maxAttempts) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000); // 2s, 4s, 8s, 16s, 30s
      logger.warn(`WebSub subscribe failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs/1000}s...`);
      setTimeout(() => subscribeWithRetry(accountNumber, channelId, attempt + 1), delayMs);
    } else {
      logger.error(`WebSub subscribe permanently failed for account ${accountNumber} after ${maxAttempts} attempts`);
    }
  }
}

async function subscribe(accountNumber, channelId) {
  const callbackUrl = `${process.env.BACKEND_URL}/webhooks/youtube/${accountNumber}`;
  const topicUrl    = `${YOUTUBE_FEED_BASE}${channelId}`;

  await axios.post(WEBSUB_HUB, new URLSearchParams({
    'hub.callback':       callbackUrl,
    'hub.topic':          topicUrl,
    'hub.verify':         'async',
    'hub.mode':           'subscribe',
    'hub.secret':         process.env.WEBSUB_SECRET,
    'hub.lease_seconds':  '864000'
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  logger.info(`WebSub subscribed for account ${accountNumber} — channel: ${channelId}`);
}

function verifySignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const hmac     = crypto.createHmac('sha1', secret);
  hmac.update(body);
  const expected = `sha1=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (_) { return false; }
}

async function handleNewVideo(accountNumber, videoData) {
  logger.info(`New video detected account ${accountNumber}: ${videoData.title}`);
  await createNotification(accountNumber, 'content', 'new_video', {
    title: videoData.title,
    videoId: videoData.videoId,
    url: `https://youtube.com/watch?v=${videoData.videoId}`
  });

  // BUG-76: Post to YouTube community tab would need OAuth and YouTube API
  // For now: notification is created and Telegram push fires via notification service
  try { const { pushNotification } = require('../telegram/bot'); await pushNotification('new_video', videoData); } catch(_){}
}

module.exports = { startWebSubService, verifySignature, handleNewVideo };
