import Link from "next/link";
import { categories, formatPrice, products } from "@/data/products";
import { CartLink } from "@/components/cart-link";

export const metadata = { title:"Catalogue — Yaqeen Market", description:"Découvrez les produits des vendeurs Yaqeen Market." };

export default async function CataloguePage({searchParams}:{searchParams:Promise<{q?:string;category?:string;sort?:string}>}){
  const {q="",category="Tous",sort="selection"}=await searchParams;
  const filtered=products.filter(p=>(category==="Tous"||p.category===category)&&(`${p.name} ${p.shop}`.toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>sort==="prix-asc"?a.price-b.price:sort==="prix-desc"?b.price-a.price:b.rating-a.rating);
  return <main className="catalog-shell">
    <header className="market-nav"><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><form action="/catalogue"><label><span>⌕</span><input name="q" defaultValue={q} placeholder="Rechercher un produit, une marque, une boutique…"/></label></form><nav><Link href="/seller">Vendre</Link><button aria-label="Compte">○</button><CartLink/></nav></header>
    <section className="catalog-intro"><p>CATALOGUE YAQEEN MARKET</p><h1>Trouvez ce<br/>qu’il vous <span>faut.</span></h1><div><p>Découvrez les produits proposés par les boutiques et vendeurs de la marketplace.</p><strong>{filtered.length.toString().padStart(2,"0")} produits</strong></div></section>
    <section className="catalog-controls"><div className="catalog-cats">{categories.map(c=><Link key={c} className={c===category?"active":""} href={`/catalogue?category=${encodeURIComponent(c)}${q?`&q=${encodeURIComponent(q)}`:""}`}>{c}</Link>)}</div><form><input type="hidden" name="category" value={category}/>{q&&<input type="hidden" name="q" value={q}/>}<select name="sort" defaultValue={sort} aria-label="Trier les produits"><option value="selection">Notre sélection</option><option value="prix-asc">Prix croissant</option><option value="prix-desc">Prix décroissant</option></select><button>Appliquer</button></form></section>
    <section className="catalog-grid">{filtered.map((p,i)=><Link href={`/produit/${p.slug}`} className="catalog-card" key={p.slug}><div className="catalog-visual" style={{backgroundColor:p.color}}>{p.badge&&<em>{p.badge}</em>}<span>{String(i+1).padStart(2,"0")}</span><div className={`catalog-object ${p.shape}`}>{p.shape==="book"?"اقرأ":"Y"}</div><i aria-label={`Ajouter ${p.name} aux favoris`}>♡</i></div><div className="catalog-info"><p>{p.shop} · ★ {p.rating}</p><div><h2>{p.name}</h2><strong>{formatPrice(p.price)}</strong></div></div></Link>)}{filtered.length===0&&<div className="catalog-empty"><strong>Aucun objet trouvé.</strong><Link href="/catalogue">Réinitialiser la recherche</Link></div>}</section>
    <footer className="catalog-footer"><p className="brand-mark">yaqeen<span>✦</span></p><span>Choisir mieux. Vivre pleinement.</span></footer>
  </main>
}
