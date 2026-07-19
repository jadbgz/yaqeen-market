import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type OperationsOrder = {
  id: string;
  orderId: string;
  shopName: string;
  status: string;
  totalCents: number;
  commissionCents: number;
  currency: string;
  carrier: string | null;
  trackingNumber: string | null;
  deliveredAt: string | null;
  transfer: { status: string; amountCents: number; providerId: string | null; errorCode: string | null } | null;
  refund: { status: string; amountCents: number; providerId: string | null; errorCode: string | null } | null;
};

export type OperationsDispute = {
  id: string;
  providerId: string;
  orderId: string;
  status: string;
  fundsStatus: string;
  recoveryStatus: string;
  reasonCode: string;
  amountCents: number;
  currency: string;
  evidenceDueAt: string | null;
  hasEvidence: boolean;
  submissionCount: number;
};

export const getOperationsOrders = cache(async (): Promise<OperationsOrder[] | null> => {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_orders")
    .select("id,order_id,status,total_cents,commission_cents,currency,shipping_carrier,tracking_number,delivered_at,shops(name),payment_transfers(status,transfer_cents,provider_transfer_id,last_error_code),payment_refunds(status,amount_cents,provider_refund_id,last_error_code)")
    .in("status", ["paid", "preparing", "shipped", "delivered", "refunded"])
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) return null;
  return (data ?? []).map((row) => {
    const transfer = row.payment_transfers?.[0];
    const refund = row.payment_refunds?.[0];
    return {
      id: row.id,
      orderId: row.order_id,
      shopName: row.shops?.[0]?.name ?? "Boutique inconnue",
      status: row.status,
      totalCents: Number(row.total_cents),
      commissionCents: Number(row.commission_cents),
      currency: row.currency,
      carrier: row.shipping_carrier,
      trackingNumber: row.tracking_number,
      deliveredAt: row.delivered_at,
      transfer: transfer ? {
        status: transfer.status,
        amountCents: Number(transfer.transfer_cents),
        providerId: transfer.provider_transfer_id,
        errorCode: transfer.last_error_code,
      } : null,
      refund: refund ? {
        status: refund.status,
        amountCents: Number(refund.amount_cents),
        providerId: refund.provider_refund_id,
        errorCode: refund.last_error_code,
      } : null,
    };
  });
});

export const getOperationsDisputes = cache(async (): Promise<OperationsDispute[] | null> => {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_disputes")
    .select("id,provider_dispute_id,status,funds_status,recovery_status,reason_code,amount_cents,currency,evidence_due_at,has_evidence,submission_count,payment_attempts(order_id)")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return null;
  return (data ?? []).map((row) => ({
    id: row.id,
    providerId: row.provider_dispute_id,
    orderId: row.payment_attempts?.[0]?.order_id ?? "",
    status: row.status,
    fundsStatus: row.funds_status,
    recoveryStatus: row.recovery_status,
    reasonCode: row.reason_code,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    evidenceDueAt: row.evidence_due_at,
    hasEvidence: row.has_evidence,
    submissionCount: Number(row.submission_count),
  }));
});
