"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { getSellerProduct, getSellerProductRevision } from "@/lib/seller/dal";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const category = z.enum(["parfums", "cosmetiques", "livres", "mode", "bien-etre", "complements", "maison"]);
const price = z.string().trim().regex(/^\d{1,6}(?:[,.]\d{1,2})?$/);

const revisionHref = (productId: string, state?: string) =>
  `/seller/produits/${productId}/revision${state ? `?${state}=1` : ""}`;

function eurosToCents(value: string) {
  const [euros, decimals = ""] = value.replace(",", ".").split(".");
  return Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
}

async function requireProduct(formData: FormData) {
  const productId = uuid.safeParse(formData.get("productId"));
  if (!productId.success || !(await getViewer())) redirect("/seller");
  const product = await getSellerProduct(productId.data);
  if (!product) redirect("/seller/produits");
  return product;
}

async function requireRevision(formData: FormData) {
  const product = await requireProduct(formData);
  const revisionId = uuid.safeParse(formData.get("revisionId"));
  if (!revisionId.success) redirect(revisionHref(product.id, "revision_error"));
  const revision = await getSellerProductRevision(product.id);
  if (!revision || revision.id !== revisionId.data) redirect(revisionHref(product.id, "revision_error"));
  return { product, revision };
}

function refreshRevisionPaths(productId: string) {
  revalidatePath("/seller/produits");
  revalidatePath(`/seller/produits/${productId}`);
  revalidatePath(`/seller/produits/${productId}/revision`);
  revalidatePath("/operations/moderation");
}

export async function startRevisionAction(formData: FormData) {
  const product = await requireProduct(formData);
  if (product.status !== "published") redirect(`/seller/produits/${product.id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_product_revision", { requested_product_id: product.id });
  if (error) redirect(`/seller/produits/${product.id}?revision_error=1`);
  refreshRevisionPaths(product.id);
  redirect(revisionHref(product.id));
}

export async function updateRevisionAction(formData: FormData) {
  const { product, revision } = await requireRevision(formData);
  const parsed = z.object({
    title: z.string().trim().min(2).max(180),
    slug: z.string().trim().toLowerCase().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().min(40).max(5000),
    category,
  }).safeParse({
    title: formData.get("title") ?? "",
    slug: formData.get("slug") ?? "",
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? "",
  });
  if (!parsed.success) redirect(revisionHref(product.id, "content_error"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_product_revision", {
    requested_revision_id: revision.id,
    requested_title: parsed.data.title,
    requested_slug: parsed.data.slug,
    requested_description: parsed.data.description,
    requested_category: parsed.data.category,
  });
  if (error) redirect(revisionHref(product.id, error.code === "23505" ? "slug_error" : "content_error"));
  refreshRevisionPaths(product.id);
  redirect(revisionHref(product.id, "content_saved"));
}

export async function saveRevisionVariantAction(formData: FormData) {
  const { product, revision } = await requireRevision(formData);
  const parsed = z.object({
    revisionVariantId: z.union([z.literal(""), z.string().uuid()]),
    title: z.string().trim().min(2).max(120),
    sku: z.string().trim().toUpperCase().min(3).max(64).regex(/^[A-Z0-9][A-Z0-9._-]+$/),
    price,
    stock: z.coerce.number().int().min(0).max(1_000_000),
    active: z.enum(["true", "false"]),
  }).safeParse({
    revisionVariantId: formData.get("revisionVariantId") ?? "",
    title: formData.get("variantTitle") ?? "",
    sku: formData.get("sku") ?? "",
    price: formData.get("price") ?? "",
    stock: formData.get("stock") ?? "",
    active: formData.get("active") ?? "true",
  });
  if (!parsed.success) redirect(revisionHref(product.id, "variant_error"));
  if (parsed.data.revisionVariantId && !revision.variants.some((variant) => variant.id === parsed.data.revisionVariantId)) {
    redirect(revisionHref(product.id, "variant_error"));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_product_revision_variant", {
    requested_revision_id: revision.id,
    requested_revision_variant_id: parsed.data.revisionVariantId || null,
    requested_title: parsed.data.title,
    requested_sku: parsed.data.sku,
    requested_price_cents: eurosToCents(parsed.data.price),
    requested_stock_on_hand: parsed.data.stock,
    requested_active: parsed.data.active === "true",
  });
  if (error) redirect(revisionHref(product.id, error.code === "23505" ? "sku_error" : "variant_error"));
  refreshRevisionPaths(product.id);
  redirect(revisionHref(product.id, "variant_saved"));
}

export async function submitRevisionAction(formData: FormData) {
  const { product, revision } = await requireRevision(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_product_revision", { requested_revision_id: revision.id });
  if (error) redirect(revisionHref(product.id, error.message.includes("current_evidence") ? "evidence_error" : "submit_error"));
  refreshRevisionPaths(product.id);
  redirect(revisionHref(product.id, "submitted"));
}

export async function withdrawRevisionAction(formData: FormData) {
  const { product, revision } = await requireRevision(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_product_revision", { requested_revision_id: revision.id });
  if (error) redirect(revisionHref(product.id, "revision_error"));
  refreshRevisionPaths(product.id);
  redirect(`/seller/produits/${product.id}?revision_withdrawn=1`);
}
