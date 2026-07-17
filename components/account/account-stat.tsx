import Link from "next/link";
import { cn } from "@/lib/utils";

type AccountStatProps = {
  label: string;
  value: string | number;
  href?: string;
  className?: string;
};

export function AccountStat({ label, value, href, className }: AccountStatProps) {
  const content = (
    <>
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--account-ink-muted)]">
        {label}
      </p>
      <p className="font-display mt-1 text-4xl font-semibold tracking-tight text-[var(--account-ink)]">
        {value}
      </p>
    </>
  );

  const baseClasses = cn(
    "group rounded-[var(--account-radius-card)] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 transition-all duration-300",
    "hover:border-[var(--account-accent)]/20 hover:bg-[var(--account-accent-gradient)] hover:shadow-[var(--account-shadow-md)] hover:-translate-y-1",
    className
  );

  if (href) {
    return (
      <Link href={href} className={baseClasses}>
        {content}
      </Link>
    );
  }

  return <div className={baseClasses}>{content}</div>;
}
