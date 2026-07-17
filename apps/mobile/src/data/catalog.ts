export type PublicEvidence = {
  kind: string;
  issuerName: string | null;
  referenceNumber: string | null;
  scope: string;
  publicSummary: string;
};

export type Product = {
  id: string;
  slug: string;
  shopSlug: string;
  name: string;
  shop: string;
  category: string;
  price: number;
  currency: string;
  color: string;
  description: string;
  format: string;
  stock: number;
  verificationSummary: string;
  evidence: PublicEvidence;
  publishedAt: string | null;
};

type CatalogRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  verification_summary: string | null;
  published_at: string | null;
  shops: { slug: string; name: string; status: string } | null;
  product_variants: {
    title: string;
    price_cents: number;
    currency: string;
    stock_on_hand: number;
    stock_reserved: number;
    active: boolean;
  }[];
  product_evidence: {
    kind: string;
    status: string;
    issuer_name: string | null;
    reference_number: string | null;
    scope: string;
    public_summary: string | null;
  }[];
};

export class CatalogConfigurationError extends Error {
  constructor() {
    super('Catalogue non configuré');
    this.name = 'CatalogConfigurationError';
  }
}

const categoryLabels: Record<string, string> = {
  parfums: 'Parfums',
  cosmetiques: 'Cosmétiques',
  livres: 'Livres',
  mode: 'Mode',
  'bien-etre': 'Bien-être',
  complements: 'Compléments',
  maison: 'Maison',
};

const visualByCategory: Record<string, string> = {
  parfums: '#234f48',
  cosmetiques: '#945d48',
  livres: '#9c7540',
  mode: '#5e746c',
  'bien-etre': '#73825c',
  complements: '#1d2d3f',
  maison: '#d09b47',
};

const publicSelect = [
  'id',
  'slug',
  'title',
  'description',
  'category',
  'verification_summary',
  'published_at',
  'shops!inner(slug,name,status)',
  'product_variants(id,title,price_cents,currency,stock_on_hand,stock_reserved,active)',
  'product_evidence(kind,status,issuer_name,reference_number,scope,public_summary)',
].join(',');

function mapRow(row: CatalogRow): Product | null {
  const shop = row.shops;
  const variant = row.product_variants
    .filter((item) => item.active && item.price_cents > 0)
    .sort((a, b) => a.price_cents - b.price_cents)[0];
  const evidence = row.product_evidence.find(
    (item) => item.status === 'approved' && item.public_summary,
  );

  if (!shop || shop.status !== 'approved' || !variant || !evidence?.public_summary) return null;

  return {
    id: row.id,
    slug: row.slug,
    shopSlug: shop.slug,
    name: row.title,
    shop: shop.name,
    category: categoryLabels[row.category] ?? row.category,
    price: variant.price_cents / 100,
    currency: variant.currency,
    color: visualByCategory[row.category] ?? '#49645b',
    description: row.description ?? '',
    format: variant.title,
    stock: Math.max(0, variant.stock_on_hand - variant.stock_reserved),
    verificationSummary: row.verification_summary ?? evidence.public_summary,
    evidence: {
      kind: evidence.kind,
      issuerName: evidence.issuer_name,
      referenceNumber: evidence.reference_number,
      scope: evidence.scope,
      publicSummary: evidence.public_summary,
    },
    publishedAt: row.published_at,
  };
}

export async function loadPublishedProducts(signal?: AbortSignal): Promise<Product[]> {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) throw new CatalogConfigurationError();

  let endpoint: URL;
  try {
    endpoint = new URL('/rest/v1/products', baseUrl);
  } catch {
    throw new CatalogConfigurationError();
  }

  endpoint.searchParams.set('select', publicSelect);
  endpoint.searchParams.set('status', 'eq.published');
  endpoint.searchParams.set('shops.status', 'eq.approved');
  endpoint.searchParams.set('product_variants.active', 'eq.true');
  endpoint.searchParams.set('product_evidence.status', 'eq.approved');
  endpoint.searchParams.set('order', 'published_at.desc');

  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  signal?.addEventListener('abort', abortRequest, { once: true });
  const timeout = setTimeout(abortRequest, 10_000);

  try {
    const response = await fetch(endpoint.toString(), {
      headers: { apikey: publishableKey, Accept: 'application/json' },
      signal: requestController.signal,
    });
    if (!response.ok) throw new Error(`catalog_request_failed:${response.status}`);

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error('catalog_response_invalid');
    return (payload as CatalogRow[]).map(mapRow).filter((product): product is Product => product !== null);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }
}

export const categories = ['Tous', ...Object.values(categoryLabels)];

export function productRoute(product: Pick<Product, 'shopSlug' | 'slug'>) {
  return {
    pathname: '/product/[shopSlug]/[productSlug]' as const,
    params: { shopSlug: product.shopSlug, productSlug: product.slug },
  };
}

export function formatPrice(price: number, currency = 'EUR') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(price);
}
