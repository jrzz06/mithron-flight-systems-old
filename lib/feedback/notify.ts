import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { createElement } from "react";
import { toast } from "sonner";

type NotifyVariant = "success" | "error" | "warning" | "info";

type NotifyOptions = {
  id?: string;
  description?: string;
  source?: string;
};

const recent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 2500;
const ERROR_DEDUPE_WINDOW_MS = 4000;

const VARIANT_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
} as const;

function now() {
  return Date.now();
}

function keyFor(variant: NotifyVariant, title: string, options?: NotifyOptions) {
  const source = options?.source ? `${options.source}:` : "";
  const description = options?.description ? `:${options.description}` : "";
  const id = options?.id ? `#${options.id}` : "";
  return `${source}${variant}:${title}${description}${id}`;
}

function shouldSkip(key: string, variant: NotifyVariant) {
  const last = recent.get(key);
  const ts = now();
  const windowMs = variant === "error" ? ERROR_DEDUPE_WINDOW_MS : DEDUPE_WINDOW_MS;
  if (typeof last === "number" && ts - last < windowMs) return true;
  recent.set(key, ts);
  return false;
}

function show(variant: NotifyVariant, title: string, options?: NotifyOptions) {
  const trimmedTitle = String(title ?? "").trim();
  if (!trimmedTitle) return;

  const key = keyFor(variant, trimmedTitle, options);
  if (shouldSkip(key, variant)) return;

  const Icon = VARIANT_ICONS[variant];
  const payload = {
    id: options?.id,
    description: options?.description,
    icon: createElement(Icon, { className: "h-4 w-4 shrink-0", "aria-hidden": true })
  };

  switch (variant) {
    case "success":
      toast.success(trimmedTitle, payload);
      return;
    case "warning":
      toast.warning(trimmedTitle, payload);
      return;
    case "info":
      toast.message(trimmedTitle, payload);
      return;
    case "error":
    default:
      toast.error(trimmedTitle, payload);
  }
}

export const notify = {
  success: (title: string, options?: NotifyOptions) => show("success", title, options),
  error: (title: string, options?: NotifyOptions) => show("error", title, options),
  warning: (title: string, options?: NotifyOptions) => show("warning", title, options),
  info: (title: string, options?: NotifyOptions) => show("info", title, options)
};
