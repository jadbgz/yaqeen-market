import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CartLink } from "@/components/cart-link";
import { ProductPurchase } from "@/components/product-purchase";
import { getPublicProduct, getPublicProducts } from "@/lib/catalog/dal";
import { formatPrice } from "@/lib/catalog/format";
import { productHref } from "@/lib/catalog/types";

type ProductRouteProps = {
  params: Promise<{ shopSlug: string; productSlug: string }>;
};

export async function generateMetadata({ params }: ProductRouteProps): Promise<Metadata> {
  const { shopSlug, productSlug } = await params;
  const product = await getPublicProduct(shopSlug, productSlug);
  if (!product) return { title: "Produit indisponible — Yaqeen Market", robots: { index: false } };

  return {
    title: `${product.name} par ${product.shop} — Yaqeen Market`,
    description: product.description.slice(0, 155),
    alternates: { canonical: productHref(product) },
    openGraph: {
      title: product.name,
      description: product.description.slice(0, 155),
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: ProductRouteProps) {
  const { shopSlug, productSlug } = await params;
  const product = await getPublicProduct(shopSlug, productSlug);
  if (!product) notFound();

  const related = (await getPublicProducts({ category: product.category }))
    .filter((item) => item.id !== product.id)
    .slice(0, 3);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.variantId,
    brand: { "@type": "Brand", name: product.shop },
    offers: {
      "@type": "Offer",
      price: product.price.toFixed(2),
      priceCurrency: product.currency,
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: product.shop },
    },
  };

  return <main className="product-shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <header className="market-nav"><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><Link href="/catalogue" className="back-catalog">← Le catalogue</Link><nav><Link href="/seller">Vendre</Link><Link href="/compte" aria-label="Compte">○</Link><CartLink/></nav></header>
    <div className="product-breadcrumb"><Link href="/catalogue">Catalogue</Link><span>/</span><Link href={`/catalogue?category=${encodeURIComponent(product.category)}`}>{product.category}</Link><span>/</span><strong>{product.name}</strong></div>
    <section className="product-detail"><div className="product-gallery" style={{backgroundColor:product.color}}><span className="gallery-number">PRODUIT PUBLIÉ</span><em>Preuve revue</em><div className={`hero-product catalog-object ${product.shape}`}>{product.shape==="book"?"اقرأ":"Y"}</div></div><div className="product-copy"><p className="product-category">{product.category.toUpperCase()} · {product.shop.toUpperCase()}</p><h1>{product.name}</h1><div className="product-trust-line"><span>✓</span><strong>Vendeur et preuve revus par Yaqeen</strong></div><p className="product-price">{formatPrice(product.price,product.currency)}</p><p className="product-description">{product.description}</p><ProductPurchase product={product}/><div className="product-reassurance"><p><span>◇</span><strong>Expédié par {product.shop}</strong><small>Les délais seront confirmés au paiement</small></p><p><span>✓</span><strong>Pourquoi ce produit est visible</strong><small>{product.verificationSummary}</small></p><p><span>↙</span><strong>Retours sous 14 jours</strong><small>Selon les conditions applicables au produit</small></p></div></div></section>
    <section className="product-proof" aria-labelledby="proof-title"><div><p>LA PREUVE, PAS LE SLOGAN</p><h2 id="proof-title">Ce que nous avons revu<span>.</span></h2></div><dl><div><dt>Périmètre</dt><dd>{product.evidence.scope}</dd></div><div><dt>Nature de la preuve</dt><dd>{product.evidence.kind.replaceAll("_"," ")}</dd></div><div><dt>Émetteur</dt><dd>{product.evidence.issuerName ?? "Déclaration documentée du vendeur"}</dd></div>{product.evidence.referenceNumber&&<div><dt>Référence</dt><dd>{product.evidence.referenceNumber}</dd></div>}<div><dt>Résumé public</dt><dd>{product.evidence.publicSummary}</dd></div></dl></section>
    <section className="product-story"><p>À PROPOS DE CE PRODUIT</p><h2>Vendu par<br/>{product.shop}<span>.</span></h2><div><p>Ce produit est proposé et expédié directement par la boutique {product.shop}. Le vendeur reste responsable de ses informations, stocks et délais.</p><p>Yaqeen contrôle l’accès à la publication et expose le périmètre exact de la preuve revue, sans transformer cette revue en promesse générale.</p></div></section>
    {related.length>0&&<section className="related"><div><p>DANS LE MÊME UNIVERS</p><h2>À découvrir aussi</h2></div><div>{related.map(item=><Link href={productHref(item)} key={item.id}><div style={{backgroundColor:item.color}}><div className={`catalog-object ${item.shape}`}>Y</div></div><p>{item.shop}</p><h3>{item.name}</h3><strong>{formatPrice(item.price,item.currency)}</strong></Link>)}</div></section>}
  </main>;
}
