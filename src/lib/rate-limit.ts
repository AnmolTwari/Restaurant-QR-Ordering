import { NextResponse } from 'next/server';

interface RateLimitRecord {
  timestamps: number[];
}

const memoryStore = new Map<string, RateLimitRecord>();

// Clean up memory store every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of memoryStore.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < 300000);
      if (record.timestamps.length === 0) {
        memoryStore.delete(key);
      }
    }
  }, 300000);
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Sliding-window rate limiter supporting in-memory and shared Upstash Redis storage.
 * Synchronous and Promise-compatible.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  return checkInMemoryRateLimit(key, options);
}

/**
 * Async rate limit check supporting Upstash Redis when configured.
 */
export async function checkRateLimitAsync(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      return await checkUpstashRateLimit(key, options, upstashUrl, upstashToken);
    } catch (err) {
      console.warn('[RateLimit] Upstash Redis query failed, falling back to in-memory store:', err);
    }
  }

  return checkInMemoryRateLimit(key, options);
}

/**
 * In-memory sliding-window rate limit checker.
 */
export function checkInMemoryRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - options.windowMs;

  let record = memoryStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    memoryStore.set(key, record);
  }

  // Filter timestamps within current window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= options.limit) {
    const oldestTimestamp = record.timestamps[0];
    const resetMs = oldestTimestamp + options.windowMs - now;

    return {
      success: false,
      limit: options.limit,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    };
  }

  record.timestamps.push(now);

  return {
    success: true,
    limit: options.limit,
    remaining: options.limit - record.timestamps.length,
    resetMs: options.windowMs,
  };
}

async function checkUpstashRateLimit(
  key: string,
  options: RateLimitOptions,
  url: string,
  token: string,
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(options.windowMs / 1000);
  const redisKey = `ratelimit:${key}`;

  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', redisKey],
      ['EXPIRE', redisKey, windowSeconds],
      ['TTL', redisKey],
    ]),
  });

  if (!res.ok) {
    throw new Error(`Upstash returned HTTP ${res.status}`);
  }

  const results = await res.json();
  const currentCount = results[0]?.result || 1;
  const ttl = results[2]?.result || windowSeconds;
  const remaining = Math.max(0, options.limit - currentCount);
  const resetMs = ttl > 0 ? ttl * 1000 : options.windowMs;

  return {
    success: currentCount <= options.limit,
    limit: options.limit,
    remaining,
    resetMs,
  };
}

/**
 * Helper to extract client identifier (IP) from request headers.
 *
 * Security rule:
 * Only trusts forwarding headers if TRUST_PROXY is true or in Vercel environment.
 * Prevents clients from spoofing X-Forwarded-For to bypass rate limits.
 */
export function getClientIp(req: Request): string {
  const trustProxy =
    process.env.TRUST_PROXY === 'true' ||
    process.env.TRUST_PROXY === '1' ||
    Boolean(process.env.VERCEL);

  if (trustProxy) {
    // 1. Cloudflare header
    const cfIp = req.headers.get('cf-connecting-ip');
    if (cfIp && isValidIp(cfIp.trim())) {
      return sanitizeIp(cfIp.trim());
    }

    // 2. Standard single reverse proxy header (e.g. Nginx, ALB, Vercel)
    const realIp = req.headers.get('x-real-ip');
    if (realIp && isValidIp(realIp.trim())) {
      return sanitizeIp(realIp.trim());
    }

    // 3. Multi-proxy chain: X-Forwarded-For (take the first valid IP)
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      const parts = forwarded.split(',').map((p) => p.trim());
      for (const part of parts) {
        if (isValidIp(part)) {
          return sanitizeIp(part);
        }
      }
    }
  }

  return '127.0.0.1';
}

function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^[a-fA-F0-9:]+$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

function sanitizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}

/**
 * Creates standard HTTP 429 Too Many Requests response with rate-limit headers.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSec = Math.ceil(result.resetMs / 1000);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Please try again in ${retryAfterSec} seconds.`,
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil((Date.now() + result.resetMs) / 1000)),
      },
    },
  );
}
