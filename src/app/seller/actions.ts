"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type SellerOnboardingState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"name" | "slug" | "description" | "country", string[]>>;
};

const onboardingSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "L’adresse doit contenir au moins 3 caractères.")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Utilisez uniquement lettres minuscules, chiffres et tirets."),
  description: z.string().trim().max(2000, "La présentation ne peut pas dépasser 2 000 caractères."),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Utilisez un code pays à 2 lettres."),
});

export async function createSellerShop(
  _previousState: SellerOnboardingState,
  formData: FormData,
): Promise<SellerOnboardingState> {
  const parsed = onboardingSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") ?? "",
    country: formData.get("country") ?? "FR",
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!getSupabaseConfig()) {
    return { status: "error", message: "Le backend vendeur n’est pas relié à cet environnement." };
  }

  const viewer = await getViewer();
  if (!viewer) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_seller_shop", {
    requested_name: parsed.data.name,
    requested_slug: parsed.data.slug,
    requested_description: parsed.data.description || null,
    requested_country: parsed.data.country,
  });

  if (error) {
    if (error.code === "23505" && error.message.includes("shop_owner_already_exists")) {
      return { status: "error", message: "Ce compte possède déjà une boutique." };
    }
    if (error.code === "23505") {
      return { status: "error", fieldErrors: { slug: ["Cette adresse de boutique est déjà utilisée."] } };
    }
    return { status: "error", message: "La boutique n’a pas pu être créée. Réessayez dans quelques instants." };
  }

  redirect("/seller");
}
