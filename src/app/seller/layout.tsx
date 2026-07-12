import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Yaqeen Seller — Pilotez votre boutique",
  description: "L’espace professionnel des vendeurs Yaqeen Market.",
};

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
