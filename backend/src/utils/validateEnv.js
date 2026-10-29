// BUG-53: Validate all required env vars at startup
const REQUIRED = [
  'JWT_SECRET','SESSION_SALT','COOKIE_SECRET',
  'DATABASE_URL','REDIS_URL',
  'TELEGRAM_BOT_TOKEN','AUTHORIZED_TELEGRAM_IDS',
  'FRONTEND_URL','BACKEND_URL',
  'YOUTUBE_CLIENT_ID_1','YOUTUBE_CLIENT_SECRET_1',
  'BOT_CLIENT_ID','BOT_CLIENT_SECRET',
  'YOUTUBE_API_KEY','WEBSUB_SECRET'
];

function validateEnv() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('\n╔══════════════════════════════════════════════╗');
    console.error('║  FATAL: Missing required environment variables ║');
    console.error('╚══════════════════════════════════════════════╝');
    missing.forEach(k => console.error(`  ✗ ${k}`));
    console.error('\nAdd these to your Railway environment variables.\nSee docs/DEPLOYMENT.md for details.\n');
    process.exit(1);
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters');
    process.exit(1);
  }
  console.log('✓ Environment variables validated');
}

module.exports = { validateEnv };
