"use client";

import { useActionState } from "react";
import {
  markShippedAction,
  startPreparationAction,
  type FulfillmentActionState,
} from "@/app/seller/commandes/fulfillment-actions";

const initialState: FulfillmentActionState = { status: "idle" };

export function SellerFulfillmentControls({ shopOrderId, status }: { shopOrderId: string; status: string }) {
  const [preparationState, prepare, preparationPending] = useActionState(startPreparationAction, initialState);
  const [shipmentState, ship, shipmentPending] = useActionState(markShippedAction, initialState);

  if (status === "paid") return <form action={prepare} className="seller-fulfillment-form">
    <input type="hidden" name="shopOrderId" value={shopOrderId} />
    <button type="submit" disabled={preparationPending}>{preparationPending ? "DÉMARRAGE…" : "COMMENCER LA PRÉPARATION →"}</button>
    {preparationState.message && <p className={preparationState.status} aria-live="polite">{preparationState.message}</p>}
  </form>;

  if (status === "preparing") return <form action={ship} className="seller-fulfillment-form shipment">
    <input type="hidden" name="shopOrderId" value={shopOrderId} />
    <label>Transporteur<input name="carrier" required minLength={2} maxLength={80} autoComplete="off" placeholder="Ex. Colissimo" /></label>
    <label>Numéro de suivi<input name="trackingNumber" required minLength={3} maxLength={80} autoComplete="off" pattern="[A-Za-z0-9._/\- ]+" placeholder="Ex. 8R12345678901" /></label>
    <button type="submit" disabled={shipmentPending}>{shipmentPending ? "ENREGISTREMENT…" : "CONFIRMER L’EXPÉDITION →"}</button>
    {shipmentState.message && <p className={shipmentState.status} aria-live="polite">{shipmentState.message}</p>}
  </form>;

  return null;
}
