export function isNextRedirect(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = String((error as { digest: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")) return true;
  }
  return error instanceof Error && error.message === "NEXT_REDIRECT";
}

export function actionErrorMessage(error: unknown, maxLength = 240): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, maxLength);
}
