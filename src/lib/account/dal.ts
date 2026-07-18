import "server-only";

import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type CustomerAddress = {
  id: string;
  label: string;
  recipientName: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  isDefault: boolean;
};

export type CustomerOrder = {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  shops: Array<{ id: string; status: string; subtotalCents: number }>;
};

export async function getCustomerAddresses(): Promise<CustomerAddress[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_addresses")
    .select("id,label,recipient_name,line1,line2,postal_code,city,country_code,phone,is_default")
    .order("is_default", { ascending: false })
    .order("created_at");

  return (data ?? []).map((address) => ({
    id: address.id,
    label: address.label,
    recipientName: address.recipient_name,
    line1: address.line1,
    line2: address.line2,
    postalCode: address.postal_code,
    city: address.city,
    countryCode: address.country_code,
    phone: address.phone,
    isDefault: address.is_default,
  }));
}

export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id,status,total_cents,currency,created_at,shop_orders(id,status,subtotal_cents)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((order) => ({
    id: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    currency: order.currency,
    createdAt: order.created_at,
    shops: (order.shop_orders ?? []).map((shop) => ({
      id: shop.id,
      status: shop.status,
      subtotalCents: Number(shop.subtotal_cents),
    })),
  }));
}

export async function getCustomerOrder(orderId: string): Promise<CustomerOrder | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id,status,total_cents,currency,created_at,shop_orders(id,status,subtotal_cents)")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    totalCents: Number(data.total_cents),
    currency: data.currency,
    createdAt: data.created_at,
    shops: (data.shop_orders ?? []).map((shop) => ({
      id: shop.id,
      status: shop.status,
      subtotalCents: Number(shop.subtotal_cents),
    })),
  };
}

export async function getPendingDeletionRequest() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_deletion_requests")
    .select("scheduled_for,requested_at")
    .eq("status", "pending")
    .maybeSingle();
  return data
    ? { scheduledFor: data.scheduled_for, requestedAt: data.requested_at }
    : null;
}
