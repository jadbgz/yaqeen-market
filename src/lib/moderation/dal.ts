import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type ModerationQueue = {
  shops: Array<{ id: string; name: string; slug: string; description: string | null; country: string | null }>;
  products: Array<{
    id: string;
    title: string;
    category: string;
    description: string | null;
    shopName: string;
    evidence: Array<{ id: string; kind: string; scope: string; issuerName: string | null; referenceNumber: string | null; proposedSummary: string | null; validFrom: string | null; validUntil: string | null }>;
    variants: Array<{ title: string; sku: string; priceCents: number; stock: number }>;
    media: Array<{ id: string; position: number; altText: string; width: number; height: number; byteSize: number; signedUrl: string | null }>;
  }>;
};

export const getModerationQueue = cache(async (): Promise<ModerationQueue | null> => {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) return null;

  const supabase = await createClient();
  const [{ data: shops }, { data: products }] = await Promise.all([
    supabase.from("shops").select("id, name, slug, description, ships_from_country").eq("status", "under_review").order("created_at"),
    supabase.from("products").select("id, shop_id, title, category, description").eq("status", "under_review").order("created_at"),
  ]);

  const productRows = products ?? [];
  const productIds = productRows.map((product) => product.id);
  const shopIds = [...new Set(productRows.map((product) => product.shop_id))];
  const [{ data: productShops }, { data: evidence }, { data: variants }, { data: media }] = await Promise.all([
    shopIds.length ? supabase.from("shops").select("id, name").in("id", shopIds) : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("product_evidence").select("id, product_id, kind, scope, issuer_name, reference_number, public_summary, valid_from, valid_until").in("product_id", productIds).eq("status", "pending").order("created_at") : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("product_variants").select("product_id, title, sku, price_cents, stock_on_hand").in("product_id", productIds).eq("active", true).order("created_at") : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("product_media").select("id, product_id, position, alt_text, width, height, byte_size, storage_path").in("product_id", productIds).eq("status", "pending").order("position") : Promise.resolve({ data: [] }),
  ]);
  const mediaRows = media ?? [];
  const { data: signedMedia } = mediaRows.length
    ? await supabase.storage.from("product-media").createSignedUrls(mediaRows.map((item) => item.storage_path), 600)
    : { data: [] };
  const signedByPath = new Map((signedMedia ?? []).map((item) => [item.path, item.signedUrl]));

  return {
    shops: (shops ?? []).map((shop) => ({ id: shop.id, name: shop.name, slug: shop.slug, description: shop.description, country: shop.ships_from_country })),
    products: productRows.map((product) => {
      const productEvidence = evidence?.filter((item) => item.product_id === product.id) ?? [];
      const productVariants = variants?.filter((item) => item.product_id === product.id) ?? [];
      return {
        id: product.id,
        title: product.title,
        category: product.category,
        description: product.description,
        shopName: productShops?.find((shop) => shop.id === product.shop_id)?.name ?? "Boutique inconnue",
        evidence: productEvidence.map((proof) => ({ id: proof.id, kind: proof.kind, scope: proof.scope, issuerName: proof.issuer_name, referenceNumber: proof.reference_number, proposedSummary: proof.public_summary, validFrom: proof.valid_from, validUntil: proof.valid_until })),
        variants: productVariants.map((variant) => ({ title: variant.title, sku: variant.sku, priceCents: variant.price_cents, stock: variant.stock_on_hand })),
        media: mediaRows.filter((item) => item.product_id === product.id).map((item) => ({
          id: item.id,
          position: item.position,
          altText: item.alt_text,
          width: item.width,
          height: item.height,
          byteSize: item.byte_size,
          signedUrl: signedByPath.get(item.storage_path) ?? null,
        })),
      };
    }),
  };
});
