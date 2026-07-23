import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Opérations Yaqeen", robots: { index: false, follow: false } };

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/?auth=login&next=/operations/commandes");
  if (viewer.role !== "operator" && viewer.role !== "admin") redirect("/compte");
  if (viewer.aal !== "aal2") redirect("/compte/securite?mfa=required");
  return children;
}
