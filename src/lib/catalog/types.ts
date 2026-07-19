export type PublicEvidence = {
  kind: string;
  issuerName: string | null;
  referenceNumber: string | null;
  scope: string;
  validFrom: string | null;
  validUntil: string | null;
  publicSummary: string;
};

export type PublicMedia = {
  url: string;
  altText: string;
  width: number;
  height: number;
  position: number;
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
  media: PublicMedia[];
  publishedAt: string | null;
};

export function productHref(
  product: Pick<PublicProduct, "shopSlug" | "slug"> & Partial<Pick<PublicProduct, "variantId">>,
  includeVariant = true,
) {
  const pathname = `/produit/${encodeURIComponent(product.shopSlug)}/${encodeURIComponent(product.slug)}`;
  return includeVariant && product.variantId
    ? `${pathname}?variant=${encodeURIComponent(product.variantId)}`
    : pathname;
}
