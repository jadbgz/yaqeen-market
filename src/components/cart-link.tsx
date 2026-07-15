"use client";
import Link from "next/link";
import { useCart } from "./cart-provider";

export function CartLink({variant="default"}:{variant?:"default"|"icon"}){
  const {count}=useCart();
  if(variant==="icon") return <Link href="/panier" aria-label={`Panier, ${count} article${count>1?"s":""}`} className="ml-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#24231f] text-[11px] text-[#f3efe5]">{count}</Link>;
  return <Link href="/panier" className="nav-cart">Panier <b>{count}</b></Link>;
}
