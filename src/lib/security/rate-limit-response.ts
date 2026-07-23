import "server-only";

import { NextResponse } from "next/server";
import {
  rateLimitHeaders,
  type RateLimitDecision,
} from "@/lib/security/rate-limit";

export function rejectedRateLimitResponse(decision: RateLimitDecision) {
  if (decision.status === "allowed") return null;

  return NextResponse.json(
    {
      error:
        decision.status === "limited"
          ? "rate_limit_exceeded"
          : "abuse_control_unavailable",
    },
    {
      status: decision.status === "limited" ? 429 : 503,
      headers: rateLimitHeaders(decision),
    },
  );
}
