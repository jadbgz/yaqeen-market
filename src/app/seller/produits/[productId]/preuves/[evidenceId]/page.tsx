import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SellerChrome } from "@/components/seller-chrome";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard, getSellerProduct } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { deleteEvidenceDocumentAction, uploadEvidenceDocumentAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EvidenceDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string; evidenceId: string }>;
  searchParams: Promise<{ uploaded?: string; deleted?: string; invalid_file?: string; register_error?: string; storage_error?: string; delete_error?: string; already_uploaded?: string }>;
}) {
  if (!getSupabaseConfig()) redirect("/seller");
  const [{ productId, evidenceId }, query] = await Promise.all([params, searchParams]);
  const [viewer, dashboard, product] = await Promise.all([getViewer(), getSellerDashboard(), getSellerProduct(productId)]);
  if (!viewer || !dashboard) redirect("/seller");
  const evidence = product?.evidence.find((proof) => proof.id === evidenceId);
  if (!product || !evidence) notFound();

  let signedUrl: string | null = null;
  if (evidence.document) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("product-evidence").createSignedUrl(evidence.document.storagePath, 600, { download: evidence.document.originalFilename });
    signedUrl = data?.signedUrl ?? null;
  }
  const userName = viewer.displayName || viewer.email?.split("@")[0] || "Membre";
  const error = query.invalid_file || query.register_error || query.storage_error || query.delete_error || query.already_uploaded;

  return <SellerChrome shopName={dashboard.shop.name} shopStatus={dashboard.shop.status} userName={userName} activeRoute="products">
    <div className="seller-content seller-evidence-dossier-page">
      <header className="seller-editor-head"><div><Link href={`/seller/produits/${product.id}`}>← Registre de confiance</Link><p className="seller-kicker">DOSSIER SOURCE CONFIDENTIEL</p><h1>Pièce justificative<span>.</span></h1><p>Le résumé approuvé pourra être public. Le PDF original ne sera accessible qu’à votre boutique et aux opérateurs Yaqeen.</p></div><aside><span className={`seller-state seller-state-${evidence.status}`}>{evidence.status}</span><strong>{product.title}</strong><small>{evidence.issuerName || "Déclaration vendeur"} · {evidence.referenceNumber || "sans référence"}</small></aside></header>
      {(query.uploaded || query.deleted) && <div className="seller-success" role="status"><span>✓</span><div><strong>{query.uploaded ? "Document scellé dans le dossier." : "Document retiré avant revue."}</strong><p>L’empreinte et les droits ont été contrôlés côté serveur.</p></div></div>}
      {error && <div className="seller-form-feedback" role="alert">Opération refusée. Utilisez un PDF lisible de 10 Mo maximum, non déjà enregistré.</div>}

      <section className="seller-evidence-dossier-grid"><article><p>JUSTIFICATION PROPOSÉE</p><h2>{evidence.scope}</h2><dl><div><dt>Nature</dt><dd>{evidence.kind}</dd></div><div><dt>Validité</dt><dd>{evidence.validFrom ?? "—"} → {evidence.validUntil ?? "sans fin"}</dd></div><div><dt>Résumé public</dt><dd>{evidence.publicSummary}</dd></div></dl></article><article className="seller-evidence-vault"><p>COFFRE PRIVÉ</p>{evidence.document ? <><div className="seller-evidence-file"><span>PDF</span><div><strong>{evidence.document.originalFilename}</strong><small>{(evidence.document.byteSize / 1024).toFixed(1)} Ko · SHA‑256</small><code>{evidence.document.sha256}</code></div></div><div className="seller-evidence-file-actions">{signedUrl && <a href={signedUrl}>Télécharger pendant 10 minutes ↓</a>}{evidence.status === "pending" && <form action={deleteEvidenceDocumentAction}><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="evidenceId" value={evidence.id}/><button type="submit">Retirer le PDF</button></form>}</div></> : evidence.status === "pending" ? <form action={uploadEvidenceDocumentAction} className="seller-evidence-upload"><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="evidenceId" value={evidence.id}/><label>Document PDF<input type="file" name="document" accept="application/pdf,.pdf" required/></label><small>10 Mo maximum · signature PDF et empreinte SHA‑256 contrôlées</small><button type="submit">Sceller le document →</button></form> : <p className="moderation-blocked">Aucun document rattaché à cette ancienne décision.</p>}</article></section>
    </div>
  </SellerChrome>;
}
