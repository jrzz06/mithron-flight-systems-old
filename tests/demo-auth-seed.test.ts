import { describe, expect, it } from "vitest";
import { isDemoSeedingEnabled } from "@/lib/auth/demo-access";
import { listDemoAccessAccounts } from "@/services/demo-access-accounts";
import { seedDemoAuthAccounts } from "@/services/demo-auth-seed";

describe("demo auth accounts", () => {
  it("enables demo seeding when ALLOW_DEMO_SEED=true in production", () => {
    expect(isDemoSeedingEnabled({ ALLOW_DEMO_SEED: "true", NODE_ENV: "production" })).toBe(true);
    expect(isDemoSeedingEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("loads demo account metadata from Supabase without passwords", async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return;
    }

    const accounts = await listDemoAccessAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    for (const account of accounts) {
      expect(account.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(account.email).toContain("@");
      expect(account).not.toHaveProperty("password");
    }
  });

  it("seeds operator users in Supabase when configured", async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return;
    }

    const previousAllowDemoSeed = process.env.ALLOW_DEMO_SEED;
    const previousAdminPassword = process.env.DEMO_ADMIN_PASSWORD;
    const previousSupplierPassword = process.env.DEMO_SUPPLIER_PASSWORD;
    const previousWarehousePassword = process.env.DEMO_WAREHOUSE_PASSWORD;
    process.env.ALLOW_DEMO_SEED = "true";
    process.env.DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "demo@gmail.com";
    process.env.DEMO_SUPPLIER_PASSWORD = process.env.DEMO_SUPPLIER_PASSWORD ?? "demo2@gmail.com";
    process.env.DEMO_WAREHOUSE_PASSWORD = process.env.DEMO_WAREHOUSE_PASSWORD ?? "demo3@gmail.com";
    try {
      const results = await seedDemoAuthAccounts();
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((result) => result.email.includes("@"))).toBe(true);
    } finally {
      if (previousAllowDemoSeed === undefined) {
        delete process.env.ALLOW_DEMO_SEED;
      } else {
        process.env.ALLOW_DEMO_SEED = previousAllowDemoSeed;
      }
      if (previousAdminPassword === undefined) {
        delete process.env.DEMO_ADMIN_PASSWORD;
      } else {
        process.env.DEMO_ADMIN_PASSWORD = previousAdminPassword;
      }
      if (previousSupplierPassword === undefined) {
        delete process.env.DEMO_SUPPLIER_PASSWORD;
      } else {
        process.env.DEMO_SUPPLIER_PASSWORD = previousSupplierPassword;
      }
      if (previousWarehousePassword === undefined) {
        delete process.env.DEMO_WAREHOUSE_PASSWORD;
      } else {
        process.env.DEMO_WAREHOUSE_PASSWORD = previousWarehousePassword;
      }
    }
  }, 30_000);
});
