const jwt = require('jsonwebtoken');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.pubgmi_session || 
                  req.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No session token', redirect: '/login' });
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired', redirect: '/session-expired' });
      }
      return res.status(401).json({ error: 'Invalid token', redirect: '/login' });
    }

    // Verify session still exists in Redis
    const redis = getRedis();
    const sessionData = await redis.get(`session:${decoded.sessionId}`);

    if (!sessionData) {
      return res.status(401).json({ error: 'Session not found', redirect: '/session-expired' });
    }

    const session = JSON.parse(sessionData);

    // Update last active timestamp
    session.lastActive = new Date().toISOString();
    const ttl = await redis.ttl(`session:${decoded.sessionId}`);
    if (ttl > 0) {
      await redis.setex(`session:${decoded.sessionId}`, ttl, JSON.stringify(session));
    }

    req.user = decoded;
    req.session = session;
    next();

  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

// Telegram authorization guard — completely ignores unauthorized users
function requireTelegramAuth(telegramUserId) {
  const authorizedIds = process.env.AUTHORIZED_TELEGRAM_IDS
    ?.split(',')
    .map(id => parseInt(id.trim()))
    || [];
  
  return authorizedIds.includes(telegramUserId);
}

module.exports = { requireAuth, requireTelegramAuth };
