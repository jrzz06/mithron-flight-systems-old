"use client";

import { useEffect, useRef } from "react";
import styles from "./platform-nav-badge.module.css";

type PlatformNavBadgeProps = {
  count: number;
  label: string;
};

export function PlatformNavBadge({ count, label }: PlatformNavBadgeProps) {
  const previousCountRef = useRef(count);
  const badgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (count <= 0) {
      previousCountRef.current = count;
      return;
    }

    if (count > previousCountRef.current && badgeRef.current) {
      badgeRef.current.classList.remove(styles.bump);
      void badgeRef.current.offsetWidth;
      badgeRef.current.classList.add(styles.bump);
    }

    previousCountRef.current = count;
  }, [count]);

  if (count <= 0) return null;

  return (
    <span
      ref={badgeRef}
      aria-label={`${count} ${label}`}
      className="rounded-full bg-[var(--platform-warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--platform-warning)]"
    >
      {count}
    </span>
  );
}
