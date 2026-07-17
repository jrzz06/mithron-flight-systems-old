import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-2xl bg-slate-200/80 motion-reduce:animate-none motion-reduce:opacity-60 dark:bg-white/[0.08]", className)}
      {...props}
    />
  );
}
