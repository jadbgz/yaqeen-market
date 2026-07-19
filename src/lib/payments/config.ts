import "server-only";

export type StripeTestConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
};

export function getStripeTestConfig(): StripeTestConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const enabled = process.env.STRIPE_TEST_CHECKOUT_ENABLED === "true";

  if (!enabled || !secretKey || !publishableKey || !webhookSecret) return null;
  if (!secretKey.startsWith("sk_test_") || !publishableKey.startsWith("pk_test_") || !webhookSecret.startsWith("whsec_")) {
    throw new Error("stripe_test_configuration_invalid");
  }
  return { secretKey, publishableKey, webhookSecret };
}

export function isStripeTestCheckoutConfigured() {
  try {
    return getStripeTestConfig() !== null && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  } catch {
    return false;
  }
}
