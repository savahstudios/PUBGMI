require('dotenv').config();
const { validateEnv } = require('./utils/validateEnv'); // BUG-53
validateEnv();

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');

const logger  = require('./utils/logger');
const { getVersion } = require('./utils/version');
const { connectDatabase } = require('./config/database');
const { connectRedis }    = require('./config/redis');
const { initializeTelegramBot } = require('./telegram/bot');
const { startYouTubePoller }    = require('./services/youtubeService');
const { startWebSubService }    = require('./services/websubService');
const { startWatchdog, markDatabaseReady } = require('./services/watchdogService');
const { startBotGuideScheduler }= require('./services/botGuideService');
const { startTimedMessageService } = require('./services/timedMessageService');
const { startGiveawayWatcher }     = require('./services/giveawayWatcher');
const { maintenanceCheck } = require('./middleware/maintenance');

// Routes
const authRoutes          = require('./routes/auth');
const youtubeRoutes       = require('./routes/youtube');
const chatRoutes          = require('./routes/chat');
const commandsRoutes      = require('./routes/commands');
const spRoutes            = require('./routes/sp');
const giveawayRoutes      = require('./routes/giveaway');
const queueRoutes         = require('./routes/queue');
const analyticsRoutes     = require('./routes/analytics');
const settingsRoutes      = require('./routes/settings');
const overlayRoutes       = require('./routes/overlay');
const notificationsRoutes = require('./routes/notifications');
const recordsRoutes       = require('./routes/records');
const statusRoutes        = require('./routes/status');
const webhookRoutes       = require('./routes/webhooks');
const publicRoutes        = require('./routes/public');

const app    = express();
const server = http.createServer(app);

// BUG-52 FIXED: Validate CORS origin with fallback
const corsOrigin = process.env.FRONTEND_URL;
if (!corsOrigin) {
  logger.error('FRONTEND_URL is not set — CORS will be restricted. Set this env var in Railway.');
}

const io = new Server(server, {
  cors: {
    origin: corsOrigin || false, // false = reject all if not set
    credentials: true
  }
});
app.set('io', io);

// BUG-84 FIXED: Reduced body limit to 1MB
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: corsOrigin || false, credentials: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json({ limit: '1mb' }));   // was 10mb
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
app.use(maintenanceCheck);

// Global rate limiter — 300 req/min per IP (applied to all routes)
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.path === '/health'
}));

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'online', version: getVersion(), uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

// Routes
app.use('/auth',          authRoutes);
app.use('/youtube',       youtubeRoutes);
app.use('/chat',          chatRoutes);
app.use('/commands',      commandsRoutes);
app.use('/sp',            spRoutes);
app.use('/giveaway',      giveawayRoutes);
app.use('/queue',         queueRoutes);
app.use('/analytics',     analyticsRoutes);
app.use('/settings',      settingsRoutes);
app.use('/overlay',       overlayRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/records',       recordsRoutes);
app.use('/status',        statusRoutes);
app.use('/webhooks',      webhookRoutes);
app.use('/public',        publicRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path, version: getVersion() }));
app.use((err, req, res, next) => {
  const errorId = `ERR-${Date.now()}`;
  logger.error(`${errorId} — ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error', errorId, version: getVersion() });
});

io.on('connection', socket => {
  logger.info(`Dashboard connected: ${socket.id}`);
  socket.on('join:account', id => socket.join(`account:${id}`));
  socket.on('disconnect', () => logger.info(`Dashboard disconnected: ${socket.id}`));
});

async function startup() {
  try {
    logger.info(`╔══════════════════════════════════════════╗`);
    logger.info(`║   PUBGMI BOT v${getVersion()} — STARTING UP    ║`);
    logger.info(`╚══════════════════════════════════════════╝`);

    await connectDatabase(); logger.info('✓ PostgreSQL');
    markDatabaseReady(); // BUG-54: signal DB is ready for notifications
    await connectRedis();    logger.info('✓ Redis');

    await initializeTelegramBot(io); logger.info('✓ Telegram @PUBGMIROBOT');
    await startYouTubePoller(io);    logger.info('✓ YouTube poller');
    await startWebSubService();      logger.info('✓ WebSub');

    startBotGuideScheduler();    logger.info('✓ Bot guide scheduler');
    await startTimedMessageService(); logger.info('✓ Timed messages');  // BUG-15
    startGiveawayWatcher(io);            logger.info('✓ Giveaway watcher'); // BUG-35
    startWatchdog(server);       logger.info('✓ Watchdog');

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`✓ Server on port ${PORT}`);
      logger.info(`══════════════════════════════════════════`);
      logger.info(`  PUBGMI BOT v${getVersion()} is fully operational`);
      logger.info(`══════════════════════════════════════════`);
    });
  } catch (err) {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('uncaughtException',  err => logger.error('Uncaught exception:', err));
process.on('unhandledRejection', err => logger.error('Unhandled rejection:', err));

startup();
