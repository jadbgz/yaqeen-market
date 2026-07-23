import Link from "next/link";

const groups = [
  {
    title: "Acheter",
    links: [["Catalogue", "/catalogue"], ["Mon panier", "/panier"], ["Mon compte", "/compte"]],
  },
  {
    title: "Confiance",
    links: [["Notre méthode de revue", "/#garanties"], ["Livraison & retours", "/aide#livraison"], ["Paiement sécurisé", "/aide#paiement"]],
  },
  {
    title: "Vendeurs",
    links: [["Vendre sur Yaqeen", "/seller"], ["Processus de publication", "/aide#vendeurs"], ["Recommander une boutique", "/aide#recommander"]],
  },
  {
    title: "Informations",
    links: [["Centre d’aide", "/aide"], ["Cadre légal avant ouverture", "/aide#legal"], ["Signaler un problème", "/.well-known/security.txt"]],
  },
] as const;

export function MarketFooter() {
  return (
    <footer className="market-footer">
      <div className="market-footer-lead">
        <p className="brand-mark">yaqeen<span>✦</span></p>
        <strong>Une marketplace.<br />Plusieurs boutiques.<br />Un même niveau d’exigence.</strong>
        <p>Yaqeen organise la rencontre entre des vendeurs indépendants et une communauté qui veut choisir avec plus de clarté.</p>
      </div>
      <nav className="market-footer-links" aria-label="Pied de page">
        {groups.map((group) => <section key={group.title}><h2>{group.title}</h2>{group.links.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}</section>)}
      </nav>
      <div className="market-footer-bottom"><span>Paris · France</span><span>© 2026 Yaqeen Market</span><span>Version de développement — aucune carte réelle débitée</span></div>
    </footer>
  );
}
