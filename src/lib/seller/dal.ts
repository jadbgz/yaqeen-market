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
