import type { MetadataRoute } from "next";
import { getPublicShopsForSitemap, getPublishedProductsForSitemap } from "@/lib/catalog/dal";
import { productHref, shopHref } from "@/lib/catalog/types";
import { getSiteUrl } from "@/lib/supabase/config";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const [products, shops] = await Promise.all([
    getPublishedProductsForSitemap(),
    getPublicShopsForSitemap(),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: "daily", priority: 1 },
    { url: `${site}/catalogue`, changeFrequency: "daily", priority: 0.9 },
  ];

  const shopEntries: MetadataRoute.Sitemap = shops.map((shop) => ({
    url: `${site}${shopHref(shop.slug)}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${site}${productHref(product)}`,
    lastModified: product.publishedAt ?? undefined,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...shopEntries, ...productEntries];
}
