import { getViewer } from "@/lib/auth/dal";
import { AccountAccessClient } from "@/components/account-access-client";

export async function AccountAccess() {
  const viewer = await getViewer();
  return <AccountAccessClient viewer={viewer} />;
}
