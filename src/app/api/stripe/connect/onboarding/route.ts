import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/dal";
import { createStripeOnboardingLink } from "@/lib/payments/connect";
import { getStripeTestConfig } from "@/lib/payments/config";
import { isSameOriginRequest } from "@/lib/payments/origin";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { rejectedRateLimitResponse } from "@/lib/security/rate-limit-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  const decision = await enforceRateLimit("connectOnboardingUser", [
    { kind: "user", value: viewer.id },
  ]);
  const rejection = rejectedRateLimitResponse(decision);
  if (rejection) return rejection;

  if (!getStripeTestConfig()) return NextResponse.json({ error: "stripe_test_unconfigured" }, { status: 503 });
  try {
    return NextResponse.json({ url: await createStripeOnboardingLink() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "connect_failed";
    const status = message === "authentication_required" ? 401 : message === "approved_shop_required" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "connect_failed" : message }, { status });
  }
}
