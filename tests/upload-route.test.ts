import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadMithronAssetsMock = vi.fn();

vi.mock("@/lib/mithron-assets/upload-service", () => ({
  uploadMithronAssets: uploadMithronAssetsMock
}));

const managedEnvKeys = [
  "MITHRON_ASSET_UPLOAD_TOKEN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;

async function postUpload(body: unknown, headers: Record<string, string> = {}) {
  vi.resetModules();
  const { POST } = await import("@/app/api/upload/route");

  return POST(
    new Request("http://localhost/api/upload", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    })
  );
}

describe("mithron asset upload route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of managedEnvKeys) delete process.env[key];
    uploadMithronAssetsMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("fails closed when the route upload token is not configured", async () => {
    const response = await postUpload({ dryRun: true });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ status: "FAILED", code: "UPLOAD_TOKEN_MISSING" });
    expect(uploadMithronAssetsMock).not.toHaveBeenCalled();
  });

  it("rejects requests without a matching bearer token", async () => {
    process.env.MITHRON_ASSET_UPLOAD_TOKEN = "server-only-token";

    const response = await postUpload({ dryRun: true }, { authorization: "Bearer wrong-token" });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({ status: "FAILED", code: "UNAUTHORIZED" });
    expect(uploadMithronAssetsMock).not.toHaveBeenCalled();
  });

  it("does not run a real upload without the Supabase service role key", async () => {
    process.env.MITHRON_ASSET_UPLOAD_TOKEN = "server-only-token";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

    const response = await postUpload({ dryRun: false }, { authorization: "Bearer server-only-token" });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ status: "FAILED", code: "SUPABASE_SERVICE_ROLE_KEY_MISSING" });
    expect(uploadMithronAssetsMock).not.toHaveBeenCalled();
  });

  it("runs the server-side uploader for an authorized dry run", async () => {
    process.env.MITHRON_ASSET_UPLOAD_TOKEN = "server-only-token";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    uploadMithronAssetsMock.mockResolvedValueOnce({
      status: "VERIFIED",
      dryRun: true,
      generatedAssets: 32,
      metadataRows: 180,
      missingMasters: []
    });

    const response = await postUpload({ dryRun: true, limit: 3 }, { authorization: "Bearer server-only-token" });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(uploadMithronAssetsMock).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, limit: 3 }));
    expect(payload).toMatchObject({ status: "VERIFIED", dryRun: true, generatedAssets: 32, metadataRows: 180 });
  });
});
