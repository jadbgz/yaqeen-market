"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart-provider";

export function ConfirmationStatus({ status }: { status: string }) {
  const router = useRouter();
  const { clear } = useCart();
  const cleared = useRef(false);

  useEffect(() => {
    if (status === "paid" && !cleared.current) {
      cleared.current = true;
      clear();
      sessionStorage.removeItem("yaqeen-checkout-token-v1");
      return;
    }
    if (status !== "pending_payment") return;
    const interval = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(interval);
  }, [clear, router, status]);

  if (status !== "pending_payment") return null;
  return <button type="button" onClick={() => router.refresh()}>ACTUALISER LE STATUT →</button>;
}
