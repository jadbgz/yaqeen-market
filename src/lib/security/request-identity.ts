import "server-only";

import { isIP } from "node:net";

function firstForwardedAddress(value: string | null) {
  const candidate = value?.split(",", 1)[0]?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

/**
 * Client IPs are security inputs only when the hosting layer guarantees the
 * selected header is overwritten before the request reaches Next.js.
 */
export function getTrustedClientIp(headers: Headers) {
  const mode = process.env.TRUSTED_PROXY_MODE;

  if (mode === "vercel") {
    return firstForwardedAddress(headers.get("x-vercel-forwarded-for"));
  }

  if (mode === "custom") {
    const headerName = process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase();
    if (!headerName || !/^[a-z0-9-]{3,80}$/.test(headerName)) return null;
    return firstForwardedAddress(headers.get(headerName));
  }

  if (process.env.NODE_ENV !== "production") {
    return "127.0.0.1";
  }

  return null;
}
