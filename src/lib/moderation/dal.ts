import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type ModerationQueue = {
  shops: Array<{ id: string; name: string; slug: string; description: string | null; country: string | null }>;
  products: Array<{
    id: string;
    title: string;
    category: string;
    description: string | null;
    shopName: string;
    evidence: Array<{ id: string; kind: string; scope: string; issuerName: string | null; referenceNumber: string | null; proposedSummary: string | null; validFrom: string | null; validUntil: string | null; document: { originalFilename: string; signedUrl: string | null } | null }>;
    variants: Array<{ title: string; sku: string; priceCents: number; stock: number }>;
    media: Array<{ id: string; position: number; altText: string; width: number; height: number; byteSize: number; signedUrl: string | null }>;
  }>;
  revisions: Array<{
    id: string;
    productId: string;
    revisionNumber: number;
    shopName: string;
    live: { title: string; slug: string; description: string | null; category: string };
    proposed: { title: string; slug: string; description: string; category: string };
    variants: Array<{
      id: string;
      sourceVariantId: string | null;
      proposed: { title: string; sku: string; priceCents: number; stock: number; active: boolean };
      live: { title: string; sku: string; priceCents: number; stock: number; reserved: number; active: boolean } | null;
    }>;
  }>;
  evidenceRenewals: Array<{
    id: string;
    productId: string;
    productTitle: string;
    shopName: string;
    kind: string;
    scope: string;
    issuerName: string | null;
    referenceNumber: string | null;
    proposedSummary: string | null;
    validFrom: string | null;
    validUntil: string | null;
    currentSummary: string | null;
    document: { originalFilename: string; byteSize: number; sha256: string; signedUrl: string | null } | null;
  }>;
};

export const getModerationQueue = cache(async (): Promise<ModerationQueue | null> => {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) return null;

  const supabase = await createClient();
  const [{ data: shops }, { data: products }, { data: revisions }, { data: pendingEvidence }] = await Promise.all([
    supabase.from("shops").select("id, name, slug, description, ships_from_country").eq("status", "under_review").order("created_at"),
    supabase.from("products").select("id, shop_id, title, category, description").eq("status", "under_review").order("created_at"),
    supabase.from("product_revisions").select("id, product_id, revision_number, title, slug, description, category").eq("status", "under_review").order("submitted_at"),
    supabase.from("product_evidence").select("id, product_id, kind, scope, issuer_name, reference_number, public_summary, valid_from, valid_until").eq("status", "pending").order("created_at").limit(100),
  ]);

  const productRows = products ?? [];
  const productIds = productRows.map((product) => product.id);
  const shopIds = [...new Set(productRows.map((product) => product.shop_id))];
  const [{ data: productShops }, { data: evidence }, { data: variants }, { data: media }] = await Promise.all([
    shopIds.length ? supabase.from("shops").select("id, name").in("id", shopIds) : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("product_evidence").select("id, product_id, kind, scope, issuer_name, reference_number, public_summary, valid_from, valid_until").in("product_id", productIds).eq("status", "pending").order("created_at") : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("product_variants").select("product_id, title, sku, price_cents, stock_on_hand").in("product_id", productIds).eq("active", true).order("created_at") : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("product_media").select("id, product_id, position, alt_text, width, height, byte_size, storage_path").in("product_id", productIds).eq("status", "pending").order("position") : Promise.resolve({ data: [] }),
  ]);
  const mediaRows = media ?? [];
  const { data: signedMedia } = mediaRows.length
    ? await supabase.storage.from("product-media").createSignedUrls(mediaRows.map((item) => item.storage_path), 600)
    : { data: [] };
  const signedByPath = new Map((signedMedia ?? []).map((item) => [item.path, item.signedUrl]));
  const revisionRows = revisions ?? [];
  const revisionProductIds = [...new Set(revisionRows.map((revision) => revision.product_id))];
  const revisionIds = revisionRows.map((revision) => revision.id);
  const [{ data: revisionProducts }, { data: revisionVariants }] = await Promise.all([
    revisionProductIds.length
      ? supabase.from("products").select("id, shop_id, title, slug, description, category").in("id", revisionProductIds)
      : Promise.resolve({ data: [] }),
    revisionIds.length
      ? supabase.from("product_revision_variants").select("id, revision_id, source_variant_id, title, sku, price_cents, stock_on_hand, active").in("revision_id", revisionIds).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const revisionShopIds = [...new Set((revisionProducts ?? []).map((product) => product.shop_id))];
  const liveVariantIds = [...new Set((revisionVariants ?? []).map((variant) => variant.source_variant_id).filter((id): id is string => Boolean(id)))];
  const [{ data: revisionShops }, { data: liveVariants }] = await Promise.all([
    revisionShopIds.length ? supabase.from("shops").select("id, name").in("id", revisionShopIds) : Promise.resolve({ data: [] }),
    liveVariantIds.length ? supabase.from("product_variants").select("id, title, sku, price_cents, stock_on_hand, stock_reserved, active").in("id", liveVariantIds) : Promise.resolve({ data: [] }),
  ]);
  const renewalCandidates = pendingEvidence ?? [];
  const renewalProductIds = [...new Set(renewalCandidates.map((proof) => proof.product_id))];
  const { data: renewalProducts } = renewalProductIds.length
    ? await supabase.from("products").select("id, shop_id, title, verification_summary, status").in("id", renewalProductIds).eq("status", "published")
    : { data: [] };
  const renewalProductRows = renewalProducts ?? [];
  const publishedRenewalIds = new Set(renewalProductRows.map((product) => product.id));
  const renewalRows = renewalCandidates.filter((proof) => publishedRenewalIds.has(proof.product_id));
  const renewalIds = renewalRows.map((proof) => proof.id);
  const dossierEvidenceIds = [...new Set([...renewalIds, ...(evidence ?? []).map((proof) => proof.id)])];
  const renewalShopIds = [...new Set(renewalProductRows.map((product) => product.shop_id))];
  const [{ data: evidenceDocuments }, { data: renewalShops }] = await Promise.all([
    dossierEvidenceIds.length ? supabase.from("product_evidence_documents").select("evidence_id, storage_path, original_filename, byte_size, sha256").in("evidence_id", dossierEvidenceIds) : Promise.resolve({ data: [] }),
    renewalShopIds.length ? supabase.from("shops").select("id, name").in("id", renewalShopIds) : Promise.resolve({ data: [] }),
  ]);
  const evidenceDocumentRows = evidenceDocuments ?? [];
  const { data: signedEvidenceDocuments } = evidenceDocumentRows.length
    ? await supabase.storage.from("product-evidence").createSignedUrls(evidenceDocumentRows.map((document) => document.storage_path), 600, { download: true })
    : { data: [] };
  const signedEvidenceByPath = new Map((signedEvidenceDocuments ?? []).map((item) => [item.path, item.signedUrl]));

  return {
    shops: (shops ?? []).map((shop) => ({ id: shop.id, name: shop.name, slug: shop.slug, description: shop.description, country: shop.ships_from_country })),
    products: productRows.map((product) => {
      const productEvidence = evidence?.filter((item) => item.product_id === product.id) ?? [];
      const productVariants = variants?.filter((item) => item.product_id === product.id) ?? [];
      return {
        id: product.id,
        title: product.title,
        category: product.category,
        description: product.description,
        shopName: productShops?.find((shop) => shop.id === product.shop_id)?.name ?? "Boutique inconnue",
        evidence: productEvidence.map((proof) => {
          const document = evidenceDocumentRows.find((item) => item.evidence_id === proof.id);
          return { id: proof.id, kind: proof.kind, scope: proof.scope, issuerName: proof.issuer_name, referenceNumber: proof.reference_number, proposedSummary: proof.public_summary, validFrom: proof.valid_from, validUntil: proof.valid_until, document: document ? { originalFilename: document.original_filename, signedUrl: signedEvidenceByPath.get(document.storage_path) ?? null } : null };
        }),
        variants: productVariants.map((variant) => ({ title: variant.title, sku: variant.sku, priceCents: variant.price_cents, stock: variant.stock_on_hand })),
        media: mediaRows.filter((item) => item.product_id === product.id).map((item) => ({
          id: item.id,
          position: item.position,
          altText: item.alt_text,
          width: item.width,
          height: item.height,
          byteSize: item.byte_size,
          signedUrl: signedByPath.get(item.storage_path) ?? null,
        })),
      };
    }),
    revisions: revisionRows.flatMap((revision) => {
      const liveProduct = revisionProducts?.find((product) => product.id === revision.product_id);
      if (!liveProduct) return [];
      return [{
        id: revision.id,
        productId: revision.product_id,
        revisionNumber: revision.revision_number,
        shopName: revisionShops?.find((shop) => shop.id === liveProduct.shop_id)?.name ?? "Boutique inconnue",
        live: { title: liveProduct.title, slug: liveProduct.slug, description: liveProduct.description, category: liveProduct.category },
        proposed: { title: revision.title, slug: revision.slug, description: revision.description, category: revision.category },
        variants: (revisionVariants ?? []).filter((variant) => variant.revision_id === revision.id).map((variant) => {
          const live = variant.source_variant_id ? liveVariants?.find((item) => item.id === variant.source_variant_id) : null;
          return {
            id: variant.id,
            sourceVariantId: variant.source_variant_id,
            proposed: { title: variant.title, sku: variant.sku, priceCents: variant.price_cents, stock: variant.stock_on_hand, active: variant.active },
            live: live ? { title: live.title, sku: live.sku, priceCents: live.price_cents, stock: live.stock_on_hand, reserved: live.stock_reserved, active: live.active } : null,
          };
        }),
      }];
    }),
    evidenceRenewals: renewalRows.flatMap((proof) => {
      const product = renewalProductRows.find((item) => item.id === proof.product_id);
      if (!product) return [];
      const document = evidenceDocumentRows.find((item) => item.evidence_id === proof.id);
      return [{
        id: proof.id,
        productId: proof.product_id,
        productTitle: product.title,
        shopName: renewalShops?.find((shop) => shop.id === product.shop_id)?.name ?? "Boutique inconnue",
        kind: proof.kind,
        scope: proof.scope,
        issuerName: proof.issuer_name,
        referenceNumber: proof.reference_number,
        proposedSummary: proof.public_summary,
        validFrom: proof.valid_from,
        validUntil: proof.valid_until,
        currentSummary: product.verification_summary,
        document: document ? {
          originalFilename: document.original_filename,
          byteSize: document.byte_size,
          sha256: document.sha256,
          signedUrl: signedEvidenceByPath.get(document.storage_path) ?? null,
        } : null,
      }];
    }),
  };
});
