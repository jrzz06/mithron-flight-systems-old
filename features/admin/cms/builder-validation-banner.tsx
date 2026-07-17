"use client";

import type { CmsValidationError } from "@/lib/cms/section-validation";

export function BuilderValidationBanner({ errors }: { errors: CmsValidationError[] }) {
  if (!errors.length) return null;

  return (
    <div
      data-builder-validation-banner
      className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="alert"
    >
      <p className="font-medium">Fix these issues before publishing:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={`${error.field}-${error.message}`}>{error.message}</li>
        ))}
      </ul>
    </div>
  );
}
