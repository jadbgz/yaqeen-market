"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { getSellerProduct } from "@/lib/seller/dal";
import { createClient } from "@/lib/supabase/server";

const productIdSchema = z.string().uuid();
const categorySchema = z.enum(["parfums", "cosmetiques", "livres", "mode", "bien-etre", "complements", "maison"]);
const priceSchema = z.string().trim().regex(/^\d{1,6}(?:[,.]\d{1,2})?$/);
const optionalDateSchema = z.union([z.literal(""), z.string().date()]);

function cents(value: string) {
  const [euros, decimals = ""] = value.replace(",", ".").split(".");
  return Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
}

function editorHref(productId: string, key: string) {
  return `/seller/produits/${productId}?${key}=1`;
}

async function ownedProduct(formData: FormData) {
  const id = productIdSchema.safeParse(formData.get("productId"));
  if (!id.success || !(await getViewer())) redirect("/seller");
  const product = await getSellerProduct(id.data);
  if (!product) redirect("/seller/produits");
  return product;
}

export async function updateProductAction(formData: FormData) {
  const product = await ownedProduct(formData);
  const parsed = z.object({
    title: z.string().trim().min(2).max(180),
    slug: z.string().trim().toLowerCase().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().min(40).max(5000),
    category: categorySchema,
  }).safeParse(Object.fromEntries(["title", "slug", "description", "category"].map((key) => [key, formData.get(key) ?? ""])));
  if (!parsed.success) redirect(editorHref(product.id, "content_error"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_product_draft", {
    requested_product_id: product.id,
    requested_title: parsed.data.title,
    requested_slug: parsed.data.slug,
    requested_description: parsed.data.description,
    requested_category: parsed.data.category,
  });
  if (error) redirect(editorHref(product.id, error.code === "23505" ? "slug_error" : "content_error"));
  revalidatePath("/seller/produits");
  revalidatePath(`/seller/produits/${product.id}`);
  redirect(editorHref(product.id, "content_saved"));
}

export async function saveVariantAction(formData: FormData) {
  const product = await ownedProduct(formData);
  const parsed = z.object({
    variantId: z.union([z.literal(""), z.string().uuid()]),
    title: z.string().trim().min(2).max(120),
    sku: z.string().trim().toUpperCase().min(3).max(64).regex(/^[A-Z0-9][A-Z0-9._-]+$/),
    price: priceSchema,
    stock: z.coerce.number().int().min(0).max(1_000_000),
    active: z.enum(["true", "false"]),
  }).safeParse({
    variantId: formData.get("variantId") ?? "",
    title: formData.get("variantTitle") ?? "",
    sku: formData.get("sku") ?? "",
    price: formData.get("price") ?? "",
    stock: formData.get("stock") ?? "",
    active: formData.get("active") ?? "true",
  });
  if (!parsed.success) redirect(editorHref(product.id, "variant_error"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_product_variant", {
    requested_product_id: product.id,
    requested_variant_id: parsed.data.variantId || null,
    requested_title: parsed.data.title,
    requested_sku: parsed.data.sku,
    requested_price_cents: cents(parsed.data.price),
    requested_stock_on_hand: parsed.data.stock,
    requested_active: parsed.data.active === "true",
  });
  if (error) redirect(editorHref(product.id, error.code === "23505" ? "sku_error" : "variant_error"));
  revalidatePath("/seller");
  revalidatePath("/seller/produits");
  revalidatePath(`/seller/produits/${product.id}`);
  redirect(editorHref(product.id, "variant_saved"));
}

export async function deactivateVariantAction(formData: FormData) {
  const product = await ownedProduct(formData);
  const variantId = productIdSchema.safeParse(formData.get("variantId"));
  if (!variantId.success || !product.variants.some((variant) => variant.id === variantId.data)) redirect(editorHref(product.id, "variant_error"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_product_variant", { requested_variant_id: variantId.data });
  if (error) redirect(editorHref(product.id, "variant_error"));
  revalidatePath("/seller/produits");
  revalidatePath(`/seller/produits/${product.id}`);
  redirect(editorHref(product.id, "variant_saved"));
}

export async function addEvidenceAction(formData: FormData) {
  const product = await ownedProduct(formData);
  const parsed = z.object({
    kind: z.enum(["seller_declaration", "third_party_certificate"]),
    scope: z.string().trim().min(10).max(2000),
    issuerName: z.string().trim().max(180),
    referenceNumber: z.string().trim().max(180),
    publicSummary: z.string().trim().min(20).max(1000),
    validFrom: optionalDateSchema,
    validUntil: optionalDateSchema,
  }).superRefine((value, context) => {
    if (value.kind === "third_party_certificate" && !value.issuerName) context.addIssue({ code: "custom", path: ["issuerName"], message: "required" });
    if (value.kind === "third_party_certificate" && !value.referenceNumber) context.addIssue({ code: "custom", path: ["referenceNumber"], message: "required" });
    if (value.validFrom && value.validUntil && value.validUntil < value.validFrom) context.addIssue({ code: "custom", path: ["validUntil"], message: "before_start" });
  }).safeParse({
    kind: formData.get("evidenceKind") ?? "",
    scope: formData.get("evidenceScope") ?? "",
    issuerName: formData.get("issuerName") ?? "",
    referenceNumber: formData.get("referenceNumber") ?? "",
    publicSummary: formData.get("publicSummary") ?? "",
    validFrom: formData.get("validFrom") ?? "",
    validUntil: formData.get("validUntil") ?? "",
  });
  if (!parsed.success) redirect(editorHref(product.id, "evidence_error"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_product_evidence", {
    requested_product_id: product.id,
    requested_kind: parsed.data.kind,
    requested_scope: parsed.data.scope,
    requested_issuer_name: parsed.data.issuerName || null,
    requested_reference_number: parsed.data.referenceNumber || null,
    requested_public_summary: parsed.data.publicSummary,
    requested_valid_from: parsed.data.validFrom || null,
    requested_valid_until: parsed.data.validUntil || null,
  });
  if (error) redirect(editorHref(product.id, "evidence_error"));
  revalidatePath("/seller");
  revalidatePath("/seller/produits");
  revalidatePath(`/seller/produits/${product.id}`);
  redirect(editorHref(product.id, "evidence_saved"));
}

export async function discardEvidenceAction(formData: FormData) {
  const product = await ownedProduct(formData);
  const evidenceId = productIdSchema.safeParse(formData.get("evidenceId"));
  if (!evidenceId.success || !product.evidence.some((proof) => proof.id === evidenceId.data && proof.status === "pending")) redirect(editorHref(product.id, "evidence_error"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_pending_product_evidence", { requested_evidence_id: evidenceId.data });
  if (error) redirect(editorHref(product.id, "evidence_error"));
  revalidatePath("/seller/produits");
  revalidatePath(`/seller/produits/${product.id}`);
  redirect(editorHref(product.id, "evidence_saved"));
}
