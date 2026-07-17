import { isNextRedirect } from "@/lib/server-action-feedback";

/** Rethrow Next.js redirect/notFound errors from server action try/catch blocks. */
export function isActionNavigationError(error: unknown) {
  return isNextRedirect(error);
}
