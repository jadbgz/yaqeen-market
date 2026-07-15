import Link from "next/link";
import { redirect } from "next/navigation";
import { SellerChrome } from "@/components/seller-chrome";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard, getSellerProducts } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { submitProductForReview } from "../review-actions";

export const dynamic = "force-dynamic";

const statusLabels = { draft: "Brouillon", under_review: "En vérification", published: "Publié", rejected: "À corriger", archived: "Archivé" } as const;
const evidenceLabels = { pending: "Preuve à vérifier", approved: "Preuve approuvée", rejected: "Preuve rejetée", expired: "Preuve expirée", revoked: "Preuve révoquée" } as const;
const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export default async function SellerProductsPage({ searchParams }: { searchParams: Promise<{ created?: string; submitted?: string; review_error?: string }> }) {
  if (!getSupabaseConfig()) redirect("/seller");
  const [viewer, dashboard, products, params] = await Promise.all([getViewer(), getSellerDashboard(), getSellerProducts(), searchParams]);
  if (!viewer || !dashboard || !products) redirect("/seller");
  const userName = viewer.displayName || viewer.email?.split("@")[0] || "Membre";

  return <SellerChrome shopName={dashboard.shop.name} shopStatus={dashboard.shop.status} userName={userName} activeRoute="products"><div className="seller-content seller-products-page">
    <div className="seller-page-head"><div><p className="seller-kicker">CATALOGUE PERSISTÉ</p><h1>Vos produits<span>.</span></h1><p>{products.length} fiche{products.length > 1 ? "s" : ""} · chaque statut vient de PostgreSQL.</p></div><Link className="seller-primary" href="/seller/produits/nouveau">＋ Ajouter un produit</Link></div>
    {params.created === "1" && <div className="seller-success" role="status"><span>✓</span><div><strong>Brouillon enregistré sans donnée partielle.</strong><p>La fiche, sa variante, son stock et sa preuve sont maintenant liés.</p></div></div>}
    {params.submitted === "1" && <div className="seller-success" role="status"><span>✓</span><div><strong>Produit transmis à la modération.</strong><p>Son contenu est verrouillé jusqu’à la décision Yaqeen.</p></div></div>}{params.review_error && <div className="seller-form-feedback">Soumission refusée. Vérifiez la description, la variante, le résumé de preuve et le statut de la boutique.</div>}
    {products.length === 0 ? <section className="seller-catalog-empty"><span>◇</span><p>VOTRE PREMIER OBJET MÉTIER</p><h2>Une fiche complète,<br />pas une simple carte.</h2><p>Le produit restera invisible aux clients tant que sa preuve et son contenu n’auront pas été revus.</p><Link href="/seller/produits/nouveau">Créer le premier brouillon →</Link></section> : <section className="seller-product-list"><header><span>Produit</span><span>Prix</span><span>Stock</span><span>Confiance</span><span>Publication</span><span>Action</span></header>{products.map((product) => <article key={product.id}><div className="seller-product-identity"><span>{product.category.slice(0, 2).toUpperCase()}</span><div><strong>{product.title}</strong><small>{product.variant?.title ?? "Aucune variante"} · {product.variant?.sku ?? "Sans SKU"}</small></div></div><strong>{product.variant ? money.format(product.variant.priceCents / 100) : "—"}</strong><span>{product.variant?.availableStock ?? 0}</span><span className={`seller-state seller-state-${product.evidenceStatus ?? "none"}`}>{product.evidenceStatus ? evidenceLabels[product.evidenceStatus] : "Aucune preuve"}</span><span className={`seller-state seller-product-${product.status}`}>{statusLabels[product.status]}</span><div>{product.status === "draft" && (dashboard.shop.status === "under_review" || dashboard.shop.status === "approved") ? <form action={submitProductForReview}><input type="hidden" name="productId" value={product.id} /><button className="seller-review-button" type="submit">Soumettre →</button></form> : product.status === "draft" ? <small className="seller-action-hint">Soumettez d’abord la boutique</small> : <small className="seller-action-hint">Aucune action disponible</small>}</div></article>)}</section>}
  </div></SellerChrome>;
}
