"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { applyNavbarInkToDocument } from "@/lib/navbar-ink-document";
import {
  isFlushHeroDocument,
  NAVBAR_INK_SURFACE_SELECTOR,
  resolveNavbarTone
} from "@/lib/navbar-ink-resolver";
import type { NavbarInkTone } from "@/config/navbar-ink-registry";

const MIN_CHECK_INTERVAL_MS = 200;
const MUTATION_THROTTLE_MS = 120;

function isInteractionPaused() {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-overlay-open");
}

function isInkSurface(element: Element) {
  return element.matches(NAVBAR_INK_SURFACE_SELECTOR);
}

export function useAdaptiveNavbarTone(initialTone: NavbarInkTone = "dark") {
  const pathname = usePathname();
  const [tone, setTone] = useState(initialTone);
  const toneRef = useRef(initialTone);
  const pathToneRef = useRef(initialTone);
  const pathnameRef = useRef(pathname);
  const lastCheckAtRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const lastMutationAtRef = useRef(0);
  const hasMountedRef = useRef(false);

  pathnameRef.current = pathname;

  const applyTone = (nextTone: NavbarInkTone, options?: { markHydrated?: boolean }) => {
    const docInk = document.documentElement.getAttribute("data-nav-ink");
    const stateChanged = toneRef.current !== nextTone;
    const docChanged = docInk !== nextTone;

    if (!stateChanged && !docChanged) return;

    toneRef.current = nextTone;
    setTone(nextTone);

    if (docChanged) {
      applyNavbarInkToDocument(nextTone, { markHydrated: options?.markHydrated });
    } else if (options?.markHydrated) {
      applyNavbarInkToDocument(nextTone, { markHydrated: true });
    }
  };

  const syncTone = () => resolveNavbarTone(pathToneRef.current, pathnameRef.current);

  useLayoutEffect(() => {
    pathToneRef.current = initialTone;
    const resolved = syncTone();
    toneRef.current = resolved;
    setTone(resolved);
    applyNavbarInkToDocument(resolved, { markHydrated: true });
  }, [initialTone]);

  useLayoutEffect(() => {
    hasMountedRef.current = true;
    if (isInteractionPaused()) return;

    applyTone(syncTone(), { markHydrated: true });
    lastCheckAtRef.current = performance.now();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryRafId: number | null = null;
    const observedSurfaces = new WeakSet<Element>();

    const runToneCheck = (markHydrated = false) => {
      if (cancelled || !hasMountedRef.current || isInteractionPaused()) return;
      applyTone(syncTone(), markHydrated ? { markHydrated: true } : undefined);
      lastCheckAtRef.current = performance.now();
    };

    const scheduleToneCheck = (force = false) => {
      if (cancelled || rafIdRef.current !== null) return;

      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (cancelled || !hasMountedRef.current) return;
        const elapsed = performance.now() - lastCheckAtRef.current;
        if (!force && elapsed < MIN_CHECK_INTERVAL_MS) {
          scheduleToneCheck();
          return;
        }
        runToneCheck();
      });
    };

    const attachSurfaceObservers = (
      surface: Element,
      surfaceObserver: IntersectionObserver,
      surfaceMutationObserver: MutationObserver
    ) => {
      if (observedSurfaces.has(surface)) return;
      observedSurfaces.add(surface);
      surfaceObserver.observe(surface);
      surfaceMutationObserver.observe(surface, {
        attributes: true,
        attributeFilter: ["data-navbar-ink", "data-hero-slide-state"],
        subtree: surface.id === "hero"
      });
    };

    const scanForSurfaces = (
      surfaceObserver: IntersectionObserver,
      surfaceMutationObserver: MutationObserver,
      root: ParentNode = document
    ) => {
      const surfaces = root.querySelectorAll(NAVBAR_INK_SURFACE_SELECTOR);
      for (const surface of surfaces) {
        attachSurfaceObservers(surface, surfaceObserver, surfaceMutationObserver);
      }
    };

    const retryUntilSurfacesReady = () => {
      if (cancelled || !hasMountedRef.current) return;
      scheduleToneCheck(true);
      const hasSurfaces = Boolean(document.querySelector(NAVBAR_INK_SURFACE_SELECTOR));
      if (!hasSurfaces && !isFlushHeroDocument()) {
        retryRafId = window.requestAnimationFrame(retryUntilSurfacesReady);
      }
    };
    retryUntilSurfacesReady();

    const onResize = () => {
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => scheduleToneCheck(true), 150);
    };

    const onScroll = () => scheduleToneCheck();
    const onMediaReady = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement || target instanceof HTMLVideoElement) {
        scheduleToneCheck(true);
      }
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("load", onMediaReady, true);

    const surfaceObserver = new IntersectionObserver(() => scheduleToneCheck(true), {
      threshold: [0, 0.25, 0.5, 0.75, 1]
    });

    const onSurfaceMutation = () => {
      const now = performance.now();
      if (now - lastMutationAtRef.current < MUTATION_THROTTLE_MS) return;
      lastMutationAtRef.current = now;
      scheduleToneCheck();
    };

    const surfaceMutationObserver = new MutationObserver(onSurfaceMutation);
    const rootMutationObserver = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (isInkSurface(node) || node.querySelector(NAVBAR_INK_SURFACE_SELECTOR)) {
            shouldScan = true;
            break;
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        scanForSurfaces(surfaceObserver, surfaceMutationObserver);
      }
      onSurfaceMutation();
    });

    scanForSurfaces(surfaceObserver, surfaceMutationObserver);

    rootMutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-overlay-open", "data-nav-ink"],
      childList: true,
      subtree: true
    });

    return () => {
      cancelled = true;
      hasMountedRef.current = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("load", onMediaReady, true);
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      if (rafIdRef.current !== null) window.cancelAnimationFrame(rafIdRef.current);
      if (retryRafId !== null) window.cancelAnimationFrame(retryRafId);
      surfaceObserver.disconnect();
      surfaceMutationObserver.disconnect();
      rootMutationObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current || isInteractionPaused()) return;
    pathToneRef.current = initialTone;
    applyTone(syncTone());
    lastCheckAtRef.current = performance.now();
  }, [pathname, initialTone]);

  return { tone };
}
