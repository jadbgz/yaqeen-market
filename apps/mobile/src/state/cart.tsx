import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { Product } from '@/data/catalog';
export type CartLine={product:Product;quantity:number};
type CartValue={items:CartLine[];add:(product:Product)=>void;decrement:(id:string)=>void;remove:(id:string)=>void;clear:()=>void;count:number;total:number};
const CartContext=createContext<CartValue|undefined>(undefined);
export function CartProvider({children}:PropsWithChildren){
  const [items,setItems]=useState<CartLine[]>([]);
  const value=useMemo(()=>({items,add:(product:Product)=>setItems(current=>{const line=current.find(item=>item.product.id===product.id);if((line&&line.quantity>=product.stock)||product.stock<1)return current;return line?current.map(item=>item.product.id===product.id?{...item,product,quantity:item.quantity+1}:item):[...current,{product,quantity:1}]}),decrement:(id:string)=>setItems(current=>current.flatMap(item=>item.product.id!==id?[item]:item.quantity>1?[{...item,quantity:item.quantity-1}]:[])),remove:(id:string)=>setItems(current=>current.filter(item=>item.product.id!==id)),clear:()=>setItems([]),count:items.reduce((sum,item)=>sum+item.quantity,0),total:items.reduce((sum,item)=>sum+item.product.price*item.quantity,0)}),[items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
export function useCart(){const value=useContext(CartContext);if(!value)throw new Error('useCart doit être utilisé dans CartProvider');return value}
