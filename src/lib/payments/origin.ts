import "server-only";

import { getSiteUrl } from "@/lib/supabase/config";

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    const configured = new URL(getSiteUrl());
    return parsed.host === host && parsed.origin === configured.origin;
  } catch {
    return false;
  }
}
