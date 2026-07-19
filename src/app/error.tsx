"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    // Keep a local diagnostic until centralized error reporting is connected.
    console.error("Unhandled storefront error", error);
  }, [error]);

  return (
    <main className="status-shell">
      <Link href="/" className="brand-mark status-brand">yaqeen<span>✦</span></Link>
      <section className="status-copy">
        <p>INCIDENT TECHNIQUE</p>
        <h1>Un imprévu<br/>de notre côté<span>.</span></h1>
        <p className="status-lead">La page n’a pas pu être affichée. Réessayez — si le problème persiste, conservez la référence d’incident pour nous aider à retrouver l’erreur.</p>
        <div className="status-actions">
          <button onClick={unstable_retry} className="status-primary">Réessayer →</button>
          <Link href="/">Retour à l’accueil</Link>
        </div>
        {error.digest && <small className="status-digest">Référence incident : {error.digest}</small>}
      </section>
    </main>
  );
}
