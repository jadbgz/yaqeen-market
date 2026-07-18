import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomerOrder } from "@/lib/account/dal";
import { getViewer } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/catalog/format";
import { ConfirmationStatus } from "@/components/confirmation-status";

const statusCopy: Record<string, { label: string; title: string; detail: string }> = {
  pending_payment: { label: "VÉRIFICATION EN COURS", title: "Nous attendons Stripe.", detail: "La page de paiement ne confirme jamais elle-même une commande. Le webhook signé doit d’abord être reçu." },
  paid: { label: "PAIEMENT CONFIRMÉ", title: "Commande validée.", detail: "Le paiement test a été authentifié et le stock a été consommé atomiquement." },
  cancelled: { label: "RÉSERVATION FERMÉE", title: "Commande annulée.", detail: "Aucun paiement n’a été confirmé pour cette réservation." },
};

export default async function ConfirmationPage({ params }: { params: Promise<{ orderId: string }> }) {
  if (!await getViewer()) redirect("/?auth=login&next=/compte/commandes");
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const order = await getCustomerOrder(orderId);
  if (!order) notFound();
  const copy = statusCopy[order.status] ?? { label: "COMMANDE EN COURS", title: "Statut mis à jour.", detail: "Consultez votre espace pour suivre les prochaines étapes." };
  return <main className="confirmation-shell"><header><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><Link href="/compte/commandes">Mes commandes →</Link></header><section><p>{copy.label}</p><h1>{copy.title}</h1><div className={order.status === "paid" ? "confirmation-mark paid" : "confirmation-mark"}>{order.status === "paid" ? "✓" : "···"}</div><p>{copy.detail}</p><dl><div><dt>Commande</dt><dd>#{order.id.slice(0, 8).toUpperCase()}</dd></div><div><dt>Total test</dt><dd>{formatPrice(order.totalCents / 100, order.currency)}</dd></div><div><dt>Boutiques</dt><dd>{order.shops.length}</dd></div></dl><ConfirmationStatus status={order.status} /><Link href="/compte/commandes">Voir l’historique complet</Link></section></main>;
}
