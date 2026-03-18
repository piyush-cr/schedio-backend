import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Request, Response, NextFunction } from 'express';

const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasUpstash
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    : null;

// No-op middleware when Upstash is not configured (e.g. local dev without Redis)
const noopLimiter = (_req: Request, _res: Response, next: NextFunction) => next();

type Duration = `${number} s` | `${number} m` | `${number} h` | `${number} d`;

const createUpstashLimiter = (
    limit: number,
    window: Duration,
    prefix: string,
    message: string,
    retryAfter: number
): ((req: Request, res: Response, next: NextFunction) => void | Promise<void>) => {
    if (!redis) return noopLimiter;

    const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, window),
        prefix: `rl:${prefix}`,
    });

    return async (req: Request, res: Response, next: NextFunction) => {
        const id = req.ip || req.socket.remoteAddress || 'unknown';
        const { success, remaining, reset } = await ratelimit.limit(id);

        res.set('RateLimit-Limit', limit.toString());
        res.set('RateLimit-Remaining', remaining.toString());
        res.set('RateLimit-Reset', reset.toString());

        if (!success) {
            return void res.status(429).json({
                success: false,
                message,
                retryAfter,
            });
        }
        next();
    };
};

export const generalLimiter = createUpstashLimiter(
    600,
    '15 m',
    'general',
    'Too many requests, please try again after 15 minutes.',
    15 * 60
);

export const authLimiter = createUpstashLimiter(
    80,
    '15 m',
    'auth',
    'Too many login attempts, please try again after 15 minutes.',
    15 * 60
);

export const sensitiveLimiter = createUpstashLimiter(
    400,
    '6 m',
    'sensitive',
    'Too many requests for sensitive operations, please try again after an hour.',
    60 * 60
);

export const burstLimiter = createUpstashLimiter(
    1000,
    '1 m',
    'burst',
    'Too many requests, please slow down.',
    60
);

export const createRateLimiter = (options: {
    windowMs: number;
    max: number;
    message?: string;
    keyPrefix?: string;
}) => {
    const { windowMs, max, message = 'Too many requests', keyPrefix = 'custom' } = options;
    const windowSec = Math.ceil(windowMs / 1000);
    const windowStr: Duration = windowSec >= 60 ? `${Math.floor(windowSec / 60)} m` : `${windowSec} s`;
    return createUpstashLimiter(max, windowStr, keyPrefix, message, Math.ceil(windowSec));
};
