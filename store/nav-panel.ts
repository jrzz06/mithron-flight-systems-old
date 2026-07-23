import { create } from "zustand";

export type NavPanel = null | "category" | "search" | "cart" | "profile" | "mobile";

export type NavPanelOpenSource = "hover" | "click" | "keyboard" | "programmatic";

type OpenOpts = {
  categoryKey?: string;
  source?: NavPanelOpenSource;
  /** Optional focus restore target when the panel closes. */
  triggerEl?: HTMLElement | null;
};

type NavPanelStore = {
  activePanel: NavPanel;
  categoryKey: string | null;
  exitingPanel: NavPanel;
  lastSource: NavPanelOpenSource | null;
  lastTriggerEl: HTMLElement | null;
  hasOpenedSearch: boolean;
  hasOpenedCart: boolean;
  hasOpenedProfile: boolean;
  openPanel: (panel: Exclude<NavPanel, null>, opts?: OpenOpts) => void;
  closePanel: () => void;
  setCategoryKey: (key: string | null) => void;
  clearExiting: () => void;
};

const OPEN_INTENT_MS = 60;
const CLOSE_INTENT_MS = 200;
const EXIT_MS = 280;

let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let exitTimer: ReturnType<typeof setTimeout> | null = null;
let pendingOpen: { panel: Exclude<NavPanel, null>; opts?: OpenOpts } | null = null;

function clearOpenTimer() {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  pendingOpen = null;
}

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function clearExitTimer() {
  if (exitTimer) {
    clearTimeout(exitTimer);
    exitTimer = null;
  }
}

function syncDocumentAttr(panel: NavPanel) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (panel) {
    root.setAttribute("data-nav-panel", panel);
    // Legacy attr for adaptive tone / existing CSS until fully migrated.
    root.setAttribute(
      "data-overlay-open",
      panel === "mobile" ? "mobile-menu" : panel === "search" ? "search" : panel
    );
  } else {
    root.removeAttribute("data-nav-panel");
    root.removeAttribute("data-overlay-open");
  }
}

function notifyCartBridge(panel: NavPanel) {
  // Lazy require to avoid circular init: cart store imports nav-panel for open wrappers.
  void import("@/store/cart")
    .then(({ useCartStore }) => {
      const cart = useCartStore.getState();
      if (panel === "cart") {
        if (!cart.isCartOpen) {
          useCartStore.setState({ isCartOpen: true, hasOpenedCart: true });
        }
      } else if (cart.isCartOpen) {
        useCartStore.setState({
          isCartOpen: false,
          cartDrawerMode: "cart",
          lastAddedLineKey: null
        });
      }
    })
    .catch(() => undefined);
}

export const useNavPanelStore = create<NavPanelStore>((set, get) => ({
  activePanel: null,
  categoryKey: null,
  exitingPanel: null,
  lastSource: null,
  lastTriggerEl: null,
  hasOpenedSearch: false,
  hasOpenedCart: false,
  hasOpenedProfile: false,

  openPanel(panel, opts) {
    clearOpenTimer();
    clearCloseTimer();
    clearExitTimer();

    const prev = get().activePanel;
    const nextCategory =
      panel === "category" ? (opts?.categoryKey ?? get().categoryKey) : get().categoryKey;

    if (prev === panel) {
      if (panel === "category" && opts?.categoryKey && opts.categoryKey !== get().categoryKey) {
        set({ categoryKey: opts.categoryKey });
      }
      if (opts?.triggerEl) {
        set({ lastTriggerEl: opts.triggerEl });
      }
      return;
    }

    set((state) => ({
      activePanel: panel,
      exitingPanel: prev && prev !== panel ? prev : null,
      categoryKey: panel === "category" ? nextCategory : state.categoryKey,
      lastSource: opts?.source ?? "programmatic",
      lastTriggerEl: opts?.triggerEl ?? state.lastTriggerEl,
      hasOpenedSearch: state.hasOpenedSearch || panel === "search",
      hasOpenedCart: state.hasOpenedCart || panel === "cart",
      hasOpenedProfile: state.hasOpenedProfile || panel === "profile"
    }));

    syncDocumentAttr(panel);
    notifyCartBridge(panel);

    if (prev && prev !== panel) {
      exitTimer = setTimeout(() => {
        if (get().exitingPanel === prev) {
          set({ exitingPanel: null });
        }
        exitTimer = null;
      }, EXIT_MS);
    }
  },

  closePanel() {
    clearOpenTimer();
    clearCloseTimer();
    clearExitTimer();

    const prev = get().activePanel;
    if (!prev) {
      syncDocumentAttr(null);
      return;
    }

    const trigger = get().lastTriggerEl;
    set({ activePanel: null, exitingPanel: prev, lastSource: null });
    syncDocumentAttr(null);
    notifyCartBridge(null);

    exitTimer = setTimeout(() => {
      if (get().exitingPanel === prev) {
        set({ exitingPanel: null });
      }
      exitTimer = null;
    }, EXIT_MS);

    if (trigger && typeof trigger.focus === "function") {
      requestAnimationFrame(() => {
        try {
          trigger.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      });
    }
  },

  setCategoryKey(key) {
    set({ categoryKey: key });
  },

  clearExiting() {
    clearExitTimer();
    set({ exitingPanel: null });
  }
}));

/** Schedule opening after hover intent delay (desktop). */
export function scheduleNavPanelOpen(
  panel: Exclude<NavPanel, null>,
  opts?: OpenOpts,
  delayMs = OPEN_INTENT_MS
) {
  clearCloseTimer();
  clearOpenTimer();
  pendingOpen = { panel, opts };
  openTimer = setTimeout(() => {
    const next = pendingOpen;
    openTimer = null;
    pendingOpen = null;
    if (!next) return;
    useNavPanelStore.getState().openPanel(next.panel, { ...next.opts, source: next.opts?.source ?? "hover" });
  }, delayMs);
}

/** Schedule closing after leave intent delay. */
export function scheduleNavPanelClose(delayMs = CLOSE_INTENT_MS) {
  clearOpenTimer();
  clearCloseTimer();
  closeTimer = setTimeout(() => {
    closeTimer = null;
    useNavPanelStore.getState().closePanel();
  }, delayMs);
}

export function cancelNavPanelSchedule() {
  clearOpenTimer();
  clearCloseTimer();
}

export const NAV_PANEL_OPEN_MS = OPEN_INTENT_MS;
export const NAV_PANEL_CLOSE_MS = CLOSE_INTENT_MS;
export const NAV_PANEL_MOTION_MS = EXIT_MS;
