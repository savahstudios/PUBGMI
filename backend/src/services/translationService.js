// BUG-75 FIXED: Rate limit detection with dashboard notification
const axios  = require('axios');
const { getCache, setCache } = require('../config/redis');
const { createNotification } = require('./notificationService');
const logger = require('../utils/logger');

const MYMEMORY_URL   = 'https://api.mymemory.translated.net/get';
let rateLimitWarned  = { 1: false, 2: false };
let dailyRequestCount = 0;
const DAILY_LIMIT    = 900; // warn at 900, hard stop at 1000

async function translate(text, targetLang = 'en', accountNumber = 1) {
  if (!text || text.trim().length < 3) return null;

  // BUG-75 FIXED: Track daily requests
  dailyRequestCount++;
  if (dailyRequestCount > DAILY_LIMIT) {
    if (!rateLimitWarned[accountNumber]) {
      rateLimitWarned[accountNumber] = true;
      logger.warn(`MyMemory translation daily limit approaching (${dailyRequestCount} requests). Translation paused until midnight.`);
      await createNotification(accountNumber, 'system', 'api_quota_warning', {
        percent: 90,
        service: 'MyMemory Translation',
        message: 'Translation daily limit reached — translations paused until midnight'
      });
    }
    return null;
  }

  // Reset daily counter at midnight
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    dailyRequestCount = 0;
    rateLimitWarned = { 1: false, 2: false };
  }

  const cacheKey = `translate:${targetLang}:${Buffer.from(text).toString('base64').slice(0, 40)}`;
  const cached   = await getCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(MYMEMORY_URL, {
      params: { q: text, langpair: `|${targetLang}` },
      timeout: 4000
    });

    if (response.data?.responseStatus === 200) {
      const translated   = response.data.responseData?.translatedText;
      const detectedLang = response.data.responseData?.detectedLanguage;

      // Don't return if detected as English
      if (!translated || detectedLang === 'EN' || detectedLang === 'en') return null;
      if (translated === text) return null; // No translation happened

      await setCache(cacheKey, translated, 3600);
      return translated;
    }

    // BUG-75 FIXED: Detect rate limit response from MyMemory
    if (response.data?.responseStatus === 429 || response.data?.responseDetails?.includes('LIMIT')) {
      if (!rateLimitWarned[accountNumber]) {
        rateLimitWarned[accountNumber] = true;
        logger.warn('MyMemory translation rate limit hit');
        await createNotification(accountNumber, 'system', 'api_quota_warning', {
          percent: 100, service: 'MyMemory Translation',
          message: 'Translation rate limit hit — service paused temporarily'
        });
      }
      return null;
    }

    return null;
  } catch (err) {
    if (err.code !== 'ECONNABORTED') logger.error('Translation error:', err.message);
    return null;
  }
}

module.exports = { translate };
