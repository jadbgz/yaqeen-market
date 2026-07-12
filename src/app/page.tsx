const categories = [
  { name: "Livres", icon: "📚", tone: "#E9F2E8" }, { name: "Mode", icon: "🧥", tone: "#F2E9E1" },
  { name: "Parfums", icon: "✨", tone: "#EEE8F5" }, { name: "Beauté", icon: "🧴", tone: "#F6E8E8" },
  { name: "Bien-être", icon: "🌿", tone: "#E5F0EC" }, { name: "Maison", icon: "🏺", tone: "#F3EEDB" },
];

const products = [
  { name: "Musc blanc — Eau de parfum", shop: "Boutique Démo 01", price: "34,90 €", icon: "🧴", color: "#DFEDE7" },
  { name: "Le Coran — traduction française", shop: "Boutique Démo 02", price: "22,00 €", icon: "📖", color: "#EFE6D7" },
  { name: "Abaya Lina — Vert sauge", shop: "Boutique Démo 04", price: "59,90 €", icon: "🥻", color: "#E0E8DE" },
  { name: "Huile de nigelle premium", shop: "Boutique Démo 03", price: "14,50 €", icon: "🌱", color: "#F1E8CC" },
];

export default function Home() {
  return <main>
    <div className="bg-[#173c32] px-4 py-2 text-center text-xs font-medium tracking-wide text-white">Livraison offerte dès 59 € · Des vendeurs sélectionnés avec soin</div>
    <header className="border-b border-black/8 bg-[#fffdf8]">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-4 lg:px-8">
        <a href="#" className="text-2xl font-black tracking-[-0.06em] text-[#173c32]">yaqeen<span className="text-[#c38a3a]">.</span></a>
        <label className="relative hidden flex-1 md:block"><span className="sr-only">Rechercher</span><input className="w-full rounded-full border border-black/10 bg-white py-3 pl-5 pr-12 text-sm outline-none transition focus:border-[#2f6b58]" placeholder="Rechercher un produit, une marque, une boutique…" /><span className="absolute right-4 top-1/2 -translate-y-1/2">⌕</span></label>
        <nav className="ml-auto flex items-center gap-5 text-sm font-semibold text-[#26352f]"><a href="#boutiques" className="hidden sm:block">Boutiques</a><a href="#vendeurs" className="hidden lg:block">Vendre sur Yaqeen</a><button aria-label="Compte">♙</button><button aria-label="Panier" className="relative">🛍<span className="absolute -right-2 -top-2 rounded-full bg-[#c38a3a] px-1 text-[9px] text-white">0</span></button></nav>
      </div>
      <div className="mx-auto flex max-w-7xl gap-7 overflow-x-auto px-5 pb-3 text-xs font-semibold text-[#4a554f] lg:px-8"><a href="#categories">Toutes les catégories</a><a href="#">Nouveautés</a><a href="#">Livres</a><a href="#">Mode</a><a href="#">Parfums</a><a href="#">Beauté</a><a href="#">Bien-être</a><a href="#" className="text-[#a56621]">Offres</a></div>
    </header>

    <section className="relative overflow-hidden bg-[#f1ebdf]"><div className="hero-pattern absolute inset-0 opacity-30" /><div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-24">
      <div><div className="mb-5 inline-flex rounded-full border border-[#b68a51]/30 bg-white/60 px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-[#86612f]">La marketplace qui a du sens</div><h1 className="max-w-2xl font-serif text-5xl leading-[1.02] tracking-tight text-[#173c32] sm:text-6xl lg:text-7xl">Le meilleur du halal, réuni au même endroit.</h1><p className="mt-6 max-w-xl text-base leading-7 text-[#53625c] sm:text-lg">Découvrez des produits sélectionnés et achetez en toute confiance auprès de boutiques indépendantes qui partagent vos valeurs.</p><div className="mt-8 flex flex-wrap gap-3"><a href="#selection" className="rounded-full bg-[#173c32] px-6 py-3.5 text-sm font-bold text-white">Découvrir la sélection</a><a href="#vendeurs" className="rounded-full border border-[#173c32]/20 bg-white/50 px-6 py-3.5 text-sm font-bold text-[#173c32]">Ouvrir ma boutique</a></div><div className="mt-10 flex flex-wrap gap-6 text-xs font-semibold text-[#52615b]"><span>✓ Paiement sécurisé</span><span>✓ Produits vérifiés</span><span>✓ Vendeurs engagés</span></div></div>
      <div className="relative mx-auto hidden aspect-square w-full max-w-lg md:block"><div className="absolute inset-[12%] rounded-full bg-[#d9c7a7]" /><div className="absolute left-[8%] top-[12%] flex h-44 w-36 rotate-[-8deg] items-center justify-center rounded-[2rem] bg-[#244f42] text-7xl shadow-xl">📖</div><div className="absolute right-[4%] top-[24%] flex h-52 w-40 rotate-[7deg] items-center justify-center rounded-[2rem] bg-[#fffaf0] text-7xl shadow-xl">🧴</div><div className="absolute bottom-[5%] left-[30%] flex h-40 w-40 items-center justify-center rounded-full bg-[#bd8a4b] text-7xl shadow-xl">🌿</div></div>
    </div></section>

    <section id="categories" className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><div className="mb-8 flex items-end justify-between"><div><p className="eyebrow">Explorer</p><h2 className="section-title">Tout ce qu’il vous faut</h2></div><a href="#" className="hidden text-sm font-bold text-[#2f6b58] sm:block">Voir toutes les catégories →</a></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{categories.map(c => <a href="#selection" key={c.name} className="group rounded-3xl p-4 transition hover:-translate-y-1" style={{backgroundColor:c.tone}}><span className="block py-5 text-center text-5xl transition group-hover:scale-110">{c.icon}</span><span className="block text-center text-sm font-bold text-[#283b34]">{c.name}</span></a>)}</div></section>

    <section id="selection" className="bg-[#f7f5ef] py-16"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="mb-8"><p className="eyebrow">Nos coups de cœur</p><h2 className="section-title">La sélection Yaqeen</h2></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{products.map(p => <article key={p.name} className="group overflow-hidden rounded-3xl bg-white p-3 shadow-[0_8px_30px_rgba(26,52,43,.06)]"><div className="relative flex aspect-[4/3] items-center justify-center rounded-[1.25rem] text-7xl" style={{backgroundColor:p.color}}><span className="transition duration-300 group-hover:scale-110">{p.icon}</span><button aria-label="Ajouter aux favoris" className="absolute right-3 top-3 h-9 w-9 rounded-full bg-white/80">♡</button></div><div className="px-2 pb-2 pt-4"><p className="text-xs font-semibold text-[#78837e]">{p.shop} · ★ 4,9</p><h3 className="mt-1 min-h-12 font-semibold leading-6 text-[#21342d]">{p.name}</h3><div className="mt-3 flex items-center justify-between"><span className="font-extrabold text-[#173c32]">{p.price}</span><button className="rounded-full bg-[#edf3ef] px-3 py-2 text-xs font-bold text-[#245344]">Ajouter +</button></div></div></article>)}</div></div></section>

    <section id="vendeurs" className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><div className="overflow-hidden rounded-[2.5rem] bg-[#173c32] px-6 py-12 text-white sm:px-12 lg:flex lg:items-center lg:justify-between lg:py-16"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#d8b681]">Vous êtes une marque ou un créateur ?</p><h2 className="mt-3 font-serif text-4xl sm:text-5xl">Votre boutique mérite d’être découverte.</h2><p className="mt-4 max-w-xl leading-7 text-white/70">Créez votre espace, gérez vos produits et rejoignez une communauté qui recherche exactement ce que vous proposez.</p></div><a href="#" className="mt-8 inline-flex shrink-0 rounded-full bg-[#d5a35f] px-7 py-4 text-sm font-extrabold text-[#173c32] lg:ml-10 lg:mt-0">Devenir vendeur →</a></div></section>
    <footer className="border-t border-black/8 px-5 py-8 text-center text-xs text-[#6e7873]">© 2026 Yaqeen Market · La marketplace halal de confiance</footer>
  </main>;
}
