import { NextResponse } from "next/server";
import { checkoutRequestSchema, createCheckoutSession } from "@/lib/payments/checkout";
import { getStripeTestConfig } from "@/lib/payments/config";

export const runtime = "nodejs";

const checkoutErrors: Array<[string, number, string]> = [
  ["authentication_required", 401, "authentication_required"],
  ["insufficient_stock", 409, "insufficient_stock"],
  ["active_order_limit_reached", 429, "active_order_limit"],
  ["seller_payment_account_required", 409, "seller_payment_unavailable"],
  ["order_not_payable", 409, "order_not_payable"],
  ["active_payment_attempt_exists", 409, "order_not_payable"],
];

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token.length >= 20 && token.length <= 4096 ? token : null;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "checkout_failed";
  const match = checkoutErrors.find(([needle]) => message.includes(needle));
  return match ? { status: match[1], code: match[2] } : { status: 500, code: "checkout_failed" };
}

export async function POST(request: Request) {
  const accessToken = bearerToken(request);
  if (!accessToken) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  if (!getStripeTestConfig()) return NextResponse.json({ error: "stripe_test_checkout_unconfigured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_checkout" }, { status: 400 });

  try {
    const checkout = await createCheckoutSession(parsed.data, { accessToken });
    return NextResponse.json(checkout, {
      headers: { "Cache-Control": "no-store, private", Vary: "Authorization" },
    });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status });
  }
}
