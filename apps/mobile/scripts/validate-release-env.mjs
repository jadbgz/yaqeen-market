const variant = process.env.APP_VARIANT;

if (!variant || !["development", "preview", "production"].includes(variant)) {
  fail("APP_VARIANT must be development, preview or production.");
}

if (variant === "production") {
  fail(
    "Production store builds are locked: Yaqeen currently rejects Stripe live mode. " +
      "Open the live-payment release gate before producing a store binary.",
  );
}

const supabaseUrl = required("EXPO_PUBLIC_SUPABASE_URL");
const supabaseKey = required("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const siteUrl = required("EXPO_PUBLIC_SITE_URL");
const stripeKey = required("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY");

assertHostedHttpsUrl("EXPO_PUBLIC_SUPABASE_URL", supabaseUrl);
assertHostedHttpsUrl("EXPO_PUBLIC_SITE_URL", siteUrl);

if (supabaseKey.includes("replace") || supabaseKey.length < 20) {
  fail("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is a placeholder or malformed.");
}

if (!stripeKey.startsWith("pk_test_") || stripeKey.includes("replace")) {
  fail("Internal builds require a non-placeholder Stripe pk_test_ publishable key.");
}

console.log(`Release environment is valid for the ${variant} mobile build.`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required for EAS builds.`);
  return value;
}

function assertHostedHttpsUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be a valid URL.`);
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
  if (parsed.protocol !== "https:" || localHosts.has(parsed.hostname)) {
    fail(`${name} must use a hosted HTTPS endpoint for an installable build.`);
  }
}

function fail(message) {
  console.error(`\nYAQEEN RELEASE GATE\n${message}\n`);
  process.exit(1);
}
