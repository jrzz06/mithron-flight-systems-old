import { humanStatus } from "@/lib/platform/copy";

type StatusTone = {
  dot: string;
  surface: string;
  text: string;
};

function statusTone(status: string): StatusTone {
  const normalized = status.toLowerCase();

  if (/(blocked|failed|error|denied|cancelled|archived|out_of_stock|damaged|danger|critical|rejected)/.test(normalized)) {
    return {
      dot: "bg-[var(--platform-danger)]",
      surface: "bg-transparent border-transparent",
      text: "text-[var(--platform-danger)]"
    };
  }

  if (/(low_stock|partial|pending|draft|review|processing|packed|warning|reserved|unread|new)/.test(normalized)) {
    return {
      dot: "bg-[var(--platform-warning)]",
      surface: "bg-transparent border-transparent",
      text: "text-[var(--platform-warning)]"
    };
  }

  if (/(live|verified|success|published|available|delivered|shipped|ready|clear|read|approved|healthy|dispatched)/.test(normalized)) {
    return {
      dot: "bg-[var(--platform-success)]",
      surface: "bg-transparent border-transparent",
      text: "text-[var(--platform-success)]"
    };
  }

  return {
    dot: "bg-[var(--platform-text-muted)]",
    surface: "bg-transparent border-transparent",
    text: "text-[var(--platform-text-secondary)]"
  };
}

export function StatusPill({ status }: { status: string }) {
  const label = humanStatus(status);
  if (!label) return null;

  const tone = statusTone(status);

  return (
    <span
      aria-label={`Status: ${label}`}
      className={`inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tone.surface} ${tone.text}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
