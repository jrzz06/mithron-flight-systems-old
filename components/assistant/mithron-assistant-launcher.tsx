"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { glassButtonClassName } from "@/lib/glass-ui";
import { cn } from "@/lib/utils";
import styles from "./mithron-assistant-launcher.module.css";

const MithronAssistantPanel = dynamic(
  () =>
    import("@/components/assistant/mithron-assistant-panel").then(
      (mod) => mod.MithronAssistantPanel
    ),
  { ssr: false, loading: () => null }
);

function useJitteredInterval(callback: () => void, baseMs: number, jitterMs: number) {
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!alive) return;
      const next = baseMs + Math.floor(Math.random() * jitterMs);
      timer = setTimeout(() => {
        callback();
        schedule();
      }, next);
    };

    schedule();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [callback, baseMs, jitterMs]);
}

function productSlugFromPathname(pathname: string) {
  if (!pathname.startsWith("/product/")) return null;
  const slug = pathname.replace("/product/", "").split("/")[0]?.trim();
  return slug ? slug : null;
}

export function MithronAssistantLauncher() {
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const pathname = usePathname() ?? "";
  const selectedProductSlug = useMemo(() => productSlugFromPathname(pathname), [pathname]);

  useJitteredInterval(() => {
    if (open) return;
    setBump(true);
    const id = setTimeout(() => setBump(false), 820);
    return () => clearTimeout(id);
  }, 8000, 4000);

  return (
    <>
      {!open ? (
        <div className={styles.root} data-mithron-ai-launcher data-assistant-launcher>
          <button
            ref={buttonRef}
            type="button"
            aria-label="Open Mithron AI Assistant"
            className={cn(glassButtonClassName({ className: styles.button }), bump && styles.bump)}
            onClick={() => setOpen(true)}
          >
            <span className={styles.logoWrap} aria-hidden="true">
              <Image
                src="/favicon.svg"
                alt=""
                fill
                sizes="64px"
                className={styles.logo}
                priority={false}
              />
            </span>
            <span className={styles.tooltip} role="tooltip" aria-hidden="true">
              Mithron AI Assistant
            </span>
          </button>
        </div>
      ) : null}

      {open ? (
        <MithronAssistantPanel
          open={open}
          onClose={() => setOpen(false)}
          selectedProductSlug={selectedProductSlug}
        />
      ) : null}
    </>
  );
}

