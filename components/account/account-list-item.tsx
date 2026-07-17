import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type AccountListItemProps = {
  href: string;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  footer?: React.ReactNode;
  actionLabel?: string;
  className?: string;
};

export function AccountListItem({
  href,
  title,
  subtitle,
  meta,
  badges,
  footer,
  actionLabel = "View details",
  className
}: AccountListItemProps) {
  return (
    <article
      className={cn(
        "group relative rounded-[var(--account-radius-card)] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 transition-all duration-300",
        "hover:border-[var(--account-border-strong)] hover:shadow-[var(--account-shadow-md)] hover:-translate-y-0.5",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link href={href} className="block min-w-0">
            <p className="truncate font-semibold text-[var(--account-ink)] group-hover:text-[var(--account-accent)] transition-colors duration-300">
              {title}
            </p>
            {subtitle ? <p className="mt-1 text-sm text-[var(--account-ink-muted)]">{subtitle}</p> : null}
            {meta ? <div className="mt-2 text-sm text-[var(--account-ink-muted)]">{meta}</div> : null}
          </Link>
          {badges ? <div className="mt-3 flex flex-wrap gap-2">{badges}</div> : null}
          {footer ? <div className="mt-3 text-sm text-[var(--account-ink-muted)]">{footer}</div> : null}
        </div>
        <Link
          href={href}
          aria-label={`${actionLabel} for ${title}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--account-surface-muted)] text-[var(--account-ink-muted)] transition-all duration-300 group-hover:bg-[var(--account-accent)] group-hover:text-white group-hover:rotate-[-45deg] sm:self-center"
        >
          <ArrowRight className="size-5" />
        </Link>
      </div>
    </article>
  );
}
