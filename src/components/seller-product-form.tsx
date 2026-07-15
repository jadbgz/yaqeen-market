"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createProductDraft, type ProductDraftState } from "@/app/seller/produits/actions";

function ErrorText({ messages }: { messages?: string[] }) {
  return messages?.length ? <span className="seller-form-error">{messages[0]}</span> : null;
}

export function SellerProductForm() {
  const initialState: ProductDraftState = { status: "idle" };
  const [state, action, pending] = useActionState(createProductDraft, initialState);

  return (
    <form action={action} className="seller-product-form">
      <section className="seller-form-section"><header><span>01</span><div><p>IDENTITÉ DU PRODUIT</p><h2>Ce que le client découvrira.</h2></div></header><div className="seller-form-grid">
        <label className="seller-field-wide">Titre<input name="title" required minLength={2} maxLength={180} placeholder="Ex. Musc blanc — Eau de parfum" /><ErrorText messages={state.fieldErrors?.title} /></label>
        <label>Adresse produit<input name="slug" required minLength={3} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="musc-blanc-eau-parfum" /><ErrorText messages={state.fieldErrors?.slug} /></label>
        <label>Catégorie<select name="category" defaultValue="parfums"><option value="parfums">Parfums</option><option value="cosmetiques">Cosmétiques</option><option value="livres">Livres</option><option value="mode">Mode</option><option value="bien-etre">Bien-être</option><option value="complements">Compléments</option><option value="maison">Maison</option></select><ErrorText messages={state.fieldErrors?.category} /></label>
        <label className="seller-field-wide">Description<textarea name="description" required minLength={40} rows={6} maxLength={5000} placeholder="Composition, usage, fabrication, origine et informations utiles — sans allégation non prouvée." /><ErrorText messages={state.fieldErrors?.description} /></label>
      </div></section>

      <section className="seller-form-section"><header><span>02</span><div><p>OFFRE & STOCK</p><h2>Une première variante vendable.</h2></div></header><div className="seller-form-grid seller-form-grid-three">
        <label>Format<input name="variantTitle" required minLength={2} maxLength={120} placeholder="Flacon 50 ml" /><ErrorText messages={state.fieldErrors?.variantTitle} /></label>
        <label>SKU<input name="sku" required minLength={3} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._-]+" placeholder="MUSC-BLANC-50" /><ErrorText messages={state.fieldErrors?.sku} /></label>
        <label>Prix TTC · EUR<input name="price" required inputMode="decimal" placeholder="34,90" /><ErrorText messages={state.fieldErrors?.price} /></label>
        <label>Stock physique<input name="stock" type="number" required min={0} max={1000000} defaultValue={0} /><ErrorText messages={state.fieldErrors?.stock} /></label>
      </div></section>

      <section className="seller-form-section seller-trust-section"><header><span>03</span><div><p>PREUVE YAQEEN</p><h2>Dire exactement ce qui est établi.</h2></div></header><div className="seller-trust-note"><strong>Une déclaration n’est pas une certification.</strong><p>Elle sera affichée comme telle après revue. Yaqeen ne transformera jamais une pièce soumise en promesse plus large que son périmètre.</p></div><div className="seller-form-grid">
        <label>Nature de la preuve<select name="evidenceKind" defaultValue="seller_declaration"><option value="seller_declaration">Déclaration du vendeur</option><option value="third_party_certificate">Certificat tiers</option></select><ErrorText messages={state.fieldErrors?.evidenceKind} /></label>
        <label className="seller-field-wide">Périmètre couvert<textarea name="evidenceScope" required minLength={10} maxLength={2000} rows={4} placeholder="Ex. Composition du produit fini, absence d’alcool éthylique ajouté et procédé de fabrication du lot concerné." /><ErrorText messages={state.fieldErrors?.evidenceScope} /></label>
        <label>Organisme émetteur<input name="issuerName" maxLength={180} placeholder="Obligatoire pour un certificat" /><ErrorText messages={state.fieldErrors?.issuerName} /></label>
        <label>Référence du document<input name="referenceNumber" maxLength={180} placeholder="Obligatoire pour un certificat" /><ErrorText messages={state.fieldErrors?.referenceNumber} /></label>
        <label className="seller-field-wide">Résumé public proposé<textarea name="publicSummary" required minLength={20} rows={3} maxLength={1000} placeholder="Résumé factuel que l’équipe Yaqeen pourra valider avant affichage." /><ErrorText messages={state.fieldErrors?.publicSummary} /></label>
      </div></section>

      {state.message && <p className="seller-form-feedback" aria-live="polite">{state.message}</p>}
      <footer className="seller-form-actions"><Link href="/seller/produits">Annuler</Link><div><span>Enregistrement privé · revue obligatoire</span><button type="submit" disabled={pending}>{pending ? "Enregistrement atomique…" : "Créer le brouillon →"}</button></div></footer>
    </form>
  );
}
