import { create } from "zustand";

type Overlay = "search" | "mobile-menu" | null;

type UiStore = {
  overlay: Overlay;
  megaMenuOpen: boolean;
  hasOpenedSearch: boolean;
  setOverlay: (overlay: Overlay) => void;
  setMegaMenuOpen: (open: boolean) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  overlay: null,
  megaMenuOpen: false,
  hasOpenedSearch: false,
  setOverlay: (overlay) => set((state) => ({ overlay, hasOpenedSearch: state.hasOpenedSearch || overlay === "search" })),
  setMegaMenuOpen: (megaMenuOpen) => set({ megaMenuOpen })
}));
