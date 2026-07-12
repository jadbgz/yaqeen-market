import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice, products } from "@/data/products";
import { CartLink } from "@/components/cart-link";
import { ProductPurchase } from "@/components/product-purchase";

export function generateStaticParams(){return products.map(product=>({slug:product.slug}));}

export default async function ProductPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params; const product=products.find(p=>p.slug===slug); if(!product)notFound();
  const related=products.filter(p=>p.category===product.category&&p.slug!==product.slug).slice(0,3);
  return <main className="product-shell">
    <header className="market-nav"><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><Link href="/catalogue" className="back-catalog">← Le catalogue</Link><nav><Link href="/seller">Vendre</Link><button aria-label="Compte">○</button><CartLink/></nav></header>
    <div className="product-breadcrumb"><Link href="/catalogue">Catalogue</Link><span>/</span><Link href={`/catalogue?category=${product.category}`}>{product.category}</Link><span>/</span><strong>{product.name}</strong></div>
    <section className="product-detail"><div className="product-gallery" style={{backgroundColor:product.color}}><span className="gallery-number">01 / 03</span>{product.badge&&<em>{product.badge}</em>}<div className={`hero-product catalog-object ${product.shape}`}>{product.shape==="book"?"اقرأ":"Y"}</div><div className="gallery-thumbs"><button className="active">01</button><button>02</button><button>03</button></div></div><div className="product-copy"><p className="product-category">{product.category.toUpperCase()} · {product.shop.toUpperCase()}</p><h1>{product.name}</h1><div className="product-rating"><span>★★★★★</span><strong>{product.rating}</strong><a href="#avis">{product.reviews} avis</a></div><p className="product-price">{formatPrice(product.price)}</p><p className="product-description">{product.description}</p><ProductPurchase product={product}/><div className="product-reassurance"><p><span>◇</span><strong>Expédié par {product.shop}</strong><small>Préparation sous 24 à 48 h</small></p><p><span>✓</span><strong>Sélection vérifiée</strong><small>Maison et produit validés par Yaqeen</small></p><p><span>↙</span><strong>Retours sous 14 jours</strong><small>Une question ? Nous sommes là.</small></p></div></div></section>
    <section className="product-story"><p>À PROPOS DE CE PRODUIT</p><h2>Vendu par<br/>{product.shop}<span>.</span></h2><div><p>Ce produit est proposé et expédié directement par la boutique {product.shop}. Le vendeur reste responsable de ses informations, stocks et délais.</p><p>Yaqeen vérifie l’identité des vendeurs, sécurise votre paiement et vous accompagne en cas de problème avec la commande.</p></div></section>
    {related.length>0&&<section className="related"><div><p>DANS LE MÊME UNIVERS</p><h2>À découvrir aussi</h2></div><div>{related.map(p=><Link href={`/produit/${p.slug}`} key={p.slug}><div style={{backgroundColor:p.color}}><div className={`catalog-object ${p.shape}`}>Y</div></div><p>{p.shop}</p><h3>{p.name}</h3><strong>{formatPrice(p.price)}</strong></Link>)}</div></section>}
  </main>
}
