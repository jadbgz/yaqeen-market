import Link from "next/link";
import { AccountAccess } from "@/components/account-access";
import { CartLink } from "@/components/cart-link";
import { categories } from "@/lib/catalog/format";

export function MarketHeader({ query = "" }: { query?: string }) {
  return (
    <header className="site-header">
      <div className="site-header-main">
        <Link href="/" className="brand-mark" aria-label="Yaqeen Market, accueil">yaqeen<span>✦</span></Link>
        <form action="/catalogue" className="site-search" role="search">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input name="q" defaultValue={query} maxLength={80} aria-label="Rechercher dans le catalogue" placeholder="Produits, boutiques, catégories…" />
          <button type="submit">Rechercher</button>
        </form>
        <nav className="site-quick-nav" aria-label="Accès rapides"><Link href="/catalogue">Explorer</Link><Link href="/seller">Vendre</Link></nav>
        <AccountAccess />
        <CartLink variant="icon" />
      </div>
      <nav className="site-category-bar" aria-label="Catégories du catalogue">
        <div className="site-category-inner">
          <details className="category-menu">
            <summary><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Catégories</span></summary>
            <div className="category-menu-panel">
              <div><p>TOUT YAQEEN MARKET</p><strong>Explorer par univers</strong><small>Des produits proposés par des boutiques indépendantes et publiés après revue.</small></div>
              <nav aria-label="Toutes les catégories">{categories.map((category) => <Link key={category} href={category === "Tous" ? "/catalogue" : `/catalogue?category=${encodeURIComponent(category)}`}>{category}<span>↗</span></Link>)}</nav>
            </div>
          </details>
          {categories.slice(1).map((category) => <Link key={category} href={`/catalogue?category=${encodeURIComponent(category)}`}>{category}</Link>)}
          <Link href="/catalogue" className="category-all">Tout explorer →</Link>
        </div>
      </nav>
    </header>
  );
}
