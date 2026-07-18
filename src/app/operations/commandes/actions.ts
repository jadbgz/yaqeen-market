"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { releaseSellerTransfer } from "@/lib/payments/transfers";
import { initiateShopOrderRefund } from "@/lib/payments/refunds";
import { createClient } from "@/lib/supabase/server";

async function requireOperator() {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "operator" && viewer.role !== "admin")) redirect("/");
}

export async function confirmDeliveryAction(formData: FormData) {
  await requireOperator();
  const parsed = z.object({
    shopOrderId: z.uuid(),
    rationale: z.string().trim().min(10).max(1000),
  }).safeParse({ shopOrderId: formData.get("shopOrderId"), rationale: formData.get("rationale") });
  if (!parsed.success) redirect("/operations/commandes?error=confirmation_invalide");
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_shop_order_delivery", {
    requested_shop_order_id: parsed.data.shopOrderId,
    requested_rationale: parsed.data.rationale,
  });
  if (error) redirect("/operations/commandes?error=confirmation_refusee");
  revalidatePath("/operations/commandes");
  revalidatePath("/seller/commandes");
  revalidatePath("/compte/commandes");
  redirect("/operations/commandes?confirmed=1");
}

export async function releaseTransferAction(formData: FormData) {
  await requireOperator();
  const parsed = z.uuid().safeParse(formData.get("shopOrderId"));
  if (!parsed.success) redirect("/operations/commandes?error=transfert_invalide");
  try {
    await releaseSellerTransfer(parsed.data);
  } catch {
    redirect("/operations/commandes?error=transfert_refuse");
  }
  revalidatePath("/operations/commandes");
  revalidatePath("/seller");
  redirect("/operations/commandes?transferred=1");
}

export async function refundShopOrderAction(formData: FormData) {
  await requireOperator();
  const parsed = z.object({
    shopOrderId: z.uuid(),
    reasonCode: z.enum(["requested_by_customer", "duplicate", "fraudulent"]),
    rationale: z.string().trim().min(10).max(1000),
  }).safeParse({
    shopOrderId: formData.get("shopOrderId"),
    reasonCode: formData.get("reasonCode"),
    rationale: formData.get("rationale"),
  });
  if (!parsed.success) redirect("/operations/commandes?error=remboursement_invalide");
  try {
    await initiateShopOrderRefund(parsed.data);
  } catch {
    redirect("/operations/commandes?error=remboursement_refuse");
  }
  revalidatePath("/operations/commandes");
  revalidatePath("/seller/commandes");
  revalidatePath("/compte/commandes");
  redirect("/operations/commandes?refunded=1");
}
