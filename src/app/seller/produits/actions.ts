"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const fieldNames = ["title", "slug", "description", "category", "variantTitle", "sku", "price", "stock", "evidenceKind", "evidenceScope", "issuerName", "referenceNumber", "publicSummary"] as const;
type FieldName = typeof fieldNames[number];

export type ProductDraftState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
};

const priceSchema = z.string().trim().regex(/^\d{1,6}(?:[,.]\d{1,2})?$/, "Saisissez un montant valide, par exemple 34,90.");
const productSchema = z.object({
  title: z.string().trim().min(2, "Le titre doit contenir au moins 2 caractères.").max(180),
  slug: z.string().trim().toLowerCase().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Utilisez uniquement lettres minuscules, chiffres et tirets."),
  description: z.string().trim().max(5000, "La description ne peut pas dépasser 5 000 caractères."),
  category: z.enum(["parfums", "cosmetiques", "livres", "mode", "bien-etre", "complements", "maison"]),
  variantTitle: z.string().trim().min(2, "Précisez le format de cette variante.").max(120),
  sku: z.string().trim().toUpperCase().min(3).max(64).regex(/^[A-Z0-9][A-Z0-9._-]+$/, "Utilisez lettres, chiffres, points, tirets ou underscores."),
  price: priceSchema,
  stock: z.coerce.number().int().min(0, "Le stock ne peut pas être négatif.").max(1_000_000),
  evidenceKind: z.enum(["seller_declaration", "third_party_certificate"]),
  evidenceScope: z.string().trim().min(10, "Décrivez précisément ce que couvre cette preuve.").max(2000),
  issuerName: z.string().trim().max(180),
  referenceNumber: z.string().trim().max(180),
  publicSummary: z.string().trim().max(1000),
}).superRefine((data, context) => {
  if (data.evidenceKind === "third_party_certificate" && !data.issuerName) {
    context.addIssue({ code: "custom", path: ["issuerName"], message: "L’organisme est obligatoire pour un certificat." });
  }
  if (data.evidenceKind === "third_party_certificate" && !data.referenceNumber) {
    context.addIssue({ code: "custom", path: ["referenceNumber"], message: "La référence est obligatoire pour un certificat." });
  }
});

function eurosToCents(value: string) {
  const [euros, decimals = ""] = value.replace(",", ".").split(".");
  return Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
}

export async function createProductDraft(_state: ProductDraftState, formData: FormData): Promise<ProductDraftState> {
  const raw = Object.fromEntries(fieldNames.map((field) => [field, formData.get(field) ?? ""]));
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  if (!getSupabaseConfig()) return { status: "error", message: "Le catalogue n’est pas relié à cet environnement." };

  const [viewer, dashboard] = await Promise.all([getViewer(), getSellerDashboard()]);
  if (!viewer) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  if (!dashboard) return { status: "error", message: "Créez d’abord votre boutique vendeur." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_product_draft", {
    requested_shop_id: dashboard.shop.id,
    requested_title: parsed.data.title,
    requested_slug: parsed.data.slug,
    requested_description: parsed.data.description || null,
    requested_category: parsed.data.category,
    requested_variant_title: parsed.data.variantTitle,
    requested_sku: parsed.data.sku,
    requested_price_cents: eurosToCents(parsed.data.price),
    requested_stock_on_hand: parsed.data.stock,
    requested_evidence_kind: parsed.data.evidenceKind,
    requested_evidence_scope: parsed.data.evidenceScope,
    requested_issuer_name: parsed.data.issuerName || null,
    requested_reference_number: parsed.data.referenceNumber || null,
    requested_public_summary: parsed.data.publicSummary || null,
  });

  if (error) {
    if (error.code === "23505" && error.message.includes("products_shop_id_slug_key")) return { status: "error", fieldErrors: { slug: ["Cette adresse produit existe déjà dans votre boutique."] } };
    if (error.code === "23505") return { status: "error", fieldErrors: { sku: ["Ce SKU est déjà utilisé."] } };
    if (error.code === "42501") return { status: "error", message: "Vous n’avez plus accès à cette boutique." };
    return { status: "error", message: "La fiche n’a pas pu être enregistrée. Aucune donnée partielle n’a été créée." };
  }

  revalidatePath("/seller");
  revalidatePath("/seller/produits");
  redirect("/seller/produits?created=1");
}
