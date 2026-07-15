"use client";

import { useActionState } from "react";
import { createSellerShop, type SellerOnboardingState } from "@/app/seller/actions";

function ErrorText({ messages }: { messages?: string[] }) {
  return messages?.length ? <span className="seller-form-error">{messages[0]}</span> : null;
}

export function SellerOnboardingForm() {
  const initialState: SellerOnboardingState = { status: "idle" };
  const [state, action, pending] = useActionState(createSellerShop, initialState);

  return (
    <form action={action} className="seller-onboarding-form">
      <label>Nom de la boutique<input name="name" autoComplete="organization" required minLength={2} maxLength={120} placeholder="Ex. Boutique Démo 04" /><ErrorText messages={state.fieldErrors?.name} /></label>
      <label>Adresse Yaqeen<div className="seller-slug-input"><span>yaqeen.market/boutique/</span><input name="slug" required minLength={3} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="atelier-haya" /></div><ErrorText messages={state.fieldErrors?.slug} /></label>
      <label>Présentation<textarea name="description" maxLength={2000} rows={5} placeholder="Présentez votre savoir-faire, vos produits et vos engagements." /><ErrorText messages={state.fieldErrors?.description} /></label>
      <label>Pays d’expédition<input name="country" defaultValue="FR" required minLength={2} maxLength={2} aria-describedby="country-help" /><small id="country-help">Code ISO à deux lettres, par exemple FR ou BE.</small><ErrorText messages={state.fieldErrors?.country} /></label>
      {state.message && <p className="seller-form-feedback">{state.message}</p>}
      <button type="submit" disabled={pending}>{pending ? "Création sécurisée…" : "Créer ma boutique →"}</button>
      <p className="seller-form-note">La boutique sera créée en brouillon. Aucun produit ne sera public avant la revue Yaqeen.</p>
    </form>
  );
}
