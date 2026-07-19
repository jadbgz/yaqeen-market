import { redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout-client";
import { getCustomerAddresses } from "@/lib/account/dal";
import { getViewer } from "@/lib/auth/dal";
import { getStripeTestConfig, isStripeTestCheckoutConfigured } from "@/lib/payments/config";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const metadata = { title: "Paiement sécurisé — Yaqeen Market" };

export default async function CheckoutPage() {
  if (!getSupabaseConfig()) {
    return <CheckoutClient addresses={[]} publishableKey={null} configured={false} />;
  }
  const viewer = await getViewer();
  if (!viewer) redirect("/?auth=login&next=/checkout");
  const addresses = await getCustomerAddresses();
  const configured = isStripeTestCheckoutConfigured();
  const publishableKey = configured ? getStripeTestConfig()?.publishableKey ?? null : null;
  return <CheckoutClient addresses={addresses} publishableKey={publishableKey} configured={configured} />;
}
