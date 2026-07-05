const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const pool = new Pool({
  host:                    process.env.ECAFRICA_DB_HOST     || 'localhost',
  port:                    parseInt(process.env.ECAFRICA_DB_PORT || '5432'),
  database:                process.env.ECAFRICA_DB_NAME     || 'ECareAfrica_db',
  user:                    process.env.ECAFRICA_DB_USER     || 'postgres',
  password:                process.env.ECAFRICA_DB_PASSWORD || '',
  ssl:                     process.env.ECAFRICA_DB_SSL === 'true'
                             ? { rejectUnauthorized: false }
                             : false,
  max:                     parseInt(process.env.ECAFRICA_DB_POOL_MAX || '20'),
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  logger.error('[db] Unexpected pool error:', err.message);
});

async function connectEcafrica() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
}

/** Parameterised query with slow-query logging. */
async function queryEca(text, params = []) {
  const start = Date.now();
  const res   = await pool.query(text, params);
  const ms    = Date.now() - start;
  if (ms > 1000) logger.warn(`[db] Slow query (${ms}ms): ${text}`);
  return res;
}

/** Get a raw client for multi-statement transactions. */
async function getClientEca() {
  return pool.connect();
}

module.exports = { pool, connectEcafrica, queryEca, getClientEca };
