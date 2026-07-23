import { NextResponse } from "next/server";
import {
  inspectRuntimeReadiness,
  isReadinessRequestAuthorized,
  readinessHeaders,
} from "@/lib/release/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isReadinessRequestAuthorized(request)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: readinessHeaders() });
  }

  const readiness = await inspectRuntimeReadiness();
  return NextResponse.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: readinessHeaders(),
  });
}
