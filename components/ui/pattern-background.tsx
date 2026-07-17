import { Crown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./pattern-background.module.css";

export const PATTERN_DEFAULTS = {
  background: "#FAFAFA",
  strokeColor: "#E5E5E5",
  strokeWidth: 0.75,
  viewBoxSize: 100,
  clusters: [
    { cxPct: 8, cyPct: 12, maxRadiusPct: 32, ringCount: 28 },
    { cxPct: 72, cyPct: 18, maxRadiusPct: 26, ringCount: 22 },
    { cxPct: 38, cyPct: 55, maxRadiusPct: 30, ringCount: 26 },
    { cxPct: 88, cyPct: 68, maxRadiusPct: 22, ringCount: 20 },
    { cxPct: 18, cyPct: 82, maxRadiusPct: 24, ringCount: 22 },
    { cxPct: 58, cyPct: 28, maxRadiusPct: 18, ringCount: 16 }
  ] as const,
  badge: {
    size: 36,
    offset: 16,
    fill: "#6B6B6B",
    iconColor: "#F5A623",
    iconSize: 16
  }
} as const;

type PatternCircle = {
  key: string;
  cx: number;
  cy: number;
  r: number;
};

export function buildPatternCircles(
  clusters: typeof PATTERN_DEFAULTS.clusters = PATTERN_DEFAULTS.clusters
): PatternCircle[] {
  const circles: PatternCircle[] = [];

  clusters.forEach((cluster, clusterIndex) => {
    const gap = cluster.maxRadiusPct / cluster.ringCount;
    for (let ring = 1; ring <= cluster.ringCount; ring += 1) {
      circles.push({
        key: `${clusterIndex}-${ring}`,
        cx: cluster.cxPct,
        cy: cluster.cyPct,
        r: gap * ring
      });
    }
  });

  return circles;
}

const PATTERN_CIRCLES = buildPatternCircles();

export type PatternBackgroundProps = {
  children?: ReactNode;
  className?: string;
  showBadge?: boolean;
  badgeLabel?: string;
  borderRadius?: number;
  background?: string;
  strokeColor?: string;
  strokeWidth?: number;
};

export function PatternBackground({
  children,
  className,
  showBadge = false,
  badgeLabel = "Featured product",
  borderRadius = 24,
  background = PATTERN_DEFAULTS.background,
  strokeColor = PATTERN_DEFAULTS.strokeColor,
  strokeWidth = PATTERN_DEFAULTS.strokeWidth
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
      <svg
        className={styles.patternSvg}
        viewBox={`0 0 ${PATTERN_DEFAULTS.viewBoxSize} ${PATTERN_DEFAULTS.viewBoxSize}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        {PATTERN_CIRCLES.map((circle) => (
          <circle
            key={circle.key}
            cx={circle.cx}
            cy={circle.cy}
            r={circle.r}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

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
