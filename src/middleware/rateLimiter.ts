import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';

const getClientIp = (req: Request): string => {
    const raw =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown';

    return raw
        .replace(/^\[|\]$/g, '')       // strip brackets from IPv6
        .replace(/^::ffff:/i, '');     // unwrap IPv4-mapped IPv6
};

const createLimiter = (options: {
    windowMs: number;
    limit: number;
    message: string;
    prefix: string;
    retryAfter: number;
}) => {
    const { windowMs, limit, message, retryAfter } = options;

    return rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: getClientIp,   // no "req.ip" string inside → no ValidationError
        handler: (_req: Request, res: Response) => {
            res.status(429).json({
                success: false,
                message,
                retryAfter,
            });
        },
    });
};

export const generalLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    prefix: 'general',
    message: 'Too many requests, please try again after 15 minutes.',
    retryAfter: 15 * 60,
});

export const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 80,
    prefix: 'auth',
    message: 'Too many login attempts, please try again after 15 minutes.',
    retryAfter: 15 * 60,
});

export const sensitiveLimiter = createLimiter({
    windowMs: 6 * 60 * 1000,
    limit: 400,
    prefix: 'sensitive',
    message: 'Too many requests for sensitive operations, please try again after an hour.',
    retryAfter: 60 * 60,
});

export const burstLimiter = createLimiter({
    windowMs: 1 * 60 * 1000,
    limit: 1000,
    prefix: 'burst',
    message: 'Too many requests, please slow down.',
    retryAfter: 60,
});

export const createRateLimiter = (options: {
    windowMs: number;
    max: number;
    message?: string;
    keyPrefix?: string;
}) => {
    const {
        windowMs,
        max,
        message = 'Too many requests',
        keyPrefix = 'custom',
    } = options;

    return createLimiter({
        windowMs,
        limit: max,
        prefix: keyPrefix,
        message,
        retryAfter: Math.ceil(windowMs / 1000),
    });
};