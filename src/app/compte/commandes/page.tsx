import { redirect } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { getCustomerOrders } from "@/lib/account/dal";
import { getViewer } from "@/lib/auth/dal";

const statusLabels: Record<string, string> = {
  pending_payment: "Paiement en attente", paid: "Payée", processing: "En préparation",
  partially_shipped: "Expédition partielle", shipped: "Expédiée", delivered: "Livrée",
  cancelled: "Annulée", partially_refunded: "Remboursement partiel", refunded: "Remboursée",
};

export default async function OrdersPage() {
  if (!await getViewer()) redirect("/?auth=login&next=/compte/commandes");
  const orders = await getCustomerOrders();
  return <main className="member-shell">
    <AccountHeader />
    <section className="account-page-heading"><p>VOTRE COMPTE / ACHATS</p><h1>Mes commandes.</h1><p>Une commande Yaqeen peut regrouper plusieurs boutiques. Chaque vendeur conserve son propre suivi d’expédition.</p></section>
    <section className="orders-list">
      {orders.length ? orders.map((order) => <article key={order.id}>
        <header><div><span>Commande</span><strong>#{order.id.slice(0, 8).toUpperCase()}</strong></div><b>{statusLabels[order.status] ?? order.status}</b></header>
        <div><p>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(order.createdAt))}</p><strong>{new Intl.NumberFormat("fr-FR", { style: "currency", currency: order.currency }).format(order.totalCents / 100)}</strong></div>
        <footer>{order.shops.length} {order.shops.length > 1 ? "boutiques vendeuses" : "boutique vendeuse"}</footer>
      </article>) : <div className="account-empty account-empty-wide"><strong>Votre historique est vide.</strong><p>Aucune commande simulée : vos futurs achats apparaîtront ici après leur création réelle.</p><a href="/catalogue">Explorer le catalogue →</a></div>}
    </section>
  </main>;
}
