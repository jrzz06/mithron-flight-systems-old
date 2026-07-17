import type { CmsRole } from "@/lib/auth/permissions";
import type { EnterprisePermission } from "@/lib/auth/permissions";

export type WorkflowRole = CmsRole;

export type WorkflowPage = {
  path: string;
  label: string;
  description: string;
};

export type WorkflowAction = {
  id: string;
  label: string;
  permission: EnterprisePermission | "self";
  auditEvent: string;
  notification?: string;
};

export type StateTransition = {
  from: string;
  to: string;
  action: string;
  actor: WorkflowRole | WorkflowRole[];
};

export type RoleWorkflow = {
  role: WorkflowRole;
  label: string;
  responsibilities: string[];
  permissions: EnterprisePermission[];
  pages: WorkflowPage[];
  actions: WorkflowAction[];
  stateMachines: Record<string, { states: readonly string[]; transitions: StateTransition[] }>;
};
