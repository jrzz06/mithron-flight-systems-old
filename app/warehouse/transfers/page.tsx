import { redirect } from "next/navigation";
import { ControlShell } from "@/components/admin/control-shell";
import { DataList, OperationalFeedback } from "@/components/admin/module-panel";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { TimedActionForm } from "@/components/admin/timed-action-form";
import { WarehouseOpsLiveSync } from "@/components/warehouse/warehouse-ops-live-sync";
import { RichTextEditorField } from "@/components/editor/RichTextEditor/rich-text-editor-field";
import { WarehouseCodeSelect } from "@/components/warehouse/warehouse-code-select";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { getWarehouseSnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getDefaultWarehouseCode } from "@/services/warehouse-config";
import { listActiveWarehouses } from "@/services/warehouses";
import { applyWarehouseMovementFormAction } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function value(params: SearchParams, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
}

function text(input: unknown, fallback = "n/a") {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

function feedbackPath(status: "success" | "error", message: string) {
  return `/warehouse/transfers?operation_status=${status}&operation_message=${encodeURIComponent(message.slice(0, 220))}`;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Stock transfer action failed.";
}

async function recordTransfer(formData: FormData) {
  "use server";
  try {
    await applyWarehouseMovementFormAction(formData);
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    redirect(feedbackPath("error", errorText(error)));
  }
  redirect(feedbackPath("success", "Transfer movement recorded."));
}

export default async function TransfersPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const [snapshot, warehouses, defaultWarehouseCode, policy] = await Promise.all([
    getWarehouseSnapshot({ scope: "transfers" }),
    listActiveWarehouses(),
    getDefaultWarehouseCode(),
    getAdminSettingsPolicy()
  ]);
  const params = searchParams ? await searchParams : {};
  const operationStatus = value(params, "operation_status");
  const operationMessage = value(params, "operation_message");
  const transferRows = snapshot.data.movements.filter((movement) => text(movement.movement_type) === "transfer").slice(0, 10);
  const stockOptions = snapshot.data.stock.slice(0, 80);

  return (
    <ControlShell
      eyebrow="Stock transfers"
      title="Transfer stock"
      description={snapshot.blockedReason ?? "Transfers are recorded through the immutable inventory movement ledger and update the selected warehouse stock row."}
      metrics={[
        { label: "Stock rows", value: String(snapshot.data.stock.length) },
        { label: "Transfers", value: String(transferRows.length) },
        { label: "Warehouses", value: String(new Set(snapshot.data.stock.map((row) => text(row.warehouse_code, ""))).size) }
      ]}
      actions={[
        { label: "Orders", href: "/warehouse/orders" },
        { label: "Fulfillment", href: "/warehouse/fulfillment" },
        { label: "History", href: "/warehouse/activity" }
      ]}
    >
      <WarehouseOpsLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <section data-stock-transfer-workflow className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4">
          <OperationalFeedback status={operationStatus} message={operationMessage} context="Stock transfer" idle="Transfer validation and ledger status appear here." />
          <DataList
            rows={transferRows.length ? transferRows.map((movement) => ({
              label: `${text(movement.product_slug, "product")} / ${text(movement.sku, "sku")}`,
              value: `${Number(movement.quantity_delta ?? 0) >= 0 ? "+" : ""}${String(movement.quantity_delta ?? 0)}`,
              detail: `${text(movement.warehouse_code, "warehouse")} | ${text(movement.reason_code, "transfer")} | ${text(movement.created_at, "no timestamp")}`
            })) : [{ label: "Transfers", value: "0", detail: "No transfer movements are visible yet." }]}
          />
        </div>

        <TimedActionForm action={recordTransfer} actionLabel="Record stock transfer" className="grid content-start gap-3 rounded-xl border border-white/[0.06] bg-[#10151d] p-4">
          <input name="movement_type" type="hidden" value="transfer" />
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            Product and SKU
            <select name="product_slug" className="h-10 rounded-lg border border-white/[0.06] bg-[#0b1017] px-3 text-sm text-slate-100">
              {stockOptions.map((row) => (
                <option key={`${text(row.warehouse_code)}:${text(row.product_slug)}:${text(row.sku)}`} value={text(row.product_slug, "")}>
                  {text(row.product_slug)} / {text(row.sku)} / {text(row.warehouse_code)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            SKU
            <input name="sku" defaultValue={text(stockOptions[0]?.sku, "")} className="h-10 rounded-lg border border-white/[0.06] bg-[#0b1017] px-3 text-sm text-slate-100" />
          </label>
          <WarehouseCodeSelect
            warehouses={warehouses}
            defaultValue={text(stockOptions[0]?.warehouse_code, defaultWarehouseCode)}
          />
          <label className="grid gap-1 text-xs font-medium text-slate-500">
            Quantity delta
            <input name="quantity_delta" defaultValue="-1" inputMode="numeric" className="h-10 rounded-lg border border-white/[0.06] bg-[#0b1017] px-3 text-sm text-slate-100" />
          </label>
          <input name="reason_code" type="hidden" value="warehouse_transfer" />
          <RichTextEditorField
            label="Transfer note"
            name="notes"
            jsonName="notes_json"
            documentType="warehouse_transfer_note"
            documentId="transfer-form"
            minHeight={140}
          />
          <input name="change_summary" type="hidden" value="Record warehouse stock transfer" />
          <OperationalSubmitButton pendingLabel="Recording">
            Record transfer
          </OperationalSubmitButton>
        </TimedActionForm>
      </section>
    </ControlShell>
  );
}
