import Link from "next/link";

const nav = [
  ["⌂", "Vue d’ensemble", true], ["□", "Commandes", false], ["◇", "Produits", false],
  ["◫", "Stock", false], ["↗", "Expéditions", false], ["◉", "Statistiques", false],
  ["€", "Paiements", false], ["✓", "Conformité", false],
] as const;

const orders = [
  { id: "#YQ-2048", client: "Sarah M.", product: "Musc blanc · 50 ml", amount: "34,90 €", status: "À préparer", tone: "orange" },
  { id: "#YQ-2047", client: "Yasmine K.", product: "Ambre noir · 50 ml", amount: "42,00 €", status: "À préparer", tone: "orange" },
  { id: "#YQ-2046", client: "Nabil B.", product: "Coffret découverte", amount: "68,50 €", status: "Expédiée", tone: "green" },
  { id: "#YQ-2045", client: "Inès A.", product: "Musc tahara · 30 ml", amount: "26,90 €", status: "Livrée", tone: "blue" },
];

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <article className={`seller-metric ${accent ? "seller-metric-accent" : ""}`}><div className="flex items-start justify-between"><p>{label}</p><span>↗</span></div><strong>{value}</strong><small>{detail}</small></article>;
}

export default function SellerPage() {
  return (
    <main className="seller-shell">
      <aside className="seller-sidebar">
        <Link href="/" className="seller-logo">yaqeen<span>✦</span><small>seller</small></Link>
        <div className="seller-store"><div className="seller-avatar">MS</div><div><strong>Boutique Démo 01</strong><span>Boutique active</span></div><button aria-label="Changer de boutique">⌄</button></div>
        <nav>{nav.map(([icon, label, active]) => <a href="#" className={active ? "active" : ""} key={label}><i>{icon}</i><span>{label}</span>{label === "Commandes" && <b>2</b>}</a>)}</nav>
        <div className="seller-side-bottom"><a href="#"><i>⚙</i><span>Paramètres</span></a><a href="#"><i>?</i><span>Centre d’aide</span></a><Link href="/"><i>↙</i><span>Voir ma boutique</span></Link></div>
      </aside>

      <section className="seller-main">
        <header className="seller-topbar"><button className="seller-menu" aria-label="Ouvrir le menu">☰</button><div><span>Dimanche 12 juillet</span><strong>Bonjour, Boutique Démo 01.</strong></div><div className="seller-actions"><button aria-label="Notifications" className="seller-round">♢<b /></button><div className="seller-profile">J</div><button>Jad <span>⌄</span></button></div></header>

        <div className="seller-content">
          <div className="seller-welcome"><div><p className="seller-kicker">TABLEAU DE BORD</p><h1>Voici l’essentiel<br />pour aujourd’hui<span>.</span></h1></div><button className="seller-primary">＋ Ajouter un produit</button></div>

          <div className="seller-alert"><div className="seller-alert-icon">2</div><div><strong>Deux commandes attendent votre attention</strong><p>Préparez-les avant 14 h pour une expédition aujourd’hui.</p></div><button>Voir les commandes →</button></div>

          <div className="seller-metrics"><Metric label="Chiffre d’affaires" value="3 842,60 €" detail="↑ 18,4 % ce mois" accent /><Metric label="Commandes" value="127" detail="↑ 12 depuis hier" /><Metric label="Panier moyen" value="46,20 €" detail="↑ 3,10 € ce mois" /><Metric label="Visiteurs" value="2 840" detail="6,2 % de conversion" /></div>

          <div className="seller-grid">
            <section className="seller-panel seller-chart"><div className="seller-panel-head"><div><p>VENTES</p><h2>Activité des 7 derniers jours</h2></div><select aria-label="Période"><option>7 jours</option><option>30 jours</option></select></div><div className="chart-total"><strong>1 284,30 €</strong><span>+24,6 %</span></div><div className="chart-area"><div className="chart-lines"><i/><i/><i/><i/></div><svg viewBox="0 0 700 180" role="img" aria-label="Courbe des ventes"><defs><linearGradient id="sellerFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ef6b38" stopOpacity=".28"/><stop offset="1" stopColor="#ef6b38" stopOpacity="0"/></linearGradient></defs><path d="M0 145 C55 132 68 112 118 120 S190 142 235 105 S310 65 355 82 S425 115 472 78 S540 35 580 58 S650 55 700 18 L700 180 L0 180Z" fill="url(#sellerFill)"/><path d="M0 145 C55 132 68 112 118 120 S190 142 235 105 S310 65 355 82 S425 115 472 78 S540 35 580 58 S650 55 700 18" fill="none" stroke="#ef6b38" strokeWidth="4" strokeLinecap="round"/><circle cx="700" cy="18" r="7" fill="#ef6b38" stroke="#fff" strokeWidth="4"/></svg><div className="chart-days"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div></div></section>

            <section className="seller-panel seller-health"><div className="seller-panel-head"><div><p>BOUTIQUE</p><h2>Santé de votre maison</h2></div><span className="seller-good">Excellent</span></div><div className="health-score"><div className="score-ring"><strong>92</strong><span>/ 100</span></div><p>Votre boutique inspire confiance.</p></div><ul><li><span>✓</span><div><strong>Documents vérifiés</strong><small>Tout est à jour</small></div></li><li><span>✓</span><div><strong>Expédition rapide</strong><small>1,2 jour en moyenne</small></div></li><li><span>!</span><div><strong>3 fiches à compléter</strong><small>Ajoutez les compositions</small></div><b>→</b></li></ul></section>
          </div>

          <section className="seller-panel seller-orders"><div className="seller-panel-head"><div><p>COMMANDES RÉCENTES</p><h2>Les dernières activités</h2></div><button>Voir toutes les commandes →</button></div><div className="seller-table"><div className="seller-tr seller-th"><span>Commande</span><span>Client</span><span>Produit</span><span>Montant</span><span>Statut</span><span /></div>{orders.map(order => <div className="seller-tr" key={order.id}><strong>{order.id}</strong><span>{order.client}</span><span>{order.product}</span><strong>{order.amount}</strong><span><i className={order.tone}/>{order.status}</span><button aria-label={`Options pour ${order.id}`}>•••</button></div>)}</div></section>
        </div>
      </section>
    </main>
  );
}
