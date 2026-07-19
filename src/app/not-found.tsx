import Link from "next/link";

export const metadata = { title: "Page introuvable — Yaqeen Market", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="status-shell">
      <Link href="/" className="brand-mark status-brand">yaqeen<span>✦</span></Link>
      <section className="status-copy">
        <p>ERREUR 404</p>
        <h1>Cette page<br/>n’existe pas<span>.</span></h1>
        <p className="status-lead">L’adresse est peut-être erronée, ou ce contenu n’est plus publié. Aucun produit ne disparaît sans raison : les fiches retirées le sont après décision tracée.</p>
        <div className="status-actions">
          <Link href="/catalogue" className="status-primary">Explorer le catalogue →</Link>
          <Link href="/">Retour à l’accueil</Link>
        </div>
      </section>
    </main>
  );
}
