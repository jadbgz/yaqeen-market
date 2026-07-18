"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type AccountActionState = { status: "idle" | "success" | "error"; message?: string };

const addressSchema = z.object({
  addressId: z.uuid().optional(),
  label: z.string().trim().min(2).max(40),
  recipientName: z.string().trim().min(2).max(120),
  line1: z.string().trim().min(3).max(180),
  line2: z.string().trim().max(180).optional(),
  postalCode: z.string().trim().min(2).max(20),
  city: z.string().trim().min(2).max(100),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  phone: z.string().trim().max(32).optional(),
  isDefault: z.boolean(),
});

async function requireAccount() {
  const viewer = await getViewer();
  if (!viewer) throw new Error("authentication_required");
  return createClient();
}

export async function saveAddress(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = addressSchema.safeParse({
    addressId: formData.get("addressId") || undefined,
    label: formData.get("label"),
    recipientName: formData.get("recipientName"),
    line1: formData.get("line1"),
    line2: formData.get("line2") || undefined,
    postalCode: formData.get("postalCode"),
    city: formData.get("city"),
    countryCode: formData.get("countryCode"),
    phone: formData.get("phone") || undefined,
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) return { status: "error", message: "Vérifiez les champs de l’adresse." };

  try {
    const supabase = await requireAccount();
    const { error } = await supabase.rpc("save_customer_address", {
      requested_address_id: parsed.data.addressId ?? null,
      requested_label: parsed.data.label,
      requested_recipient_name: parsed.data.recipientName,
      requested_line1: parsed.data.line1,
      requested_line2: parsed.data.line2 ?? null,
      requested_postal_code: parsed.data.postalCode,
      requested_city: parsed.data.city,
      requested_country_code: parsed.data.countryCode,
      requested_phone: parsed.data.phone ?? null,
      requested_is_default: parsed.data.isDefault,
    });
    if (error) throw error;
    revalidatePath("/compte/adresses");
    return { status: "success", message: "Adresse enregistrée." };
  } catch {
    return { status: "error", message: "L’adresse n’a pas pu être enregistrée." };
  }
}

export async function deleteAddress(formData: FormData) {
  const addressId = z.uuid().safeParse(formData.get("addressId"));
  if (!addressId.success) return;
  const supabase = await requireAccount();
  await supabase.rpc("delete_customer_address", { requested_address_id: addressId.data });
  revalidatePath("/compte/adresses");
}

export async function requestAccountDeletion() {
  const supabase = await requireAccount();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) throw new Error("account_deletion_request_failed");
  revalidatePath("/compte/securite");
}

export async function cancelAccountDeletion() {
  const supabase = await requireAccount();
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) throw new Error("account_deletion_cancellation_failed");
  revalidatePath("/compte/securite");
}
