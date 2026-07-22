"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  rationale: z.string().trim().min(10).max(2000),
});

async function requireOperator() {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) redirect("/");
  return viewer;
}

export async function reviewShopAction(formData: FormData) {
  await requireOperator();
  const parsed = decisionSchema.extend({ shopId: z.string().uuid() }).safeParse({
    shopId: formData.get("shopId"), decision: formData.get("decision"), rationale: formData.get("rationale"),
  });
  if (!parsed.success) redirect("/operations/moderation?error=decision_invalide");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_shop_submission", {
    requested_shop_id: parsed.data.shopId,
    requested_decision: parsed.data.decision,
    requested_rationale: parsed.data.rationale,
  });
  if (error) redirect("/operations/moderation?error=transition_refusee");

  revalidatePath("/seller");
  revalidatePath("/operations/moderation");
  redirect("/operations/moderation?reviewed=shop");
}

export async function reviewProductAction(formData: FormData) {
  await requireOperator();
  const schema = decisionSchema.extend({ productId: z.string().uuid(), evidenceId: z.string().uuid(), publicSummary: z.string().trim().max(1000) }).superRefine((data, context) => {
    if (data.decision === "approved" && data.publicSummary.length < 20) context.addIssue({ code: "custom", path: ["publicSummary"], message: "Résumé public requis." });
  });
  const parsed = schema.safeParse({
    productId: formData.get("productId"), evidenceId: formData.get("evidenceId"), decision: formData.get("decision"), rationale: formData.get("rationale"), publicSummary: formData.get("publicSummary") ?? "",
  });
  if (!parsed.success) redirect("/operations/moderation?error=decision_invalide");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_product_submission", {
    requested_product_id: parsed.data.productId,
    requested_evidence_id: parsed.data.evidenceId,
    requested_decision: parsed.data.decision,
    requested_rationale: parsed.data.rationale,
    requested_public_summary: parsed.data.publicSummary || null,
  });
  if (error) redirect("/operations/moderation?error=transition_refusee");

  revalidatePath("/seller");
  revalidatePath("/seller/produits");
  revalidatePath("/operations/moderation");
  revalidatePath("/catalogue");
  redirect("/operations/moderation?reviewed=product");
}

export async function reviewRevisionAction(formData: FormData) {
  await requireOperator();
  const parsed = decisionSchema.extend({ revisionId: z.string().uuid() }).safeParse({
    revisionId: formData.get("revisionId"),
    decision: formData.get("decision"),
    rationale: formData.get("rationale"),
  });
  if (!parsed.success) redirect("/operations/moderation?error=decision_invalide");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_product_revision", {
    requested_revision_id: parsed.data.revisionId,
    requested_decision: parsed.data.decision,
    requested_rationale: parsed.data.rationale,
  });
  if (error) redirect(`/operations/moderation?error=${error.message.includes("base_changed") ? "revision_obsolete" : "transition_refusee"}`);

  revalidatePath("/seller");
  revalidatePath("/seller/produits");
  revalidatePath("/operations/moderation");
  revalidatePath("/catalogue");
  revalidatePath("/boutique/[slug]", "page");
  revalidatePath("/produit/[shopSlug]/[productSlug]", "page");
  redirect("/operations/moderation?reviewed=revision");
}
