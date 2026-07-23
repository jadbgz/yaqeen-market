import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { inspectReleaseEnvironment } from "@/lib/release/environment";

type CheckState = "up" | "down" | "skipped";

type ReadinessCheck = {
  state: CheckState;
  durationMs: number;
};

type ReadinessResult = {
  status: "ready" | "not_ready";
  environment: string;
  release: { sha: string };
  checks: {
    configuration: ReadinessCheck;
    database: ReadinessCheck;
    stripe: ReadinessCheck;
  };
};

const responseHeaders = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow",
};

export function readinessHeaders() {
  return responseHeaders;
}

export function isReadinessRequestAuthorized(request: Request) {
  const expected = process.env.YAQEEN_HEALTHCHECK_TOKEN?.trim();
  const authorization = request.headers.get("authorization");
  if (!expected || expected.length < 32 || !authorization?.startsWith("Bearer ")) return false;

  const supplied = authorization.slice(7).trim();
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

async function checked(operation: () => Promise<void>): Promise<ReadinessCheck> {
  const startedAt = performance.now();
  try {
    await operation();
    return { state: "up", durationMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { state: "down", durationMs: Math.round(performance.now() - startedAt) };
  }
}

export async function inspectRuntimeReadiness(): Promise<ReadinessResult> {
  const configurationStartedAt = performance.now();
  const release = inspectReleaseEnvironment(process.env);
  const configuration: ReadinessCheck = {
    state: release.issues.length === 0 ? "up" : "down",
    durationMs: Math.round(performance.now() - configurationStartedAt),
  };

  if (configuration.state === "down") {
    return {
      status: "not_ready",
      environment: release.environment,
      release: { sha: release.releaseSha },
      checks: {
        configuration,
        database: { state: "skipped", durationMs: 0 },
        stripe: { state: "skipped", durationMs: 0 },
      },
    };
  }

  const [database, stripe] = await Promise.all([
    checked(async () => {
      const { error } = await createAdminClient()
        .from("profiles")
        .select("id", { head: true, count: "exact" });
      if (error) throw error;
    }),
    checked(async () => {
      const balance = await getStripe().balance.retrieve({}, { timeout: 5_000, maxNetworkRetries: 0 });
      if (balance.livemode) throw new Error("stripe_livemode_rejected");
    }),
  ]);

  return {
    status: database.state === "up" && stripe.state === "up" ? "ready" : "not_ready",
    environment: release.environment,
    release: { sha: release.releaseSha },
    checks: { configuration, database, stripe },
  };
}
