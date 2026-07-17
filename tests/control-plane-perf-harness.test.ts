import { describe, expect, it } from "vitest";
import { CONTROL_PANEL_TRANSITIONS, type ControlPanelTransition } from "./e2e/helpers/control-panel-perf";

describe("control panel performance harness", () => {
  it("defines twelve canonical panel transitions", () => {
    expect(CONTROL_PANEL_TRANSITIONS).toHaveLength(12);
    expect(CONTROL_PANEL_TRANSITIONS.map((entry: ControlPanelTransition) => entry.panel)).toEqual([
      "admin",
      "admin",
      "admin",
      "admin",
      "admin",
      "admin",
      "warehouse",
      "warehouse",
      "warehouse",
      "supplier",
      "supplier",
      "supplier"
    ]);
  });
});
