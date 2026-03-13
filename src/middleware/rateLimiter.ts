import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import { Response } from 'express';
import { redisConfig } from '../db/redis';

/**
 * Rate Limiter Configuration using Redis
 * Provides distributed rate limiting across multiple server instances
 */

// Create a dedicated Redis client for rate limiting
const rateLimitRedisClient = createClient({
    username: 'default',
    password: redisConfig.password,
    socket: {
        host: redisConfig.host,
        port: redisConfig.port
    }
});

// Connect the client
rateLimitRedisClient.connect().catch(console.error);

rateLimitRedisClient.on('error', err => console.log('Rate Limiter Redis Client Error', err));
rateLimitRedisClient.on('connect', () => console.log('Rate Limiter Redis Client Connected'));

// General API rate limiter - 600 requests per 15 minutes
export const generalLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => rateLimitRedisClient.sendCommand(args),
        prefix: 'rl:general:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 600, // Limit each IP to 600 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests, please try again after 15 minutes.',
    },
    standardHeaders: 'draft-7', // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (_req, res: Response) => {
        res.status(429).json({
            success: false,
            message: 'Too many requests, please try again after 15 minutes.',
            retryAfter: 15 * 60, // seconds
        });
    },
});

// Strict rate limiter for auth routes - 40 requests per 15 minutes
export const authLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => rateLimitRedisClient.sendCommand(args),
        prefix: 'rl:auth:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 40, // Limit each IP to 40 login attempts per windowMs
    message: {
        success: false,
        message: 'Too many login attempts, please try again after 15 minutes.',
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res: Response) => {
        res.status(429).json({
            success: false,
            message: 'Too many login attempts, please try again after 15 minutes.',
            retryAfter: 15 * 60, // seconds
        });
    },
    skipSuccessfulRequests: false, // Count all requests
});

// Strict rate limiter for sensitive operations - 400 requests per hour
export const sensitiveLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => rateLimitRedisClient.sendCommand(args),
        prefix: 'rl:sensitive:',
    }),
    windowMs: 6 * 60 * 1000, // 6 minutes
    limit: 400, // Limit each IP to 400 requests per 6 minutes
    message: {
        success: false,
        message: 'Too many requests for sensitive operations, please try again after an hour.',
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res: Response) => {
        res.status(429).json({
            success: false,
            message: 'Too many requests for sensitive operations, please try again after an hour.',
            retryAfter: 60 * 60, // seconds
        });
    },
});

// Burst rate limiter for high-frequency endpoints - 1000 requests per minute
export const burstLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => rateLimitRedisClient.sendCommand(args),
        prefix: 'rl:burst:',
    }),
    windowMs: 60 * 1000, // 1 minute
    limit: 1000, // Limit each IP to 1000 requests per minute
    message: {
        success: false,
        message: 'Too many requests, please slow down.',
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res: Response) => {
        res.status(429).json({
            success: false,
            message: 'Too many requests, please slow down.',
            retryAfter: 60, // seconds
        });
    },
});

// Custom rate limiter factory - create custom limiters with specific configurations
export const createRateLimiter = (options: {
    windowMs: number;
    max: number;
    message?: string;
    keyPrefix?: string;
}) => {
    const { windowMs, max, message = 'Too many requests', keyPrefix = 'custom' } = options;
    
    return rateLimit({
        store: new RedisStore({
            sendCommand: (...args: string[]) => rateLimitRedisClient.sendCommand(args),
            prefix: `rl:${keyPrefix}:`,
        }),
        windowMs,
        limit: max,
        message: {
            success: false,
            message,
        },
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (_req, res: Response) => {
            res.status(429).json({
                success: false,
                message,
                retryAfter: Math.ceil(windowMs / 1000), // seconds
            });
        },
    });
};

// Export the Redis client for cleanup purposes
export { rateLimitRedisClient };
