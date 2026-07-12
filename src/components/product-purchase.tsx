"use client";
import { useState } from "react";
import { useCart } from "./cart-provider";
import type { Product } from "@/data/products";
import { formatPrice } from "@/data/products";

export function ProductPurchase({product}:{product:Product}){
  const [quantity,setQuantity]=useState(1);const [added,setAdded]=useState(false);const {add}=useCart();
  const handleAdd=()=>{add({slug:product.slug,name:product.name,shop:product.shop,price:product.price,color:product.color,shape:product.shape},quantity);setAdded(true);setTimeout(()=>setAdded(false),1800)};
  return <><div className="product-choice"><label>Format</label><div><button className="active">Standard</button><button>Découverte</button></div></div><div className="product-buy"><div><button onClick={()=>setQuantity(q=>Math.max(1,q-1))} aria-label="Réduire la quantité">−</button><span>{quantity}</span><button onClick={()=>setQuantity(q=>q+1)} aria-label="Augmenter la quantité">＋</button></div><button onClick={handleAdd} className={added?"added":""}>{added?"Ajouté au panier ✓":`Ajouter au panier · ${formatPrice(product.price*quantity)}`}</button></div></>;
}
