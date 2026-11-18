import { createClient, RedisClientType } from 'redis';
import { config } from './env';
import { logger } from '../utils/logger';

let redisClient: RedisClientType;
let isConnected = false;

function getRedisClient(): RedisClientType {
  if (!redisClient) {
    redisClient = createClient({
      url: config.redisUrl,
      password: config.redisPassword,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis: too many reconnect attempts, giving up');
            return new Error('Redis max reconnect attempts reached');
          }
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      },
    }) as RedisClientType;

    redisClient.on('connect', () => {
      logger.info('Redis: connected');
      isConnected = true;
    });

    redisClient.on('disconnect', () => {
      logger.warn('Redis: disconnected');
      isConnected = false;
    });

    redisClient.on('error', (err: Error) => {
      logger.error('Redis error', { message: err.message });
    });
  }
  return redisClient;
}

async function connectRedis(): Promise<void> {
  try {
    const client = getRedisClient();
    if (!isConnected) {
      await client.connect();
    }
  } catch (err) {
    logger.warn('Redis: could not connect — location caching disabled', { message: (err as Error).message });
  }
}

async function disconnectRedis(): Promise<void> {
  if (redisClient && isConnected) {
    await redisClient.disconnect();
    isConnected = false;
  }
}

// ── Driver Location Helpers ──────────────────────────────────────────────────

interface DriverLocation {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: string;
  journeyId?: string;
}

async function setDriverLocation(
  driverId: string,
  location: DriverLocation
): Promise<void> {
  const client = getRedisClient();
  const key = `driver:${driverId}:location`;
  await client.set(key, JSON.stringify(location), {
    EX: config.routing.locationCacheTtlSeconds,
  });
}

async function getDriverLocation(driverId: string): Promise<DriverLocation | null> {
  const client = getRedisClient();
  const key = `driver:${driverId}:location`;
  const raw = await client.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as DriverLocation;
}

async function deleteDriverLocation(driverId: string): Promise<void> {
  const client = getRedisClient();
  await client.del(`driver:${driverId}:location`);
}

// ── Generic Cache Helpers ────────────────────────────────────────────────────

async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const client = getRedisClient();
  const opts = ttlSeconds ? { EX: ttlSeconds } : undefined;
  await client.set(key, JSON.stringify(value), opts);
}

async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const raw = await client.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

async function cacheDel(key: string): Promise<void> {
  const client = getRedisClient();
  await client.del(key);
}

export {
  getRedisClient,
  connectRedis,
  disconnectRedis,
  setDriverLocation,
  getDriverLocation,
  deleteDriverLocation,
  cacheSet,
  cacheGet,
  cacheDel,
  DriverLocation,
};
