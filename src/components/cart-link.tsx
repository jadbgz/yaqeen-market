"use client";
import Link from "next/link";
import { useCart } from "./cart-provider";

export function CartLink(){const {count}=useCart();return <Link href="/panier" className="nav-cart">Panier <b>{count}</b></Link>}
