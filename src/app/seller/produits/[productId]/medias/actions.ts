"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const MAX_SOURCE_BYTES = 6 * 1024 * 1024;
const uploadSchema = z.object({
  productId: z.string().uuid(),
  position: z.coerce.number().int().min(1).max(6),
  altText: z.string().trim().min(5).max(240),
});
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function mediaRedirect(productId: string, key: string): never {
  redirect(`/seller/produits/${productId}/medias?${key}=1`);
}

export async function uploadProductMedia(formData: FormData) {
  const parsed = uploadSchema.safeParse({
    productId: formData.get("productId"),
    position: formData.get("position"),
    altText: formData.get("altText"),
  });
  const fallbackId = typeof formData.get("productId") === "string" ? String(formData.get("productId")) : "";
  if (!parsed.success) mediaRedirect(fallbackId, "invalid");
  if (!await getViewer()) mediaRedirect(parsed.data.productId, "session");

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_SOURCE_BYTES || !acceptedTypes.has(file.type)) {
    mediaRedirect(parsed.data.productId, "invalid_file");
  }

  let output: Buffer;
  let width: number;
  let height: number;
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const pipeline = sharp(source, { limitInputPixels: 40_000_000, animated: false }).rotate();
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 500 || metadata.height < 500 || (metadata.pages ?? 1) !== 1) {
      mediaRedirect(parsed.data.productId, "invalid_dimensions");
    }
    output = await pipeline.resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toBuffer();
    const normalized = await sharp(output).metadata();
    if (!normalized.width || !normalized.height || output.byteLength > 4 * 1024 * 1024) mediaRedirect(parsed.data.productId, "invalid_dimensions");
    width = normalized.width;
    height = normalized.height;
  } catch {
    mediaRedirect(parsed.data.productId, "invalid_file");
  }

  const supabase = await createClient();
  const { data, error: registerError } = await supabase.rpc("create_product_media_draft", {
    requested_product_id: parsed.data.productId,
    requested_position: parsed.data.position,
    requested_alt_text: parsed.data.altText,
    requested_byte_size: output!.byteLength,
    requested_width: width!,
    requested_height: height!,
  });
  const media = Array.isArray(data) ? data[0] : data;
  if (registerError || !media?.media_id || !media?.storage_path) mediaRedirect(parsed.data.productId, "register_error");

  const { error: storageError } = await supabase.storage.from("product-media").upload(media.storage_path, output!, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: false,
  });
  if (storageError) {
    await supabase.rpc("discard_product_media", { requested_media_id: media.media_id });
    mediaRedirect(parsed.data.productId, "storage_error");
  }

  revalidatePath("/seller/produits");
  revalidatePath(`/seller/produits/${parsed.data.productId}/medias`);
  mediaRedirect(parsed.data.productId, "uploaded");
}

export async function deleteProductMedia(formData: FormData) {
  const parsed = z.object({ productId: z.string().uuid(), mediaId: z.string().uuid(), storagePath: z.string().min(1) }).safeParse({
    productId: formData.get("productId"), mediaId: formData.get("mediaId"), storagePath: formData.get("storagePath"),
  });
  if (!parsed.success || !await getViewer()) redirect("/seller/produits");
  const supabase = await createClient();
  const { error: removeError } = await supabase.storage.from("product-media").remove([parsed.data.storagePath]);
  if (removeError) mediaRedirect(parsed.data.productId, "delete_error");
  const { error } = await supabase.rpc("discard_product_media", { requested_media_id: parsed.data.mediaId });
  if (error) mediaRedirect(parsed.data.productId, "delete_error");
  revalidatePath("/seller/produits");
  revalidatePath(`/seller/produits/${parsed.data.productId}/medias`);
  mediaRedirect(parsed.data.productId, "deleted");
}
