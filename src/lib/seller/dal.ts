import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type SellerDashboard = {
  shop: {
    id: string;
    name: string;
    slug: string;
    status: "draft" | "under_review" | "approved" | "suspended" | "rejected";
    shipsFromCountry: string;
  };
  metrics: {
    products: number;
    publishedProducts: number;
    availableStock: number;
    pendingEvidence: number;
  };
};

export type SellerProduct = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: "draft" | "under_review" | "published" | "rejected" | "archived";
  createdAt: string;
  variant: {
    sku: string;
    title: string;
    priceCents: number;
    currency: string;
    availableStock: number;
  } | null;
  evidenceStatus: "pending" | "approved" | "rejected" | "expired" | "revoked" | null;
  mediaCount: number;
};

export type SellerProductMedia = {
  id: string;
  productId: string;
  position: number;
  altText: string;
  status: "pending" | "approved" | "rejected";
  width: number;
  height: number;
  byteSize: number;
  storagePath: string;
  signedUrl: string | null;
};

export type SellerOrder = {
  id: string;
  aggregateOrderId: string;
  status: string;
  currency: string;
  totalCents: number;
  createdAt: string;
  shippedAt: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  address: {
    recipientName: string;
    line1: string;
    line2: string | null;
    postalCode: string;
    city: string;
    countryCode: string;
    phone: string | null;
  } | null;
  items: Array<{
    id: string;
    productTitle: string;
    variantTitle: string;
    sku: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }>;
};

export const getSellerDashboard = cache(async (): Promise<SellerDashboard | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;

  const supabase = await createClient();
  let { data: shop } = await supabase
    .from("shops")
    .select("id, name, slug, status, ships_from_country")
    .eq("owner_id", viewer.id)
    .limit(1)
    .maybeSingle();

  if (!shop) {
    const { data: membership } = await supabase
      .from("shop_members")
      .select("shop_id")
      .eq("user_id", viewer.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      const result = await supabase
        .from("shops")
        .select("id, name, slug, status, ships_from_country")
        .eq("id", membership.shop_id)
        .maybeSingle();
      shop = result.data;
    }
  }

  if (!shop) return null;

  const { data: products } = await supabase
    .from("products")
    .select("id, status")
    .eq("shop_id", shop.id);

  const productRows = products ?? [];
  const productIds = productRows.map((product) => product.id);
  let availableStock = 0;
  let pendingEvidence = 0;

  if (productIds.length > 0) {
    const [{ data: variants }, { data: evidence }] = await Promise.all([
      supabase
        .from("product_variants")
        .select("stock_on_hand, stock_reserved")
        .in("product_id", productIds)
        .eq("active", true),
      supabase
        .from("product_evidence")
        .select("id")
        .in("product_id", productIds)
        .eq("status", "pending"),
    ]);

    availableStock = (variants ?? []).reduce(
      (total, variant) => total + Math.max(0, variant.stock_on_hand - variant.stock_reserved),
      0,
    );
    pendingEvidence = evidence?.length ?? 0;
  }

  return {
    shop: {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      status: shop.status,
      shipsFromCountry: shop.ships_from_country,
    },
    metrics: {
      products: productRows.length,
      publishedProducts: productRows.filter((product) => product.status === "published").length,
      availableStock,
      pendingEvidence,
    },
  };
});

export const getSellerPaymentState = cache(async () => {
  const dashboard = await getSellerDashboard();
  if (!dashboard) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("shop_payment_accounts")
    .select("status,transfers_enabled,requirements_due_count,last_synced_at")
    .eq("shop_id", dashboard.shop.id)
    .maybeSingle();
  return {
    status: data?.status ?? "not_started",
    transfersEnabled: data?.transfers_enabled ?? false,
    requirementsDue: data?.requirements_due_count ?? 0,
    lastSyncedAt: data?.last_synced_at ?? null,
  };
});

export const getSellerOrders = cache(async (): Promise<SellerOrder[] | null> => {
  const dashboard = await getSellerDashboard();
  if (!dashboard) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("shop_orders")
    .select("id,order_id,status,currency,total_cents,created_at,shipped_at,shipping_carrier,tracking_number,order_items(id,product_title,variant_title,sku,unit_price_cents,quantity,line_total_cents)")
    .eq("shop_id", dashboard.shop.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const orderIds = [...new Set((data ?? []).map((order) => order.order_id))];
  const { data: addresses } = orderIds.length > 0
    ? await supabase
      .from("order_shipping_addresses")
      .select("order_id,recipient_name,line1,line2,postal_code,city,country_code,phone")
      .in("order_id", orderIds)
    : { data: [] };
  const addressByOrderId = new Map((addresses ?? []).map((address) => [address.order_id, address]));

  return (data ?? []).map((order) => {
    const address = addressByOrderId.get(order.order_id);
    return {
      id: order.id,
      aggregateOrderId: order.order_id,
      status: order.status,
      currency: order.currency,
      totalCents: Number(order.total_cents),
      createdAt: order.created_at,
      shippedAt: order.shipped_at,
      shippingCarrier: order.shipping_carrier,
      trackingNumber: order.tracking_number,
      address: address ? {
        recipientName: address.recipient_name,
        line1: address.line1,
        line2: address.line2,
        postalCode: address.postal_code,
        city: address.city,
        countryCode: address.country_code,
        phone: address.phone,
      } : null,
      items: (order.order_items ?? []).map((item) => ({
        id: item.id,
        productTitle: item.product_title,
        variantTitle: item.variant_title,
        sku: item.sku,
        unitPriceCents: item.unit_price_cents,
        quantity: item.quantity,
        lineTotalCents: Number(item.line_total_cents),
      })),
    };
  });
});

export const getSellerProducts = cache(async (): Promise<SellerProduct[] | null> => {
  const dashboard = await getSellerDashboard();
  if (!dashboard) return null;

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, slug, title, category, status, created_at")
    .eq("shop_id", dashboard.shop.id)
    .order("created_at", { ascending: false });

  const rows = products ?? [];
  if (rows.length === 0) return [];
  const productIds = rows.map((product) => product.id);
  const [{ data: variants }, { data: evidence }, { data: media }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("product_id, sku, title, price_cents, currency, stock_on_hand, stock_reserved")
      .in("product_id", productIds)
      .eq("active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("product_evidence")
      .select("product_id, status, created_at")
      .in("product_id", productIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_media")
      .select("product_id")
      .in("product_id", productIds)
      .in("status", ["pending", "approved"]),
  ]);

  return rows.map((product) => {
    const variant = variants?.find((item) => item.product_id === product.id);
    const proof = evidence?.find((item) => item.product_id === product.id);
    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      category: product.category,
      status: product.status,
      createdAt: product.created_at,
      variant: variant ? {
        sku: variant.sku,
        title: variant.title,
        priceCents: variant.price_cents,
        currency: variant.currency,
        availableStock: Math.max(0, variant.stock_on_hand - variant.stock_reserved),
      } : null,
      evidenceStatus: proof?.status ?? null,
      mediaCount: media?.filter((item) => item.product_id === product.id).length ?? 0,
    };
  });
});

export const getSellerProductMedia = cache(async (productId: string): Promise<SellerProductMedia[] | null> => {
  const dashboard = await getSellerDashboard();
  if (!dashboard) return null;
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("shop_id", dashboard.shop.id)
    .maybeSingle();
  if (!product) return null;

  const { data } = await supabase
    .from("product_media")
    .select("id, product_id, position, alt_text, status, width, height, byte_size, storage_path")
    .eq("product_id", productId)
    .order("position");
  const rows = data ?? [];
  const { data: signed } = rows.length
    ? await supabase.storage.from("product-media").createSignedUrls(rows.map((item) => item.storage_path), 600)
    : { data: [] };
  const signedByPath = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));

  return rows.map((item) => ({
    id: item.id,
    productId: item.product_id,
    position: item.position,
    altText: item.alt_text,
    status: item.status,
    width: item.width,
    height: item.height,
    byteSize: item.byte_size,
    storagePath: item.storage_path,
    signedUrl: signedByPath.get(item.storage_path) ?? null,
  }));
});
