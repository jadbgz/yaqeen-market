import Link from "next/link";
import { CartLink } from "@/components/cart-link";
import { getPublicProducts } from "@/lib/catalog/dal";
import { categories, formatPrice } from "@/lib/catalog/format";
import { productHref } from "@/lib/catalog/types";

export const metadata = {
  title: "Catalogue — Yaqeen Market",
  description: "Découvrez les produits publiés par les vendeurs vérifiés de Yaqeen Market.",
};

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}) {
  const { q = "", category = "Tous", sort = "selection" } = await searchParams;
  const products = await getPublicProducts({ q, category, sort });

  return <main className="catalog-shell">
    <header className="market-nav"><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><form action="/catalogue"><label><span>⌕</span><input name="q" defaultValue={q} placeholder="Rechercher un produit, une marque, une boutique…"/></label></form><nav><Link href="/seller">Vendre</Link><Link href="/compte" aria-label="Compte">○</Link><CartLink/></nav></header>
    <section className="catalog-intro"><p>CATALOGUE YAQEEN MARKET</p><h1>Trouvez ce<br/>qu’il vous <span>faut.</span></h1><div><p>Uniquement des produits publiés après revue de la boutique et de leur preuve.</p><strong>{products.length.toString().padStart(2,"0")} produits</strong></div></section>
    <section className="catalog-controls"><div className="catalog-cats">{categories.map(c=><Link key={c} className={c===category?"active":""} href={`/catalogue?category=${encodeURIComponent(c)}${q?`&q=${encodeURIComponent(q)}`:""}`}>{c}</Link>)}</div><form><input type="hidden" name="category" value={category}/>{q&&<input type="hidden" name="q" value={q}/>}<select name="sort" defaultValue={sort} aria-label="Trier les produits"><option value="selection">Nouveautés vérifiées</option><option value="prix-asc">Prix croissant</option><option value="prix-desc">Prix décroissant</option></select><button>Appliquer</button></form></section>
    <section className="catalog-grid">{products.map((product,index)=><Link href={productHref(product)} className="catalog-card" key={product.id}><div className="catalog-visual" style={{backgroundColor:product.color}}><em>Preuve revue</em><span>{String(index+1).padStart(2,"0")}</span><div className={`catalog-object ${product.shape}`}>{product.shape==="book"?"اقرأ":"Y"}</div></div><div className="catalog-info"><p>{product.shop} · Vérifié par Yaqeen</p><div><h2>{product.name}</h2><strong>{formatPrice(product.price,product.currency)}</strong></div></div></Link>)}{products.length===0&&<div className="catalog-empty"><strong>Aucun produit publié pour le moment.</strong><p>Le catalogue se remplit uniquement après revue des boutiques et des preuves produit.</p>{q||category!=="Tous"?<Link href="/catalogue">Réinitialiser la recherche</Link>:<Link href="/seller">Ouvrir une boutique</Link>}</div>}</section>
    <footer className="catalog-footer"><p className="brand-mark">yaqeen<span>✦</span></p><span>La confiance avant la quantité.</span></footer>
  </main>;
}
