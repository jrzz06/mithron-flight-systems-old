"use client";

import { createContext, useContext, type RefObject } from "react";

const NavAnchorContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function NavAnchorProvider({
  navRef,
  children
}: {
  navRef: RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  return <NavAnchorContext.Provider value={navRef}>{children}</NavAnchorContext.Provider>;
}

export function useNavAnchorRef() {
  return useContext(NavAnchorContext);
}
