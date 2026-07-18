import "server-only";

import Stripe from "stripe";
import { getStripeTestConfig } from "@/lib/payments/config";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const config = getStripeTestConfig();
  if (!config) throw new Error("stripe_test_checkout_unconfigured");
  if (!stripeClient) {
    stripeClient = new Stripe(config.secretKey, {
      apiVersion: "2026-06-24.dahlia",
      appInfo: { name: "Yaqeen Market", version: "0.1.0" },
    });
  }
  return stripeClient;
}
