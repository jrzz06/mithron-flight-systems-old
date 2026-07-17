import type { CatalogDataError } from "@/services/catalog";

function partitionCatalogErrors(errors: CatalogDataError[]) {
  const unavailable = errors.filter((error) => error.code === "catalog_unavailable");
  const integrity = errors.filter((error) => error.code !== "catalog_unavailable");
  return { unavailable, integrity };
}

export function CatalogIntegrityNotice({ errors }: { errors: CatalogDataError[] }) {
  if (!errors.length) return null;

  const { unavailable, integrity } = partitionCatalogErrors(errors);

  return (
    <>
      {unavailable.length ? (
        <div
          role="alert"
          data-catalog-unavailable-notice
          className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-[#334155]"
        >
          <div className="mx-auto flex w-full max-w-[1740px] flex-col gap-2">
            <p className="text-sm font-semibold tracking-tight">Products are temporarily unavailable</p>
            <p className="text-sm text-[#64748b]">
              Mithron could not load products reliably. Navigation may be limited until the connection recovers. Refresh the page or try again shortly.
            </p>
            {unavailable.map((error) => (
              <p key={`${error.slug}-${error.message}`} className="text-xs text-[#94a3b8]">
                {error.message}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {integrity.length ? (
        <div
          role="alert"
          data-catalog-integrity-notice
          className="border-b border-amber-200/80 bg-amber-50 px-4 py-3 text-[#7c2d12]"
        >
          <div className="mx-auto flex w-full max-w-[1740px] flex-col gap-2">
            <p className="text-sm font-semibold tracking-tight">Some products need attention</p>
            <p className="text-sm text-[#9a3412]">
              {integrity.length === 1
                ? "One published product is hidden from navigation because its source image is missing."
                : `${integrity.length} published products are hidden from navigation because source images are missing.`}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[#9a3412]">
              {integrity.map((error) => (
                <li key={error.slug}>
                  <span className="font-medium">{error.slug}</span>
                  <span className="text-[#b45309]"> — {error.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CatalogDataErrorPanel({
  error,
  title,
  description
}: {
  error: CatalogDataError;
  title?: string;
  description?: string;
}) {
  const resolvedTitle = title ?? (
    error.code === "catalog_unavailable"
      ? "This product listing is temporarily unavailable."
      : "This product listing could not load."
  );
  const resolvedDescription = description ?? (
    error.code === "catalog_unavailable"
      ? "Mithron could not load products right now. Refresh the page or try again in a moment."
      : "The product is published, but Mithron could not resolve its image. Update the product image or unpublish the listing."
  );

  return (
    <main data-catalog-data-error className="min-h-[62vh] bg-[var(--surface-page)] px-6 py-24 text-[#0f172a]">
      <section className="mx-auto flex max-w-2xl flex-col justify-center">
        <p className="type-meta text-[#64748b]">Product unavailable</p>
        <h1 className="type-page mt-4">{resolvedTitle}</h1>
        <p className="type-body mt-5 max-w-xl text-[#64748b]">{resolvedDescription}</p>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[#9a3412]">
          <span className="font-medium">{error.slug}</span>
          <span className="text-[#b45309]"> — {error.message}</span>
        </p>
      </section>
    </main>
  );
}
