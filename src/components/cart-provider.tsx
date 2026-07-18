"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = { variantId:string; slug:string; name:string; shop:string; price:number; currency:string; stock:number; color:string; shape:string; quantity:number };
type CartContextValue = { items:CartItem[]; ready:boolean; count:number; subtotal:number; add:(item:Omit<CartItem,"quantity">,quantity?:number)=>void; update:(variantId:string,quantity:number)=>void; remove:(variantId:string)=>void; clear:()=>void };

const CartContext=createContext<CartContextValue|null>(null);
const CART_STORAGE_KEY="yaqeen-cart-v3";

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.variantId === "string" && /^[0-9a-f-]{36}$/i.test(item.variantId)
    && typeof item.slug === "string" && item.slug.startsWith("/produit/")
    && typeof item.name === "string" && typeof item.shop === "string"
    && typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0
    && typeof item.currency === "string" && /^[A-Z]{3}$/.test(item.currency)
    && typeof item.stock === "number" && Number.isInteger(item.stock) && item.stock >= 0
    && typeof item.quantity === "number" && Number.isInteger(item.quantity)
    && item.quantity >= 1 && item.quantity <= Math.min(item.stock as number, 100)
    && typeof item.color === "string" && typeof item.shape === "string";
}

export function CartProvider({children}:{children:React.ReactNode}){
  const [items,setItems]=useState<CartItem[]>([]);
  const [ready,setReady]=useState(false);
  useEffect(()=>{queueMicrotask(()=>{try{const saved=localStorage.getItem(CART_STORAGE_KEY);const parsed=saved?JSON.parse(saved):[];if(Array.isArray(parsed))setItems(parsed.filter(isCartItem));localStorage.removeItem("yaqeen-cart");localStorage.removeItem("yaqeen-cart-v2");}catch{}setReady(true)})},[]);
  useEffect(()=>{if(ready)localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(items))},[items,ready]);
  const value=useMemo<CartContextValue>(()=>({items,ready,count:items.reduce((s,i)=>s+i.quantity,0),subtotal:items.reduce((s,i)=>s+i.price*i.quantity,0),add:(item,quantity=1)=>setItems(current=>{const bounded=Math.max(1,Math.min(quantity,item.stock,100));const found=current.find(i=>i.variantId===item.variantId);return found?current.map(i=>i.variantId===item.variantId?{...i,...item,quantity:Math.min(i.quantity+bounded,item.stock,100)}:i):[...current,{...item,quantity:bounded}]}),update:(variantId,quantity)=>setItems(current=>quantity<1?current.filter(i=>i.variantId!==variantId):current.map(i=>i.variantId===variantId?{...i,quantity:Math.min(quantity,i.stock,100)}:i)),remove:variantId=>setItems(current=>current.filter(i=>i.variantId!==variantId)),clear:()=>setItems([])}),[items,ready]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(){const value=useContext(CartContext);if(!value)throw new Error("useCart must be used within CartProvider");return value;}
