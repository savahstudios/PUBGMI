// BUG-55 FIXED: getRedis() returns null instead of throwing before connect
// Callers should handle null gracefully
const Redis  = require('ioredis');
const logger = require('../utils/logger');

let redis = null;

async function connectRedis() {
  redis = new Redis(process.env.REDIS_URL, {
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false
  });

  redis.on('error',       err  => logger.error('Redis error:', err.message));
  redis.on('connect',     ()   => logger.info('Redis connection established'));
  redis.on('reconnecting',()   => logger.warn('Redis reconnecting...'));

  await redis.ping();
  return redis;
}

// BUG-55 FIXED: Return null instead of throwing — callers check for null
function getRedis() {
  return redis; // null before connectRedis() is called
}

async function setCache(key, value, ttlSeconds = 300) {
  if (!redis) return;
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

async function getCache(key) {
  if (!redis) return null;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function deleteCache(key) {
  if (!redis) return;
  await redis.del(key);
}

async function incrementCounter(key, ttlSeconds = 86400) {
  if (!redis) return 0;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttlSeconds);
  return count;
}

async function setWithExpiry(key, value, ttlSeconds) {
  if (!redis) return;
  await redis.setex(key, ttlSeconds, typeof value === 'string' ? value : JSON.stringify(value));
}

async function publishEvent(channel, data) {
  if (!redis) return;
  await redis.publish(channel, JSON.stringify(data));
}

module.exports = {
  connectRedis, getRedis,
  setCache, getCache, deleteCache,
  incrementCounter, setWithExpiry, publishEvent
};
