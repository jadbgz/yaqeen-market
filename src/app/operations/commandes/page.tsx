import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmDeliveryAction, refundShopOrderAction, releaseTransferAction } from "./actions";
import { getViewer } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { getOperationsOrders } from "@/lib/operations/orders-dal";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function OperationsOrdersPage({ searchParams }: { searchParams: Promise<{ confirmed?: string; transferred?: string; refunded?: string; error?: string }> }) {
  if (!getSupabaseConfig()) redirect("/");
  const [viewer, orders, params] = await Promise.all([getViewer(), getOperationsOrders(), searchParams]);
  if (!viewer || !orders || (viewer.role !== "operator" && viewer.role !== "admin")) redirect("/");
  return <main className="moderation-shell operations-orders"><header className="moderation-topbar"><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><b>OPÉRATIONS · COMMANDES</b><div><Link href="/operations/moderation">Modération</Link><Link href="/compte">{viewer.displayName || viewer.email || "Opérateur"}</Link></div></header>
    <section className="moderation-hero"><p>EXÉCUTION & RAPPROCHEMENT</p><h1>Livrer, puis<br/><span>libérer.</span></h1><div><strong>{orders.length}</strong><span>sous-commandes suivies</span></div></section>
    {(params.confirmed || params.transferred || params.refunded) && <div className="moderation-flash">✓ Transition enregistrée et auditée.</div>}{params.error && <div className="moderation-flash moderation-flash-error">Opération refusée : l’état, la preuve ou le rapprochement Stripe n’est pas valide.</div>}
    <section className="moderation-section"><header><div><p>SANDBOX STRIPE UNIQUEMENT</p><h2>File de libération vendeur</h2></div></header><div className="moderation-grid">{orders.map((order) => <article className="moderation-card" key={order.id}><div className="moderation-card-head"><span>CO</span><div><h3>{order.shopName}</h3><p>#{order.orderId.slice(0,8).toUpperCase()} · {order.status}</p></div></div><dl><div><dt>Expédition</dt><dd>{order.carrier} · {order.trackingNumber}</dd></div><div><dt>Commande</dt><dd>{formatPrice(order.totalCents / 100, order.currency)}</dd></div><div><dt>Net vendeur</dt><dd>{formatPrice((order.totalCents - order.commissionCents) / 100, order.currency)}</dd></div></dl>
        {order.status === "shipped" && !order.refund ? <form action={confirmDeliveryAction} className="moderation-form"><input type="hidden" name="shopOrderId" value={order.id}/><label>Justification de la confirmation<textarea name="rationale" required minLength={10} maxLength={1000} rows={3} placeholder="Source vérifiée, contrôle effectué et résultat…"/></label><button className="moderation-approve">CONFIRMER LA LIVRAISON</button></form> : null}
        {order.status === "delivered" && !order.refund ? order.transfer ? <div className="operations-transfer-state"><b>TRANSFERT {order.transfer.status.toUpperCase()}</b><span>{formatPrice(order.transfer.amountCents / 100, order.currency)}</span>{order.transfer.providerId && <code>{order.transfer.providerId}</code>}{order.transfer.errorCode && <small>À rapprocher : {order.transfer.errorCode}</small>}</div> : <form action={releaseTransferAction} className="moderation-form"><input type="hidden" name="shopOrderId" value={order.id}/><p>La livraison est confirmée. Cette action crée un transfert Stripe idempotent lié au paiement source.</p><button className="moderation-approve">LIBÉRER LE TRANSFERT TEST</button></form> : null}
        {order.refund ? <div className="operations-transfer-state"><b>REMBOURSEMENT {order.refund.status.toUpperCase()}</b><span>{formatPrice(order.refund.amountCents / 100, order.currency)}</span>{order.refund.providerId && <code>{order.refund.providerId}</code>}{order.refund.errorCode && <small>À rapprocher : {order.refund.errorCode}</small>}</div> : <form action={refundShopOrderAction} className="moderation-form"><input type="hidden" name="shopOrderId" value={order.id}/><label>Motif Stripe<select name="reasonCode" required defaultValue="requested_by_customer"><option value="requested_by_customer">Demande client</option><option value="duplicate">Paiement en double</option><option value="fraudulent">Paiement frauduleux</option></select></label><label>Justification interne<textarea name="rationale" required minLength={10} maxLength={1000} rows={3} placeholder="Demande vérifiée, périmètre et décision…"/></label><button className="moderation-reject">REMBOURSER LA SOUS-COMMANDE</button></form>}
      </article>)}</div>{orders.length === 0 && <p className="moderation-empty">Aucune expédition à contrôler.</p>}</section>
  </main>;
}
