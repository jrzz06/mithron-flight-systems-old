"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode
} from "react";

export type ProductPurchaseActionHandlers = {
  addToCart: () => void;
  buyNow: () => void;
  openEnquiry: () => void;
};

export type ProductPurchaseActions = ProductPurchaseActionHandlers & {
  isAdding: boolean;
};

const ProductPurchaseHandlersContext = createContext<ProductPurchaseActionHandlers | null>(null);
const ProductPurchaseAddingContext = createContext(false);
const ProductPurchaseRegistrationContext = createContext<
  ((handlers: ProductPurchaseActionHandlers | null, isAdding: boolean) => void) | null
>(null);

export function ProductPurchaseProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<ProductPurchaseActionHandlers | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const register = useCallback((nextHandlers: ProductPurchaseActionHandlers | null, nextIsAdding: boolean) => {
    setHandlers(nextHandlers);
    setIsAdding(nextIsAdding);
  }, []);

  return (
    <ProductPurchaseHandlersContext.Provider value={handlers}>
      <ProductPurchaseAddingContext.Provider value={isAdding}>
        <ProductPurchaseRegistrationContext.Provider value={register}>
          {children}
        </ProductPurchaseRegistrationContext.Provider>
      </ProductPurchaseAddingContext.Provider>
    </ProductPurchaseHandlersContext.Provider>
  );
}

export function useProductPurchaseHandlers() {
  return useContext(ProductPurchaseHandlersContext);
}

function useProductPurchaseActions() {
  const handlers = useContext(ProductPurchaseHandlersContext);
  const isAdding = useContext(ProductPurchaseAddingContext);
  if (!handlers) return null;
  return { ...handlers, isAdding };
}

export function useProductPurchaseIsAdding() {
  return useContext(ProductPurchaseAddingContext);
}

export function useRegisterProductPurchase(actions: ProductPurchaseActions | null) {
  const register = useContext(ProductPurchaseRegistrationContext);

  useLayoutEffect(() => {
    if (!register) return;
    if (!actions) {
      register(null, false);
      return () => register(null, false);
    }
    register(
      { addToCart: actions.addToCart, buyNow: actions.buyNow, openEnquiry: actions.openEnquiry },
      actions.isAdding
    );
    return () => register(null, false);
  }, [actions, register]);
}
