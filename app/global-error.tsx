"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { recordClientError } from "@/lib/observability";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    recordClientError({
      name: error.name,
      message: error.message,
      digest: error.digest,
      stack: error.stack
    });
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main data-global-error-boundary style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
          <h1>Something went wrong</h1>
          <p>We could not load this page. Please try again.</p>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
