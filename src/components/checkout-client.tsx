"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CustomerAddress } from "@/lib/account/dal";
import { formatPrice } from "@/lib/catalog/format";
import { useCart } from "@/components/cart-provider";

type CheckoutSession = {
  orderId: string;
  clientSecret: string;
  status: string;
  expiresAt: string;
};

const errorMessages: Record<string, string> = {
  authentication_required: "Reconnectez-vous avant de poursuivre.",
  insufficient_stock: "Le stock a changé. Revenez au panier pour ajuster votre commande.",
  active_order_limit: "Trop de réservations sont déjà ouvertes. Réessayez après leur expiration.",
  seller_payment_unavailable: "Une boutique n’a pas encore terminé son activation Stripe. Le paiement reste fermé.",
  order_not_payable: "Cette réservation ne peut plus être payée.",
  stripe_test_checkout_unconfigured: "Le bac à sable Stripe n’est pas encore configuré.",
};

function checkoutToken(fingerprint: string) {
  const key = "yaqeen-checkout-token-v1";
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as { fingerprint?: string; token?: string } | null;
    if (saved?.fingerprint === fingerprint && saved.token) return saved.token;
  } catch {}
  const token = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ fingerprint, token }));
  return token;
}

function PaymentForm({ session }: { session: CheckoutSession }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/commande/${session.orderId}/confirmation` },
      redirect: "if_required",
    });
    if (result.error) {
      setError(result.error.message ?? "La carte de test n’a pas été acceptée.");
      setSubmitting(false);
      return;
    }
    router.replace(`/commande/${session.orderId}/confirmation`);
  }

  return <form onSubmit={submit} className="payment-form">
    <PaymentElement options={{ layout: "tabs" }} />
    {error && <p className="checkout-error" role="alert">{error}</p>}
    <button disabled={!stripe || submitting}>{submitting ? "Confirmation…" : "CONFIRMER LE PAIEMENT TEST →"}</button>
    <small>Utilisez uniquement une carte de test Stripe. Aucune carte réelle ne sera débitée.</small>
  </form>;
}

export function CheckoutClient({ addresses, publishableKey, configured }: {
  addresses: CustomerAddress[];
  publishableKey: string | null;
  configured: boolean;
}) {
  const { items, ready, count, subtotal } = useCart();
  const [addressId, setAddressId] = useState(addresses.find((item) => item.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stripePromise = useMemo(() => publishableKey ? loadStripe(publishableKey) : null, [publishableKey]);
  const fingerprint = `${addressId}|${items.map((item) => `${item.variantId}:${item.quantity}`).sort().join("|")}`;

  async function reserve() {
    if (!addressId || !items.length || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressId,
          checkoutToken: checkoutToken(fingerprint),
          items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        }),
      });
      const body = await response.json() as CheckoutSession & { error?: string };
      if (!response.ok || !body.clientSecret) throw new Error(body.error ?? "checkout_failed");
      setSession(body);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "checkout_failed";
      setError(errorMessages[code] ?? "Le paiement test n’a pas pu être préparé. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="checkout-shell">
    <header className="checkout-nav"><Link href="/" className="brand-mark">yaqeen<span>✦</span></Link><Link href="/panier">← Retour au panier</Link><span>PAIEMENT TEST</span></header>
    <section className="checkout-heading"><p>CHECKOUT SÉCURISÉ</p><h1>Finaliser<span>.</span></h1><p>Le serveur recalcule le prix et réserve le stock. Seul un webhook Stripe signé peut confirmer la commande.</p></section>
    {!ready ? <section className="checkout-empty"><h2>Chargement du panier…</h2></section> : !items.length ? <section className="checkout-empty"><h2>Votre panier est vide.</h2><Link href="/catalogue">Explorer le catalogue →</Link></section> : <div className="checkout-grid">
      <section className="checkout-main">
        <div className="checkout-step"><span>01</span><div><p>LIVRAISON</p><h2>Choisir une adresse</h2></div></div>
        {addresses.length ? <div className="checkout-addresses">{addresses.map((address) => <label key={address.id} className={addressId === address.id ? "active" : ""}>
          <input type="radio" name="address" value={address.id} checked={addressId === address.id} disabled={Boolean(session)} onChange={() => setAddressId(address.id)} />
          <span><strong>{address.label}{address.isDefault && <em>Par défaut</em>}</strong><small>{address.recipientName}<br />{address.line1}<br />{address.postalCode} {address.city}</small></span>
        </label>)}</div> : <div className="checkout-notice"><strong>Une adresse est nécessaire.</strong><p>Ajoutez-la dans votre compte avant de réserver le stock.</p><Link href="/compte/adresses">Ajouter une adresse →</Link></div>}

        <div className="checkout-step"><span>02</span><div><p>PAIEMENT</p><h2>Carte de test Stripe</h2></div></div>
        {!configured && <div className="checkout-notice warning"><strong>Bac à sable non configuré.</strong><p>Ajoutez les clés Stripe test et la clé serveur Supabase pour activer cette étape.</p></div>}
        {!session ? <button className="checkout-reserve" disabled={!configured || !addressId || loading} onClick={reserve}>{loading ? "RÉSERVATION…" : "RÉSERVER LE STOCK ET CONTINUER →"}</button> : stripePromise && <Elements stripe={stripePromise} options={{
          clientSecret: session.clientSecret,
          appearance: { theme: "stripe", variables: { colorPrimary: "#0a3265", colorBackground: "#f7f1e6", colorText: "#17201c", borderRadius: "2px", fontFamily: "Arial, sans-serif" } },
        }}><PaymentForm session={session} /></Elements>}
        {error && <p className="checkout-error" role="alert">{error}</p>}
      </section>
      <aside className="checkout-summary"><p>VOTRE COMMANDE</p><h2>{count} {count > 1 ? "articles" : "article"}</h2>{items.map((item) => <div key={item.variantId}><span>{item.quantity} × {item.name}<small>{item.shop}</small></span><strong>{formatPrice(item.price * item.quantity, item.currency)}</strong></div>)}<dl><dt>Sous-total</dt><dd>{formatPrice(subtotal)}</dd><dt>Livraison test</dt><dd>0,00 €</dd></dl><footer><span>Total test</span><strong>{formatPrice(subtotal)}</strong></footer>{session && <small>Réservation valable jusqu’à {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.expiresAt))}.</small>}</aside>
    </div>}
  </main>;
}
