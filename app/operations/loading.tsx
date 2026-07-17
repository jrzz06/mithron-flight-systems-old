import { ControlPlaneLoading } from "@/components/ui/control-plane-loading";

export default function OperationsLoading() {
  return (
    <main data-control-plane data-control-plane-theme="dark" className="min-h-screen bg-[var(--platform-bg)]" aria-label="Loading operations">
      <div className="px-4 py-4 md:px-6 md:py-5">
        <ControlPlaneLoading label="Loading operations workspace" metricCount={0} panelCount={2} />
      </div>
    </main>
  );
}
