export type PublicEvidence = {
  kind: string;
  issuerName: string | null;
  referenceNumber: string | null;
  scope: string;
  validFrom: string | null;
  validUntil: string | null;
  publicSummary: string;
};

export type PublicProduct = {
  id: string;
  slug: string;
  shopSlug: string;
  name: string;
  shop: string;
  category: string;
  description: string;
  verificationSummary: string;
  price: number;
  currency: string;
  stock: number;
  variantId: string;
  variantTitle: string;
  color: string;
  shape: string;
  evidence: PublicEvidence;
  publishedAt: string | null;
};

export function productHref(product: Pick<PublicProduct, "shopSlug" | "slug">) {
  return `/produit/${encodeURIComponent(product.shopSlug)}/${encodeURIComponent(product.slug)}`;
}
