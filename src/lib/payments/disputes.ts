import "server-only";

import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type PreparedRecovery = {
  recovery_id: string;
  provider_transfer_id: string;
  recovery_amount_cents: number;
  recovery_currency: string;
  recovery_idempotency_key: string;
};

function safeCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.replace(/[^A-Za-z0-9:_-]/g, "_").slice(0, 120) || "stripe_dispute_recovery_failed";
  }
  return "stripe_dispute_recovery_failed";
}

export async function recoverSellerTransfersForDispute(paymentDisputeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("prepare_dispute_transfer_recoveries", {
    requested_payment_dispute_id: paymentDisputeId,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });

  const prepared = (Array.isArray(data) ? data : data ? [data] : []) as PreparedRecovery[];
  for (const recovery of prepared) {
    try {
      const reversal = await getStripe().transfers.createReversal(
        recovery.provider_transfer_id,
        {
          amount: Number(recovery.recovery_amount_cents),
          metadata: { yaqeen_payment_dispute_id: paymentDisputeId },
        },
        { idempotencyKey: recovery.recovery_idempotency_key },
      );
      const { error: completionError } = await admin.rpc("complete_dispute_transfer_recovery", {
        requested_recovery_id: recovery.recovery_id,
        requested_provider_reversal_id: reversal.id,
        requested_amount_cents: reversal.amount,
        requested_currency: reversal.currency,
      });
      if (completionError) {
        throw Object.assign(new Error(completionError.message), { code: completionError.code });
      }
    } catch (error) {
      await admin.rpc("record_dispute_recovery_error", {
        requested_recovery_id: recovery.recovery_id,
        requested_error_code: safeCode(error),
      });
      throw error;
    }
  }
  return { recoveredTransfers: prepared.length };
}

export async function recoverWithdrawnDisputesForPaymentTransfer(paymentTransferId: string) {
  const admin = createAdminClient();
  const { data: transfer, error: transferError } = await admin
    .from("payment_transfers")
    .select("payment_attempt_id")
    .eq("id", paymentTransferId)
    .single();
  if (transferError || !transfer) throw new Error("payment_transfer_not_found");

  const { data: disputes, error } = await admin
    .from("payment_disputes")
    .select("id,amount_cents,payment_attempts(amount_cents)")
    .eq("payment_attempt_id", transfer.payment_attempt_id)
    .eq("funds_status", "withdrawn");
  if (error) throw new Error("payment_dispute_lookup_failed");

  for (const dispute of disputes ?? []) {
    const paymentAmount = dispute.payment_attempts?.[0]?.amount_cents;
    if (Number(dispute.amount_cents) === Number(paymentAmount)) {
      await recoverSellerTransfersForDispute(dispute.id);
    }
  }
}
