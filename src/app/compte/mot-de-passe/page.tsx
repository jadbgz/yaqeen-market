import { redirect } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { RecoveredPasswordForm } from "@/components/password-forms";
import { getViewer } from "@/lib/auth/dal";

export default async function RecoveredPasswordPage() {
  if (!await getViewer()) redirect("/compte/mot-de-passe-oublie");
  return <main className="member-shell"><AccountHeader />
    <section className="auth-standalone"><p>LIEN DE RÉCUPÉRATION VALIDÉ</p><h1>Nouveau<br />mot de passe.</h1><p>Choisissez un mot de passe unique que vous n’utilisez sur aucun autre service.</p><RecoveredPasswordForm /></section>
  </main>;
}
