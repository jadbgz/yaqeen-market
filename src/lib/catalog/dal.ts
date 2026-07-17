import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { categoryLabel } from "@/lib/catalog/format";
import type { PublicProduct } from "@/lib/catalog/types";

type PublicCatalogRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  verification_summary: string | null;
  published_at: string | null;
  shops: { slug: string; name: string; status: string } | null;
  product_variants: Array<{
    id: string;
    title: string;
    price_cents: number;
    currency: string;
    stock_on_hand: number;
    stock_reserved: number;
    active: boolean;
  }>;
  product_evidence: Array<{
    kind: string;
    status: string;
    issuer_name: string | null;
    reference_number: string | null;
    scope: string;
    valid_from: string | null;
    valid_until: string | null;
    public_summary: string | null;
  }>;
  product_media: Array<{
    storage_path: string;
    status: string;
    position: number;
    alt_text: string;
    width: number;
    height: number;
  }>;
};

const visualByCategory: Record<string, { color: string; shape: string }> = {
  parfums: { color: "#234f48", shape: "bottle" },
  cosmetiques: { color: "#945d48", shape: "soap" },
  livres: { color: "#9c7540", shape: "book" },
  mode: { color: "#5e746c", shape: "fabric" },
  "bien-etre": { color: "#73825c", shape: "oil" },
  complements: { color: "#1d2d3f", shape: "bottle" },
  maison: { color: "#d09b47", shape: "box" },
};

function toPublicProduct(row: PublicCatalogRow, signedByPath: Map<string, string>): PublicProduct | null {
  const shop = row.shops;
  const variant = row.product_variants
    .filter((item) => item.active && item.price_cents > 0)
    .sort((a, b) => a.price_cents - b.price_cents)[0];
  const evidence = row.product_evidence.find(
    (item) => item.status === "approved" && item.public_summary,
  );
  const media = row.product_media
    .filter((item) => item.status === "approved" && signedByPath.has(item.storage_path))
    .sort((a, b) => a.position - b.position);

  if (!shop || shop.status !== "approved" || !variant || !evidence?.public_summary || media.length === 0) return null;

  const visual = visualByCategory[row.category] ?? { color: "#49645b", shape: "box" };
  return {
    id: row.id,
    slug: row.slug,
    shopSlug: shop.slug,
    name: row.title,
    shop: shop.name,
    category: categoryLabel(row.category),
    description: row.description ?? "",
    verificationSummary: row.verification_summary ?? evidence.public_summary,
    price: variant.price_cents / 100,
    currency: variant.currency,
    stock: Math.max(0, variant.stock_on_hand - variant.stock_reserved),
    variantId: variant.id,
    variantTitle: variant.title,
    color: visual.color,
    shape: visual.shape,
    evidence: {
      kind: evidence.kind,
      issuerName: evidence.issuer_name,
      referenceNumber: evidence.reference_number,
      scope: evidence.scope,
      validFrom: evidence.valid_from,
      validUntil: evidence.valid_until,
      publicSummary: evidence.public_summary,
    },
    media: media.map((item) => ({
      url: signedByPath.get(item.storage_path)!,
      altText: item.alt_text,
      width: item.width,
      height: item.height,
      position: item.position,
    })),
    publishedAt: row.published_at,
  };
}

async function queryPublishedProducts(): Promise<PublicProduct[]> {
  const config = getSupabaseConfig();
  if (!config) return [];

  const supabase = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase
    .from("products")
    .select(`
      id, slug, title, description, category, verification_summary, published_at,
      shops!inner(slug, name, status),
      product_variants(id, title, price_cents, currency, stock_on_hand, stock_reserved, active),
      product_evidence(kind, status, issuer_name, reference_number, scope, valid_from, valid_until, public_summary)
      ,product_media(storage_path, status, position, alt_text, width, height)
    `)
    .eq("status", "published")
    .eq("shops.status", "approved")
    .eq("product_variants.active", true)
    .eq("product_evidence.status", "approved")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("Unable to load the public catalog", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as PublicCatalogRow[];
  const paths = rows.flatMap((row) => row.product_media.filter((item) => item.status === "approved").map((item) => item.storage_path));
  const { data: signed, error: signError } = paths.length
    ? await supabase.storage.from("product-media").createSignedUrls(paths, 3600)
    : { data: [], error: null };
  if (signError) {
    console.error("Unable to sign public product media", signError.message);
    return [];
  }
  const signedByPath = new Map<string, string>();
  for (const item of signed ?? []) {
    if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
  }

  return rows
    .map((row) => toPublicProduct(row, signedByPath))
    .filter((product): product is PublicProduct => product !== null);
}

const getPublishedProducts = cache(queryPublishedProducts);

export async function getPublicProducts(options: {
  q?: string;
  category?: string;
  sort?: string;
  limit?: number;
} = {}) {
  const q = options.q?.trim().toLocaleLowerCase("fr") ?? "";
  const category = options.category?.trim().toLocaleLowerCase("fr") ?? "";
  const products = (await getPublishedProducts()).filter(
    (product) =>
      (!category || category === "tous" || product.category.toLocaleLowerCase("fr") === category) &&
      (!q || `${product.name} ${product.shop}`.toLocaleLowerCase("fr").includes(q)),
  );

  products.sort((a, b) => {
    if (options.sort === "prix-asc") return a.price - b.price;
    if (options.sort === "prix-desc") return b.price - a.price;
    return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  });

  return typeof options.limit === "number" ? products.slice(0, options.limit) : products;
}

export async function getPublicProduct(shopSlug: string, productSlug: string) {
  return (await getPublishedProducts()).find(
    (product) => product.shopSlug === shopSlug && product.slug === productSlug,
  ) ?? null;
}
