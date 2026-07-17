import type { ReactNode } from "react";

type PlatformActionBarProps = {
  children: ReactNode;
  className?: string;
};

export function PlatformActionBar({ children, className = "" }: PlatformActionBarProps) {
  return (
    <div data-platform-action-bar className={`platform-action-bar ${className}`.trim()}>
      {children}
    </div>
  );
}

export function PlatformActionGroup({
  children,
  variant = "default",
  className = ""
}: {
  children: ReactNode;
  variant?: "default" | "destructive";
  className?: string;
}) {
  return (
    <div
      className={`platform-action-group ${variant === "destructive" ? "platform-action-group--destructive" : ""} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
