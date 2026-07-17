import type { CmsRole } from "@/lib/auth/permissions";

export type DemoLoginAccount = {
  id: string;
  email: string;
  role: CmsRole;
  label: string;
  description: string;
};

export { listDemoAccessAccounts as getDemoLoginAccounts, findDemoAccessAccountByRole as findDemoLoginAccount } from "@/services/demo-access-accounts";
