import * as React from "react";
import { cn } from "@/lib/utils";

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  variant?: "hero" | "page" | "section" | "product" | "card";
}

const variantClasses = {
  hero: "type-hero",
  page: "type-page",
  section: "type-section",
  product: "type-product-title",
  card: "type-card-title",
} as const;

export function Heading({
  as: Component = "h2",
  variant = "section",
  className,
  children,
  ...props
}: HeadingProps) {
  return (
    <Component className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </Component>
  );
}
