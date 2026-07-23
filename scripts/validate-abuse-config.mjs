const required = [
  "RATE_LIMIT_REDIS_REST_URL",
  "RATE_LIMIT_REDIS_REST_TOKEN",
  "RATE_LIMIT_HMAC_PEPPER",
  "TRUSTED_PROXY_MODE",
];

const errors = [];

if (process.env.RATE_LIMIT_ENABLED !== "true") {
  errors.push("RATE_LIMIT_ENABLED must be true");
}

for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required`);
}

try {
  const redisUrl = new URL(process.env.RATE_LIMIT_REDIS_REST_URL ?? "");
  if (redisUrl.protocol !== "https:") {
    errors.push("RATE_LIMIT_REDIS_REST_URL must use HTTPS");
  }
} catch {
  errors.push("RATE_LIMIT_REDIS_REST_URL must be a valid URL");
}

if ((process.env.RATE_LIMIT_HMAC_PEPPER?.trim().length ?? 0) < 32) {
  errors.push("RATE_LIMIT_HMAC_PEPPER must contain at least 32 characters");
}

const proxyMode = process.env.TRUSTED_PROXY_MODE;
if (proxyMode !== "vercel" && proxyMode !== "custom") {
  errors.push("TRUSTED_PROXY_MODE must be vercel or custom");
}
if (
  proxyMode === "custom"
  && !/^[a-z0-9-]{3,80}$/.test(
    process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase() ?? "",
  )
) {
  errors.push(
    "TRUSTED_PROXY_IP_HEADER must name the header overwritten by the trusted proxy",
  );
}

if (errors.length > 0) {
  console.error(`Abuse-control configuration is invalid:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("Abuse-control configuration is valid.");
