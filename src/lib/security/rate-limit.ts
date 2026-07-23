import "server-only";

import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const POLICIES = {
  authLoginIp: { limit: 10, window: "1 m" },
  authSignupIp: { limit: 5, window: "1 h" },
  authResetIp: { limit: 10, window: "1 h" },
  checkoutIp: { limit: 10, window: "15 m" },
  checkoutUser: { limit: 5, window: "1 m" },
  connectOnboardingUser: { limit: 5, window: "1 h" },
  connectSyncUser: { limit: 12, window: "1 h" },
  productMediaUser: { limit: 4, window: "10 m" },
  evidenceDocumentUser: { limit: 3, window: "1 h" },
} as const;

export type RateLimitPolicy = keyof typeof POLICIES;

type RateLimitConfig = {
  redis: Redis;
  pepper: string;
  environment: string;
};

export type RateLimitDecision =
  | { status: "allowed"; limit?: number; remaining?: number; reset?: number }
  | { status: "limited"; limit: number; remaining: number; reset: number }
  | { status: "unavailable" };

const limiters = new Map<RateLimitPolicy, Ratelimit>();

function config(): RateLimitConfig | null | "invalid" {
  if (process.env.RATE_LIMIT_ENABLED !== "true") return null;

  const url = process.env.RATE_LIMIT_REDIS_REST_URL?.trim();
  const token = process.env.RATE_LIMIT_REDIS_REST_TOKEN?.trim();
  const pepper = process.env.RATE_LIMIT_HMAC_PEPPER?.trim();
  if (!url || !token || !pepper || pepper.length < 32) return "invalid";

  return {
    redis: new Redis({ url, token }),
    pepper,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };
}

function subjectDigest(pepper: string, subject: string) {
  return createHmac("sha256", pepper).update(subject).digest("hex");
}

function limiterFor(policy: RateLimitPolicy, resolved: RateLimitConfig) {
  const existing = limiters.get(policy);
  if (existing) return existing;

  const definition = POLICIES[policy];
  const limiter = new Ratelimit({
    redis: resolved.redis,
    limiter: Ratelimit.slidingWindow(definition.limit, definition.window),
    prefix: `yaqeen:rl:${resolved.environment}:${policy}`,
    ephemeralCache: new Map(),
    analytics: false,
    timeout: 1_500,
  });
  limiters.set(policy, limiter);
  return limiter;
}

export async function enforceRateLimit(
  policy: RateLimitPolicy,
  subjects: Array<{ kind: "ip" | "user" | "token"; value: string | null }>,
): Promise<RateLimitDecision> {
  const resolved = config();
  if (resolved === null) return { status: "allowed" };
  if (resolved === "invalid" || subjects.some((subject) => !subject.value)) {
    return { status: "unavailable" };
  }

  const limiter = limiterFor(policy, resolved);

  try {
    const results = await Promise.all(
      subjects.map((subject) =>
        limiter.limit(
          subjectDigest(
            resolved.pepper,
            `${subject.kind}:${subject.value as string}`,
          ),
        ),
      ),
    );

    // The SDK times out fail-open by default. Sensitive mutation boundaries
    // deliberately reinterpret that signal as unavailable/fail-closed.
    if (results.some((result) => result.reason === "timeout")) {
      return { status: "unavailable" };
    }

    const rejected = results.find((result) => !result.success);
    if (rejected) {
      return {
        status: "limited",
        limit: rejected.limit,
        remaining: rejected.remaining,
        reset: rejected.reset,
      };
    }

    const mostConstrained = results.sort(
      (left, right) => left.remaining - right.remaining,
    )[0];
    return mostConstrained
      ? {
          status: "allowed",
          limit: mostConstrained.limit,
          remaining: mostConstrained.remaining,
          reset: mostConstrained.reset,
        }
      : { status: "allowed" };
  } catch {
    return { status: "unavailable" };
  }
}

export function rateLimitHeaders(decision: RateLimitDecision) {
  if (
    decision.status === "unavailable"
    || decision.limit === undefined
    || decision.remaining === undefined
    || decision.reset === undefined
  ) {
    return { "Cache-Control": "no-store" };
  }

  const retryAfter = Math.max(
    1,
    Math.ceil((decision.reset - Date.now()) / 1_000),
  );
  return {
    "Cache-Control": "no-store",
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(Math.ceil(decision.reset / 1_000)),
    ...(decision.status === "limited"
      ? { "Retry-After": String(retryAfter) }
      : {}),
  };
}
