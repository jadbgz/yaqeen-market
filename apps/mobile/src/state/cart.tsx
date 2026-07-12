import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { Product } from '@/data/products';
export type CartLine={product:Product;quantity:number};
type CartValue={items:CartLine[];add:(product:Product)=>void;decrement:(slug:string)=>void;remove:(slug:string)=>void;clear:()=>void;count:number;total:number};
const CartContext=createContext<CartValue|undefined>(undefined);
export function CartProvider({children}:PropsWithChildren){
  const [items,setItems]=useState<CartLine[]>([]);
  const value=useMemo(()=>({items,add:(product:Product)=>setItems(current=>{const line=current.find(item=>item.product.slug===product.slug);return line?current.map(item=>item.product.slug===product.slug?{...item,quantity:item.quantity+1}:item):[...current,{product,quantity:1}]}),decrement:(slug:string)=>setItems(current=>current.flatMap(item=>item.product.slug!==slug?[item]:item.quantity>1?[{...item,quantity:item.quantity-1}]:[])),remove:(slug:string)=>setItems(current=>current.filter(item=>item.product.slug!==slug)),clear:()=>setItems([]),count:items.reduce((sum,item)=>sum+item.quantity,0),total:items.reduce((sum,item)=>sum+item.product.price*item.quantity,0)}),[items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
export function useCart(){const value=useContext(CartContext);if(!value)throw new Error('useCart doit être utilisé dans CartProvider');return value}
