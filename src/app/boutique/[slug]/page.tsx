import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MarketHeader } from "@/components/market-header";
import { getPublicShop, getPublicShopProducts } from "@/lib/catalog/dal";
import { formatPrice } from "@/lib/catalog/format";
import { productHref, shopHref } from "@/lib/catalog/types";
import { getSiteUrl } from "@/lib/supabase/config";
import { MarketFooter } from "@/components/market-footer";

type ShopRouteProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

const countryNames = new Intl.DisplayNames(["fr"], { type: "region" });

export async function generateMetadata({ params }: ShopRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) return { title: "Boutique indisponible — Yaqeen Market", robots: { index: false } };

  const description = (shop.description ?? `Découvrez les produits publiés par ${shop.name} sur Yaqeen Market.`).slice(0, 155);
  return {
    title: `${shop.name} — Boutique sur Yaqeen Market`,
    description,
    alternates: { canonical: shopHref(shop.slug) },
    openGraph: { title: shop.name, description, type: "website" },
  };
}

export default async function ShopPage({ params, searchParams }: ShopRouteProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const requestedPage = /^\d{1,4}$/.test(rawPage ?? "") ? Number(rawPage) : 1;
  const [shop, catalog] = await Promise.all([getPublicShop(slug), getPublicShopProducts(slug, requestedPage)]);
  if (!shop) notFound();

  const { products, total, page, pageCount } = catalog;
  if (page > 1 && pageCount === 0) {
    redirect(shopHref(shop.slug));
  }
  if (pageCount > 0 && page > pageCount) {
    redirect(`${shopHref(shop.slug)}?page=${pageCount}`);
  }

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
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <section className="shop-hero">
      <p className="shop-kicker">BOUTIQUE REVUE PAR YAQEEN</p>
      <h1>{shop.name}<span>.</span></h1>
      {shop.description && <p className="shop-description">{shop.description}</p>}
      <div className="shop-facts">
        <span><b>✓</b> Dossier boutique revu avant publication</span>
        {country && <span><b>◇</b> Expédie depuis : {country}</span>}
        <span><b>◈</b> {total} produit{total > 1 ? "s" : ""} publié{total > 1 ? "s" : ""} après revue</span>
      </div>
    </section>

    <section className="catalog-results-head"><p><strong>{total}</strong> produit{total > 1 ? "s" : ""} en ligne{pageCount > 1 && <> · page {page} sur {pageCount}</>}</p><span>Chaque fiche est publiée après revue de sa preuve et de ses médias</span></section>
    <section className="catalog-grid">
      {products.map((product, index) => <Link href={productHref(product)} className="catalog-card" key={product.id}><div className="catalog-visual catalog-photo"><Image src={product.media[0].url} alt={product.media[0].altText} fill sizes="(max-width: 720px) 50vw, (max-width: 1100px) 33vw, 25vw" unoptimized/><em>Preuve revue</em><span>{String(index + 1).padStart(2, "0")}</span></div><div className="catalog-info"><p>{product.category}</p><div><h2>{product.name}</h2><strong>{formatPrice(product.price, product.currency)}</strong></div><footer><span className="verified-dot">✓ Publié après revue</span><span className={product.stock > 0 ? "in-stock" : "out-stock"}>{product.stock > 0 ? "En stock" : "Indisponible"}</span></footer></div></Link>)}
      {products.length === 0 && <div className="catalog-empty"><span>◇</span><strong>Cette boutique prépare son catalogue.</strong><p>Ses produits apparaîtront ici dès qu’ils auront passé la revue Yaqeen.</p><Link href="/catalogue">Explorer le catalogue →</Link></div>}
    </section>

    {pageCount > 1 && <nav className="catalog-pagination" aria-label="Pagination de la boutique">
      {page > 1 ? <Link href={`${shopHref(shop.slug)}?page=${page - 1}`} rel="prev">← Page précédente</Link> : <span aria-disabled="true">← Page précédente</span>}
      <strong>Page {page} / {pageCount}</strong>
      {page < pageCount ? <Link href={`${shopHref(shop.slug)}?page=${page + 1}`} rel="next">Page suivante →</Link> : <span aria-disabled="true">Page suivante →</span>}
    </nav>}

    <section className="shop-trust"><p>NOTRE ENGAGEMENT</p><h2>Pourquoi cette boutique<br/>est publiée sur Yaqeen<span>.</span></h2><div><p>Le dossier de {shop.name} a été revu par l’équipe Yaqeen avant publication. Chaque produit affiché ici a été soumis individuellement à la revue Yaqeen : preuve déclarée ou certifiée, médias vérifiés, publication décidée par un opérateur et tracée.</p><p>Le vendeur reste responsable de ses informations, de ses stocks et de ses délais. Yaqeen contrôle l’accès à la publication et sécurise votre paiement.</p></div></section>
    <MarketFooter />
  </main>;
}
