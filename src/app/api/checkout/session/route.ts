import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/dal";
import { createCheckoutSession, checkoutRequestSchema } from "@/lib/payments/checkout";
import { getStripeTestConfig } from "@/lib/payments/config";
import { isSameOriginRequest } from "@/lib/payments/origin";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { rejectedRateLimitResponse } from "@/lib/security/rate-limit-response";
import { getTrustedClientIp } from "@/lib/security/request-identity";

export const runtime = "nodejs";

function safeCheckoutError(error: unknown) {
  const message = error instanceof Error ? error.message : "checkout_failed";
  if (message.includes("authentication_required")) return { status: 401, code: "authentication_required" };
  if (message.includes("insufficient_stock")) return { status: 409, code: "insufficient_stock" };
  if (message.includes("active_order_limit_reached")) return { status: 429, code: "active_order_limit" };
  if (message.includes("seller_payment_account_required")) return { status: 409, code: "seller_payment_unavailable" };
  if (message.includes("order_not_payable") || message.includes("active_payment_attempt_exists")) {
    return { status: 409, code: "order_not_payable" };
  }
  return { status: 500, code: "checkout_failed" };
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const ipDecision = await enforceRateLimit("checkoutIp", [
    { kind: "ip", value: getTrustedClientIp(request.headers) },
  ]);
  const ipRejection = rejectedRateLimitResponse(ipDecision);
  if (ipRejection) return ipRejection;

  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }
  const userDecision = await enforceRateLimit("checkoutUser", [
    { kind: "user", value: viewer.id },
  ]);
  const userRejection = rejectedRateLimitResponse(userDecision);
  if (userRejection) return userRejection;

  if (!getStripeTestConfig()) {
    return NextResponse.json({ error: "stripe_test_checkout_unconfigured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_checkout" }, { status: 400 });
  }

  try {
    const checkout = await createCheckoutSession(parsed.data);
    return NextResponse.json(checkout, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    const safe = safeCheckoutError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status });
  }
}
