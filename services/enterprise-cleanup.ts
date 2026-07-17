export type CleanupDependencyStatus = "ACTIVE" | "FALLBACK_ONLY" | "OBSOLETE" | "SAFE_TO_REMOVE_LATER";

export type CleanupRemovalGate =
  | "cmsParity"
  | "mediaParity"
  | "realtimeStability"
  | "warehouseWorkflow"
  | "rollbackRecovery"
  | "operationalContinuity";

export type CleanupReadinessInput = {
  cmsCutoverReady: boolean;
  cmsParityVerified: boolean;
  mediaParityVerified: boolean;
  canonicalMediaRows: number;
  productMediaLinks: number;
  realtimeStabilized: boolean;
  warehouseAuthenticatedVerified: boolean;
  rollbackRecoveryVerified: boolean;
};

export type CleanupDependencyDefinition = {
  id: string;
  label: string;
  path: string;
  surface: "cms" | "media" | "storefront" | "admin" | "warehouse" | "operations" | "realtime" | "tooling";
  status: Exclude<CleanupDependencyStatus, "SAFE_TO_REMOVE_LATER">;
  removalGate: CleanupRemovalGate;
  safeLaterCandidate: boolean;
  runtimeConsumers: string[];
  dependencyReason: string;
  blockers: string[];
  evidence: string[];
  rollbackPlan: string[];
};

export type CleanupDependency = Omit<CleanupDependencyDefinition, "status"> & {
  status: CleanupDependencyStatus;
  gateVerified: boolean;
};

export type CleanupDependencyGraph = {
  nodes: string[];
  edges: Array<{ from: string; to: string; reason: string }>;
};

export type CleanupReadinessSnapshot = {
  status: "BLOCKED" | "PARTIAL" | "READY_FOR_STAGED_REMOVAL";
  destructiveCleanupAllowed: false;
  dependencies: CleanupDependency[];
  dependencyCounts: Record<CleanupDependencyStatus, number>;
  activeFallbacks: CleanupDependency[];
  safeToRemoveLater: CleanupDependency[];
  blockers: string[];
  graph: CleanupDependencyGraph;
};

export const ENTERPRISE_CLEANUP_DEPENDENCIES: CleanupDependencyDefinition[] = [
  {
    id: "cms-local-storefront-content",
    label: "Local storefront CMS fallback content",
    path: "config/storefront-content.ts",
    surface: "cms",
    status: "FALLBACK_ONLY",
    removalGate: "cmsParity",
    safeLaterCandidate: true,
    runtimeConsumers: ["services/cms.ts", "components/layout/site-footer.tsx"],
    dependencyReason: "CMS fallback content",
    blockers: [
      "CMS staged parity and rollback verification are not complete.",
      "Product support FAQ/review fallback content still protects storefront rendering."
    ],
    evidence: [
      "services/cms.ts imports footerContent and productSupportContent as fallback data.",
      "progress.md marks CMS source switching ready for staged parity testing, not global cutover."
    ],
    rollbackPlan: [
      "Keep config/storefront-content.ts in place until remote CMS parity and rollback recovery are verified.",
      "If remote CMS rows regress, route services/cms.ts back to fallbackSnapshot without storefront component changes."
    ]
  },
  {
    id: "cms-navigation-fallback",
    label: "Local navigation fallback",
    path: "config/navigation.ts",
    surface: "cms",
    status: "FALLBACK_ONLY",
    removalGate: "cmsParity",
    safeLaterCandidate: true,
    runtimeConsumers: ["services/cms.ts", "components/navigation/store-nav.tsx"],
    dependencyReason: "CMS fallback navigation",
    blockers: [
      "Navigation source switching still needs staged parity verification.",
      "Rollback-safe navigation rendering depends on the local tree."
    ],
    evidence: [
      "services/cms.ts imports navigation for fallbackSnapshot.",
      "site_navigation is remote-backed but global fallback decommission is deferred."
    ],
    rollbackPlan: [
      "Keep config/navigation.ts until navigation SSR, mobile menu, SEO links, and rollback recovery are verified.",
      "Restore navigation fallback if remote rows disappear or ordering regresses."
    ]
  },
  {
    id: "category-route-metadata-fallback",
    label: "Category metadata and route contract fallback",
    path: "config/catalog-routes.ts",
    surface: "storefront",
    status: "ACTIVE",
    removalGate: "cmsParity",
    safeLaterCandidate: false,
    runtimeConsumers: ["services/cms.ts", "app/agriculture/page.tsx", "app/industrial/page.tsx", "app/mapping/page.tsx"],
    dependencyReason: "SEO and stable category route contract",
    blockers: [
      "Category route metadata protects SEO and route rendering.",
      "Route contracts must not be removed as part of fallback cleanup."
    ],
    evidence: [
      "Product and category URLs are explicitly protected.",
      "catalog-routes remains a stable route/SEO contract even when CMS metadata is remote-backed."
    ],
    rollbackPlan: [
      "Do not remove category route metadata during cleanup preparation.",
      "Use it as the rollback contract if remote category_metadata rows regress."
    ]
  },
  {
    id: "generated-media-manifest",
    label: "Generated media manifest fallback",
    path: "data/mithron-supabase-assets.generated.json",
    surface: "media",
    status: "ACTIVE",
    removalGate: "mediaParity",
    safeLaterCandidate: true,
    runtimeConsumers: ["config/generated-assets.ts", "components/media/mithron-responsive-image.tsx"],
    dependencyReason: "responsive media fallback manifest",
    blockers: [
      "Canonical media parity is not verified with durable media rows.",
      "media_assets and product_media_assets are empty after reversible probe cleanup."
    ],
    evidence: [
      "config/generated-assets.ts imports data/mithron-supabase-assets.generated.json.",
      "progress.md records the generated asset manifest as active rollback media."
    ],
    rollbackPlan: [
      "Keep the manifest until canonical media rows, CDN variants, and visual parity are verified.",
      "If canonical media fails, responsive image rendering can continue from the generated manifest."
    ]
  },
  {
    id: "local-shell-editorial-media",
    label: "Local shell and editorial media",
    path: "public/media/mithron",
    surface: "media",
    status: "ACTIVE",
    removalGate: "mediaParity",
    safeLaterCandidate: true,
    runtimeConsumers: ["config/assets.ts", "config/generated-assets.ts"],
    dependencyReason: "rollback-safe shell/editorial media",
    blockers: [
      "Legacy local media cannot be removed until CDN parity and image quality are verified.",
      "Cinematic/editorial assets still provide rollback-safe rendering."
    ],
    evidence: [
      "progress.md marks local shell/editorial media active.",
      "Media manager has verified reversible probes but no durable canonical media population."
    ],
    rollbackPlan: [
      "Keep local media directories until CDN URLs and responsive variants are verified route by route.",
      "Restore local shell media references immediately if visual parity or hydration regresses."
    ]
  },
  {
    id: "responsive-media-renderer",
    label: "Responsive media rollback renderer",
    path: "components/media/mithron-responsive-image.tsx",
    surface: "media",
    status: "ACTIVE",
    removalGate: "mediaParity",
    safeLaterCandidate: false,
    runtimeConsumers: ["sections/home/hero-carousel.tsx", "sections/product/product-media-viewer.tsx", "sections/catalog/catalog-page.tsx"],
    dependencyReason: "image rendering and bandwidth safety",
    blockers: [
      "Responsive renderer is part of active storefront image delivery.",
      "Removing it would risk image rendering and bandwidth regressions."
    ],
    evidence: [
      "The renderer supports Wix variants, responsive manifest variants, and fallback placeholders.",
      "Safe media optimization pass kept rollback media active."
    ],
    rollbackPlan: [
      "Do not remove the renderer during cleanup preparation.",
      "Use the renderer diagnostics to detect missing assets during staged media cutover."
    ]
  },
  {
    id: "upload-api-legacy-route",
    label: "Legacy token upload API route",
    path: "app/api/upload/route.ts",
    surface: "tooling",
    status: "ACTIVE",
    removalGate: "mediaParity",
    safeLaterCandidate: true,
    runtimeConsumers: ["lib/media/canonical-batch-upload.ts", "tools/regenerate-editorial-manifest.mjs"],
    dependencyReason: "token-gated batch media upload bypassing admin RBAC",
    blockers: [
      "Canonical media parity is not verified with durable media rows.",
      "Batch upload must be retired after manifest regeneration from media_assets."
    ],
    evidence: [
      "app/api/upload/route.ts accepts MITHRON_ASSET_UPLOAD_TOKEN bearer requests.",
      "Canonical batch upload now writes media_assets only; manifest regen is CLI-driven."
    ],
    rollbackPlan: [
      "Re-enable POST /api/upload only during staged migration with upload token rotation.",
      "Use tools/regenerate-editorial-manifest.mjs if canonical rows regress."
    ]
  },
  {
    id: "mithron-assets-source-rows",
    label: "Mithron source asset parity rows",
    path: "mithron_assets",
    surface: "media",
    status: "FALLBACK_ONLY",
    removalGate: "mediaParity",
    safeLaterCandidate: true,
    runtimeConsumers: ["tools/backfill-canonical-media.mjs", "tools/audit-media-bandwidth.mjs"],
    dependencyReason: "read-only legacy asset registry for migration tooling",
    blockers: [
      "Storefront images are served from the static manifest, not live mithron_assets reads.",
      "Full decommission requires regenerating the manifest from media_assets."
    ],
    evidence: [
      "Admin media library no longer fetches mithron_assets rows at runtime.",
      "Runtime upload pipeline writes media_assets; mithron_assets is read-only legacy data."
    ],
    rollbackPlan: [
      "Keep mithron_assets until manifest migration is complete and verified.",
      "Use media_assets as canonical source during staged cutover."
    ]
  },
  {
    id: "admin-media-parity-surface",
    label: "Product media upload surface",
    path: "app/admin/products/page.tsx",
    surface: "admin",
    status: "ACTIVE",
    removalGate: "mediaParity",
    safeLaterCandidate: false,
    runtimeConsumers: ["services/admin.ts", "app/admin/products/actions.ts"],
    dependencyReason: "product media upload and canonical asset linking",
    blockers: [
      "Products must keep uploading canonical media_assets rows during staged cleanup.",
      "Removing product media upload would block catalog parity work."
    ],
    evidence: [
      "Products page hosts local image upload and links media_assets through product_media_assets.",
      "Media library admin route was removed; product forms are the operator upload surface."
    ],
    rollbackPlan: [
      "Keep product media upload throughout staged media cleanup.",
      "Use product media links to confirm canonical rows before any media removal."
    ]
  },
  {
    id: "warehouse-admin-snapshot",
    label: "Warehouse/admin persistence snapshots",
    path: "services/admin.ts",
    surface: "warehouse",
    status: "ACTIVE",
    removalGate: "warehouseWorkflow",
    safeLaterCandidate: false,
    runtimeConsumers: ["app/warehouse/page.tsx", "app/warehouse/fulfillment/page.tsx", "app/warehouse/activity/page.tsx"],
    dependencyReason: "warehouse operational continuity",
    blockers: [
      "Authenticated warehouse-user workflow execution is still partial.",
      "Snapshots expose warehouse persistence health during cleanup."
    ],
    evidence: [
      "Warehouse route pages consume getWarehouseSnapshot.",
      "progress.md marks real warehouse-user session execution as partial."
    ],
    rollbackPlan: [
      "Keep warehouse snapshots until authenticated warehouse sessions are verified.",
      "Use snapshot status as an immediate recovery signal during cleanup."
    ]
  },
  {
    id: "operations-admin-snapshot",
    label: "Operations persistence snapshots",
    path: "services/admin.ts",
    surface: "operations",
    status: "ACTIVE",
    removalGate: "operationalContinuity",
    safeLaterCandidate: false,
    runtimeConsumers: ["app/operations/page.tsx", "app/operations/deployments/page.tsx", "app/operations/tasks/page.tsx"],
    dependencyReason: "operations workflow continuity",
    blockers: [
      "Richer escalation notification routing remains partial.",
      "Operations snapshots are required for cleanup observability."
    ],
    evidence: [
      "Operations route pages consume getOperationsSnapshot.",
      "Realtime and operations are remote verified through focused probes, not long browser-session soaks."
    ],
    rollbackPlan: [
      "Keep operations snapshots until authenticated multi-user operations checks are complete.",
      "Use snapshot status and activity logs to recover cleanup regressions."
    ]
  },
  {
    id: "remote-workflow-verifier",
    label: "Remote workflow verifier and cleanup probe registry",
    path: "tools/verify-enterprise-remote-workflows.mjs",
    surface: "tooling",
    status: "ACTIVE",
    removalGate: "rollbackRecovery",
    safeLaterCandidate: false,
    runtimeConsumers: ["progress.md"],
    dependencyReason: "rollback and remote parity verification",
    blockers: [
      "Rollback recovery and remote parity are not fully complete.",
      "Verifier remains the authoritative bounded probe for cleanup safety."
    ],
    evidence: [
      "Remote verifier proves CMS, media, inventory, shipment, warehouse, operations, realtime, RLS, and cleanup probe behavior.",
      "progress.md records cleanup candidates as blocked until rollback verification."
    ],
    rollbackPlan: [
      "Do not remove the verifier during cleanup preparation.",
      "Run it before and after any future staged cleanup removal."
    ]
  }
];

function isGateVerified(gate: CleanupRemovalGate, input: CleanupReadinessInput) {
  if (gate === "cmsParity") return input.cmsCutoverReady && input.cmsParityVerified;
  if (gate === "mediaParity") return input.mediaParityVerified && input.canonicalMediaRows > 0 && input.productMediaLinks > 0;
  if (gate === "realtimeStability") return input.realtimeStabilized;
  if (gate === "warehouseWorkflow") return input.warehouseAuthenticatedVerified;
  if (gate === "rollbackRecovery") return input.rollbackRecoveryVerified;
  return input.realtimeStabilized && input.warehouseAuthenticatedVerified;
}

function dependencyStatus(definition: CleanupDependencyDefinition, input: CleanupReadinessInput): CleanupDependencyStatus {
  const verified = isGateVerified(definition.removalGate, input);
  if (definition.safeLaterCandidate && verified && input.rollbackRecoveryVerified) {
    return "SAFE_TO_REMOVE_LATER";
  }
  return definition.status;
}

function countByStatus(dependencies: CleanupDependency[]) {
  return dependencies.reduce<Record<CleanupDependencyStatus, number>>(
    (counts, dependency) => {
      counts[dependency.status] += 1;
      return counts;
    },
    {
      ACTIVE: 0,
      FALLBACK_ONLY: 0,
      OBSOLETE: 0,
      SAFE_TO_REMOVE_LATER: 0
    }
  );
}

function globalBlockers(input: CleanupReadinessInput) {
  const blockers: string[] = [];
  if (!input.cmsCutoverReady || !input.cmsParityVerified) {
    blockers.push("CMS staged parity and rollback verification are not complete.");
  }
  if (!input.mediaParityVerified || input.canonicalMediaRows <= 0 || input.productMediaLinks <= 0) {
    blockers.push("Canonical media parity is not verified with durable media rows.");
  }
  if (!input.realtimeStabilized) {
    blockers.push("Realtime stability is not verified for cleanup execution.");
  }
  if (!input.warehouseAuthenticatedVerified) {
    blockers.push("Authenticated warehouse workflows are not verified.");
  }
  if (!input.rollbackRecoveryVerified) {
    blockers.push("Rollback recovery has not been verified for cleanup candidates.");
  }
  return blockers;
}

export function createCleanupDependencyGraph(
  dependencies: Array<Pick<CleanupDependencyDefinition, "path" | "runtimeConsumers" | "dependencyReason">>
): CleanupDependencyGraph {
  const nodes = new Set<string>();
  const edges: CleanupDependencyGraph["edges"] = [];

  for (const dependency of dependencies) {
    nodes.add(dependency.path);
    for (const consumer of dependency.runtimeConsumers) {
      nodes.add(consumer);
      edges.push({
        from: consumer,
        to: dependency.path,
        reason: dependency.dependencyReason
      });
    }
  }

  return {
    nodes: Array.from(nodes).sort(),
    edges: edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`))
  };
}

export function buildEnterpriseCleanupReadiness(input: CleanupReadinessInput): CleanupReadinessSnapshot {
  const dependencies = ENTERPRISE_CLEANUP_DEPENDENCIES.map((definition) => ({
    ...definition,
    status: dependencyStatus(definition, input),
    gateVerified: isGateVerified(definition.removalGate, input)
  }));
  const blockers = globalBlockers(input);
  const safeToRemoveLater = dependencies.filter((dependency) => dependency.status === "SAFE_TO_REMOVE_LATER");
  const activeFallbacks = dependencies.filter((dependency) => dependency.status === "ACTIVE" || dependency.status === "FALLBACK_ONLY");

  return {
    status: blockers.length ? "BLOCKED" : safeToRemoveLater.length ? "READY_FOR_STAGED_REMOVAL" : "PARTIAL",
    destructiveCleanupAllowed: false,
    dependencies,
    dependencyCounts: countByStatus(dependencies),
    activeFallbacks,
    safeToRemoveLater,
    blockers,
    graph: createCleanupDependencyGraph(dependencies)
  };
}
