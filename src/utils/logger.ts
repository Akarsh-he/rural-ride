import winston from 'winston';
import { config } from '../config/env';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Sensitive fields that must never appear in logs
const SENSITIVE_FIELDS = ['phone', 'token', 'password', 'cardNumber', 'cvv', 'otp', 'firebase_uid'];

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      redacted[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr =
      Object.keys(meta).length > 0
        ? `\n  ${JSON.stringify(redactSensitive(meta as Record<string, unknown>), null, 2)}`
        : '';
    return `${ts} ${level}: ${String(message)}${stack ? `\n${String(stack)}` : ''}${metaStr}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: config.isProduction ? 'info' : 'debug',
  format: config.isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'rural-mobility-backend' },
  transports: [
    new winston.transports.Console(),
    ...(config.isProduction
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
  exceptionHandlers: [new winston.transports.Console()],
  rejectionHandlers: [new winston.transports.Console()],
});
