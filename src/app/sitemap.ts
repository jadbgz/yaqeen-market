import type { MetadataRoute } from "next";
import { getPublishedProductsForSitemap } from "@/lib/catalog/dal";
import { productHref } from "@/lib/catalog/types";
import { getSiteUrl } from "@/lib/supabase/config";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const products = await getPublishedProductsForSitemap();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: "daily", priority: 1 },
    { url: `${site}/catalogue`, changeFrequency: "daily", priority: 0.9 },
  ];

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${site}${productHref(product)}`,
    lastModified: product.publishedAt ?? undefined,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...productEntries];
}
