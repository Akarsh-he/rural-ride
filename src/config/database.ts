import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './env';
import { logger } from '../utils/logger';

const useSsl =
  config.isProduction ||
  config.databaseUrl.includes('render.com') ||
  config.databaseUrl.includes('supabase.co') ||
  config.databaseUrl.includes('neon.tech') ||
  config.databaseUrl.includes('sslmode=require');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  logger.debug('PostgreSQL: new client connected to pool');
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error', { error: err.message });
});

pool.on('remove', () => {
  logger.debug('PostgreSQL: client removed from pool');
});

/**
 * Execute a parameterized query using a pool client.
 * Always use parameterized queries — never interpolate user input.
 */
async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('DB query executed', {
      duration_ms: duration,
      rows: result.rowCount,
    });
    return result;
  } catch (err) {
    const error = err as Error;
    logger.error('DB query error', {
      message: error.message,
      duration_ms: Date.now() - start,
    });
    throw err;
  }
}

/**
 * Get a dedicated client from the pool for transactions.
 * Caller is responsible for calling client.release().
 */
async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Run a function inside a transaction. Commits on success, rolls back on error.
 */
async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test the database connection on startup.
 */
async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() as now, version() as version');
    logger.info('PostgreSQL connected', {
      time: result.rows[0].now,
      version: result.rows[0].version.split(' ').slice(0, 2).join(' '),
    });
  } finally {
    client.release();
  }
}

export { pool, query, getClient, withTransaction, testConnection };
