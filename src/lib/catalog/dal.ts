import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { categoryLabel, categoryValue } from "@/lib/catalog/format";
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

const CATALOG_ROW_SELECT = `
  id, slug, title, description, category, verification_summary, published_at,
  shops!inner(slug, name, status),
  product_variants(id, title, price_cents, currency, stock_on_hand, stock_reserved, active),
  product_evidence(kind, status, issuer_name, reference_number, scope, valid_from, valid_until, public_summary)
  ,product_media(storage_path, status, position, alt_text, width, height)
`;

function createPublicClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

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

async function signAndMap(supabase: SupabaseClient, rows: PublicCatalogRow[]): Promise<PublicProduct[]> {
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

async function queryPublishedProducts(): Promise<PublicProduct[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("products")
    .select(CATALOG_ROW_SELECT)
    .eq("status", "published")
    .eq("shops.status", "approved")
    .eq("product_variants.active", true)
    .eq("product_evidence.status", "approved")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("Unable to load the public catalog", error.message);
    return [];
  }

  return signAndMap(supabase, (data ?? []) as unknown as PublicCatalogRow[]);
}

const getPublishedProducts = cache(queryPublishedProducts);

async function hydrateProductsByIds(supabase: SupabaseClient, ids: string[]): Promise<PublicProduct[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("products")
    .select(CATALOG_ROW_SELECT)
    .in("id", ids)
    .eq("status", "published")
    .eq("shops.status", "approved")
    .eq("product_variants.active", true)
    .eq("product_evidence.status", "approved");

  if (error) {
    console.error("Unable to hydrate the public catalog page", error.message);
    return [];
  }

  const products = await signAndMap(supabase, (data ?? []) as unknown as PublicCatalogRow[]);
  const rank = new Map(ids.map((id, index) => [id, index]));
  return products.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

export type PublicCatalogQuery = {
  q?: string;
  category?: string;
  sort?: string;
  availability?: "all" | "available";
  min?: number;
  max?: number;
  page?: number;
  pageSize?: number;
};

export type PublicCatalogPage = {
  products: PublicProduct[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const DEFAULT_PAGE_SIZE = 24;
const eurosToCents = (value: number | undefined) =>
  value === undefined ? null : Math.round(value * 100);

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr");
}

function legacyFilter(products: PublicProduct[], options: PublicCatalogQuery): PublicProduct[] {
  const q = normalizeText(options.q?.trim() ?? "");
  const category = options.category?.trim().toLocaleLowerCase("fr") ?? "";
  const filtered = products.filter(
    (product) =>
      (!category || category === "tous" || product.category.toLocaleLowerCase("fr") === category) &&
      (!q || normalizeText(`${product.name} ${product.shop} ${product.category} ${product.description} ${product.verificationSummary}`).includes(q)) &&
      (options.availability !== "available" || product.stock > 0) &&
      (options.min === undefined || product.price >= options.min) &&
      (options.max === undefined || product.price <= options.max),
  );

  filtered.sort((a, b) => {
    if (options.sort === "prix-asc") return a.price - b.price;
    if (options.sort === "prix-desc") return b.price - a.price;
    return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  });

  return filtered;
}

// SQL-side search with a graceful fallback while the search migration is not
// yet applied to the connected Supabase project.
export async function getPublicCatalogPage(options: PublicCatalogQuery = {}): Promise<PublicCatalogPage> {
  const pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1), 48);
  const page = Math.max(options.page ?? 1, 1);
  const empty: PublicCatalogPage = { products: [], total: 0, page, pageSize, pageCount: 0 };

  const supabase = createPublicClient();
  if (!supabase) return empty;

  const { data, error } = await supabase.rpc("search_public_catalog", {
    requested_query: options.q?.trim() || null,
    requested_category: options.category ? categoryValue(options.category) : null,
    requested_min_cents: eurosToCents(options.min),
    requested_max_cents: eurosToCents(options.max),
    requested_only_available: options.availability === "available",
    requested_sort: options.sort ?? "selection",
    requested_limit: pageSize,
    requested_offset: (page - 1) * pageSize,
  });

  if (error) {
    console.error("Catalog search RPC unavailable, using in-memory fallback", error.message);
    const filtered = legacyFilter(await getPublishedProducts(), options);
    const start = (page - 1) * pageSize;
    return {
      products: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      pageCount: Math.ceil(filtered.length / pageSize),
    };
  }

  const rows = (data ?? []) as Array<{ product_id: string; total_count: number }>;
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const products = await hydrateProductsByIds(supabase, rows.map((row) => row.product_id));
  return { products, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export async function getPublicCategoryCounts(options: Omit<PublicCatalogQuery, "category" | "page" | "pageSize" | "sort"> = {}): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const supabase = createPublicClient();
  if (!supabase) return counts;

  const { data, error } = await supabase.rpc("count_public_catalog_by_category", {
    requested_query: options.q?.trim() || null,
    requested_min_cents: eurosToCents(options.min),
    requested_max_cents: eurosToCents(options.max),
    requested_only_available: options.availability === "available",
  });

  if (error) {
    console.error("Catalog facet RPC unavailable, using in-memory fallback", error.message);
    const filtered = legacyFilter(await getPublishedProducts(), { ...options, category: "Tous" });
    for (const product of filtered) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    counts.set("Tous", filtered.length);
    return counts;
  }

  let total = 0;
  for (const row of (data ?? []) as Array<{ category: string; total: number }>) {
    counts.set(categoryLabel(row.category), Number(row.total));
    total += Number(row.total);
  }
  counts.set("Tous", total);
  return counts;
}

export async function getPublicProducts(options: PublicCatalogQuery & { limit?: number } = {}) {
  const { products } = await getPublicCatalogPage({
    ...options,
    pageSize: options.limit ?? options.pageSize ?? DEFAULT_PAGE_SIZE,
  });
  return products;
}

export async function getPublicProduct(shopSlug: string, productSlug: string) {
  const supabase = createPublicClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("products")
    .select(CATALOG_ROW_SELECT)
    .eq("slug", productSlug)
    .eq("shops.slug", shopSlug)
    .eq("status", "published")
    .eq("shops.status", "approved")
    .eq("product_variants.active", true)
    .eq("product_evidence.status", "approved")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Unable to load the public product", error.message);
    return null;
  }
  if (!data) return null;

  const [product] = await signAndMap(supabase, [data as unknown as PublicCatalogRow]);
  return product ?? null;
}

// Full published catalog (cached per request); reserved for sitemap generation.
export async function getPublishedProductsForSitemap(limit = 1000): Promise<PublicProduct[]> {
  return (await getPublishedProducts()).slice(0, limit);
}
