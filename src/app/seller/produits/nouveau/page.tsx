import { redirect } from "next/navigation";
import { SellerChrome } from "@/components/seller-chrome";
import { SellerProductForm } from "@/components/seller-product-form";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function NewSellerProductPage() {
  if (!getSupabaseConfig()) redirect("/seller");
  const [viewer, dashboard] = await Promise.all([getViewer(), getSellerDashboard()]);
  if (!viewer || !dashboard) redirect("/seller");
  const userName = viewer.displayName || viewer.email?.split("@")[0] || "Membre";

  return <SellerChrome shopName={dashboard.shop.name} shopStatus={dashboard.shop.status} userName={userName} activeRoute="products"><div className="seller-content seller-product-create"><div className="seller-create-head"><p className="seller-kicker">NOUVELLE FICHE</p><h1>Un produit.<br /><span>Quatre vérités.</span></h1><p>Identité, offre, stock et preuve sont enregistrés ensemble. Si une seule étape échoue, rien n’est créé.</p></div><SellerProductForm /></div></SellerChrome>;
}
