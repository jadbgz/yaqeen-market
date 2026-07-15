import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/components/cart-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yaqeen Market — La marketplace halal de confiance",
  description: "Livres, mode, parfums, beauté et bien-être : découvrez des boutiques engagées et des produits sélectionnés avec soin.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><div className="prototype-banner">VERSION DE DÉVELOPPEMENT · COMMANDES ET PAIEMENTS DÉSACTIVÉS</div><CartProvider>{children}</CartProvider></body>
    </html>
  );
}
