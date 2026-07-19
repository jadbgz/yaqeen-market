"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PaymentState = { status: string; transfersEnabled: boolean; requirementsDue: number };

const labels: Record<string, string> = {
  not_started: "Activation non commencée",
  onboarding: "Informations en cours",
  restricted: "Action requise",
  enabled: "Compte de test opérationnel",
  disabled: "Compte désactivé",
};

export function SellerPaymentPanel({ state, configured }: { state: PaymentState; configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true); setError(null);
    const response = await fetch("/api/stripe/connect/onboarding", { method: "POST" });
    const body = await response.json() as { url?: string };
    if (response.ok && body.url) window.location.assign(body.url);
    else { setError("L’onboarding Stripe test n’a pas pu être ouvert."); setBusy(false); }
  }

  async function sync() {
    setBusy(true); setError(null);
    const response = await fetch("/api/stripe/connect/sync", { method: "POST" });
    if (response.ok) router.refresh();
    else setError("La synchronisation Stripe n’a pas abouti.");
    setBusy(false);
  }

  return <section className="seller-payment-panel"><div><p>PAIEMENTS VENDEUR · TEST</p><h2>{labels[state.status] ?? state.status}</h2><small>{state.transfersEnabled ? "Transferts activés" : `${state.requirementsDue} exigence(s) à traiter`}</small></div><div><span className={state.status === "enabled" ? "ready" : ""}>{state.status === "enabled" ? "✓" : "€"}</span><button disabled={!configured || busy} onClick={state.status === "not_started" ? start : sync}>{busy ? "CHARGEMENT…" : state.status === "not_started" ? "ACTIVER STRIPE TEST →" : "VÉRIFIER LE STATUT →"}</button>{state.status !== "enabled" && state.status !== "not_started" && <button disabled={!configured || busy} onClick={start}>REPRENDRE L’ONBOARDING</button>}</div>{!configured && <p>Configurez les clés Stripe test côté serveur pour activer ce parcours.</p>}{error && <p role="alert">{error}</p>}</section>;
}
