const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
});

async function connectDatabase() {
  const client = await pool.connect();
  await client.query('SELECT NOW()');
  client.release();
}

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`Slow query detected (${duration}ms): ${text}`);
    }
    return res;
  } catch (error) {
    logger.error(`Query error: ${text}`, error);
    throw error;
  }
}

async function getClient() {
  return await pool.connect();
}

module.exports = { connectDatabase, query, getClient, pool };
