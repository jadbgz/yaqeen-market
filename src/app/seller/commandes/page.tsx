import { redirect } from "next/navigation";
import { SellerChrome } from "@/components/seller-chrome";
import { SellerFulfillmentControls } from "@/components/seller-fulfillment-controls";
import { getViewer } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getSellerDashboard, getSellerOrders } from "@/lib/seller/dal";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  pending_payment: "Paiement en attente", paid: "À préparer", preparing: "En préparation",
  shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée", refunded: "Remboursée",
};

export default async function SellerOrdersPage() {
  if (!getSupabaseConfig()) redirect("/seller");
  const [viewer, dashboard, orders] = await Promise.all([getViewer(), getSellerDashboard(), getSellerOrders()]);
  if (!viewer || !dashboard || !orders) redirect("/seller");
  const userName = viewer.displayName || viewer.email?.split("@")[0] || "Membre";
  const actionable = orders.filter((order) => order.status === "paid" || order.status === "preparing").length;

  return <SellerChrome shopName={dashboard.shop.name} shopStatus={dashboard.shop.status} userName={userName} activeRoute="orders">
    <div className="seller-content seller-orders-page">
      <div className="seller-page-head"><div><p className="seller-kicker">EXÉCUTION MULTI-VENDEUR</p><h1>Vos commandes<span>.</span></h1><p>{orders.length} sous-commande{orders.length > 1 ? "s" : ""} visible{orders.length > 1 ? "s" : ""} · {actionable} action{actionable > 1 ? "s" : ""} requise{actionable > 1 ? "s" : ""}.</p></div></div>
      {orders.length === 0 ? <section className="seller-catalog-empty"><span>□</span><p>AUCUNE DONNÉE SIMULÉE</p><h2>Les commandes payées<br />arriveront ici.</h2><p>Chaque boutique ne voit que sa propre sous-commande et l’adresse strictement nécessaire à l’expédition.</p></section> : <section className="seller-fulfillment-list">
        {orders.map((order) => <article key={order.id} className="seller-fulfillment-card">
          <header><div><span>COMMANDE #{order.aggregateOrderId.slice(0, 8).toUpperCase()}</span><h2>{labels[order.status] ?? order.status}</h2></div><strong>{formatPrice(order.totalCents / 100, order.currency)}</strong></header>
          <div className="seller-fulfillment-body"><section><p>ARTICLES</p>{order.items.map((item) => <div className="seller-fulfillment-item" key={item.id}><span>{item.quantity} ×</span><div><strong>{item.productTitle}</strong><small>{item.variantTitle} · SKU {item.sku}</small></div><b>{formatPrice(item.lineTotalCents / 100, order.currency)}</b></div>)}</section>
            <aside><p>EXPÉDIER À</p>{order.address ? <address><strong>{order.address.recipientName}</strong><span>{order.address.line1}</span>{order.address.line2 && <span>{order.address.line2}</span>}<span>{order.address.postalCode} {order.address.city}</span><span>{order.address.countryCode}</span>{order.address.phone && <small>{order.address.phone}</small>}</address> : <div className="seller-order-warning">Adresse indisponible — n’expédiez pas.</div>}</aside>
          </div>
          {order.status === "shipped" && <div className="seller-shipment-record"><span>✓ EXPÉDIÉE</span><strong>{order.shippingCarrier}</strong><code>{order.trackingNumber}</code></div>}
          {order.address && <SellerFulfillmentControls shopOrderId={order.id} status={order.status} />}
        </article>)}
      </section>}
    </div>
  </SellerChrome>;
}
