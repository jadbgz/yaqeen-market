"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = { slug:string; name:string; shop:string; price:number; color:string; shape:string; quantity:number };
type CartContextValue = { items:CartItem[]; count:number; subtotal:number; add:(item:Omit<CartItem,"quantity">,quantity?:number)=>void; update:(slug:string,quantity:number)=>void; remove:(slug:string)=>void; clear:()=>void };

const CartContext=createContext<CartContextValue|null>(null);
const CART_STORAGE_KEY="yaqeen-cart-v2";

export function CartProvider({children}:{children:React.ReactNode}){
  const [items,setItems]=useState<CartItem[]>([]);
  const [ready,setReady]=useState(false);
  useEffect(()=>{queueMicrotask(()=>{try{const saved=localStorage.getItem(CART_STORAGE_KEY);if(saved)setItems(JSON.parse(saved));localStorage.removeItem("yaqeen-cart");}catch{}setReady(true)})},[]);
  useEffect(()=>{if(ready)localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(items))},[items,ready]);
  const value=useMemo<CartContextValue>(()=>({items,count:items.reduce((s,i)=>s+i.quantity,0),subtotal:items.reduce((s,i)=>s+i.price*i.quantity,0),add:(item,quantity=1)=>setItems(current=>{const found=current.find(i=>i.slug===item.slug);return found?current.map(i=>i.slug===item.slug?{...i,quantity:i.quantity+quantity}:i):[...current,{...item,quantity}]}),update:(slug,quantity)=>setItems(current=>quantity<1?current.filter(i=>i.slug!==slug):current.map(i=>i.slug===slug?{...i,quantity}:i)),remove:slug=>setItems(current=>current.filter(i=>i.slug!==slug)),clear:()=>setItems([])}),[items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(){const value=useContext(CartContext);if(!value)throw new Error("useCart must be used within CartProvider");return value;}
