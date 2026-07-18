import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeTestConfig } from "@/lib/payments/config";
import { getStripe } from "@/lib/payments/stripe";
import { reverseSellerTransferForRefund } from "@/lib/payments/refunds";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const HANDLED_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.requires_action",
  "refund.created",
  "refund.updated",
  "refund.failed",
]);

function stripeState(intent: Stripe.PaymentIntent) {
  if (intent.status === "canceled") return "cancelled";
  if (["requires_payment_method", "requires_action", "processing", "succeeded"].includes(intent.status)) {
    return intent.status;
  }
  return null;
}

function chargeId(intent: Stripe.PaymentIntent) {
  if (typeof intent.latest_charge === "string") return intent.latest_charge;
  return intent.latest_charge?.id ?? null;
}

function safeErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.replace(/[^A-Za-z0-9:_-]/g, "_").slice(0, 120) || "stripe_processing_failed";
  }
  return "stripe_processing_failed";
}

export async function POST(request: Request) {
  const config = getStripeTestConfig();
  if (!config) return NextResponse.json({ error: "webhook_unconfigured" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "signature_required" }, { status: 400 });

  const payload = await request.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.livemode) {
    return NextResponse.json({ error: "livemode_rejected" }, { status: 400 });
  }

  const object = event.data.object as { id?: string };
  const objectId = typeof object.id === "string" ? object.id : null;
  const admin = createAdminClient();
  const payloadHash = createHash("sha256").update(payload).digest("hex");
  const { data: isNew, error: registerError } = await admin.rpc("register_stripe_webhook_event", {
    requested_provider_event_id: event.id,
    requested_event_type: event.type,
    requested_object_id: objectId,
    requested_livemode: event.livemode,
    requested_api_version: event.api_version,
    requested_payload_sha256: payloadHash,
  });
  if (registerError) return NextResponse.json({ error: "event_registration_failed" }, { status: 500 });
  if (!isNew) {
    const { data: existing } = await admin.from("stripe_webhook_events")
      .select("status")
      .eq("provider_event_id", event.id)
      .single();
    if (existing?.status === "processed" || existing?.status === "ignored" || existing?.status === "processing") {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_stripe_webhook_event", {
    requested_provider_event_id: event.id,
  });
  if (claimError || !claimed) {
    return NextResponse.json({ error: "event_claim_failed" }, { status: 500 });
  }

  if (!HANDLED_EVENTS.has(event.type) || (!objectId?.startsWith("pi_") && !objectId?.startsWith("re_"))) {
    await admin.rpc("complete_stripe_webhook_event", {
      requested_provider_event_id: event.id,
      requested_outcome: "ignored",
      requested_error_code: null,
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    if (objectId.startsWith("re_")) {
      const refund = await stripe.refunds.retrieve(objectId);
      const localRefundId = refund.metadata?.yaqeen_payment_refund_id;
      if (!localRefundId) throw Object.assign(new Error("refund_metadata_missing"), { code: "refund_metadata_missing" });
      const { error: refundError } = await admin.rpc("apply_stripe_refund_state", {
        requested_payment_refund_id: localRefundId,
        requested_provider_refund_id: refund.id,
        requested_status: refund.status,
        requested_amount_cents: refund.amount,
        requested_currency: refund.currency,
        requested_failure_reason: refund.failure_reason ?? null,
      });
      if (refundError) throw Object.assign(new Error(refundError.message), { code: refundError.code });
      if (refund.status === "succeeded") await reverseSellerTransferForRefund(localRefundId);
      const { error: completeRefundEventError } = await admin.rpc("complete_stripe_webhook_event", {
        requested_provider_event_id: event.id,
        requested_outcome: "processed",
        requested_error_code: null,
      });
      if (completeRefundEventError) throw completeRefundEventError;
      return NextResponse.json({ received: true });
    }

    const intent = await stripe.paymentIntents.retrieve(objectId, { expand: ["latest_charge"] });
    const localStatus = stripeState(intent);
    if (!localStatus) {
      await admin.rpc("complete_stripe_webhook_event", {
        requested_provider_event_id: event.id,
        requested_outcome: "ignored",
        requested_error_code: null,
      });
      return NextResponse.json({ received: true, ignored: true });
    }
    if (localStatus === "succeeded" && intent.amount_received !== intent.amount) {
      throw Object.assign(new Error("stripe_amount_received_mismatch"), { code: "stripe_amount_received_mismatch" });
    }

    const { error: transitionError } = await admin.rpc("apply_stripe_payment_intent_state", {
      requested_provider_payment_intent_id: intent.id,
      requested_status: localStatus,
      requested_amount_cents: intent.amount,
      requested_currency: intent.currency,
      requested_provider_charge_id: chargeId(intent),
      requested_last_error_code: intent.last_payment_error?.code ?? null,
    });
    if (transitionError) throw Object.assign(new Error(transitionError.message), { code: transitionError.code });

    const { error: completeError } = await admin.rpc("complete_stripe_webhook_event", {
      requested_provider_event_id: event.id,
      requested_outcome: "processed",
      requested_error_code: null,
    });
    if (completeError) throw completeError;
    return NextResponse.json({ received: true });
  } catch (error) {
    await admin.rpc("complete_stripe_webhook_event", {
      requested_provider_event_id: event.id,
      requested_outcome: "failed",
      requested_error_code: safeErrorCode(error),
    });
    return NextResponse.json({ error: "event_processing_failed" }, { status: 500 });
  }
}
