import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveCmsRecord, publishCmsRecord, recordCmsRevision, restoreCmsRevision } from "@/services/cms-crud";

vi.mock("@/services/auth", () => ({
  requirePermission: vi.fn(async () => true)
}));

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SERVICE_ROLE_KEY: "service-role"
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

describe("CMS revision conflict handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("retries direct content revision RPC without REST local revision allocation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/rest/v1/rpc/cms_insert_content_revision")) {
        const body = JSON.parse(String(init?.body));
        expect(body).not.toHaveProperty("revision");
        if (fetchMock.mock.calls.length === 1) {
          return jsonResponse({
            code: "23505",
            message: "duplicate key value violates unique constraint",
            details: "content_revisions_entity_table_entity_id_revision_key"
          }, { status: 409, statusText: "Conflict" });
        }

        return jsonResponse([{ id: "revision-9", revision: 9 }]);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const record = await recordCmsRevision({
      table: "hero_banners",
      entityId: "hero-rapid-publish",
      snapshot: { id: "hero-rapid-publish", status: "published" },
      actorId: "00000000-0000-0000-0000-000000000001",
      changeSummary: "Rapid publish"
    }, env);

    expect(record).toMatchObject({ id: "revision-9", revision: 9 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([input]) => String(input).includes("/rest/v1/rpc/cms_insert_content_revision"))).toBe(true);
  });

  it("retries direct content revision RPC up to three attempts after repeated conflicts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/rest/v1/rpc/cms_insert_content_revision")) {
        const body = JSON.parse(String(init?.body));
        expect(body).not.toHaveProperty("revision");
        if (fetchMock.mock.calls.length < 3) {
          return jsonResponse({
            code: "23505",
            message: "duplicate key value violates unique constraint",
            details: "content_revisions_entity_table_entity_id_revision_key"
          }, { status: 409, statusText: "Conflict" });
        }

        return jsonResponse([{ id: "revision-12", revision: 12 }]);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const record = await recordCmsRevision({
      table: "hero_banners",
      entityId: "ag10-arrival",
      snapshot: { id: "ag10-arrival", status: "published" },
      actorId: "00000000-0000-0000-0000-000000000001",
      changeSummary: "Rapid publish retry"
    }, env);

    expect(record).toMatchObject({ id: "revision-12", revision: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([input]) => String(input).includes("/rest/v1/rpc/cms_insert_content_revision"))).toBe(true);
  });

  it("falls back to table-trigger-owned revision insert when direct revision RPC keeps returning 23505", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/rest/v1/rpc/cms_insert_content_revision")) {
        return jsonResponse({
          code: "23505",
          message: "duplicate key value violates unique constraint",
          details: "content_revisions_entity_table_entity_id_revision_key"
        }, { status: 409, statusText: "Conflict" });
      }

      if (url.includes("/rest/v1/content_revisions")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          entity_table: "hero_banners",
          entity_id: "ag10-arrival",
          change_summary: "Visual edit Hero Banner"
        });
        expect(body).not.toHaveProperty("revision");
        return jsonResponse([{ id: "revision-11", revision: 11 }]);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const record = await recordCmsRevision({
      table: "hero_banners",
      entityId: "ag10-arrival",
      snapshot: { id: "ag10-arrival", title: "Mithron Jerus Agriculture", revision: 10 },
      actorId: "00000000-0000-0000-0000-000000000001",
      changeSummary: "Visual edit Hero Banner"
    }, env);

    expect(record).toMatchObject({ id: "revision-11", revision: 11 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.slice(0, 3).every(([input]) => String(input).includes("/rest/v1/rpc/cms_insert_content_revision"))).toBe(true);
    expect(String(fetchMock.mock.calls[3][0])).toContain("/rest/v1/content_revisions");
  });

  it("fails closed when the DB revision RPC is missing instead of falling back to REST revision math", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/rest/v1/rpc/cms_insert_content_revision")) {
        return jsonResponse({
          code: "PGRST202",
          message: "Could not find the function public.cms_insert_content_revision"
        }, { status: 404, statusText: "Not Found" });
      }

      throw new Error(`Unsafe REST fallback attempted: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(recordCmsRevision({
      table: "hero_banners",
      entityId: "ag10-arrival",
      snapshot: { id: "ag10-arrival", status: "published" },
      actorId: "00000000-0000-0000-0000-000000000001",
      changeSummary: "Missing RPC"
    }, env)).rejects.toThrow(/cms_insert_content_revision/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps DB revision allocation locked around MAX(revision) + 1", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260527000200_cms_atomic_revision_publish.sql"),
      "utf8"
    );

    expect(migration).toContain("cms_mutate_content_with_revision");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("max(revision)");
    expect(migration).toContain("coalesce(max(revision), 0) + 1");
    expect(migration).toContain("for update");
    expect(migration).toContain("insert into public.content_revisions");
  });

  it("publishes and archives CMS records through one transactional revision RPC without local revision patches", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("/rest/v1/rpc/cms_mutate_content_with_revision");
      const body = JSON.parse(String(init?.body));
      expect(body).not.toHaveProperty("p_base_revision");
      expect(body.p_patch).not.toHaveProperty("revision");
      return jsonResponse({
        record: { id: "ag10-arrival", status: body.p_operation === "archive" ? "archived" : "published", revision: body.p_operation === "archive" ? 12 : 11 },
        revision: body.p_operation === "archive" ? 12 : 11,
        revision_id: `revision-${body.p_operation}`,
        debug: { next_revision: body.p_operation === "archive" ? 12 : 11 }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    await publishCmsRecord({
      table: "hero_banners",
      idColumn: "id",
      idValue: "ag10-arrival",
      actorId: "00000000-0000-0000-0000-000000000001"
    }, env);

    await archiveCmsRecord({
      table: "hero_banners",
      idColumn: "id",
      idValue: "ag10-arrival",
      actorId: "00000000-0000-0000-0000-000000000001"
    }, env);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      expect.objectContaining({ p_operation: "publish", p_entity_table: "hero_banners", p_identity: { id: "ag10-arrival" } }),
      expect.objectContaining({ p_operation: "archive", p_entity_table: "hero_banners", p_identity: { id: "ag10-arrival" } })
    ]);
  });

  it("retries the whole transactional CMS publish RPC once after a 23505 revision conflict", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "content_revisions_entity_table_entity_id_revision_key"
      }, { status: 409, statusText: "Conflict" }))
      .mockResolvedValueOnce(jsonResponse({
        record: { id: "ag10-arrival", status: "published", revision: 11 },
        revision: 11,
        revision_id: "revision-11",
        debug: { retry_attempt: 2 }
      }));

    vi.stubGlobal("fetch", fetchMock);

    const record = await publishCmsRecord({
      table: "hero_banners",
      idColumn: "id",
      idValue: "ag10-arrival",
      actorId: "00000000-0000-0000-0000-000000000001"
    }, env);

    expect(record).toMatchObject({ id: "ag10-arrival", revision: 11 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).p_attempt)).toEqual([1, 2]);
  });

  it("retries the whole transactional CMS publish RPC up to three attempts after repeated revision conflicts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "content_revisions_entity_table_entity_id_revision_key"
      }, { status: 409, statusText: "Conflict" }))
      .mockResolvedValueOnce(jsonResponse({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "content_revisions_entity_table_entity_id_revision_key"
      }, { status: 409, statusText: "Conflict" }))
      .mockResolvedValueOnce(jsonResponse({
        record: { id: "ag10-arrival", status: "published", revision: 12 },
        revision: 12,
        revision_id: "revision-12",
        debug: { retry_attempt: 3 }
      }));

    vi.stubGlobal("fetch", fetchMock);

    const record = await publishCmsRecord({
      table: "hero_banners",
      idColumn: "id",
      idValue: "ag10-arrival",
      actorId: "00000000-0000-0000-0000-000000000001"
    }, env);

    expect(record).toMatchObject({ id: "ag10-arrival", revision: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).p_attempt)).toEqual([1, 2, 3]);
  });

  it("keeps unique-violation retry inside the database revision allocation functions", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260527000300_cms_revision_retry_hardening.sql"),
      "utf8"
    );

    expect(migration).toContain("cms_insert_content_revision");
    expect(migration).toContain("cms_mutate_content_with_revision");
    expect(migration).toContain("for v_revision_attempt in 1..3 loop");
    expect(migration).toContain("when unique_violation then");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("coalesce(max(revision), 0) + 1");
  });

  it("keeps content_revisions revision ownership at the table insert boundary", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260527000400_content_revisions_db_owned_revision_trigger.sql"),
      "utf8"
    );

    expect(migration).toContain("create or replace function public.assign_content_revision_number");
    expect(migration).toContain("before insert on public.content_revisions");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("coalesce(max(revision), 0) + 1");
    expect(migration).toContain("new.revision := v_next_revision");
    expect(migration).toContain("new.snapshot := new.snapshot || jsonb_build_object('revision', v_next_revision)");
  });

  it("hardens legacy record_content_revision so old DB callers cannot reuse stale revisions", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260527000500_legacy_record_content_revision_hardening.sql"),
      "utf8"
    );

    expect(migration).toContain("create or replace function public.record_content_revision");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("coalesce(max(revision), 0) + 1");
    expect(migration).toContain("target_revision is intentionally ignored");
    expect(migration).toContain("when unique_violation then");
  });

  it("restores CMS revisions without submitting current revision as the next revision source", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/rest/v1/rpc/cms_mutate_content_with_revision");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        p_operation: "restore",
        p_entity_table: "hero_banners",
        p_identity: { id: "ag10-arrival" }
      });
      expect(body).not.toHaveProperty("p_current_revision");
      expect(body.p_patch).not.toHaveProperty("revision");
      return jsonResponse({
        record: { id: "ag10-arrival", status: "published", revision: 13 },
        revision: 13,
        revision_id: "revision-13",
        debug: { next_revision: 13 }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    await restoreCmsRevision({
      table: "hero_banners",
      entityId: "ag10-arrival",
      actorId: "00000000-0000-0000-0000-000000000001",
      snapshot: { id: "ag10-arrival", title: "Restored", revision: 4 },
      changeSummary: "Restore hero"
    }, env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not render stale revision inputs in publish archive or restore CMS forms", () => {
    const workspace = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actions = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(workspace).not.toContain('name="base_revision"');
    expect(workspace).not.toContain("related_publish_base_revision");
    expect(workspace).not.toContain("related_archive_base_revision");
    expect(workspace).not.toContain('name="current_revision"');
    expect(actions).not.toContain('readOptionalInteger(formData, "base_revision"');
    expect(actions).not.toContain("related_publish_base_revision");
    expect(actions).not.toContain("related_archive_base_revision");
  });
});

