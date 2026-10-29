const express = require('express');
const router = express.Router();
const { verifySignature, handleNewVideo } = require('../services/websubService');
const logger = require('../utils/logger');

// YouTube WebSub verification
router.get('/youtube/:accountNumber', (req, res) => {
  const { 'hub.challenge': challenge, 'hub.mode': mode } = req.query;
  if (mode === 'subscribe' && challenge) {
    logger.info(`WebSub verified for account ${req.params.accountNumber}`);
    res.status(200).send(challenge);
  } else {
    res.status(400).send('Bad request');
  }
});

// YouTube WebSub push notification
router.post('/youtube/:accountNumber', express.raw({ type: 'application/atom+xml' }), async (req, res) => {
  const accountNumber = parseInt(req.params.accountNumber);
  const signature = req.headers['x-hub-signature'];
  const body = req.body;

  if (!verifySignature(body, signature, process.env.WEBSUB_SECRET)) {
    logger.warn(`Invalid WebSub signature for account ${accountNumber}`);
    return res.status(403).send('Forbidden');
  }

  res.status(200).send('OK');

  try {
    const bodyStr = body.toString();
    const videoIdMatch = bodyStr.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const titleMatch = bodyStr.match(/<title>(.*?)<\/title>/);

    if (videoIdMatch && titleMatch) {
      await handleNewVideo(accountNumber, {
        videoId: videoIdMatch[1],
        title: titleMatch[1]
      });
    }
  } catch (error) {
    logger.error('WebSub processing error:', error.message);
  }
});

module.exports = router;
