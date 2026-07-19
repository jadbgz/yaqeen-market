export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function getSupabaseConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;

  try {
    new URL(url);
  } catch {
    return null;
  }

  return { url, publishableKey };
}

export function requireSupabaseConfig(): SupabasePublicConfig {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase n'est pas configuré. Renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return config;
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;

  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // The local fallback keeps preview builds usable while configuration is incomplete.
    }
  }

  if (process.env.NODE_ENV === "production") {
    // A production deployment without NEXT_PUBLIC_SITE_URL would emit
    // localhost canonical URLs, sitemap entries and auth confirmation links.
    console.warn("NEXT_PUBLIC_SITE_URL is missing or invalid: falling back to http://localhost:3000. Set it before serving traffic.");
  }

  return "http://localhost:3000";
}
