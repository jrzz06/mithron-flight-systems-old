import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTROL_PANEL_TRANSITIONS,
  measureTransition,
  type NavigationPerfSample
} from "./helpers/control-panel-perf";
import { credentialsSkipMessage, hasRoleCredentials, loginAsRole } from "./fixtures/auth";

test.describe("Control panel navigation performance", () => {
  test("captures admin transition timings", async ({ page }) => {
    test.skip(!hasRoleCredentials("admin"), credentialsSkipMessage("admin"));

    await loginAsRole(page, "admin");
    const samples = await capturePanelTransitions(page, "admin");
    writePerfReport("admin", samples);
  });

  test("captures warehouse transition timings", async ({ page }) => {
    test.skip(!hasRoleCredentials("warehouse"), credentialsSkipMessage("warehouse"));

    await loginAsRole(page, "warehouse");
    const samples = await capturePanelTransitions(page, "warehouse");
    writePerfReport("warehouse", samples);
  });

  test("captures supplier transition timings", async ({ page }) => {
    test.skip(!hasRoleCredentials("supplier"), credentialsSkipMessage("supplier"));

    await loginAsRole(page, "supplier");
    const samples = await capturePanelTransitions(page, "supplier");
    writePerfReport("supplier", samples);
  });
});

async function capturePanelTransitions(page: import("@playwright/test").Page, panel: "admin" | "warehouse" | "supplier") {
  const transitions = CONTROL_PANEL_TRANSITIONS.filter((entry) => entry.panel === panel);
  const samples: NavigationPerfSample[] = [];

  for (const transition of transitions) {
    samples.push(await measureTransition(page, transition));
  }

  return samples;
}

function writePerfReport(panel: string, samples: NavigationPerfSample[]) {
  const outputPath = join(process.cwd(), "test-output", `control-panel-perf-${panel}.json`);
  writeFileSync(outputPath, `${JSON.stringify({ capturedAt: new Date().toISOString(), samples }, null, 2)}\n`, "utf8");
  console.log(`[control-panel-perf] wrote ${outputPath}`);
}
