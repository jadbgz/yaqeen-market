"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type FulfillmentActionState = { status: "idle" | "success" | "error"; message?: string };

const orderIdSchema = z.uuid();
const shipmentSchema = z.object({
  shopOrderId: z.uuid(),
  carrier: z.string().trim().min(2).max(80),
  trackingNumber: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._/\- ]+$/),
}).strict();

function safeMessage(message: string) {
  if (message.includes("shop_order_membership_required")) return "Cette commande n’appartient pas à votre boutique.";
  if (message.includes("shop_order_not_preparable")) return "Cette commande ne peut pas entrer en préparation.";
  if (message.includes("preparation_required_before_shipping")) return "Commencez la préparation avant d’enregistrer l’expédition.";
  if (message.includes("shipment_already_recorded")) return "L’expédition a déjà été enregistrée avec un autre suivi.";
  return "La transition a été refusée. Actualisez la page puis réessayez.";
}

export async function startPreparationAction(
  _previous: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  if (!await getViewer()) return { status: "error", message: "Reconnectez-vous avant de continuer." };
  const parsed = orderIdSchema.safeParse(formData.get("shopOrderId"));
  if (!parsed.success) return { status: "error", message: "Identifiant de commande invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_shop_order_preparation", { requested_shop_order_id: parsed.data });
  if (error) return { status: "error", message: safeMessage(error.message) };
  revalidatePath("/seller");
  revalidatePath("/seller/commandes");
  revalidatePath("/compte/commandes");
  return { status: "success", message: "Préparation démarrée et client informé dans son suivi." };
}

export async function markShippedAction(
  _previous: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  if (!await getViewer()) return { status: "error", message: "Reconnectez-vous avant de continuer." };
  const parsed = shipmentSchema.safeParse({
    shopOrderId: formData.get("shopOrderId"),
    carrier: formData.get("carrier"),
    trackingNumber: formData.get("trackingNumber"),
  });
  if (!parsed.success) return { status: "error", message: "Transporteur ou numéro de suivi invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_shop_order_shipped", {
    requested_shop_order_id: parsed.data.shopOrderId,
    requested_shipping_carrier: parsed.data.carrier,
    requested_tracking_number: parsed.data.trackingNumber,
  });
  if (error) return { status: "error", message: safeMessage(error.message) };
  revalidatePath("/seller");
  revalidatePath("/seller/commandes");
  revalidatePath("/compte/commandes");
  return { status: "success", message: "Expédition enregistrée. Le suivi client a été recalculé." };
}
