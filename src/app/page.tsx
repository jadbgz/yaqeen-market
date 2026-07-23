import Image from "next/image";
import Link from "next/link";
import { MarketHeader } from "@/components/market-header";
import { getPublicProducts } from "@/lib/catalog/dal";
import { formatPrice } from "@/lib/catalog/format";
import { productHref } from "@/lib/catalog/types";
import { MarketFooter } from "@/components/market-footer";

export const revalidate = 300;

export default async function Home() {
  const products = await getPublicProducts({ limit: 4 });
  return (
    <main className="min-h-screen overflow-hidden bg-[#e9e1d2] text-[#171b18]">
      <MarketHeader />

      <section className="relative min-h-[750px] border-b border-white/15 bg-[#092b5d] text-[#f2eadc] lg:min-h-[810px]">
        <Image src="/yaqeen-architectural-hero.avif" alt="Composition architecturale Yaqeen" fill priority className="object-cover object-[66%_center]" sizes="100vw" />
        <div className="hero-shade absolute inset-0" />
        <div className="relative mx-auto flex min-h-[750px] max-w-[1440px] items-end px-5 pb-16 pt-28 md:px-10 lg:min-h-[810px] lg:items-center lg:pb-0">
          <div className="max-w-[650px]">
            <p className="mb-8 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.22em]"><span className="h-px w-8 bg-current" />Par la communauté · Pour la communauté</p>
            <h1 className="display-head text-[clamp(4.1rem,9.2vw,9rem)] leading-[.78] tracking-[-.085em]">CHOISIR<br />MIEUX<span className="text-[#ef6b38]">.</span></h1>
            <p className="mt-10 max-w-[470px] text-[15px] leading-7 text-[#e7ddcc]/80">La marketplace qui rassemble nos boutiques, nos créateurs et les produits que nous cherchons vraiment — dans un espace pensé avec nous, pour nous.</p>
            <div className="mt-9 flex flex-wrap items-center gap-5"><Link href="/catalogue" className="primary-pill">Voir tous les produits <span>↗</span></Link><a href="#garanties" className="text-[12px] underline decoration-[#24231f]/30 underline-offset-8">Pourquoi acheter sur Yaqeen ?</a></div>
          </div>
        </div>
        <p className="absolute bottom-5 right-8 hidden rotate-90 origin-right text-[9px] uppercase tracking-[.22em] lg:block">Yaqeen Market · Édition 01</p>
      </section>

      <section id="garanties" className="border-b border-[#24231f]/15">
        <div className="mx-auto grid max-w-[1440px] md:grid-cols-[.65fr_1.35fr]">
          <div className="border-b border-[#24231f]/15 px-5 py-10 md:border-b-0 md:border-r md:px-10 md:py-20"><p className="index-label">01 / Notre point commun</p></div>
          <div className="px-5 py-12 md:px-14 md:py-20 lg:px-24"><p className="statement max-w-4xl text-[clamp(2.1rem,4.4vw,4.8rem)] leading-[1.02] tracking-[-.055em]">NOS BESOINS.<br /><span>NOS BOUTIQUES.</span><br />NOTRE MARKETPLACE.</p><div className="mt-12 grid gap-8 border-t border-[#24231f]/15 pt-8 text-sm leading-6 text-[#55534b] sm:grid-cols-2"><p>Yaqeen est né d’un constat simple : nous cherchons tous des produits adaptés à nos valeurs, mais les bonnes boutiques restent trop souvent difficiles à trouver.</p><p>Nous les réunissons au même endroit avec une publication contrôlée : la boutique, le produit et la preuve associée sont revus avant leur mise en ligne.</p></div></div>
        </div>
      </section>

      <section id="catalogue" className="px-5 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-14 flex items-end justify-between"><div><p className="index-label">02 / Dernières publications</p><h2 className="display-head mt-5 text-[clamp(3rem,6vw,6rem)] tracking-[-.07em]">À DÉCOUVRIR</h2></div><Link href="/catalogue" className="hidden text-xs sm:block">Voir tout le catalogue ↗</Link></div>
          <div className="grid border-l border-t border-[#24231f]/15 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product,index) => <Link href={productHref(product)} key={product.id} className="product-card border-b border-r border-[#24231f]/15 p-4"><div className="flex items-center justify-between text-[9px] uppercase tracking-[.18em]"><span>{String(index+1).padStart(2,"0")}</span><span aria-hidden="true">↗</span></div><div className="object-stage product-photo"><Image src={product.media[0].url} alt={product.media[0].altText} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" unoptimized/></div><div className="border-t border-[#24231f]/15 pt-4"><p className="text-[11px] uppercase tracking-[.12em] text-[#5e5b50]">{product.shop} · preuve & image revues</p><div className="mt-2 flex items-start justify-between gap-4"><h3 className="text-lg font-bold tracking-[-.04em]">{product.name}</h3><span className="shrink-0 text-xs">{formatPrice(product.price,product.currency)}</span></div></div></Link>)}
            {products.length===0&&<div className="col-span-full border-b border-r border-[#24231f]/15 px-6 py-16"><p className="max-w-xl text-lg">Les premiers produits apparaîtront ici après la revue de leur boutique et de leur preuve.</p><Link href="/seller" className="mt-6 inline-block text-xs underline underline-offset-8">Ouvrir une boutique vérifiée →</Link></div>}
          </div>
        </div>
      </section>

      <section className="community-section">
        <div className="community-heading"><p className="index-label">03 / Construite ensemble</p><h2>PLUS QU’UN<br />CATALOGUE<span>.</span></h2><p>Yaqeen grandit avec celles et ceux qui l’utilisent. Les clients recommandent leurs boutiques préférées, les vendeurs partagent leur savoir-faire et la communauté aide à définir ce qui mérite d’être mis en avant.</p></div>
        <div className="community-grid"><article><span>01</span><p>Recommandez les boutiques et créateurs que la communauté devrait pouvoir retrouver sur Yaqeen.</p><footer><i>↗</i><div><strong>Proposer un vendeur</strong><small>Chaque proposition sera étudiée</small></div></footer></article><article className="community-stat"><strong>1</strong><p>seul compte pour acheter auprès de plusieurs vendeurs de la communauté.</p><div className="community-orbit"><i/><i/><i/><i/></div></article><article><span>02</span><p>Partagez les catégories, produits et garanties dont vous avez réellement besoin au quotidien.</p><footer><i>+</i><div><strong>Participer à la construction</strong><small>Les retours orienteront le catalogue</small></div></footer></article></div>
        <div className="community-actions"><p>Une boutique que tout le monde devrait connaître ?</p><Link href="/aide#recommander">Recommander un vendeur ↗</Link><span>Le parcours ouvrira avec le premier catalogue public.</span></div>
      </section>
      <MarketFooter />
    </main>
  );
}
