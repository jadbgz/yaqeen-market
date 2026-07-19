import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import type { Product } from '@/data/catalog';
import { useCatalog } from '@/state/catalog';

export type CartLine = { product: Product; quantity: number };
type CartValue = {
  items: CartLine[];
  ready: boolean;
  add: (product: Product) => void;
  decrement: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: number;
  total: number;
};

type StoredLine = { variantId: string; quantity: number };
const storageKey = 'yaqeen-mobile-cart-v1';
const CartContext = createContext<CartValue | undefined>(undefined);

function parseStoredCart(value: string | null): StoredLine[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 50).flatMap((line): StoredLine[] => {
      if (!line || typeof line !== 'object') return [];
      const candidate = line as Partial<StoredLine>;
      if (typeof candidate.variantId !== 'string' || !Number.isInteger(candidate.quantity)) return [];
      return [{ variantId: candidate.variantId, quantity: Math.min(100, Math.max(1, candidate.quantity!)) }];
    });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: PropsWithChildren) {
  const { products, status } = useCatalog();
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (status !== 'ready' || hydrated) return;
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (!active) return;
        const stored = parseStoredCart(value);
        setItems(stored.flatMap((line): CartLine[] => {
          const product = products.find((candidate) => candidate.variantId === line.variantId);
          if (!product || product.stock < 1) return [];
          return [{ product, quantity: Math.min(line.quantity, product.stock) }];
        }));
        setHydrated(true);
      })
      .catch(() => active && setHydrated(true));
    return () => { active = false; };
  }, [hydrated, products, status]);

  const ready = hydrated && status === 'ready';
  useEffect(() => {
    if (!ready) return;
    const snapshot = items.map((line) => ({ variantId: line.product.variantId, quantity: line.quantity }));
    AsyncStorage.setItem(storageKey, JSON.stringify(snapshot)).catch(() => undefined);
  }, [items, ready]);

  const value = useMemo<CartValue>(() => ({
    items,
    ready,
    add: (product) => setItems((current) => {
      const line = current.find((item) => item.product.variantId === product.variantId);
      if ((line && line.quantity >= product.stock) || product.stock < 1) return current;
      return line
        ? current.map((item) => item.product.variantId === product.variantId ? { ...item, product, quantity: item.quantity + 1 } : item)
        : [...current, { product, quantity: 1 }];
    }),
    decrement: (id) => setItems((current) => current.flatMap((item) => item.product.id !== id ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [])),
    remove: (id) => setItems((current) => current.filter((item) => item.product.id !== id)),
    clear: () => setItems([]),
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    total: items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  }), [items, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart doit être utilisé dans CartProvider');
  return value;
}
