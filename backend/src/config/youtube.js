// BUG-73 FIXED: Token refresh failure detection with clear error messages
const { google } = require('googleapis');
const logger = require('../utils/logger');

function createOAuthClient(clientId, clientSecret) {
  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${process.env.BACKEND_URL}/auth/callback`
  );

  // BUG-73 FIXED: Listen for token refresh events and errors
  client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      logger.info('OAuth: New refresh token received — update environment variables');
    }
  });

  // Intercept refresh errors
  const originalGetAccessToken = client.getAccessToken.bind(client);
  client.getAccessToken = async () => {
    try {
      return await originalGetAccessToken();
    } catch (err) {
      if (err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired')) {
        logger.error('OAUTH TOKEN EXPIRED OR REVOKED. Re-authorize the bot at:');
        logger.error(`  ${process.env.BACKEND_URL}/auth/bot/authorize`);
        logger.error('Bot will continue retrying but YouTube features will fail until re-authorized.');
      }
      throw err;
    }
  };

  return client;
}

function getYouTubeClient(auth) {
  return google.youtube({ version: 'v3', auth });
}

function getChannel1Client() {
  const auth = createOAuthClient(process.env.YOUTUBE_CLIENT_ID_1, process.env.YOUTUBE_CLIENT_SECRET_1);
  if (process.env.YOUTUBE_REFRESH_TOKEN_1) auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN_1 });
  return { auth, youtube: getYouTubeClient(auth) };
}

function getChannel2Client() {
  const auth = createOAuthClient(process.env.YOUTUBE_CLIENT_ID_2, process.env.YOUTUBE_CLIENT_SECRET_2);
  if (process.env.YOUTUBE_REFRESH_TOKEN_2) auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN_2 });
  return { auth, youtube: getYouTubeClient(auth) };
}

function getBotClient() {
  const auth = createOAuthClient(process.env.BOT_CLIENT_ID, process.env.BOT_CLIENT_SECRET);
  if (process.env.BOT_REFRESH_TOKEN) auth.setCredentials({ refresh_token: process.env.BOT_REFRESH_TOKEN });
  return { auth, youtube: getYouTubeClient(auth) };
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly'
];

module.exports = { createOAuthClient, getYouTubeClient, getChannel1Client, getChannel2Client, getBotClient, SCOPES };
