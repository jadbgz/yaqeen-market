import "server-only";

import { getViewer } from "@/lib/auth/dal";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RefundSource = {
  id: string;
  provider_refund_id: string | null;
  idempotency_key: string;
  reason_code: "requested_by_customer" | "duplicate" | "fraudulent";
  amount_cents: number;
  currency: string;
  shop_order_id: string;
  payment_attempts: Array<{ provider_charge_id: string | null }>;
};

type PreparedReversal = {
  reversal_record_id: string;
  provider_transfer_id: string;
  reversal_amount_cents: number;
  reversal_currency: string;
  reversal_idempotency_key: string;
};

function safeCode(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.replace(/[^A-Za-z0-9:_-]/g, "_").slice(0, 120) || fallback;
  }
  return fallback;
}

export async function initiateShopOrderRefund(input: {
  shopOrderId: string;
  reasonCode: "requested_by_customer" | "duplicate" | "fraudulent";
  rationale: string;
}) {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) throw new Error("operator_required");
  const userClient = await createClient();
  const idempotencyKey = `refund:${input.shopOrderId}:full:v1`;
  const { data: refundId, error: requestError } = await userClient.rpc("request_shop_order_refund", {
    requested_shop_order_id: input.shopOrderId,
    requested_reason_code: input.reasonCode,
    requested_rationale: input.rationale,
    requested_idempotency_key: idempotencyKey,
  });
  if (requestError || typeof refundId !== "string") throw new Error(requestError?.message ?? "refund_request_failed");

  const admin = createAdminClient();
  const { data, error } = await admin.from("payment_refunds")
    .select("id,provider_refund_id,idempotency_key,reason_code,amount_cents,currency,shop_order_id,payment_attempts(provider_charge_id)")
    .eq("id", refundId).single();
  const source = data as RefundSource | null;
  if (error || !source) throw new Error("refund_source_not_found");
  if (source.provider_refund_id) return { status: "submitted", refundId: source.id };
  const chargeId = source.payment_attempts?.[0]?.provider_charge_id;
  if (!chargeId) throw new Error("refund_charge_not_found");

  const refund = await getStripe().refunds.create({
    charge: chargeId,
    amount: Number(source.amount_cents),
    reason: source.reason_code,
    metadata: {
      yaqeen_payment_refund_id: source.id,
      yaqeen_shop_order_id: source.shop_order_id,
    },
  }, { idempotencyKey: source.idempotency_key });
  if (refund.amount !== Number(source.amount_cents) || refund.currency.toUpperCase() !== source.currency) {
    throw new Error("stripe_refund_reconciliation_failed");
  }
  const { error: attachError } = await admin.rpc("attach_stripe_refund", {
    requested_payment_refund_id: source.id,
    requested_provider_refund_id: refund.id,
  });
  if (attachError) throw new Error(attachError.message);
  return { status: refund.status, refundId: source.id };
}

export async function reverseSellerTransferForRefund(paymentRefundId: string) {
  const admin = createAdminClient();
  const idempotencyKey = `reversal:${paymentRefundId}:full:v1`;
  const { data, error } = await admin.rpc("prepare_transfer_reversal", {
    requested_payment_refund_id: paymentRefundId,
    requested_idempotency_key: idempotencyKey,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const prepared = (Array.isArray(data) ? data[0] : data) as PreparedReversal | null;
  if (!prepared) return { status: "not_required" };
  try {
    const reversal = await getStripe().transfers.createReversal(
      prepared.provider_transfer_id,
      { amount: Number(prepared.reversal_amount_cents), metadata: { yaqeen_payment_refund_id: paymentRefundId } },
      { idempotencyKey: prepared.reversal_idempotency_key },
    );
    const { error: completionError } = await admin.rpc("complete_transfer_reversal", {
      requested_reversal_record_id: prepared.reversal_record_id,
      requested_provider_reversal_id: reversal.id,
      requested_amount_cents: reversal.amount,
      requested_currency: reversal.currency,
    });
    if (completionError) throw Object.assign(new Error(completionError.message), { code: completionError.code });
    return { status: "submitted" };
  } catch (error) {
    await admin.rpc("record_transfer_reversal_error", {
      requested_reversal_record_id: prepared.reversal_record_id,
      requested_error_code: safeCode(error, "stripe_reversal_failed"),
    });
    throw error;
  }
}
