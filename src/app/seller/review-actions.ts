"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard, getSellerProducts } from "@/lib/seller/dal";
import { createClient } from "@/lib/supabase/server";

function sellerReviewError(message: string) {
  if (message.includes("shop_profile_incomplete")) return "profil_boutique_incomplet";
  if (message.includes("shop_must_be_submitted_first")) return "boutique_non_soumise";
  if (message.includes("product_description_incomplete")) return "description_incomplete";
  if (message.includes("active_variant_required")) return "variante_requise";
  if (message.includes("reviewable_evidence_required")) return "preuve_incomplete";
  return "transition_refusee";
}

export async function submitShopForReview() {
  const [viewer, dashboard] = await Promise.all([getViewer(), getSellerDashboard()]);
  if (!viewer || !dashboard) redirect("/seller");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_shop_for_review", { requested_shop_id: dashboard.shop.id });
  if (error) redirect(`/seller?review_error=${sellerReviewError(error.message)}`);

  revalidatePath("/seller");
  revalidatePath("/operations/moderation");
  redirect("/seller?shop_submitted=1");
}

export async function submitProductForReview(formData: FormData) {
  const parsed = z.string().uuid().safeParse(formData.get("productId"));
  if (!parsed.success) redirect("/seller/produits?review_error=produit_invalide");

  const [viewer, dashboard, products] = await Promise.all([getViewer(), getSellerDashboard(), getSellerProducts()]);
  if (!viewer || !dashboard || !products) redirect("/seller");
  if (!products.some((product) => product.id === parsed.data)) redirect("/seller/produits?review_error=acces_refuse");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_product_for_review", { requested_product_id: parsed.data });
  if (error) redirect(`/seller/produits?review_error=${sellerReviewError(error.message)}`);

  revalidatePath("/seller");
  revalidatePath("/seller/produits");
  revalidatePath("/operations/moderation");
  redirect("/seller/produits?submitted=1");
}
