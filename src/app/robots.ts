import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/supabase/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/checkout",
          "/commande/",
          "/compte",
          "/operations/",
          "/panier",
          "/seller",
          "/app-preview",
        ],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
