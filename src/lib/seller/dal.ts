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
  };
  metrics: {
    products: number;
    publishedProducts: number;
    availableStock: number;
    pendingEvidence: number;
  };
};

export const getSellerDashboard = cache(async (): Promise<SellerDashboard | null> => {
  const viewer = await getViewer();
  if (!viewer) return null;

  const supabase = await createClient();
  let { data: shop } = await supabase
    .from("shops")
    .select("id, name, slug, status")
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
        .select("id, name, slug, status")
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
    shop,
    metrics: {
      products: productRows.length,
      publishedProducts: productRows.filter((product) => product.status === "published").length,
      availableStock,
      pendingEvidence,
    },
  };
});
