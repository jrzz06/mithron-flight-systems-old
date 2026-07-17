import { expect, type Page } from "@playwright/test";

export type E2ERole = "admin" | "warehouse" | "supplier";

type RoleCredentials = {
  email: string;
  password: string;
};

const ROLE_HOME: Record<E2ERole, string> = {
  admin: "/admin",
  warehouse: "/warehouse/dashboard",
  supplier: "/supplier"
};

function readRoleCredentials(role: E2ERole): RoleCredentials | null {
  const envMap: Record<E2ERole, { emailEnvKey: string; passwordEnvKey: string }> = {
    admin: {
      emailEnvKey: "E2E_ADMIN_EMAIL",
      passwordEnvKey: "E2E_ADMIN_PASSWORD"
    },
    warehouse: {
      emailEnvKey: "E2E_WAREHOUSE_EMAIL",
      passwordEnvKey: "E2E_WAREHOUSE_PASSWORD"
    },
    supplier: {
      emailEnvKey: "E2E_SUPPLIER_EMAIL",
      passwordEnvKey: "E2E_SUPPLIER_PASSWORD"
    }
  };

  const email = process.env[envMap[role].emailEnvKey]?.trim() ?? "";
  const password = process.env[envMap[role].passwordEnvKey]?.trim() ?? "";

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export function hasRoleCredentials(role: E2ERole) {
  return readRoleCredentials(role) !== null;
}

export function credentialsSkipMessage(role: E2ERole) {
  const keys = {
    admin: "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD",
    warehouse: "E2E_WAREHOUSE_EMAIL / E2E_WAREHOUSE_PASSWORD",
    supplier: "E2E_SUPPLIER_EMAIL / E2E_SUPPLIER_PASSWORD"
  };
  return `missing ${keys[role]} — set credentials in .env.local to run authenticated production tests`;
}

export async function loginAsRole(page: Page, role: E2ERole, nextPath?: string) {
  const credentials = readRoleCredentials(role);
  if (!credentials) {
    throw new Error(credentialsSkipMessage(role));
  }

  const destination = nextPath ?? ROLE_HOME[role];
  await page.goto(`/login?next=${encodeURIComponent(destination)}`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-testid="login-auth-form"]').waitFor({ state: "visible" });
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);

  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 }),
    page.locator('[data-testid="login-auth-form"] button[type="submit"]').click()
  ]);

  await expect(page).not.toHaveURL(/\/login/);
}

export async function expectForbiddenFromAdminShell(page: Page, role: E2ERole) {
  const home = ROLE_HOME[role];
  await expect(page).toHaveURL(new RegExp(`${home.replace(/\//g, "\\/")}(\\?.*)?$`));
  const url = new URL(page.url());
  expect(url.searchParams.get("admin_status")).toBe("forbidden");
}

export function mutationsEnabled() {
  return process.env.E2E_ALLOW_MUTATIONS === "true";
}
