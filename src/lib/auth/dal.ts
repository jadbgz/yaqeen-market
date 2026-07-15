import "server-only";

import { cache } from "react";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: "customer" | "seller" | "operator" | "admin";
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!getSupabaseConfig()) return null;

  const supabase = await createClient();
  const { data: claimData, error: claimError } = await supabase.auth.getClaims();
  if (claimError || !claimData?.claims.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", claimData.claims.sub)
    .maybeSingle();

  const role = profile?.role;
  const safeRole =
    role === "seller" || role === "operator" || role === "admin"
      ? role
      : "customer";

  return {
    id: claimData.claims.sub,
    email: typeof claimData.claims.email === "string" ? claimData.claims.email : null,
    displayName: profile?.display_name ?? null,
    role: safeRole,
  };
});
