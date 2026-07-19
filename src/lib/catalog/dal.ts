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

function toPublicProduct(row: PublicCatalogRow, signedByPath: Map<string, string>, preferredVariantId?: string): PublicProduct | null {
  const eligibleVariants = row.product_variants
    .filter((item) => item.active && item.price_cents > 0)
    .sort((a, b) => a.price_cents - b.price_cents);
  const shop = row.shops;
  // The SQL search decides which variant qualified the product; the storefront
  // must show that exact variant so price and stock never contradict filters.
  const variant = (preferredVariantId && eligibleVariants.find((item) => item.id === preferredVariantId))
    || eligibleVariants.find((item) => item.stock_on_hand - item.stock_reserved > 0)
    || eligibleVariants[0];
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

async function signAndMap(supabase: SupabaseClient, rows: PublicCatalogRow[], preferredVariantByProduct?: Map<string, string>): Promise<PublicProduct[]> {
  const paths = rows.flatMap((row) => row.product_media.filter((item) => item.status === "approved").map((item) => item.storage_path));
  const { data: signed, error: signError } = paths.length
    ? await supabase.storage.from("product-media").createSignedUrls(paths, 3600)
    : { data: [], error: null };
  if (signError) {
    console.error("Unable to sign public product media", signError.message);
    throw new Error("Unable to prepare public product media");
  }
  const signedByPath = new Map<string, string>();
  for (const item of signed ?? []) {
    if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
  }

  return rows
    .map((row) => toPublicProduct(row, signedByPath, preferredVariantByProduct?.get(row.id)))
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

async function hydrateProductsByIds(
  supabase: SupabaseClient,
  ids: string[],
  preferredVariantByProduct?: Map<string, string>,
): Promise<PublicProduct[]> {
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

  const products = await signAndMap(supabase, (data ?? []) as unknown as PublicCatalogRow[], preferredVariantByProduct);
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

// PGRST202: PostgREST cannot find the function in its schema cache.
// 42883: PostgreSQL undefined_function. Anything else is a real failure.
function isMissingSearchFunction(error: { code?: string }) {
  return error.code === "PGRST202" || error.code === "42883";
}
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

  const rpcArgs = {
    requested_query: options.q?.trim() || null,
    requested_category: options.category ? categoryValue(options.category) : null,
    requested_min_cents: eurosToCents(options.min),
    requested_max_cents: eurosToCents(options.max),
    requested_only_available: options.availability === "available",
    requested_sort: options.sort ?? "selection",
  };
  const { data, error } = await supabase.rpc("search_public_catalog", {
    ...rpcArgs,
    requested_limit: pageSize,
    requested_offset: (page - 1) * pageSize,
  });

  if (error) {
    if (!isMissingSearchFunction(error)) {
      console.error("Catalog search RPC failed", error.code, error.message);
      throw new Error(`Catalog search failed: ${error.message}`);
    }
    // Transitional only: the search migration is not applied yet on this
    // Supabase project. Remove this branch once the migration is deployed.
    console.error("Catalog search RPC missing (migration not applied), using in-memory fallback", error.message);
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

  const rows = (data ?? []) as Array<{ product_id: string; variant_id: string; total_count: number }>;
  let total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  if (rows.length === 0 && page > 1) {
    // Out-of-range page: recover the real total so pagination stays correct.
    const { data: probe, error: probeError } = await supabase.rpc("search_public_catalog", {
      ...rpcArgs,
      requested_limit: 1,
      requested_offset: 0,
    });
    if (probeError) {
      console.error("Catalog total probe failed", probeError.code, probeError.message);
      throw new Error(`Catalog total probe failed: ${probeError.message}`);
    }
    const probeRows = (probe ?? []) as Array<{ total_count: number }>;
    total = probeRows.length > 0 ? Number(probeRows[0].total_count) : 0;
  }
  const preferredVariantByProduct = new Map(rows.map((row) => [row.product_id, row.variant_id]));
  const products = await hydrateProductsByIds(supabase, rows.map((row) => row.product_id), preferredVariantByProduct);
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
    if (!isMissingSearchFunction(error)) {
      console.error("Catalog facet RPC failed", error.code, error.message);
      throw new Error(`Catalog facet counts failed: ${error.message}`);
    }
    // Transitional only: remove once the search migration is deployed.
    console.error("Catalog facet RPC missing (migration not applied), using in-memory fallback", error.message);
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

export async function getPublicProduct(shopSlug: string, productSlug: string, preferredVariantId?: string) {
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

  const preferredVariantByProduct = preferredVariantId
    ? new Map([[data.id, preferredVariantId]])
    : undefined;
  const [product] = await signAndMap(
    supabase,
    [data as unknown as PublicCatalogRow],
    preferredVariantByProduct,
  );
  return product ?? null;
}

export type PublicShop = {
  slug: string;
  name: string;
  description: string | null;
  shipsFromCountry: string | null;
  createdAt: string | null;
};

export type PublicShopCatalogPage = {
  products: PublicProduct[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

// Public shop storefront: only approved shops are readable (RLS-backed and
// re-checked explicitly here, same defense-in-depth as the catalog).
export async function getPublicShop(slug: string): Promise<PublicShop | null> {
  const supabase = createPublicClient();
  if (!supabase) throw new Error("Public catalog is not configured");

  const { data, error } = await supabase
    .from("shops")
    .select("slug, name, description, ships_from_country, status, created_at")
    .eq("slug", slug)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Unable to load the public shop", error.message);
    throw new Error("Unable to load the public shop");
  }
  if (!data || data.status !== "approved") return null;

  return {
    slug: data.slug,
    name: data.name,
    description: data.description,
    shipsFromCountry: data.ships_from_country,
    createdAt: data.created_at,
  };
}

export async function getPublicShopProducts(
  shopSlug: string,
  requestedPage = 1,
  requestedPageSize = 24,
): Promise<PublicShopCatalogPage> {
  const supabase = createPublicClient();
  if (!supabase) throw new Error("Public catalog is not configured");

  const page = Math.min(Math.max(Math.trunc(requestedPage), 1), 1000);
  const pageSize = Math.min(Math.max(Math.trunc(requestedPageSize), 1), 48);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("products")
    .select(CATALOG_ROW_SELECT, { count: "exact" })
    .eq("shops.slug", shopSlug)
    .eq("status", "published")
    .eq("shops.status", "approved")
    .eq("product_variants.active", true)
    .gt("product_variants.price_cents", 0)
    .eq("product_evidence.status", "approved")
    .not("product_evidence.public_summary", "is", null)
    .eq("product_media.status", "approved")
    .order("published_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Unable to load the public shop catalog", error.message);
    throw new Error("Unable to load the public shop catalog");
  }

  const total = count ?? 0;
  return {
    products: await signAndMap(supabase, (data ?? []) as unknown as PublicCatalogRow[]),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

// Light SEO projection for the sitemap: slugs and dates only, no media
// signing. Move to segmented sitemaps (generateSitemaps) beyond ~1000 URLs.
export type SitemapProduct = { slug: string; shopSlug: string; publishedAt: string | null };

export async function getPublishedProductsForSitemap(limit = 1000): Promise<SitemapProduct[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("products")
    .select(`
      slug, published_at,
      shops!inner(slug, status),
      product_variants!inner(active),
      product_evidence!inner(status),
      product_media!inner(status)
    `)
    .eq("status", "published")
    .eq("shops.status", "approved")
    .eq("product_variants.active", true)
    .gt("product_variants.price_cents", 0)
    .eq("product_evidence.status", "approved")
    .not("product_evidence.public_summary", "is", null)
    .eq("product_media.status", "approved")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Unable to load the sitemap projection", error.message);
    return [];
  }

  return ((data ?? []) as unknown as Array<{ slug: string; published_at: string | null; shops: { slug: string } }>).map((row) => ({
    slug: row.slug,
    shopSlug: row.shops.slug,
    publishedAt: row.published_at,
  }));
}

// Approved shops that have at least one published product (inner join keeps
// the payload to slugs only) — used by the sitemap.
export type SitemapShop = { slug: string };

export async function getPublicShopsForSitemap(limit = 500): Promise<SitemapShop[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("shops")
    .select(`
      slug,
      products!inner(
        status,
        product_variants!inner(active, price_cents),
        product_evidence!inner(status, public_summary),
        product_media!inner(status)
      )
    `)
    .eq("status", "approved")
    .eq("products.status", "published")
    .eq("products.product_variants.active", true)
    .gt("products.product_variants.price_cents", 0)
    .eq("products.product_evidence.status", "approved")
    .not("products.product_evidence.public_summary", "is", null)
    .eq("products.product_media.status", "approved")
    .limit(limit);

  if (error) {
    console.error("Unable to load the shop sitemap projection", error.message);
    return [];
  }

  return ((data ?? []) as Array<{ slug: string }>).map((row) => ({ slug: row.slug }));
}
