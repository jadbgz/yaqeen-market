import "server-only";

import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const checkoutRequestSchema = z.object({
  checkoutToken: z.uuid(),
  addressId: z.uuid(),
  items: z.array(z.object({
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(100),
  }).strict()).min(1).max(50),
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.variantId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "duplicate_variant" });
  }
  if (value.items.reduce((sum, item) => sum + item.quantity, 0) > 100) {
    context.addIssue({ code: "custom", message: "quantity_limit" });
  }
});

type PaymentAttemptRow = {
  id: string;
  order_id: string;
  amount_cents: number;
  currency: string;
  provider_payment_intent_id: string | null;
  idempotency_key: string;
  status: string;
};

export type CheckoutSessionResult = {
  orderId: string;
  clientSecret: string | null;
  status: string;
  expiresAt: string;
};

function stripeTransferGroup(orderId: string) {
  return `yaqeen_order_${orderId.replaceAll("-", "")}`;
}

async function validateExistingIntent(attempt: PaymentAttemptRow) {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(attempt.provider_payment_intent_id!);
  if (
    intent.metadata.yaqeen_order_id !== attempt.order_id ||
    intent.metadata.yaqeen_payment_attempt_id !== attempt.id ||
    intent.amount !== Number(attempt.amount_cents) ||
    intent.currency.toUpperCase() !== attempt.currency
  ) {
    throw new Error("stripe_payment_intent_reconciliation_failed");
  }
  return intent;
}

export async function createCheckoutSession(input: z.infer<typeof checkoutRequestSchema>): Promise<CheckoutSessionResult> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("authentication_required");

  const userClient = await createClient();
  const { data: orderId, error: reservationError } = await userClient.rpc(
    "create_order_reservation_with_address",
    {
      requested_items: input.items.map((item) => ({
        variant_id: item.variantId,
        quantity: item.quantity,
      })),
      requested_checkout_token: input.checkoutToken,
      requested_address_id: input.addressId,
    },
  );
  if (reservationError || typeof orderId !== "string") {
    throw new Error(reservationError?.message ?? "order_reservation_failed");
  }

  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,customer_id,status,total_cents,currency,expires_at,order_shipping_addresses(order_id)")
    .eq("id", orderId)
    .eq("customer_id", viewer.id)
    .single();
  if (orderError || !order || order.status !== "pending_payment" || !order.order_shipping_addresses) {
    throw new Error("order_not_payable");
  }

  const idempotencyKey = `payment:${order.id}:checkout:${input.checkoutToken}`;
  const { data: attemptId, error: attemptError } = await admin.rpc("create_payment_attempt", {
    requested_order_id: order.id,
    requested_idempotency_key: idempotencyKey,
  });
  if (attemptError || typeof attemptId !== "string") {
    throw new Error(attemptError?.message ?? "payment_attempt_failed");
  }

  const { data: attemptData, error: attemptReadError } = await admin
    .from("payment_attempts")
    .select("id,order_id,amount_cents,currency,provider_payment_intent_id,idempotency_key,status")
    .eq("id", attemptId)
    .single();
  if (attemptReadError || !attemptData) throw new Error("payment_attempt_not_found");
  const attempt = attemptData as PaymentAttemptRow;

  const stripe = getStripe();
  const intent = attempt.provider_payment_intent_id
    ? await validateExistingIntent(attempt)
    : await stripe.paymentIntents.create({
        amount: Number(attempt.amount_cents),
        currency: attempt.currency.toLowerCase(),
        payment_method_types: ["card"],
        transfer_group: stripeTransferGroup(order.id),
        metadata: {
          yaqeen_order_id: order.id,
          yaqeen_payment_attempt_id: attempt.id,
        },
      }, { idempotencyKey: attempt.idempotency_key });

  if (!attempt.provider_payment_intent_id) {
    const { error: attachError } = await admin.rpc("attach_stripe_payment_intent", {
      requested_payment_attempt_id: attempt.id,
      requested_provider_payment_intent_id: intent.id,
    });
    if (attachError) throw new Error(attachError.message);
  }

  return {
    orderId: order.id,
    clientSecret: intent.client_secret,
    status: intent.status,
    expiresAt: order.expires_at,
  };
}
