import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SellerChrome } from "@/components/seller-chrome";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard, getSellerProduct, getSellerProductRevision } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { submitProductForReview } from "../../review-actions";
import {
  addEvidenceAction,
  deactivateVariantAction,
  discardEvidenceAction,
  saveVariantAction,
  setPublishedInventoryAction,
  updateProductAction,
} from "./actions";
import { startRevisionAction } from "./revision/actions";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const evidenceLabels = {
  pending: "En attente de revue",
  approved: "Approuvée",
  rejected: "Refusée",
  expired: "Expirée",
  revoked: "Révoquée",
} as const;
const kindLabels = {
  seller_declaration: "Déclaration du vendeur",
  documentary_review: "Revue documentaire",
  third_party_certificate: "Certificat tiers",
  laboratory_analysis: "Analyse de laboratoire",
} as const;

type EditorSearch = {
  content_saved?: string;
  content_error?: string;
  slug_error?: string;
  variant_saved?: string;
  variant_error?: string;
  sku_error?: string;
  evidence_saved?: string;
  evidence_error?: string;
  inventory_saved?: string;
  inventory_error?: string;
  revision_error?: string;
  revision_withdrawn?: string;
};

export default async function SellerProductEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<EditorSearch>;
}) {
  if (!getSupabaseConfig()) redirect("/seller");
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const [viewer, dashboard, product, revision] = await Promise.all([
    getViewer(),
    getSellerDashboard(),
    getSellerProduct(productId),
    getSellerProductRevision(productId),
  ]);
  if (!viewer || !dashboard) redirect("/seller");
  if (!product) notFound();
  const userName = viewer.displayName || viewer.email?.split("@")[0] || "Membre";
  const success = query.content_saved || query.variant_saved || query.evidence_saved || query.inventory_saved;
  const error = query.content_error || query.slug_error || query.variant_error || query.sku_error || query.evidence_error || query.inventory_error;

  return (
    <SellerChrome shopName={dashboard.shop.name} shopStatus={dashboard.shop.status} userName={userName} activeRoute="products">
      <div className="seller-content seller-product-editor">
        <header className="seller-editor-head">
          <div>
            <Link href="/seller/produits">← Catalogue</Link>
            <p className="seller-kicker">CYCLE CATALOGUE CONTRÔLÉ</p>
            <h1>{product.title}<span>.</span></h1>
            <p>Fiche, variantes et preuves évoluent séparément, mais une seule revue détermine la publication.</p>
          </div>
          <aside>
            <span className={`seller-state seller-product-${product.status}`}>{product.status}</span>
            <strong>{product.editable ? "Brouillon modifiable" : "Contenu verrouillé"}</strong>
            <small>{product.editable ? "Toute correction d’un refus revient automatiquement en brouillon." : "La fiche reste figée pendant la revue ou la publication."}</small>
          </aside>
        </header>

        {success && <div className="seller-success" role="status"><span>✓</span><div><strong>Modification enregistrée.</strong><p>La base a validé l’autorisation et l’intégrité de l’opération.</p></div></div>}
        {error && <div className="seller-form-feedback" role="alert">Modification refusée. Vérifiez les formats, l’unicité du slug ou du SKU, les dates et le stock déjà réservé.</div>}
        {query.revision_withdrawn && <div className="seller-success" role="status"><span>✓</span><div><strong>Révision retirée.</strong><p>La version actuellement publiée n’a jamais été modifiée.</p></div></div>}
        {query.revision_error && <div className="seller-form-feedback" role="alert">La révision n’a pas pu être ouverte. Vérifiez l’état public du produit et votre accès à la boutique.</div>}

        {product.status === "published" && <section className="seller-live-revision-card"><div><p>VERSION PUBLIQUE PROTÉGÉE</p><h2>{revision ? `Révision n°${revision.revisionNumber} · ${revision.status}` : "Faire évoluer cette fiche sans couper sa vente."}</h2><span>{revision ? "La proposition est isolée : les clients continuent à voir la version approuvée jusqu’à la décision opérateur." : "Yaqeen crée un instantané complet. Vos changements restent privés jusqu’à leur approbation atomique."}</span></div>{revision ? <Link href={`/seller/produits/${product.id}/revision`}>Ouvrir la révision →</Link> : <form action={startRevisionAction}><input type="hidden" name="productId" value={product.id}/><button type="submit">Préparer une révision →</button></form>}</section>}

        <section className="seller-editor-block">
          <header><div><span>01</span><p>CONTENU CLIENT</p><h2>Identité de la fiche</h2></div><small>Éditable uniquement en brouillon ou après un refus.</small></header>
          <form action={updateProductAction} className="seller-product-form seller-form-grid">
            <input type="hidden" name="productId" value={product.id} />
            <label className="seller-field-wide">Titre<input name="title" defaultValue={product.title} required minLength={2} maxLength={180} disabled={!product.editable} /></label>
            <label>Adresse produit<input name="slug" defaultValue={product.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" disabled={!product.editable} /></label>
            <label>Catégorie<select name="category" defaultValue={product.category} disabled={!product.editable}><option value="parfums">Parfums</option><option value="cosmetiques">Cosmétiques</option><option value="livres">Livres</option><option value="mode">Mode</option><option value="bien-etre">Bien-être</option><option value="complements">Compléments</option><option value="maison">Maison</option></select></label>
            <label className="seller-field-wide">Description<textarea name="description" defaultValue={product.description} required minLength={40} maxLength={5000} rows={6} disabled={!product.editable} /></label>
            {product.editable && <button className="seller-editor-submit" type="submit">Enregistrer le contenu →</button>}
          </form>
        </section>

        <section className="seller-editor-block">
          <header><div><span>02</span><p>OFFRES & STOCK</p><h2>{product.variants.length} variante{product.variants.length > 1 ? "s" : ""}</h2></div><small>Le stock physique ne peut jamais passer sous le stock déjà réservé.</small></header>
          <div className="seller-variant-stack">
            {product.variants.map((variant) => (
              <form action={saveVariantAction} className={`seller-variant-row${variant.active ? "" : " seller-variant-inactive"}`} key={variant.id}>
                <input type="hidden" name="productId" value={product.id} /><input type="hidden" name="variantId" value={variant.id} />
                <label>Format<input name="variantTitle" defaultValue={variant.title} required disabled={!product.editable} /></label>
                <label>SKU<input name="sku" defaultValue={variant.sku} required disabled={!product.editable} /></label>
                <label>Prix TTC<input name="price" defaultValue={(variant.priceCents / 100).toFixed(2).replace(".", ",")} required inputMode="decimal" disabled={!product.editable} /></label>
                <label>Stock<input name="stock" type="number" min={variant.stockReserved} max={1000000} defaultValue={variant.stockOnHand} required disabled={!product.editable && product.status !== "published"} /><small>{variant.stockReserved} réservé · {variant.stockOnHand - variant.stockReserved} disponible</small></label>
                <label>État<select name="active" defaultValue={String(variant.active)} disabled={!product.editable}><option value="true">Active</option><option value="false">Inactive</option></select></label>
                <div><strong>{money.format(variant.priceCents / 100)}</strong>{product.editable && <button type="submit">Mettre à jour</button>}{product.status === "published" && <button type="submit" formAction={setPublishedInventoryAction}>Actualiser le stock</button>}</div>
              </form>
            ))}
          </div>
          {product.editable && <form action={saveVariantAction} className="seller-variant-row seller-variant-new">
            <input type="hidden" name="productId" value={product.id} /><input type="hidden" name="variantId" value="" /><input type="hidden" name="active" value="true" />
            <label>Nouveau format<input name="variantTitle" required minLength={2} maxLength={120} placeholder="Taille M / Flacon 100 ml" /></label>
            <label>SKU unique<input name="sku" required minLength={3} maxLength={64} placeholder="REF-UNIQUE-02" /></label>
            <label>Prix TTC<input name="price" required inputMode="decimal" placeholder="39,90" /></label>
            <label>Stock<input name="stock" type="number" min={0} max={1000000} defaultValue={0} required /></label>
            <span>Active à la création</span><button type="submit">＋ Ajouter</button>
          </form>}
          {product.editable && product.variants.filter((variant) => variant.active).length > 1 && <div className="seller-variant-retire"><p>Désactiver une variante la conserve dans l’historique.</p>{product.variants.filter((variant) => variant.active).map((variant) => <form action={deactivateVariantAction} key={variant.id}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="variantId" value={variant.id} /><button type="submit">Désactiver {variant.title}</button></form>)}</div>}
        </section>

        <section className="seller-editor-block seller-editor-trust">
          <header><div><span>03</span><p>REGISTRE DE CONFIANCE</p><h2>{product.evidence.length} preuve{product.evidence.length > 1 ? "s" : ""}</h2></div><small>Les décisions passées restent visibles ; seule une preuve en cours de validité permet la vente.</small></header>
          <div className="seller-evidence-history">
            {product.evidence.map((proof) => <article key={proof.id}><div><span className={`seller-state seller-state-${proof.status}`}>{evidenceLabels[proof.status]}</span><strong>{kindLabels[proof.kind]}</strong><small>{proof.validFrom || proof.validUntil ? `Validité : ${proof.validFrom ?? "—"} → ${proof.validUntil ?? "sans fin"}` : "Validité non bornée"}</small></div><p>{proof.scope}</p><p>{proof.publicSummary}</p>{proof.status === "pending" && product.editable && <form action={discardEvidenceAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="evidenceId" value={proof.id} /><button type="submit">Retirer cette soumission</button></form>}</article>)}
          </div>
          {product.editable && <form action={addEvidenceAction} className="seller-product-form seller-form-grid seller-evidence-new">
            <input type="hidden" name="productId" value={product.id} />
            <label>Nature<select name="evidenceKind" defaultValue="seller_declaration"><option value="seller_declaration">Déclaration du vendeur</option><option value="third_party_certificate">Certificat tiers</option></select></label>
            <label className="seller-field-wide">Périmètre<textarea name="evidenceScope" required minLength={10} maxLength={2000} rows={3} placeholder="Ce que cette preuve établit précisément." /></label>
            <label>Émetteur<input name="issuerName" maxLength={180} placeholder="Obligatoire pour un certificat" /></label>
            <label>Référence<input name="referenceNumber" maxLength={180} placeholder="Obligatoire pour un certificat" /></label>
            <label>Début de validité<input name="validFrom" type="date" /></label><label>Fin de validité<input name="validUntil" type="date" /></label>
            <label className="seller-field-wide">Résumé public proposé<textarea name="publicSummary" required minLength={20} maxLength={1000} rows={3} /></label>
            <button className="seller-editor-submit" type="submit">Ajouter à la revue →</button>
          </form>}
        </section>

        <footer className="seller-editor-footer">
          <div><strong>Avant soumission</strong><span>Au moins une variante active, une preuve actuelle et une image privée téléversée.</span></div>
          <Link href={`/seller/produits/${product.id}/medias`}>Gérer les images</Link>
          {product.editable && <form action={submitProductForReview}><input type="hidden" name="productId" value={product.id} /><button type="submit">Soumettre l’ensemble →</button></form>}
        </footer>
      </div>
    </SellerChrome>
  );
}
