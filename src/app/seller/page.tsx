import Link from "next/link";
import { AccountAccess } from "@/components/account-access";
import { SellerChrome } from "@/components/seller-chrome";
import { SellerOnboardingForm } from "@/components/seller-onboarding-form";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard, getSellerPaymentState } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { isStripeTestCheckoutConfigured } from "@/lib/payments/config";
import { SellerPaymentPanel } from "@/components/seller-payment-panel";
import { submitShopForReview } from "./review-actions";

export const dynamic = "force-dynamic";

function SellerGate({ children }: { children: React.ReactNode }) {
  return <main className="seller-gate"><header><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><small>SELLER</small></header>{children}</main>;
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <article className={`seller-metric ${accent ? "seller-metric-accent" : ""}`}><div><p>{label}</p><span>DONNÉE RÉELLE</span></div><strong>{value}</strong><small>{detail}</small></article>;
}

export default async function SellerPage({ searchParams }: { searchParams: Promise<{ shop_submitted?: string; review_error?: string }> }) {
  if (!getSupabaseConfig()) {
    return <SellerGate><section className="seller-gate-copy"><p>ENVIRONNEMENT NON RELIÉ</p><h1>Le Seller Center<br /><span>est prêt.</span></h1><p>Ajoutez les variables Supabase de cet environnement pour activer les comptes et la création sécurisée de boutiques.</p><Link href="/">Retour à la marketplace →</Link></section></SellerGate>;
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
  const paymentState = await getSellerPaymentState();
  const params = await searchParams;
  const userName = viewer.displayName || viewer.email?.split("@")[0] || "Membre";

  return (
    <SellerChrome shopName={shop.name} shopStatus={shop.status} userName={userName}>
      <div className="seller-content">
        <div className="seller-welcome"><div><p className="seller-kicker">TABLEAU DE BORD RÉEL</p><h1>Construisons votre<br />catalogue<span>.</span></h1></div><Link className="seller-next-label" href="/seller/produits/nouveau">AJOUTER UN PRODUIT →</Link></div>
        {params.shop_submitted && <div className="seller-success" role="status"><span>✓</span><div><strong>Boutique transmise à l’équipe Yaqeen.</strong><p>Son statut est verrouillé pendant la revue.</p></div></div>}{params.review_error && <div className="seller-form-feedback">Soumission refusée : complétez notamment une présentation d’au moins 20 caractères et le pays d’expédition.</div>}
        <div className="seller-status-card"><div><span>{shop.status === "approved" ? "✓" : "01"}</span></div><section><p>STATUT DE LA BOUTIQUE</p><h2>{shop.status === "draft" ? "Votre boutique est en brouillon." : shop.status === "under_review" ? "La revue Yaqeen est en cours." : shop.status === "approved" ? "Votre boutique est publiée." : "Votre boutique demande une intervention."}</h2><small>Aucune donnée commerciale n’est simulée sur cet écran.</small>{(shop.status === "draft" || shop.status === "rejected") && <form action={submitShopForReview}><button className="seller-review-button" type="submit">Soumettre la boutique à la revue →</button></form>}</section></div>
        <div className="seller-metrics"><Metric label="Produits" value={String(metrics.products)} detail="Fiches réellement enregistrées" accent /><Metric label="Produits publiés" value={String(metrics.publishedProducts)} detail="Visibles par les clients" /><Metric label="Stock disponible" value={String(metrics.availableStock)} detail="Physique moins réservé" /><Metric label="Preuves en attente" value={String(metrics.pendingEvidence)} detail="À examiner par Yaqeen" /></div>
        {shop.status === "approved" && paymentState && <SellerPaymentPanel state={paymentState} configured={isStripeTestCheckoutConfigured()} />}
        <section className="seller-real-empty"><p>ACTIVITÉ VENDEUR</p><h2>{metrics.products === 0 ? "Ajoutez votre premier produit." : "Continuez à structurer votre offre."}</h2><p>Chaque création enregistre ensemble la fiche, sa première variante, son stock et une preuve. Les commandes confirmées sont ensuite isolées par boutique pour leur préparation.</p><div><Link className="seller-inline-cta" href="/seller/produits">Ouvrir le catalogue →</Link><Link className="seller-inline-cta" href="/seller/commandes">Traiter les commandes →</Link></div><span>Aucun chiffre d’affaires ni volume de commande n’est simulé.</span></section>
      </div>
    </SellerChrome>
  );
}
