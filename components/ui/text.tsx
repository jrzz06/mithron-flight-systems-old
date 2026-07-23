import * as React from "react";
import { cn } from "@/lib/utils";

interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "div";
  variant?: "body" | "badge" | "price" | "cta" | "meta";
}

const variantClasses = {
  body: "type-body",
  badge: "type-badge",
  price: "type-price",
  cta: "type-cta",
  meta: "type-meta",
} as const;

export function Text({
  as: Component = "p",
  variant = "body",
  className,
  children,
  ...props
}: TextProps) {
  return (
    <Component className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </Component>
  );
}
