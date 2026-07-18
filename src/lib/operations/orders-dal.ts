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
};

export const getOperationsOrders = cache(async (): Promise<OperationsOrder[] | null> => {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_orders")
    .select("id,order_id,status,total_cents,commission_cents,currency,shipping_carrier,tracking_number,delivered_at,shops(name),payment_transfers(status,transfer_cents,provider_transfer_id,last_error_code)")
    .in("status", ["shipped", "delivered"])
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) return null;
  return (data ?? []).map((row) => {
    const transfer = row.payment_transfers?.[0];
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
    };
  });
});
