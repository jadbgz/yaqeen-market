import Link from "next/link";
import { AccountAccess } from "@/components/account-access";
import { SellerChrome } from "@/components/seller-chrome";
import { SellerOnboardingForm } from "@/components/seller-onboarding-form";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function SellerGate({ children }: { children: React.ReactNode }) {
  return <main className="seller-gate"><header><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><small>SELLER</small></header>{children}</main>;
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <article className={`seller-metric ${accent ? "seller-metric-accent" : ""}`}><div><p>{label}</p><span>DONNÉE RÉELLE</span></div><strong>{value}</strong><small>{detail}</small></article>;
}

export default async function SellerPage() {
  if (!getSupabaseConfig()) {
    return <SellerGate><section className="seller-gate-copy"><p>ENVIRONNEMENT NON RELIÉ</p><h1>Le Seller Center<br /><span>est prêt.</span></h1><p>Ajoutez les variables Supabase de cet environnement pour activer les comptes et la création sécurisée de boutiques.</p><Link href="/pilotage">Voir l’état technique →</Link></section></SellerGate>;
  }

  const viewer = await getViewer();
  if (!viewer) {
    return <SellerGate><section className="seller-gate-copy"><p>UN COMPTE POUR TOUT YAQEEN</p><h1>Commencez par<br /><span>vous connecter.</span></h1><p>Votre espace vendeur sera rattaché au même compte que vos achats, sans identité séparée.</p><AccountAccess redirectTo="/seller" /></section></SellerGate>;
  }

  const dashboard = await getSellerDashboard();
  if (!dashboard) {
    return <SellerGate><div className="seller-onboarding-layout"><section><p>OUVERTURE DE BOUTIQUE</p><h1>Créez votre espace<br /><span>vendeur.</span></h1><p>Cette première étape crée votre boutique et votre rôle vendeur dans une seule transaction sécurisée. Vous pourrez ensuite préparer votre catalogue.</p><div><strong>01</strong><span>Boutique en brouillon</span></div><div><strong>02</strong><span>Catalogue et preuves</span></div><div><strong>03</strong><span>Revue puis publication</span></div></section><SellerOnboardingForm /></div></SellerGate>;
  }

  const { shop, metrics } = dashboard;
  const userName = viewer.displayName || viewer.email?.split("@")[0] || "Membre";

  return (
    <SellerChrome shopName={shop.name} shopStatus={shop.status} userName={userName}>
      <div className="seller-content">
        <div className="seller-welcome"><div><p className="seller-kicker">TABLEAU DE BORD RÉEL</p><h1>Construisons votre<br />catalogue<span>.</span></h1></div><Link className="seller-next-label" href="/seller/produits/nouveau">AJOUTER UN PRODUIT →</Link></div>
        <div className="seller-status-card"><div><span>{shop.status === "approved" ? "✓" : "01"}</span></div><section><p>STATUT DE LA BOUTIQUE</p><h2>{shop.status === "draft" ? "Votre boutique est en brouillon." : shop.status === "under_review" ? "La revue Yaqeen est en cours." : shop.status === "approved" ? "Votre boutique est publiée." : "Votre boutique demande une intervention."}</h2><small>Aucune donnée commerciale n’est simulée sur cet écran.</small></section></div>
        <div className="seller-metrics"><Metric label="Produits" value={String(metrics.products)} detail="Fiches réellement enregistrées" accent /><Metric label="Produits publiés" value={String(metrics.publishedProducts)} detail="Visibles par les clients" /><Metric label="Stock disponible" value={String(metrics.availableStock)} detail="Physique moins réservé" /><Metric label="Preuves en attente" value={String(metrics.pendingEvidence)} detail="À examiner par Yaqeen" /></div>
        <section className="seller-real-empty"><p>CATALOGUE VENDEUR</p><h2>{metrics.products === 0 ? "Ajoutez votre premier produit." : "Continuez à structurer votre offre."}</h2><p>Chaque création enregistre ensemble la fiche, sa première variante, son stock et une preuve. Elle reste privée jusqu’à la revue Yaqeen.</p><Link className="seller-inline-cta" href="/seller/produits">Ouvrir le catalogue →</Link><span>Commandes et chiffre d’affaires resteront absents jusqu’à l’existence d’un vrai flux de commande.</span></section>
      </div>
    </SellerChrome>
  );
}
