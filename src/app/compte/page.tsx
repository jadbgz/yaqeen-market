import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { getViewer } from "@/lib/auth/dal";

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  return (
    <main className="member-shell">
      <header className="member-header"><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><Link href="/catalogue">Continuer mes achats ↗</Link></header>
      <section className="member-hero"><p>VOTRE ESPACE YAQEEN</p><h1>Bonjour,<br /><span>{viewer.displayName || "bienvenue"}.</span></h1><p>{viewer.email}</p></section>
      <section className="member-grid member-grid-four">
        <Link href="/compte/commandes"><span>01</span><strong>Mes commandes</strong><small>Suivre chaque commande et chaque boutique vendeuse</small></Link>
        <Link href="/compte/adresses"><span>02</span><strong>Mes adresses</strong><small>Gérer les lieux utilisés pour vos prochaines livraisons</small></Link>
        <Link href="/compte/securite"><span>03</span><strong>Sécurité & données</strong><small>Mot de passe et contrôle de votre compte</small></Link>
        <Link href="/seller"><span>04</span><strong>Créer ma boutique</strong><small>Ouvrir un espace vendeur lié à ce compte</small></Link>
      </section>
      <form action={logout} className="member-logout"><button type="submit">Se déconnecter</button></form>
    </main>
  );
}
