"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaces the failure in browser and platform logs until Sentry lands.
    console.error("Unhandled storefront error", error);
  }, [error]);

  return (
    <main className="status-shell">
      <Link href="/" className="brand-mark status-brand">yaqeen<span>✦</span></Link>
      <section className="status-copy">
        <p>INCIDENT TECHNIQUE</p>
        <h1>Un imprévu<br/>de notre côté<span>.</span></h1>
        <p className="status-lead">La page n’a pas pu être affichée. Vos données et votre panier ne sont pas affectés. Réessayez — si le problème persiste, il est déjà visible dans nos journaux.</p>
        <div className="status-actions">
          <button onClick={reset} className="status-primary">Réessayer →</button>
          <Link href="/">Retour à l’accueil</Link>
        </div>
        {error.digest && <small className="status-digest">Référence incident : {error.digest}</small>}
      </section>
    </main>
  );
}
