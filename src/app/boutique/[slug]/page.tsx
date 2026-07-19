import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketHeader } from "@/components/market-header";
import { getPublicShop, getPublicShopProducts } from "@/lib/catalog/dal";
import { formatPrice } from "@/lib/catalog/format";
import { productHref, shopHref } from "@/lib/catalog/types";
import { getSiteUrl } from "@/lib/supabase/config";

type ShopRouteProps = { params: Promise<{ slug: string }> };

const countryNames = new Intl.DisplayNames(["fr"], { type: "region" });

export async function generateMetadata({ params }: ShopRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) return { title: "Boutique indisponible — Yaqeen Market", robots: { index: false } };

  const description = (shop.description ?? `Découvrez les produits publiés par ${shop.name} sur Yaqeen Market.`).slice(0, 155);
  return {
    title: `${shop.name} — Boutique vérifiée sur Yaqeen Market`,
    description,
    alternates: { canonical: shopHref(shop.slug) },
    openGraph: { title: shop.name, description, type: "website" },
  };
}

export default async function ShopPage({ params }: ShopRouteProps) {
  const { slug } = await params;
  const [shop, products] = await Promise.all([getPublicShop(slug), getPublicShopProducts(slug)]);
  if (!shop) notFound();

  const country = shop.shipsFromCountry ? countryNames.of(shop.shipsFromCountry) ?? shop.shipsFromCountry : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: shop.name,
    description: shop.description ?? undefined,
    url: `${getSiteUrl()}${shopHref(shop.slug)}`,
    parentOrganization: { "@type": "Organization", name: "Yaqeen Market" },
  };

  return <main className="catalog-shell">
    <MarketHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <section className="shop-hero">
      <p className="shop-kicker">BOUTIQUE VÉRIFIÉE PAR YAQEEN</p>
      <h1>{shop.name}<span>.</span></h1>
      {shop.description && <p className="shop-description">{shop.description}</p>}
      <div className="shop-facts">
        <span><b>✓</b> Identité vendeur contrôlée avant publication</span>
        {country && <span><b>◇</b> Expédie depuis : {country}</span>}
        <span><b>◈</b> {products.length} produit{products.length > 1 ? "s" : ""} publié{products.length > 1 ? "s" : ""} après revue</span>
      </div>
    </section>

    <section className="catalog-results-head"><p><strong>{products.length}</strong> produit{products.length > 1 ? "s" : ""} en ligne</p><span>Chaque fiche est publiée après revue de sa preuve et de ses médias</span></section>
    <section className="catalog-grid">
      {products.map((product, index) => <Link href={productHref(product)} className="catalog-card" key={product.id}><div className="catalog-visual catalog-photo"><Image src={product.media[0].url} alt={product.media[0].altText} fill sizes="(max-width: 720px) 50vw, (max-width: 1100px) 33vw, 25vw" unoptimized/><em>Preuve revue</em><span>{String(index + 1).padStart(2, "0")}</span></div><div className="catalog-info"><p>{product.category}</p><div><h2>{product.name}</h2><strong>{formatPrice(product.price, product.currency)}</strong></div><footer><span className="verified-dot">✓ Publié après revue</span><span className={product.stock > 0 ? "in-stock" : "out-stock"}>{product.stock > 0 ? "En stock" : "Indisponible"}</span></footer></div></Link>)}
      {products.length === 0 && <div className="catalog-empty"><span>◇</span><strong>Cette boutique prépare son catalogue.</strong><p>Ses produits apparaîtront ici dès qu’ils auront passé la revue Yaqeen.</p><Link href="/catalogue">Explorer le catalogue →</Link></div>}
    </section>

    <section className="shop-trust"><p>NOTRE ENGAGEMENT</p><h2>Pourquoi cette boutique<br/>est sur Yaqeen<span>.</span></h2><div><p>L’identité de {shop.name} a été contrôlée avant l’ouverture de sa boutique. Chaque produit affiché ici a été soumis individuellement à la revue Yaqeen : preuve déclarée ou certifiée, médias vérifiés, publication décidée par un opérateur et tracée.</p><p>Le vendeur reste responsable de ses informations, de ses stocks et de ses délais. Yaqeen contrôle l’accès à la publication et sécurise votre paiement.</p></div></section>
    <footer className="catalog-footer"><p className="brand-mark">yaqeen<span>✦</span></p><span>Une marketplace. Plusieurs boutiques. Un même niveau d’exigence.</span></footer>
  </main>;
}
