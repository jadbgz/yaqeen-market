import Image from "next/image";
import Link from "next/link";
import { AccountAccess } from "@/components/account-access";

const products = [
  { number: "01", name: "Musc blanc", maker: "Boutique Démo 01", price: "34,90 €", shape: "bottle" },
  { number: "02", name: "Le Coran", maker: "Boutique Démo 02", price: "22,00 €", shape: "book" },
  { number: "03", name: "Huile de nigelle", maker: "Boutique Démo 03", price: "14,50 €", shape: "oil" },
  { number: "04", name: "Abaya Lina", maker: "Boutique Démo 04", price: "59,90 €", shape: "fabric" },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#e9e1d2] text-[#171b18]">
      <header className="relative z-20 border-b border-[#24231f]/15">
        <div className="mx-auto flex max-w-[1440px] items-center px-5 py-5 md:px-10">
          <a href="#" className="brand-mark">yaqeen<span>✦</span></a>
          <form action="/catalogue" className="mx-auto hidden w-[min(480px,42vw)] md:block"><label className="flex items-center gap-3 rounded-full border border-[#24231f]/20 bg-white/35 px-4 py-2.5"><span>⌕</span><input name="q" className="w-full bg-transparent text-[11px] outline-none" placeholder="Rechercher un produit, une marque, une boutique…" /></label></form>
          <nav className="ml-auto hidden items-center gap-6 text-[11px] font-medium lg:flex"><Link href="/catalogue">Catalogue</Link><Link href="/catalogue?sort=selection">Nouveautés</Link><Link href="/seller">Vendre sur Yaqeen</Link></nav>
          <Link href="/catalogue" className="ml-auto rounded-full border border-[#24231f]/20 px-4 py-2 text-[11px] md:hidden">Rechercher</Link>
          <AccountAccess />
          <button aria-label="Panier" className="ml-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#24231f] text-[11px] text-[#f3efe5]">0</button>
        </div>
      </header>

      <section className="relative min-h-[750px] border-b border-white/15 bg-[#092b5d] text-[#f2eadc] lg:min-h-[810px]">
        <Image src="/yaqeen-architectural-hero.png" alt="Composition architecturale Yaqeen" fill priority className="object-cover object-[66%_center]" sizes="100vw" />
        <div className="hero-shade absolute inset-0" />
        <div className="relative mx-auto flex min-h-[750px] max-w-[1440px] items-end px-5 pb-16 pt-28 md:px-10 lg:min-h-[810px] lg:items-center lg:pb-0">
          <div className="max-w-[650px]">
            <p className="mb-8 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.28em]"><span className="h-px w-8 bg-current" />Par la communauté · Pour la communauté</p>
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
          <div className="px-5 py-12 md:px-14 md:py-20 lg:px-24"><p className="statement max-w-4xl text-[clamp(2.1rem,4.4vw,4.8rem)] leading-[1.02] tracking-[-.055em]">NOS BESOINS.<br /><span>NOS BOUTIQUES.</span><br />NOTRE MARKETPLACE.</p><div className="mt-12 grid gap-8 border-t border-[#24231f]/15 pt-8 text-sm leading-6 text-[#55534b] sm:grid-cols-2"><p>Yaqeen est né d’un constat simple : nous cherchons tous des produits adaptés à nos valeurs, mais les bonnes boutiques restent trop souvent difficiles à trouver.</p><p>Nous les réunissons au même endroit, avec des vendeurs vérifiés, un paiement protégé et une communauté qui participe à faire grandir la plateforme.</p></div></div>
        </div>
      </section>

      <section id="catalogue" className="px-5 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-14 flex items-end justify-between"><div><p className="index-label">02 / Produits populaires</p><h2 className="display-head mt-5 text-[clamp(3rem,6vw,6rem)] tracking-[-.07em]">MEILLEURES VENTES</h2></div><Link href="/catalogue" className="hidden text-xs sm:block">Voir tout le catalogue ↗</Link></div>
          <div className="grid border-l border-t border-[#24231f]/15 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => <article key={product.name} className="product-card border-b border-r border-[#24231f]/15 p-4"><div className="flex items-center justify-between text-[9px] uppercase tracking-[.18em]"><span>{product.number}</span><button aria-label={`Ajouter ${product.name} aux favoris`}>♡</button></div><div className="object-stage"><div className={`object-form ${product.shape}`}><span>{product.shape === "book" ? "اقرأ" : "Y"}</span></div></div><div className="border-t border-[#24231f]/15 pt-4"><p className="text-[9px] uppercase tracking-[.16em] text-[#77736a]">{product.maker}</p><div className="mt-2 flex items-start justify-between gap-4"><h3 className="text-lg font-bold tracking-[-.04em]">{product.name}</h3><span className="shrink-0 text-xs">{product.price}</span></div></div></article>)}
          </div>
        </div>
      </section>

      <section className="community-section">
        <div className="community-heading"><p className="index-label">03 / Construite ensemble</p><h2>PLUS QU’UN<br />CATALOGUE<span>.</span></h2><p>Yaqeen grandit avec celles et ceux qui l’utilisent. Les clients recommandent leurs boutiques préférées, les vendeurs partagent leur savoir-faire et la communauté aide à définir ce qui mérite d’être mis en avant.</p></div>
        <div className="community-grid"><article><span>“</span><p>Enfin un endroit où je peux retrouver plusieurs boutiques de confiance sans passer des heures à chercher.</p><footer><i>SK</i><div><strong>Sarah K.</strong><small>Cliente Yaqeen</small></div></footer></article><article className="community-stat"><strong>1</strong><p>seul compte pour acheter auprès de plusieurs vendeurs de la communauté.</p><div className="community-orbit"><i/><i/><i/><i/></div></article><article><span>“</span><p>Je garde l’identité de ma boutique, tout en touchant une communauté qui comprend déjà mes produits.</p><footer><i>AH</i><div><strong>Boutique Démo 04</strong><small>Vendeur partenaire</small></div></footer></article></div>
        <div className="community-actions"><p>Une boutique que tout le monde devrait connaître ?</p><a href="#">Recommander un vendeur ↗</a><span>Les recommandations sont étudiées par l’équipe Yaqeen.</span></div>
      </section>

      <footer className="bg-[#f3efe5] px-5 py-10 md:px-10"><div className="mx-auto flex max-w-[1440px] flex-col gap-7 border-t border-[#24231f]/15 pt-8 text-[10px] uppercase tracking-[.15em] sm:flex-row sm:items-end"><p className="brand-mark text-2xl lowercase tracking-[-.06em]">yaqeen<span>✦</span></p><p className="sm:ml-auto">Paris · France</p><p>© 2026 · Tous droits réservés</p></div></footer>
    </main>
  );
}
