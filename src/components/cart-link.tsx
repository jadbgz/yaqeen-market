"use client";
import Link from "next/link";
import { useCart } from "./cart-provider";

export function CartLink({variant="default"}:{variant?:"default"|"icon"}){
  const {count}=useCart();
  if(variant==="icon") return <Link href="/panier" aria-label={`Panier, ${count} article${count>1?"s":""}`} className="header-cart"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3.5 5h2l1.7 9.2h9.9l2-6.4H7"/><circle cx="9" cy="18.5" r="1.2"/><circle cx="17" cy="18.5" r="1.2"/></svg>{count>0&&<b>{count}</b>}</Link>;
  return <Link href="/panier" className="nav-cart">Panier <b>{count}</b></Link>;
}
