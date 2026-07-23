import { redirect } from "next/navigation";
import { cancelAccountDeletion, requestAccountDeletion } from "@/app/compte/actions";
import { AccountHeader } from "@/components/account-header";
import { MfaPanel } from "@/components/mfa-panel";
import { ChangePasswordForm } from "@/components/password-forms";
import { getPendingDeletionRequest } from "@/lib/account/dal";
import { getViewer } from "@/lib/auth/dal";

export default async function SecurityPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/?auth=login&next=/compte/securite");
  const deletion = await getPendingDeletionRequest();
  return <main className="member-shell">
    <AccountHeader />
    <section className="account-page-heading"><p>VOTRE COMPTE / SÉCURITÉ</p><h1>Sécurité & données.</h1><p>Les actions sensibles sont revérifiées côté serveur et tracées dans la base.</p></section>
    <div className="account-page-grid security-grid security-grid-mfa">
      <section><h2>Mot de passe</h2><ChangePasswordForm /></section>
      <MfaPanel privileged={viewer.role === "operator" || viewer.role === "admin"} />
      <section className="danger-zone"><p>CONTRÔLE DU COMPTE</p><h2>Suppression du compte</h2>
        {deletion ? <><p>Votre demande est enregistrée. La suppression est prévue au plus tôt le <strong>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(deletion.scheduledFor))}</strong>.</p><p>Ce délai protège contre une suppression accidentelle. Les données de commande soumises à conservation seront traitées séparément.</p><form action={cancelAccountDeletion}><button className="account-secondary">Annuler ma demande</button></form></> : <><p>Une demande ouvre un délai de réflexion de 30 jours. Elle ne supprime pas immédiatement votre session, vos commandes ou les obligations de conservation.</p><form action={requestAccountDeletion}><button className="account-danger">Demander la suppression</button></form></>}
      </section>
    </div>
  </main>;
}
