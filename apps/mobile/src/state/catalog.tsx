import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CatalogConfigurationError, loadPublishedProducts, Product } from '@/data/catalog';

export type CatalogStatus = 'loading' | 'ready' | 'unconfigured' | 'error';
type CatalogValue = {
  products: Product[];
  status: CatalogStatus;
  refresh: () => void;
};

const CatalogContext = createContext<CatalogValue | undefined>(undefined);

export function CatalogProvider({ children }: PropsWithChildren) {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [requestVersion, setRequestVersion] = useState(0);
  const refresh = useCallback(() => {
    setStatus('loading');
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadPublishedProducts(controller.signal)
      .then((nextProducts) => {
        setProducts(nextProducts);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setProducts([]);
        setStatus(error instanceof CatalogConfigurationError ? 'unconfigured' : 'error');
      });
    return () => controller.abort();
  }, [requestVersion]);

  const value = useMemo(() => ({ products, status, refresh }), [products, refresh, status]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalog doit être utilisé dans CatalogProvider');
  return value;
}
