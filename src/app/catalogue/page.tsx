import Image from "next/image";
import Link from "next/link";
import { MarketHeader } from "@/components/market-header";
import { getPublicCatalogPage, getPublicCategoryCounts } from "@/lib/catalog/dal";
import { categories, formatPrice } from "@/lib/catalog/format";
import { catalogHref, parseCatalogSearch } from "@/lib/catalog/search";
import { productHref } from "@/lib/catalog/types";

export const metadata = {
  title: "Catalogue — Yaqeen Market",
  description: "Explorez les produits publiés par les vendeurs vérifiés de Yaqeen Market.",
};

type CatalogueParams = Record<string, string | string[] | undefined>;

export default async function CataloguePage({ searchParams }: { searchParams: Promise<CatalogueParams> }) {
  const search = parseCatalogSearch(await searchParams);
  const [{ products, total, page, pageCount }, categoryCounts] = await Promise.all([
    getPublicCatalogPage(search),
    getPublicCategoryCounts(search),
  ]);
  const filters = [
    search.q ? { label: `“${search.q}”`, href: catalogHref(search, { q: "" }) } : null,
    search.category !== "Tous" ? { label: search.category, href: catalogHref(search, { category: "Tous" }) } : null,
    search.availability === "available" ? { label: "En stock", href: catalogHref(search, { availability: "all" }) } : null,
    search.min !== undefined || search.max !== undefined ? { label: `${search.min ?? 0} € — ${search.max ?? "∞"} €`, href: catalogHref(search, { min: undefined, max: undefined }) } : null,
  ].filter((filter): filter is { label: string; href: string } => Boolean(filter));

  return <main className="catalog-shell">
    <MarketHeader query={search.q} />
    <section className="catalog-intro"><p>EXPLORER YAQEEN MARKET</p><h1>Votre prochain<br/>choix, en <span>confiance.</span></h1><div><p>Recherchez parmi les produits réellement publiés. Chaque résultat indique qui le vend et pourquoi il est visible.</p><strong>{total} résultat{total > 1 ? "s" : ""}</strong></div></section>

    <section className="catalog-discovery" aria-label="Recherche et filtres">
      <div className="catalog-cats">{categories.map((category) => <Link key={category} className={category === search.category ? "active" : ""} href={catalogHref(search, { category })}><span>{category}</span><small>{categoryCounts.get(category) ?? 0}</small></Link>)}</div>
      <form className="catalog-filter-form" action="/catalogue">
        {search.q && <input type="hidden" name="q" value={search.q}/>}
        {search.category !== "Tous" && <input type="hidden" name="category" value={search.category}/>}
        <label><span>Disponibilité</span><select name="availability" defaultValue={search.availability}><option value="all">Tous les produits</option><option value="available">En stock uniquement</option></select></label>
        <fieldset><legend>Fourchette de prix</legend><label><span>Min.</span><input name="min" type="number" inputMode="decimal" min="0" step="1" defaultValue={search.min}/></label><i>—</i><label><span>Max.</span><input name="max" type="number" inputMode="decimal" min="0" step="1" defaultValue={search.max}/></label></fieldset>
        <label><span>Trier par</span><select name="sort" defaultValue={search.sort}><option value="selection">Nouveautés vérifiées</option><option value="prix-asc">Prix croissant</option><option value="prix-desc">Prix décroissant</option></select></label>
        <button type="submit">Afficher les résultats</button>
      </form>
      {filters.length > 0 && <div className="catalog-active-filters"><span>Filtres actifs</span>{filters.map((filter) => <Link key={filter.label} href={filter.href}>{filter.label} <b aria-hidden="true">×</b></Link>)}<Link href="/catalogue" className="clear-all">Tout effacer</Link></div>}
    </section>

    <section className="catalog-results-head"><p><strong>{total}</strong> produit{total > 1 ? "s" : ""} trouvé{total > 1 ? "s" : ""}{pageCount > 1 && <> · page {page} sur {pageCount}</>}</p><span>Données du catalogue publié</span></section>
    <section className="catalog-grid">{products.map((product,index) => <Link href={productHref(product)} className="catalog-card" key={product.id}><div className="catalog-visual catalog-photo"><Image src={product.media[0].url} alt={product.media[0].altText} fill sizes="(max-width: 720px) 50vw, (max-width: 1100px) 33vw, 25vw" unoptimized/><em>Preuve revue</em><span>{String(index + 1).padStart(2,"0")}</span></div><div className="catalog-info"><p>{product.category} · {product.shop}</p><div><h2>{product.name}</h2><strong>{formatPrice(product.price,product.currency)}</strong></div><footer><span className="verified-dot">✓ Publié après revue</span><span className={product.stock > 0 ? "in-stock" : "out-stock"}>{product.stock > 0 ? "En stock" : "Indisponible"}</span></footer></div></Link>)}{products.length === 0 && <div className="catalog-empty"><span>⌕</span><strong>Aucun produit ne correspond exactement.</strong><p>Modifiez les filtres ou explorez tout le catalogue publié. Aucun résultat artificiel ne vous sera proposé.</p><Link href="/catalogue">Réinitialiser la recherche</Link></div>}</section>
    {pageCount > 1 && <nav className="catalog-pagination" aria-label="Pagination du catalogue">
      {page > 1 ? <Link href={catalogHref(search, { page: page - 1 })} rel="prev">← Page précédente</Link> : <span aria-disabled="true">← Page précédente</span>}
      <strong>Page {page} / {pageCount}</strong>
      {page < pageCount ? <Link href={catalogHref(search, { page: page + 1 })} rel="next">Page suivante →</Link> : <span aria-disabled="true">Page suivante →</span>}
    </nav>}
    <footer className="catalog-footer"><p className="brand-mark">yaqeen<span>✦</span></p><span>Une marketplace. Plusieurs boutiques. Un même niveau d’exigence.</span></footer>
  </main>;
}
