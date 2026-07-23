import type { Metadata } from "next";
import Link from "next/link";
import { MarketFooter } from "@/components/market-footer";
import { MarketHeader } from "@/components/market-header";

export const metadata: Metadata = {
  title: "Aide et informations — Yaqeen Market",
  description: "Comprendre les achats, la livraison, les retours, le paiement et la publication des vendeurs sur Yaqeen Market.",
};

const sections = [
  ["livraison", "Livraison & retours", "Chaque boutique expédie ses propres produits. Les délais et frais doivent être présentés par vendeur avant le paiement. Le droit de rétractation et les exceptions applicables seront rappelés sur la commande concernée."],
  ["paiement", "Paiement sécurisé", "Le paiement est calculé côté serveur et traité par Stripe. La version actuelle utilise exclusivement le bac à sable : aucune carte réelle ne peut être débitée."],
  ["vendeurs", "Publication des vendeurs", "Une boutique prépare son dossier, ses produits, ses médias et ses preuves. Ils restent invisibles tant qu’un opérateur Yaqeen ne les a pas revus puis publiés."],
  ["recommander", "Recommander une boutique", "Ce parcours communautaire sera ouvert avec le premier catalogue public. Nous n’affichons pas encore de formulaire qui enverrait une recommandation nulle part."],
  ["legal", "Cadre légal avant ouverture", "Les mentions légales, conditions de vente, politique de confidentialité et modalités détaillées de retour devront être validées puis publiées avant l’ouverture commerciale. Cette page ne les remplace pas."],
] as const;

export default function HelpPage() {
  return <main className="help-shell"><MarketHeader /><header className="help-hero"><p>CENTRE D’AIDE · INFORMATIONS HONNÊTES</p><h1>Comprendre<br />avant de choisir<span>.</span></h1><p>Cette version distingue ce qui fonctionne déjà de ce qui doit encore être finalisé avant l’ouverture publique.</p></header><div className="help-sections">{sections.map(([id,title,copy],index)=><section id={id} key={id}><span>{String(index+1).padStart(2,"0")}</span><div><h2>{title}</h2><p>{copy}</p></div></section>)}</div><div className="help-cta"><p>Vous cherchez un produit ou une boutique ?</p><Link href="/catalogue">Explorer le catalogue →</Link></div><MarketFooter /></main>;
}
