// BUG-40 FIXED: Telegram HMAC verification
// BUG-51 FIXED: Rate limiting on auth endpoint
// BUG-83 FIXED: sameSite changed to 'lax'
const express    = require('express');
const router     = express.Router();
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');
const { createOAuthClient, SCOPES } = require('../config/youtube');
const { createSession, destroySession, destroyAllSessions, getActiveSessions } = require('../middleware/sessionManager');
const { requireAuth, requireTelegramAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// BUG-51 FIXED: Rate limit — max 10 login attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'too_many_attempts', message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// BUG-40 FIXED: Verify Telegram HMAC hash
function verifyTelegramHash(data) {
  const { hash, ...rest } = data;
  if (!hash) return false;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  // Build data-check-string: sorted key=value pairs
  const checkString = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('\n');

  // Secret key = SHA256 of bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

// ── TELEGRAM OAUTH LOGIN ──────────────────────────────────────────────────────
router.post('/telegram', loginLimiter, async (req, res) => {
  try {
    const telegramData = req.body;
    const telegramUserId = parseInt(telegramData.id);

    if (!telegramUserId) {
      return res.status(400).json({ error: 'missing_id' });
    }

    // BUG-40 FIXED: Verify Telegram signature
    if (!verifyTelegramHash(telegramData)) {
      logger.warn(`Invalid Telegram hash from IP ${req.ip} for user ${telegramUserId}`);
      return res.status(403).json({ error: 'invalid_signature', redirect: '/403' });
    }

    // Check authorization
    if (!requireTelegramAuth(telegramUserId)) {
      logger.warn(`Unauthorized login attempt: Telegram ID ${telegramUserId} from IP ${req.ip}`);
      return res.status(403).json({ error: 'access_denied', redirect: '/403' });
    }

    // Check auth_date freshness (must be within 24 hours)
    const authDate = parseInt(telegramData.auth_date || 0);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return res.status(403).json({ error: 'auth_expired', redirect: '/login' });
    }

    const rememberMe = req.body.rememberMe === true;
    const { token, sessionData, duration } = await createSession(telegramUserId, req, rememberMe);

    // BUG-83 FIXED: sameSite 'lax' for OAuth redirect compatibility
    res.cookie('pubgmi_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: duration * 1000
    });

    logger.info(`Dashboard login: Telegram ID ${telegramUserId} from ${req.ip} device: ${sessionData.device}`);

    return res.json({
      success: true,
      redirect: '/dashboard',
      user: {
        telegramUserId,
        firstName: telegramData.first_name,
        username: telegramData.username
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'login_failed' });
  }
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await destroySession(req.user.sessionId);
    res.clearCookie('pubgmi_session');
    res.json({ success: true, redirect: '/login' });
  } catch (e) { res.status(500).json({ error: 'logout_failed' }); }
});

router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    await destroyAllSessions(req.user.telegramUserId);
    res.clearCookie('pubgmi_session');
    res.json({ success: true, redirect: '/login' });
  } catch (e) { res.status(500).json({ error: 'logout_failed' }); }
});

router.get('/me', requireAuth, async (req, res) => {
  const sessions = await getActiveSessions(req.user.telegramUserId);
  res.json({ user: req.user, session: req.session, sessions });
});

// ── YOUTUBE OAUTH ─────────────────────────────────────────────────────────────
router.get('/channel/:accountNumber/authorize', (req, res) => {
  const num = parseInt(req.params.accountNumber);
  const clientId     = num === 2 ? process.env.YOUTUBE_CLIENT_ID_2     : process.env.YOUTUBE_CLIENT_ID_1;
  const clientSecret = num === 2 ? process.env.YOUTUBE_CLIENT_SECRET_2 : process.env.YOUTUBE_CLIENT_SECRET_1;
  if (!clientId || !clientSecret) return res.status(400).send('Credentials not configured for this account');
  const auth    = createOAuthClient(clientId, clientSecret);
  const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent', state: `channel:${num}` });
  res.redirect(authUrl);
});

router.get('/bot/authorize', (req, res) => {
  const auth = createOAuthClient(process.env.BOT_CLIENT_ID, process.env.BOT_CLIENT_SECRET);
  const url  = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent', state: 'bot' });
  res.redirect(url);
});

router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.send(`OAuth error: ${error}`);
  try {
    let auth, envVar;
    if (state === 'bot') {
      auth   = createOAuthClient(process.env.BOT_CLIENT_ID, process.env.BOT_CLIENT_SECRET);
      envVar = 'BOT_REFRESH_TOKEN';
    } else if (state?.startsWith('channel:')) {
      const num      = parseInt(state.split(':')[1]);
      const clientId = num === 2 ? process.env.YOUTUBE_CLIENT_ID_2 : process.env.YOUTUBE_CLIENT_ID_1;
      const secret   = num === 2 ? process.env.YOUTUBE_CLIENT_SECRET_2 : process.env.YOUTUBE_CLIENT_SECRET_1;
      auth   = createOAuthClient(clientId, secret);
      envVar = `YOUTUBE_REFRESH_TOKEN_${num}`;
    } else {
      return res.status(400).send('Invalid state');
    }
    const { tokens } = await auth.getToken(code);
    res.setHeader('Content-Type','text/html');
    res.send(`<!DOCTYPE html><html><head><title>PUBGMI Auth</title>
<style>body{background:#08080F;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:rgba(15,15,30,.8);border:1px solid rgba(0,212,255,.3);padding:40px;border-radius:12px;max-width:600px}
h2{color:#00D4FF}code{background:#0a0a18;padding:12px;border-radius:8px;word-break:break-all;display:block;color:#8B5CF6;margin:10px 0;font-size:12px}</style></head>
<body><div class="box"><h2>Authorization Successful</h2>
<p>Add to Railway environment variables:</p>
<p>Variable: <strong>${envVar}</strong></p>
<code>${tokens.refresh_token || 'No refresh token — re-authorize with ?prompt=consent'}</code>
<p style="color:rgba(255,255,255,.4);font-size:13px">Copy the token above → Railway → Variables → add ${envVar}</p>
</div></body></html>`);
  } catch (e) {
    logger.error('OAuth callback error:', e);
    res.status(500).send(`Authorization failed: ${e.message}`);
  }
});

module.exports = router;
