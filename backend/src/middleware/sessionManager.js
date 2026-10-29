// BUG-56 FIXED: Race condition prevented with Redis atomic SET NX
const { v4: uuidv4 } = require('uuid');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { getRedis } = require('../config/redis');
const { query }    = require('../config/database');
const logger = require('../utils/logger');

const SESSION_DURATION          = 7  * 24 * 60 * 60;
const SESSION_DURATION_EXTENDED = 30 * 24 * 60 * 60;

function generateUniqueSessionId(telegramUserId, ip, userAgent, timestamp) {
  const components = [
    uuidv4(),
    telegramUserId.toString(),
    ip,
    userAgent,
    timestamp.toString(),
    process.env.SESSION_SALT
  ].join('|');
  return crypto.createHash('sha256').update(components).digest('hex');
}

async function createSession(telegramUserId, req, rememberMe = false) {
  const redis     = getRedis();
  const timestamp = Date.now();
  const ip        = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  // BUG-56 FIXED: Use Lua script for atomic check-and-replace
  // This prevents the race condition where two simultaneous logins both pass the "no existing session" check
  const sessionId = generateUniqueSessionId(telegramUserId, ip, userAgent, timestamp);
  const duration  = rememberMe ? SESSION_DURATION_EXTENDED : SESSION_DURATION;
  const device    = parseUserAgent(userAgent);

  const sessionData = {
    sessionId, telegramUserId, device, ip, userAgent,
    loginTime:  new Date(timestamp).toISOString(),
    lastActive: new Date(timestamp).toISOString(),
    expiresAt:  new Date(timestamp + duration * 1000).toISOString(),
    rememberMe
  };

  // Lua script: atomically kill old session and set new one
  const luaScript = `
    local oldKey = redis.call('GET', KEYS[1])
    if oldKey then
      redis.call('DEL', 'session:' .. oldKey)
    end
    redis.call('SETEX', KEYS[1], ARGV[1], ARGV[2])
    redis.call('SETEX', KEYS[2], ARGV[1], ARGV[3])
    return 1
  `;

  await redis.eval(
    luaScript, 2,
    `user_session:${telegramUserId}`,
    `session:${sessionId}`,
    duration,
    sessionId,
    JSON.stringify(sessionData)
  );

  // Log to database
  try {
    await query(`
      INSERT INTO session_log (session_id,telegram_user_id,device,ip,login_time,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [sessionId, telegramUserId, device, ip, sessionData.loginTime, sessionData.expiresAt]);
  } catch (err) {
    logger.error('sessionManager DB log error:', err.message);
  }

  const token = jwt.sign(
    { sessionId, telegramUserId, device },
    process.env.JWT_SECRET,
    { expiresIn: duration }
  );

  return { token, sessionData, duration };
}

async function destroySession(sessionId) {
  const redis = getRedis();
  const raw   = await redis.get(`session:${sessionId}`);
  if (raw) {
    const session = JSON.parse(raw);
    await redis.del(`session:${sessionId}`);
    await redis.del(`user_session:${session.telegramUserId}`);
    try {
      await query(`UPDATE session_log SET logout_time=NOW() WHERE session_id=$1`, [sessionId]);
    } catch (_) {}
  }
}

async function destroyAllSessions(telegramUserId) {
  const redis     = getRedis();
  const sessionId = await redis.get(`user_session:${telegramUserId}`);
  if (sessionId) await destroySession(sessionId);
}

async function getActiveSessions(telegramUserId) {
  try {
    const { rows } = await query(`
      SELECT session_id,device,ip,login_time,expires_at,logout_time
      FROM session_log WHERE telegram_user_id=$1
      ORDER BY login_time DESC LIMIT 10
    `, [telegramUserId]);
    return rows;
  } catch (_) { return []; }
}

function parseUserAgent(ua) {
  if (!ua) return 'Unknown Device';
  let browser = 'Unknown', os = 'Unknown';
  if (ua.includes('Chrome'))   browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari'))  browser = 'Safari';
  else if (ua.includes('Edge'))    browser = 'Edge';
  if (ua.includes('Windows'))   os = 'Windows';
  else if (ua.includes('iPhone'))  os = 'iPhone';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Mac'))     os = 'macOS';
  else if (ua.includes('Linux'))   os = 'Linux';
  return `${browser} · ${os}`;
}

module.exports = { createSession, destroySession, destroyAllSessions, getActiveSessions };
