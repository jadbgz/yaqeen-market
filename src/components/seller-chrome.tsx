"use client";

import Link from "next/link";
import { useState } from "react";

const disabledNavigation = [
  ["□", "Commandes"], ["◫", "Stock"],
  ["↗", "Expéditions"], ["◉", "Statistiques"], ["€", "Paiements"], ["✓", "Conformité"],
] as const;

const statusLabels = {
  draft: "Brouillon",
  under_review: "En vérification",
  approved: "Boutique active",
  suspended: "Suspendue",
  rejected: "À corriger",
} as const;

export function SellerChrome({ shopName, shopStatus, userName, activeRoute = "overview", children }: {
  shopName: string;
  shopStatus: keyof typeof statusLabels;
  userName: string;
  activeRoute?: "overview" | "products";
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = shopName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <main className="seller-shell">
      {menuOpen && <button className="seller-backdrop" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />}
      <aside className={`seller-sidebar ${menuOpen ? "open" : ""}`}>
        <Link href="/" className="seller-logo">yaqeen<span>✦</span><small>seller</small></Link>
        <div className="seller-store"><div className="seller-avatar">{initials}</div><div><strong>{shopName}</strong><span>{statusLabels[shopStatus]}</span></div></div>
        <nav><Link href="/seller" className={activeRoute === "overview" ? "active" : ""} onClick={() => setMenuOpen(false)}><i>⌂</i><span>Vue d’ensemble</span></Link><Link href="/seller/produits" className={activeRoute === "products" ? "active" : ""} onClick={() => setMenuOpen(false)}><i>◇</i><span>Produits</span></Link>{disabledNavigation.map(([icon, label]) => <span className="seller-nav-disabled" aria-disabled="true" key={label}><i>{icon}</i><span>{label}</span><small>À venir</small></span>)}</nav>
        <div className="seller-side-bottom"><Link href="/compte"><i>⚙</i><span>Mon compte</span></Link><Link href="/catalogue"><i>↙</i><span>Voir la marketplace</span></Link></div>
      </aside>
      <section className="seller-main">
        <header className="seller-topbar"><button className="seller-menu" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">☰</button><div><span>{statusLabels[shopStatus]}</span><strong>{shopName}</strong></div><div className="seller-actions"><div className="seller-profile">{userName[0]?.toUpperCase() || "Y"}</div><Link href="/compte">{userName}</Link></div></header>
        {children}
      </section>
    </main>
  );
}
