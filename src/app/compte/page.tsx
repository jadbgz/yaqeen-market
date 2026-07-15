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
      <section className="member-grid">
        <Link href="/panier"><span>01</span><strong>Mes commandes</strong><small>Suivre les achats passés auprès de chaque boutique</small></Link>
        <Link href="/catalogue"><span>02</span><strong>Mes favoris</strong><small>Retrouver les produits et boutiques enregistrés</small></Link>
        <Link href="/seller"><span>03</span><strong>Créer ma boutique</strong><small>Ouvrir un espace vendeur lié à ce compte</small></Link>
      </section>
      <form action={logout} className="member-logout"><button type="submit">Se déconnecter</button></form>
    </main>
  );
}
