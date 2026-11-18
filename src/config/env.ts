import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) throw new Error(`Env var ${key} must be an integer`);
  return parsed;
}

function optionalFloat(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseFloat(val);
  if (isNaN(parsed)) throw new Error(`Env var ${key} must be a number`);
  return parsed;
}

export const config = {
  port: optionalInt('PORT', 3000),
  nodeEnv: optional('NODE_ENV', 'development'),
  isProduction: optional('NODE_ENV', 'development') === 'production',

  jwtSecret: optional('JWT_SECRET', 'rural-mobility-varanasi-secret-key-2026'),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
  redisPassword: process.env.REDIS_PASSWORD,

  firebase: {
    projectId: optional('FIREBASE_PROJECT_ID', ''),
    serviceAccountKey: optional('FIREBASE_SERVICE_ACCOUNT_KEY', ''),
  },

  razorpay: {
    keyId: optional('RAZORPAY_KEY_ID', ''),
    keySecret: optional('RAZORPAY_KEY_SECRET', ''),
  },

  maps: {
    googleApiKey: optional('GOOGLE_MAPS_API_KEY', ''),
    mapplsApiKey: optional('MAPPLS_API_KEY', ''),
  },

  routing: {
    maxDeviationMeters: optionalInt('ROUTE_MAX_DEVIATION_METERS', 500),
    bookingRequestTimeoutSeconds: optionalInt('BOOKING_REQUEST_TIMEOUT_SECONDS', 120),
    locationCacheTtlSeconds: optionalInt('LOCATION_CACHE_TTL_SECONDS', 30),
  },

  business: {
    platformCommissionPct: optionalFloat('PLATFORM_COMMISSION_PCT', 0),
  },
};

export type Config = typeof config;
