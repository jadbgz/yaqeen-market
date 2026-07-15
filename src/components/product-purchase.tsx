"use client";
import { useState } from "react";
import { useCart } from "./cart-provider";
import type { PublicProduct } from "@/lib/catalog/types";
import { productHref } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/catalog/format";

export function ProductPurchase({product}:{product:PublicProduct}){
  const [quantity,setQuantity]=useState(1);const [added,setAdded]=useState(false);const {add}=useCart();
  const handleAdd=()=>{if(product.stock<1)return;add({slug:productHref(product),name:product.name,shop:product.shop,price:product.price,color:product.color,shape:product.shape},quantity);setAdded(true);setTimeout(()=>setAdded(false),1800)};
  return <><div className="product-choice"><label>Format</label><div><button className="active" type="button">{product.variantTitle}</button></div></div><div className="product-buy"><div><button type="button" onClick={()=>setQuantity(q=>Math.max(1,q-1))} aria-label="Réduire la quantité">−</button><span>{quantity}</span><button type="button" disabled={quantity>=product.stock} onClick={()=>setQuantity(q=>Math.min(product.stock,q+1))} aria-label="Augmenter la quantité">＋</button></div><button type="button" disabled={product.stock<1} onClick={handleAdd} className={added?"added":""}>{product.stock<1?"Indisponible":added?"Ajouté au panier ✓":`Ajouter au panier · ${formatPrice(product.price*quantity,product.currency)}`}</button></div><p className="product-stock">{product.stock > 0 ? `${product.stock} disponible${product.stock > 1 ? "s" : ""}` : "Stock épuisé"}</p></>;
}
