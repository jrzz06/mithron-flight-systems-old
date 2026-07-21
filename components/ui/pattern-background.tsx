import { Crown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./pattern-background.module.css";

export const PATTERN_DEFAULTS = {
  background: "#FAFAFA",
  badge: {
    size: 36,
    offset: 16,
    fill: "#6B6B6B",
    iconColor: "#F5A623",
    iconSize: 16
  }
} as const;

export type PatternBackgroundProps = {
  children?: ReactNode;
  className?: string;
  showBadge?: boolean;
  badgeLabel?: string;
  borderRadius?: number;
  background?: string;
};

export function PatternBackground({
  children,
  className,
  showBadge = false,
  badgeLabel = "Featured product",
  borderRadius = 24,
  background = PATTERN_DEFAULTS.background
}: PatternBackgroundProps) {
  const containerStyle = {
    "--pattern-radius": `${borderRadius}px`,
    "--pattern-bg": background,
    "--pattern-badge-size": `${PATTERN_DEFAULTS.badge.size}px`,
    "--pattern-badge-offset": `${PATTERN_DEFAULTS.badge.offset}px`,
    "--pattern-badge-fill": PATTERN_DEFAULTS.badge.fill,
    "--pattern-badge-icon": PATTERN_DEFAULTS.badge.iconColor
  } as CSSProperties;

  return (
    <div className={cn(styles.root, className)} style={containerStyle} data-pattern-background>
      <div className={styles.stagePattern} aria-hidden="true" />

      {showBadge ? (
        <div className={styles.badge} aria-label={badgeLabel} data-testid="pattern-background-badge">
          <Crown
            className={styles.badgeIcon}
            size={PATTERN_DEFAULTS.badge.iconSize}
            strokeWidth={2}
            aria-hidden="true"
          />
        </div>
      ) : null}

      {children ? <div className={styles.content}>{children}</div> : null}
    </div>
  );
}
