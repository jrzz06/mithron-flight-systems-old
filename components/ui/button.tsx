import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { glassButtonClassName } from "@/lib/glass-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "type-button inline-flex max-w-full min-w-[var(--mobile-touch-min,44px)] touch-manipulation items-center justify-center gap-2 whitespace-normal text-sm transition-[background,color,border,box-shadow,transform] duration-[300ms] ease-[var(--ease-cinematic)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      wrap: {
        normal: "whitespace-normal",
        nowrap: "whitespace-nowrap"
      },
      variant: {
        default: "rounded-full border border-black/[0.06] bg-white/[0.85] text-[#0f172a] shadow-[0_20px_60px_rgba(10,20,40,.04)] hover:bg-white/[0.94] hover:shadow-[0_24px_72px_rgba(10,20,40,.065)]",
        accent: cn(glassButtonClassName(), "rounded-2xl"),
        accentCart: cn(glassButtonClassName({ cart: true }), "rounded-2xl"),
        ghost: "rounded-full bg-transparent text-current hover:bg-black/5",
        outline: "rounded-full border border-black/[0.06] bg-white/[0.85] text-foreground shadow-[0_20px_60px_rgba(10,20,40,.04)] hover:border-black/[0.08] hover:bg-white/[0.94] hover:shadow-[0_24px_72px_rgba(10,20,40,.065)]",
        glass: "rounded-full border border-white/[0.28] bg-white/[0.12] text-white hover:bg-white/[0.18]"
      },
      size: {
        default: "min-h-[var(--store-button-height,44px)] px-[var(--store-button-padding-x,22px)] py-2",
        sm: "min-h-[var(--store-button-height-sm,44px)] px-4 py-2 text-xs",
        lg: "min-h-[var(--store-button-height-lg,48px)] px-8 py-2.5 text-sm",
        icon: "size-[var(--store-button-height,44px)] min-h-[var(--store-button-height,44px)] min-w-[var(--store-button-height,44px)] p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      wrap: "normal"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, wrap, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, wrap, className }))} ref={ref} {...props} />;
  }
);

Button.displayName = "Button";
