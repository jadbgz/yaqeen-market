import "server-only";

import type Stripe from "stripe";
import { getViewer } from "@/lib/auth/dal";
import { getStripe } from "@/lib/payments/stripe";
import { getSellerDashboard } from "@/lib/seller/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/supabase/config";

function localAccountStatus(account: Stripe.Account) {
  if (account.capabilities?.transfers === "active") return "enabled";
  if (account.requirements?.disabled_reason || account.future_requirements?.disabled_reason) return "restricted";
  return "onboarding";
}

async function syncAccount(shopId: string, account: Stripe.Account) {
  const admin = createAdminClient();
  const due = new Set([
    ...(account.requirements?.currently_due ?? []),
    ...(account.future_requirements?.currently_due ?? []),
  ]).size;
  const transfersEnabled = account.capabilities?.transfers === "active";
  const { error } = await admin.rpc("sync_stripe_payment_account", {
    requested_shop_id: shopId,
    requested_provider_account_id: account.id,
    requested_status: localAccountStatus(account),
    requested_transfers_enabled: transfersEnabled,
    requested_requirements_due_count: due,
  });
  if (error) throw new Error(error.message);
  return { status: localAccountStatus(account), transfersEnabled, requirementsDue: due };
}

async function requireApprovedSeller() {
  const [viewer, dashboard] = await Promise.all([getViewer(), getSellerDashboard()]);
  if (!viewer) throw new Error("authentication_required");
  if (!dashboard || dashboard.shop.status !== "approved") throw new Error("approved_shop_required");
  return { viewer, dashboard };
}

async function getExistingAccountId(shopId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("shop_payment_accounts")
    .select("provider_account_id")
    .eq("shop_id", shopId)
    .maybeSingle();
  return data?.provider_account_id ?? null;
}

export async function createStripeOnboardingLink() {
  const { viewer, dashboard } = await requireApprovedSeller();
  const stripe = getStripe();
  const existingAccountId = await getExistingAccountId(dashboard.shop.id);
  const account = existingAccountId
    ? await stripe.accounts.retrieve(existingAccountId)
    : await stripe.accounts.create({
        country: dashboard.shop.shipsFromCountry,
        email: viewer.email ?? undefined,
        controller: {
          fees: { payer: "application" },
          losses: { payments: "application" },
          requirement_collection: "stripe",
          stripe_dashboard: { type: "express" },
        },
        capabilities: { transfers: { requested: true } },
        business_profile: { product_description: "Vente de produits vérifiés sur Yaqeen Market" },
        metadata: { yaqeen_shop_id: dashboard.shop.id },
      }, { idempotencyKey: `connect:${dashboard.shop.id}:account:v1` });

  if (account.deleted) throw new Error("stripe_account_deleted");
  await syncAccount(dashboard.shop.id, account);
  const origin = getSiteUrl();
  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${origin}/seller?stripe_connect=refresh`,
    return_url: `${origin}/seller?stripe_connect=return`,
    type: "account_onboarding",
  });
  return link.url;
}

export async function refreshStripeAccount() {
  const { dashboard } = await requireApprovedSeller();
  const accountId = await getExistingAccountId(dashboard.shop.id);
  if (!accountId) throw new Error("stripe_account_not_started");
  const account = await getStripe().accounts.retrieve(accountId);
  if (account.deleted) throw new Error("stripe_account_deleted");
  return syncAccount(dashboard.shop.id, account);
}
