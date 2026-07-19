import { redirect } from "next/navigation";
import { deleteAddress } from "@/app/compte/actions";
import { AccountHeader } from "@/components/account-header";
import { AddressForm } from "@/components/address-form";
import { getCustomerAddresses } from "@/lib/account/dal";
import { getViewer } from "@/lib/auth/dal";

export default async function AddressesPage() {
  if (!await getViewer()) redirect("/?auth=login&next=/compte/adresses");
  const addresses = await getCustomerAddresses();
  return <main className="member-shell">
    <AccountHeader />
    <section className="account-page-heading"><p>VOTRE COMPTE / LIVRAISON</p><h1>Mes adresses.</h1><p>Vos adresses restent privées. Lors d’un achat, la commande conserve une copie indépendante pour garantir son suivi.</p></section>
    <div className="account-page-grid">
      <section>
        <h2>Adresses enregistrées <span>{addresses.length}/10</span></h2>
        {addresses.length ? <div className="address-list">{addresses.map((address) => <article key={address.id}>
          <div><strong>{address.label}</strong>{address.isDefault && <span>Par défaut</span>}</div>
          <p>{address.recipientName}<br />{address.line1}{address.line2 && <><br />{address.line2}</>}<br />{address.postalCode} {address.city} · {address.countryCode}</p>
          {address.phone && <small>{address.phone}</small>}
          <form action={deleteAddress}><input type="hidden" name="addressId" value={address.id} /><button>Supprimer</button></form>
        </article>)}</div> : <div className="account-empty"><strong>Aucune adresse enregistrée.</strong><p>Ajoutez votre première adresse. Elle deviendra automatiquement l’adresse par défaut.</p></div>}
      </section>
      <section><h2>Ajouter une adresse</h2><AddressForm /></section>
    </div>
  </main>;
}
