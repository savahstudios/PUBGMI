// youtubeApiService.js — v1.1.0
// BUG-08 FIXED: Increments API quota counter on every call
// BUG-85: Logs moderator permission failures clearly
const { getBotClient, getChannel1Client, getChannel2Client } = require('../config/youtube');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

// BUG-08 FIXED: Track quota usage
async function incrementQuota(accountNumber, units = 1) {
  try {
    const redis = getRedis();
    const key   = `api_quota:${accountNumber}`;
    const count = await redis.incr(key);
    if (count === 1) {
      // Expire at midnight Pacific Time (UTC-8)
      const now      = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(8, 0, 0, 0); // midnight PT = 08:00 UTC
      if (midnight <= now) midnight.setUTCDate(midnight.getUTCDate() + 1);
      const ttl = Math.floor((midnight - now) / 1000);
      await redis.expire(key, ttl);
    }
    // Warn at 70%, 85%, 95%
    const limit = 10000;
    const pct   = Math.floor((count / limit) * 100);
    if ([70, 85, 95].includes(pct)) {
      const { createNotification } = require('./notificationService');
      await createNotification(accountNumber, 'system', 'api_quota_warning', { percent: pct });
    }
  } catch (err) {
    logger.error('incrementQuota error:', err.message);
  }
}

async function sendChatMessage(accountNumber, message) {
  try {
    const redis      = getRedis();
    const liveChatId = await redis.get(`account:${accountNumber}:live_chat_id`);
    if (!liveChatId) {
      logger.warn(`sendChatMessage: no live_chat_id for account ${accountNumber}`);
      return false;
    }
    const botClient = getBotClient();
    await botClient.youtube.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: { messageText: String(message).slice(0, 200) }
        }
      }
    });
    await incrementQuota(accountNumber, 50); // Chat message insert costs 50 units
    return true;
  } catch (error) {
    logger.error(`sendChatMessage error account ${accountNumber}:`, error.message);
    return false;
  }
}

async function banUser(accountNumber, liveChatId, channelId, durationSeconds = 0) {
  try {
    if (!liveChatId || !channelId) {
      logger.warn(`banUser: missing liveChatId or channelId for account ${accountNumber}`);
      return false;
    }
    const client = accountNumber === 2 ? getChannel2Client() : getChannel1Client();
    await client.youtube.liveChatBans.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId,
          type: durationSeconds > 0 ? 'temporary' : 'permanent',
          bannedUserDetails: { channelId },
          ...(durationSeconds > 0 && { banDurationSeconds: durationSeconds })
        }
      }
    });
    await incrementQuota(accountNumber, 50);
    return true;
  } catch (error) {
    // BUG-85: Log moderator permission failure clearly
    if (error.message?.includes('403') || error.message?.includes('forbidden')) {
      logger.error(`banUser PERMISSION DENIED on account ${accountNumber}. Ensure bot is added as Managing Moderator in YouTube Studio.`);
    } else {
      logger.error(`banUser error:`, error.message);
    }
    return false;
  }
}

async function deleteMessage(accountNumber, messageId) {
  try {
    if (!messageId) return false;
    const client = accountNumber === 2 ? getChannel2Client() : getChannel1Client();
    await client.youtube.liveChatMessages.delete({ id: messageId });
    await incrementQuota(accountNumber, 50);
    return true;
  } catch (error) {
    if (error.message?.includes('403')) {
      logger.error(`deleteMessage PERMISSION DENIED on account ${accountNumber}. Bot must be Managing Moderator.`);
    } else {
      logger.error(`deleteMessage error:`, error.message);
    }
    return false;
  }
}

module.exports = { sendChatMessage, banUser, deleteMessage, incrementQuota };
