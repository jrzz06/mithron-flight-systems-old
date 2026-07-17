type KpiTile = {
  label: string;
  value: string | number;
  href?: string;
};

export function WarehouseKpiStrip({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => {
        const content = (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">{tile.label}</p>
            <p className="mt-1 font-[var(--type-display)] text-2xl font-semibold text-[var(--platform-text-primary)]">{tile.value}</p>
          </>
        );

        if (tile.href) {
          return (
            <a
              key={tile.label}
              href={tile.href}
              className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-3 transition hover:border-[var(--platform-accent)]/30"
            >
              {content}
            </a>
          );
        }

        return (
          <div
            key={tile.label}
            className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-3"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
