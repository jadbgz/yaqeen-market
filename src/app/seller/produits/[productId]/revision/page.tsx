import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SellerChrome } from "@/components/seller-chrome";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard, getSellerProduct, getSellerProductRevision } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";
import {
  saveRevisionVariantAction,
  submitRevisionAction,
  updateRevisionAction,
  withdrawRevisionAction,
} from "./actions";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const statusLabels = {
  draft: "Brouillon privé",
  under_review: "En comparaison",
  approved: "Approuvée",
  rejected: "À corriger",
  withdrawn: "Retirée",
} as const;

type SearchState = {
  content_saved?: string;
  content_error?: string;
  slug_error?: string;
  variant_saved?: string;
  variant_error?: string;
  sku_error?: string;
  submitted?: string;
  submit_error?: string;
  evidence_error?: string;
  revision_error?: string;
};

export default async function ProductRevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<SearchState>;
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
  if (!product || !revision) notFound();
  const userName = viewer.displayName || viewer.email?.split("@")[0] || "Membre";
  const success = query.content_saved || query.variant_saved || query.submitted;
  const error = query.content_error || query.slug_error || query.variant_error || query.sku_error || query.submit_error || query.evidence_error || query.revision_error;

  return <SellerChrome shopName={dashboard.shop.name} shopStatus={dashboard.shop.status} userName={userName} activeRoute="products">
    <div className="seller-content seller-product-editor seller-revision-page">
      <header className="seller-editor-head"><div><Link href={`/seller/produits/${product.id}`}>← Version publique</Link><p className="seller-kicker">RÉVISION ISOLÉE · N°{revision.revisionNumber}</p><h1>{revision.title}<span>.</span></h1><p>Préparez la prochaine version sans toucher à celle que les clients peuvent actuellement acheter.</p></div><aside><span className={`seller-state seller-revision-${revision.status}`}>{statusLabels[revision.status]}</span><strong>{revision.editable ? "Proposition modifiable" : "Proposition verrouillée"}</strong><small>{revision.status === "under_review" ? "L’équipe Yaqeen compare maintenant cet instantané à la version publique." : revision.status === "rejected" ? revision.reviewRationale : "La publication actuelle reste inchangée."}</small></aside></header>

      {success && <div className="seller-success" role="status"><span>✓</span><div><strong>{query.submitted ? "Révision transmise à la comparaison." : "Proposition enregistrée."}</strong><p>La version publique et les identifiants de variantes restent intacts.</p></div></div>}
      {error && <div className="seller-form-feedback" role="alert">Opération refusée. Vérifiez les champs, les SKU, le stock réservé et la validité actuelle de la preuve produit.</div>}

      <section className="seller-revision-principle"><div><p>EN LIGNE MAINTENANT</p><strong>{product.title}</strong><span>/{product.slug}</span></div><b>→</b><div><p>APRÈS APPROBATION</p><strong>{revision.title}</strong><span>/{revision.slug}</span></div></section>

      <section className="seller-editor-block"><header><div><span>01</span><p>COMPARAISON DU CONTENU</p><h2>Prochaine version de la fiche</h2></div><small>La base refusera l’approbation si la version publique change entre-temps.</small></header><form action={updateRevisionAction} className="seller-product-form seller-form-grid"><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="revisionId" value={revision.id}/><label className="seller-field-wide">Titre proposé<input name="title" defaultValue={revision.title} required minLength={2} maxLength={180} disabled={!revision.editable}/><small>En ligne : {product.title}</small></label><label>Adresse proposée<input name="slug" defaultValue={revision.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" disabled={!revision.editable}/><small>En ligne : /{product.slug}</small></label><label>Catégorie<select name="category" defaultValue={revision.category} disabled={!revision.editable}><option value="parfums">Parfums</option><option value="cosmetiques">Cosmétiques</option><option value="livres">Livres</option><option value="mode">Mode</option><option value="bien-etre">Bien-être</option><option value="complements">Compléments</option><option value="maison">Maison</option></select><small>En ligne : {product.category}</small></label><label className="seller-field-wide">Description proposée<textarea name="description" defaultValue={revision.description} required minLength={40} maxLength={5000} rows={7} disabled={!revision.editable}/><small>La description publique reste visible jusqu’à la décision.</small></label>{revision.editable && <button className="seller-editor-submit" type="submit">Enregistrer la proposition →</button>}</form></section>

      <section className="seller-editor-block"><header><div><span>02</span><p>VARIANTES VERSIONNÉES</p><h2>{revision.variants.length} offre{revision.variants.length > 1 ? "s" : ""} proposée{revision.variants.length > 1 ? "s" : ""}</h2></div><small>Les variantes existantes conservent leur UUID lors de l’approbation ; paniers et commandes historiques restent cohérents.</small></header><div className="seller-variant-stack">{revision.variants.map((variant) => { const live = variant.sourceVariantId ? product.variants.find((item) => item.id === variant.sourceVariantId) : null; return <form action={saveRevisionVariantAction} className={`seller-variant-row${variant.active ? "" : " seller-variant-inactive"}`} key={variant.id}><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="revisionId" value={revision.id}/><input type="hidden" name="revisionVariantId" value={variant.id}/><label>Format<input name="variantTitle" defaultValue={variant.title} required disabled={!revision.editable}/><small>{live ? `En ligne : ${live.title}` : "Nouvelle variante"}</small></label><label>SKU<input name="sku" defaultValue={variant.sku} required disabled={!revision.editable}/><small>{live ? `En ligne : ${live.sku}` : "Nouveau SKU"}</small></label><label>Prix TTC<input name="price" defaultValue={(variant.priceCents / 100).toFixed(2).replace(".", ",")} required disabled={!revision.editable}/><small>{live ? money.format(live.priceCents / 100) : "Non publiée"}</small></label><label>Stock{live ? <><input name="stock" type="hidden" value={variant.stockOnHand}/><strong className="seller-revision-live-stock">{live.stockOnHand} en ligne</strong><small>Géré immédiatement depuis la fiche publique · {live.stockReserved} réservé</small></> : <><input name="stock" type="number" min={0} max={1000000} defaultValue={variant.stockOnHand} required disabled={!revision.editable}/><small>Initialisé à l’approbation</small></>}</label><label>État<select name="active" defaultValue={String(variant.active)} disabled={!revision.editable}><option value="true">Active</option><option value="false">Inactive</option></select></label><div><strong>{live ? "Existante" : "Nouvelle"}</strong>{revision.editable && <button type="submit">Mettre à jour</button>}</div></form>; })}</div>{revision.editable && <form action={saveRevisionVariantAction} className="seller-variant-row seller-variant-new"><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="revisionId" value={revision.id}/><input type="hidden" name="revisionVariantId" value=""/><input type="hidden" name="active" value="true"/><label>Nouveau format<input name="variantTitle" required minLength={2} maxLength={120} placeholder="Taille XL"/></label><label>SKU unique<input name="sku" required minLength={3} maxLength={64} placeholder="REF-XL"/></label><label>Prix TTC<input name="price" required inputMode="decimal" placeholder="59,90"/></label><label>Stock<input name="stock" type="number" min={0} max={1000000} defaultValue={0} required/></label><span>Créée seulement après approbation</span><button type="submit">＋ Ajouter</button></form>}</section>

      <footer className="seller-editor-footer seller-revision-footer"><div><strong>Publication sans interruption</strong><span>Une preuve actuelle et une boutique approuvée seront revérifiées au moment exact de la décision.</span></div>{revision.editable && <form action={withdrawRevisionAction}><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="revisionId" value={revision.id}/><button className="seller-revision-withdraw" type="submit">Retirer</button></form>}{revision.editable && <form action={submitRevisionAction}><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="revisionId" value={revision.id}/><button type="submit">Soumettre à la comparaison →</button></form>}</footer>
    </div>
  </SellerChrome>;
}
