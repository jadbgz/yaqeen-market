"use client";

import { useState } from "react";

const tabs = ["Accueil", "Explorer", "Panier", "Compte"] as const;
type Tab = (typeof tabs)[number];

const products = [
  { name: "Musc blanc", shop: "Boutique Démo 06", price: "24 €", tone: "green" },
  { name: "L'essentiel", shop: "Boutique Démo 07", price: "18 €", tone: "rust" },
  { name: "Sérum nigelle", shop: "Boutique Démo 08", price: "29 €", tone: "gold" },
];

export default function MobilePreview() {
  const [active, setActive] = useState<Tab>("Accueil");

  return (
    <main className="app-preview-shell">
      <section className="app-preview-copy">
        <p className="index-label">YAQEEN · EXPÉRIENCE MOBILE</p>
        <h1>UNE APP POUR<br />ACHETER EN<br /><span>CONFIANCE.</span></h1>
        <p>Une marketplace communautaire, pensée nativement pour iOS et Android. Le catalogue, le panier et le compte seront partagés avec le site web, sans sacrifier l’expérience mobile.</p>
        <div className="app-platforms"><span>iOS</span><span>Android</span><span>Web associé</span></div>
        <a href="/catalogue">Explorer la marketplace →</a>
      </section>

      <section className="phone-stage" aria-label="Aperçu interactif de l'application Yaqeen">
        <div className="phone-orbit phone-orbit-one" /><div className="phone-orbit phone-orbit-two" />
        <div className="phone-frame">
          <div className="phone-status"><span>9:41</span><i /><b>● ◒</b></div>
          <div className="mobile-head"><strong className="brand-mark">yaqeen<span>●</span></strong><button aria-label="Notifications">○</button></div>

          <div className="mobile-content">
            {active === "Accueil" && <>
              <p className="mobile-eyebrow">CHOISI PAR LA COMMUNAUTÉ</p>
              <h2>DES OBJETS QUI<br />ONT DU <em>SENS.</em></h2>
              <button className="mobile-search">⌕ &nbsp; Rechercher une boutique ou un produit</button>
              <div className="mobile-chips"><span>Parfums</span><span>Livres</span><span>Soins</span><span>Mode</span></div>
              <div className="mobile-section-title"><strong>Nos découvertes</strong><small>Voir tout</small></div>
              <div className="mobile-products">{products.map((product) => <article key={product.name}><div className={`mobile-object ${product.tone}`}><i /></div><small>{product.shop}</small><strong>{product.name}</strong><b>{product.price}</b></article>)}</div>
            </>}
            {active === "Explorer" && <>
              <p className="mobile-eyebrow">EXPLORER YAQEEN</p><h2>TROUVEZ VOTRE<br /><em>PROCHAINE MAISON.</em></h2>
              <button className="mobile-search">⌕ &nbsp; Produit, boutique, catégorie…</button>
              <div className="mobile-list">{["Beauté & parfums", "Livres & transmission", "Mode & accessoires", "Bien-être"].map((item, i)=><div key={item}><span>0{i+1}</span><strong>{item}</strong><b>→</b></div>)}</div>
            </>}
            {active === "Panier" && <>
              <p className="mobile-eyebrow">VOTRE PANIER</p><h2>PLUSIEURS MAISONS.<br /><em>UN SEUL PANIER.</em></h2>
              <div className="mobile-cart"><div className="mobile-object green"><i /></div><div><small>Boutique Démo 06</small><strong>Musc blanc</strong><span>50 ml · Qté 1</span></div><b>24 €</b></div>
              <div className="mobile-total"><span>Total provisoire</span><strong>24 €</strong></div><button className="mobile-cta">CONTINUER →</button>
            </>}
            {active === "Compte" && <>
              <p className="mobile-eyebrow">VOTRE ESPACE</p><h2>BIENVENUE DANS<br /><em>LA COMMUNAUTÉ.</em></h2>
              <div className="mobile-account"><i>Y</i><div><strong>Compte Yaqeen</strong><span>Commandes, favoris et recommandations</span></div></div>
              <div className="mobile-list"><div><span>01</span><strong>Mes commandes</strong><b>→</b></div><div><span>02</span><strong>Mes boutiques</strong><b>→</b></div><div><span>03</span><strong>Devenir vendeur</strong><b>→</b></div></div>
            </>}
          </div>

          <nav className="mobile-tabs">{tabs.map(tab => <button key={tab} className={active === tab ? "active" : ""} onClick={() => setActive(tab)}><i>{tab === "Accueil" ? "⌂" : tab === "Explorer" ? "⌕" : tab === "Panier" ? "▱" : "○"}</i><span>{tab}</span></button>)}</nav>
        </div>
      </section>
    </main>
  );
}
