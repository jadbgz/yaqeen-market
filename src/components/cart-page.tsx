"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";
import { formatPrice } from "@/lib/catalog/format";

export function CartPage() {
  const { items, ready, count, subtotal, update, remove } = useCart();
  const shops = new Set(items.map((item) => item.shop)).size;

  return <main className="cart-shell">
    <header className="market-nav">
      <Link href="/" className="brand-mark">yaqeen<span>✦</span></Link>
      <Link href="/catalogue" className="back-catalog">← Continuer mes achats</Link>
      <nav><span>Panier</span><b className="cart-count">{count}</b></nav>
    </header>
    <section className="cart-title">
      <p>VOTRE COMMANDE</p><h1>Votre panier<span>.</span></h1>
      <small>{count} {count > 1 ? "produits" : "produit"} · {shops} {shops > 1 ? "vendeurs" : "vendeur"}</small>
    </section>
    {!ready ? <section className="cart-empty"><div>◇</div><h2>Chargement du panier…</h2></section>
      : items.length === 0 ? <section className="cart-empty"><div>◇</div><h2>Votre panier est vide.</h2><p>Découvrez les produits proposés par nos vendeurs.</p><Link href="/catalogue">Voir le catalogue →</Link></section>
        : <section className="cart-layout">
          <div className="cart-items">{items.map((item) => <article className="cart-item" key={item.variantId}>
            <Link href={item.slug} className="cart-item-visual" style={{ backgroundColor: item.color }}><div className={`catalog-object ${item.shape}`}>Y</div></Link>
            <div className="cart-item-copy"><p>Vendu par {item.shop}</p><Link href={item.slug}>{item.name}</Link><span>Format standard</span>
              <div className="cart-item-actions"><div><button onClick={() => update(item.variantId, item.quantity - 1)}>−</button><span>{item.quantity}</span><button disabled={item.quantity >= item.stock} onClick={() => update(item.variantId, item.quantity + 1)}>＋</button></div><button onClick={() => remove(item.variantId)}>Retirer</button></div>
            </div><strong>{formatPrice(item.price * item.quantity, item.currency)}</strong>
          </article>)}</div>
          <aside className="cart-summary"><p>RÉCAPITULATIF</p><h2>Votre commande</h2><dl><div><dt>Sous-total</dt><dd>{formatPrice(subtotal)}</dd></div><div><dt>Livraison</dt><dd>0 € pendant le test</dd></div></dl><p className="shipping-notice">Le paiement est limité au bac à sable Stripe : aucune carte réelle ne peut être débitée. Les frais par vendeur seront branchés avant l’ouverture publique.</p><div className="cart-total"><span>Total test</span><strong>{formatPrice(subtotal)}</strong></div><Link className="checkout-button" href="/checkout">Tester le paiement sécurisé →</Link><small>Mode test uniquement · montant recalculé côté serveur.</small><div className="cart-promise"><span>✓</span><p><strong>Stock réservé pendant 15 minutes</strong><br />La commande n’est confirmée qu’après un webhook Stripe signé.</p></div></aside>
        </section>}
  </main>;
}
