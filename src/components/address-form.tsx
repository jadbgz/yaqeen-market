"use client";

import { useActionState } from "react";
import { saveAddress, type AccountActionState } from "@/app/compte/actions";

export function AddressForm() {
  const initialState: AccountActionState = { status: "idle" };
  const [state, action, pending] = useActionState(saveAddress, initialState);
  return (
    <form action={action} className="account-form">
      <div className="account-form-row">
        <label>Nom de l’adresse<input name="label" placeholder="Domicile" required minLength={2} maxLength={40} /></label>
        <label>Destinataire<input name="recipientName" autoComplete="name" required minLength={2} maxLength={120} /></label>
      </div>
      <label>Adresse<input name="line1" autoComplete="address-line1" required minLength={3} maxLength={180} /></label>
      <label>Complément<input name="line2" autoComplete="address-line2" maxLength={180} /></label>
      <div className="account-form-row account-form-row-three">
        <label>Code postal<input name="postalCode" autoComplete="postal-code" required maxLength={20} /></label>
        <label>Ville<input name="city" autoComplete="address-level2" required maxLength={100} /></label>
        <label>Pays<input name="countryCode" autoComplete="country" defaultValue="FR" required minLength={2} maxLength={2} /></label>
      </div>
      <label>Téléphone <small>Pour la livraison uniquement</small><input name="phone" type="tel" autoComplete="tel" maxLength={32} /></label>
      <label className="account-check"><input name="isDefault" type="checkbox" /> Utiliser par défaut</label>
      {state.message && <p className={`account-form-feedback ${state.status}`}>{state.message}</p>}
      <button className="account-primary" disabled={pending} type="submit">{pending ? "Enregistrement…" : "Enregistrer l’adresse"}</button>
    </form>
  );
}
