import { AccountLink } from "@/components/account";

export function AccountDataUnavailable({
  title = "We could not load this data right now.",
  description = "Your account is still signed in. Refresh the page or try again in a moment."
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      role="alert"
      data-account-data-unavailable
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-amber-900/80">{description}</p>
      <p className="mt-3">
        <AccountLink href="?retry=1">Try again</AccountLink>
      </p>
    </div>
  );
}
