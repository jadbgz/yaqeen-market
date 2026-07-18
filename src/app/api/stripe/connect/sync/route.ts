import { NextResponse } from "next/server";
import { refreshStripeAccount } from "@/lib/payments/connect";
import { getStripeTestConfig } from "@/lib/payments/config";
import { isSameOriginRequest } from "@/lib/payments/origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  if (!getStripeTestConfig()) return NextResponse.json({ error: "stripe_test_unconfigured" }, { status: 503 });
  try {
    return NextResponse.json(await refreshStripeAccount(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "connect_sync_failed";
    const status = message === "authentication_required" ? 401 : message === "approved_shop_required" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "connect_sync_failed" : message }, { status });
  }
}
