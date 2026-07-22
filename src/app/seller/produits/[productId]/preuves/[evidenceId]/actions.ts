"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { getSellerProduct } from "@/lib/seller/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const idsSchema = z.object({ productId: z.string().uuid(), evidenceId: z.string().uuid() });

function dossierHref(productId: string, evidenceId: string, state: string): never {
  redirect(`/seller/produits/${productId}/preuves/${evidenceId}?${state}=1`);
}

async function ownedPendingEvidence(formData: FormData) {
  const ids = idsSchema.safeParse({ productId: formData.get("productId"), evidenceId: formData.get("evidenceId") });
  if (!ids.success || !await getViewer()) redirect("/seller/produits");
  const product = await getSellerProduct(ids.data.productId);
  const evidence = product?.evidence.find((proof) => proof.id === ids.data.evidenceId);
  if (!product || !evidence || evidence.status !== "pending") redirect("/seller/produits");
  return { product, evidence };
}

export async function uploadEvidenceDocumentAction(formData: FormData) {
  const { product, evidence } = await ownedPendingEvidence(formData);
  if (evidence.document) dossierHref(product.id, evidence.id, "already_uploaded");
  const file = formData.get("document");
  if (!(file instanceof File) || file.type !== "application/pdf" || file.size < 5 || file.size > MAX_PDF_BYTES || !file.name.toLowerCase().endsWith(".pdf")) {
    dossierHref(product.id, evidence.id, "invalid_file");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const header = bytes.subarray(0, 5).toString("ascii");
  const trailer = bytes.subarray(Math.max(0, bytes.length - 2048)).toString("latin1");
  if (header !== "%PDF-" || !trailer.includes("%%EOF")) dossierHref(product.id, evidence.id, "invalid_file");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const supabase = await createClient();
  const { data, error: registerError } = await supabase.rpc("register_evidence_document", {
    requested_evidence_id: evidence.id,
    requested_original_filename: file.name,
    requested_byte_size: bytes.byteLength,
    requested_sha256: sha256,
  });
  const registered = Array.isArray(data) ? data[0] : data;
  if (registerError || !registered?.document_id || !registered?.storage_path) dossierHref(product.id, evidence.id, "register_error");

  let uploadError: unknown = null;
  try {
    const admin = createAdminClient();
    const result = await admin.storage.from("product-evidence").upload(registered.storage_path, bytes, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: false,
    });
    uploadError = result.error;
  } catch (error) {
    uploadError = error;
  }
  if (uploadError) {
    await supabase.rpc("discard_evidence_document", { requested_document_id: registered.document_id });
    dossierHref(product.id, evidence.id, "storage_error");
  }

  revalidatePath(`/seller/produits/${product.id}`);
  revalidatePath(`/seller/produits/${product.id}/preuves/${evidence.id}`);
  revalidatePath("/operations/moderation");
  dossierHref(product.id, evidence.id, "uploaded");
}

export async function deleteEvidenceDocumentAction(formData: FormData) {
  const { product, evidence } = await ownedPendingEvidence(formData);
  if (!evidence.document) dossierHref(product.id, evidence.id, "delete_error");
  const supabase = await createClient();
  let removeError: unknown = null;
  try {
    const admin = createAdminClient();
    const result = await admin.storage.from("product-evidence").remove([evidence.document.storagePath]);
    removeError = result.error;
  } catch (error) {
    removeError = error;
  }
  if (removeError) dossierHref(product.id, evidence.id, "delete_error");
  const { error } = await supabase.rpc("discard_evidence_document", { requested_document_id: evidence.document.id });
  if (error) dossierHref(product.id, evidence.id, "delete_error");
  revalidatePath(`/seller/produits/${product.id}`);
  revalidatePath(`/seller/produits/${product.id}/preuves/${evidence.id}`);
  revalidatePath("/operations/moderation");
  dossierHref(product.id, evidence.id, "deleted");
}
