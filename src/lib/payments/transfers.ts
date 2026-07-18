import "server-only";

import { getViewer } from "@/lib/auth/dal";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type PreparedTransfer = {
  payment_transfer_id: string;
  provider_account_id: string;
  provider_charge_id: string;
  transfer_amount_cents: number;
  transfer_currency: string;
  transfer_idempotency_key: string;
  aggregate_order_id: string;
};

function safeStripeErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.replace(/[^A-Za-z0-9:_-]/g, "_").slice(0, 120) || "stripe_transfer_failed";
  }
  return "stripe_transfer_failed";
}

export async function releaseSellerTransfer(shopOrderId: string) {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) {
    throw new Error("operator_required");
  }

  const admin = createAdminClient();
  const idempotencyKey = `transfer:${shopOrderId}:delivery-release:v1`;
  const { data, error } = await admin.rpc("prepare_payment_transfer", {
    requested_shop_order_id: shopOrderId,
    requested_idempotency_key: idempotencyKey,
  });
  const prepared = (Array.isArray(data) ? data[0] : data) as PreparedTransfer | null;
  if (error || !prepared) throw new Error(error?.message ?? "payment_transfer_preparation_failed");

  const stripe = getStripe();
  try {
    const transfer = await stripe.transfers.create({
      amount: Number(prepared.transfer_amount_cents),
      currency: prepared.transfer_currency.toLowerCase(),
      destination: prepared.provider_account_id,
      source_transaction: prepared.provider_charge_id,
      transfer_group: `yaqeen_order_${prepared.aggregate_order_id.replaceAll("-", "")}`,
      metadata: {
        yaqeen_order_id: prepared.aggregate_order_id,
        yaqeen_shop_order_id: shopOrderId,
        yaqeen_payment_transfer_id: prepared.payment_transfer_id,
      },
    }, { idempotencyKey: prepared.transfer_idempotency_key });

    if (!transfer.destination || transfer.livemode || transfer.reversed) {
      throw Object.assign(new Error("stripe_transfer_state_invalid"), { code: "stripe_transfer_state_invalid" });
    }
    const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination.id;

    const { error: completionError } = await admin.rpc("complete_payment_transfer", {
      requested_payment_transfer_id: prepared.payment_transfer_id,
      requested_provider_transfer_id: transfer.id,
      requested_amount_cents: transfer.amount,
      requested_currency: transfer.currency,
      requested_destination_account_id: destination,
    });
    if (completionError) throw Object.assign(new Error(completionError.message), { code: completionError.code });
    return { status: "submitted", transferId: prepared.payment_transfer_id };
  } catch (error) {
    await admin.rpc("record_payment_transfer_error", {
      requested_payment_transfer_id: prepared.payment_transfer_id,
      requested_error_code: safeStripeErrorCode(error),
    });
    throw error;
  }
}
