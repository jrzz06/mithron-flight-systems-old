import Link from "next/link";
import { cn } from "@/lib/utils";

type AccountLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

export function AccountLink({ href, children, className }: AccountLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "text-sm font-medium text-[var(--account-accent)] underline-offset-2 transition hover:underline",
        className
      )}
    >
      {children}
    </Link>
  );
}
