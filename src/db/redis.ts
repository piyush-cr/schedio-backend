import { Redis } from '@upstash/redis';

// Upstash REST – used for rate limiting and caching (strip quotes if env/secret stored them)
const stripQuotes = (s: string) => (s || '').replace(/^["']|["']$/g, '').trim();
const UPSTASH_REDIS_REST_URL = stripQuotes(process.env.UPSTASH_REDIS_REST_URL || '');
const UPSTASH_REDIS_REST_TOKEN = stripQuotes(process.env.UPSTASH_REDIS_REST_TOKEN || '');

export const upstashRedis = (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN)
    ? new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN })
    : null;

// BullMQ requires TCP. Use REDIS_URL, or derive from Upstash REST (same DB, TLS connection)
const REDIS_URL = process.env.REDIS_URL;
const derivedFromUpstash = UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN
    ? (() => {
        try {
            const host = new URL(UPSTASH_REDIS_REST_URL).hostname;
            return {
                host,
                port: 6379,
                password: UPSTASH_REDIS_REST_TOKEN,
                username: 'default',
                tls: {} as object,
            };
        } catch {
            return null;
        }
    })()
    : null;

export const hasBullMQRedis = !!(REDIS_URL || derivedFromUpstash);

export const redisConfig = REDIS_URL
    ? { url: REDIS_URL }
    : derivedFromUpstash;
