import { describe, expect, it } from "vitest";
import { isSafeFilename, resolveMissionImagePath } from "@/lib/media/secure-mission-image";

describe("secure mission image paths", () => {
  it("rejects traversal and unknown filenames", () => {
    expect(isSafeFilename("../.env")).toBe(false);
    expect(isSafeFilename("..\\secret.png")).toBe(false);
    expect(isSafeFilename("evil/evil.png")).toBe(false);
    expect(resolveMissionImagePath({
      filename: "not-allowlisted.png",
      filenameByDest: { "known.png": "known.png" },
      publicSubdir: "city",
      devSearchRoots: () => []
    })).toBeUndefined();
  });

  it("accepts allowlisted safe filenames only", () => {
    expect(isSafeFilename("dronelancer-model.png")).toBe(true);
  });
});
