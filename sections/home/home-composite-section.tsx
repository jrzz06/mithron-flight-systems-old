"use client";

import type { ReactNode } from "react";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";
import styles from "./home-landing-composite.module.css";

export function HomeCompositeSection({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotionPreference();
  const motionState = reducedMotion ? "reduced" : "static";

  return (
    <section
      className={styles.root}
      data-testid="home-landing-composite"
      data-home-composite-root="true"
      data-motion-state={motionState}
      data-motion-engine="static"
      aria-label="Mithron home landing composite"
    >
      {children}
    </section>
  );
}
