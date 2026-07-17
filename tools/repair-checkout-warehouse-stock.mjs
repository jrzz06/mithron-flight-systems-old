import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

function deriveProductSku(slug) {
  const cleaned = slug.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "SKU";
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) {
    const detail = (await response.text()).catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return response.json();
}

async function resolveCheckoutWarehouseCode(url, headers) {
  const envDefault = process.env.DEFAULT_WAREHOUSE_CODE?.trim();
  const rows = await fetchJson(
    `${url}/rest/v1/warehouse_configuration?id=eq.global&select=checkout_warehouse_code,default_warehouse_code&limit=1`,
    headers
  ).catch(() => []);
  const row = rows[0];
  return String(row?.checkout_warehouse_code ?? row?.default_warehouse_code ?? envDefault ?? "MAIN").trim();
}

async function main() {
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates"
  };

  const checkoutWarehouseCode = await resolveCheckoutWarehouseCode(url, headers);
  const pageSize = 500;
  let offset = 0;
  const inventoryRows = [];

  while (true) {
    const page = await fetchJson(
      `${url}/rest/v1/inventory?select=product_slug,sku,quantity,reserved_quantity,reorder_threshold,stock_status&order=product_slug.asc&limit=${pageSize}&offset=${offset}`,
      headers
    );
    if (!page.length) break;
    inventoryRows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  let created = 0;
  let synced = 0;
  let skipped = 0;
  let desyncedFixed = 0;
  const errors = [];

  for (const inv of inventoryRows) {
    const slug = String(inv.product_slug ?? "").trim();
    if (!slug) continue;
    const sku = String(inv.sku ?? "").trim() || deriveProductSku(slug);
    const quantity = Math.max(0, Math.trunc(Number(inv.quantity ?? 0)));
    const reservedQuantity = Math.max(0, Math.trunc(Number(inv.reserved_quantity ?? 0)));
    const targetAvailable = Math.max(0, quantity - reservedQuantity);

    try {
      const stockRows = await fetchJson(
        `${url}/rest/v1/warehouse_stock?select=id,available_quantity,committed_quantity&warehouse_code=eq.${encodeURIComponent(checkoutWarehouseCode)}&product_slug=eq.${encodeURIComponent(slug)}&sku=eq.${encodeURIComponent(sku)}&limit=1`,
        headers
      );
      const existing = stockRows[0];

      if (!existing) {
        await fetch(`${url}/rest/v1/warehouse_stock`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            warehouse_code: checkoutWarehouseCode,
            product_slug: slug,
            sku,
            available_quantity: targetAvailable,
            committed_quantity: 0,
            updated_at: new Date().toISOString()
          })
        });
        created += 1;
        if (targetAvailable > 0) desyncedFixed += 1;
        console.log(`Created checkout warehouse stock for ${slug} -> ${targetAvailable}`);
        continue;
      }

      const currentAvailable = Math.max(0, Math.trunc(Number(existing.available_quantity ?? 0)));
      if (currentAvailable >= targetAvailable) {
        skipped += 1;
        continue;
      }

      const quantityDelta = targetAvailable - currentAvailable;
      const response = await fetch(`${url}/rest/v1/rpc/apply_inventory_adjustment`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_product_slug: slug,
          p_sku: sku,
          p_warehouse_code: checkoutWarehouseCode,
          p_quantity_delta: quantityDelta,
          p_reason_code: "checkout_repair_sync",
          p_notes: "Checkout warehouse stock repair sync",
          p_actor_id: null,
          p_expected_updated_at: null
        })
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail.slice(0, 240));
      }

      synced += 1;
      desyncedFixed += 1;
      console.log(`Synced ${slug}: ${currentAvailable} -> ${targetAvailable}`);
    } catch (error) {
      errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const summary = {
    checkoutWarehouseCode,
    inventoryRows: inventoryRows.length,
    created,
    synced,
    skipped,
    desyncedFixed,
    failed: errors.length,
    errors
  };

  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
