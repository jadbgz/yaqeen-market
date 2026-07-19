import { getViewer } from "@/lib/auth/dal";
import { AccountAccessClient } from "@/components/account-access-client";

export async function AccountAccess({ redirectTo = "/compte" }: { redirectTo?: string } = {}) {
  const viewer = await getViewer();
  return <AccountAccessClient viewer={viewer} redirectTo={redirectTo} />;
}
