/**
 * Regression tests for CMS revision collision handling
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
 * 
 * These tests simulate transient duplicate-revision conflicts and verify that
 * the CMS mutation layer retries without exposing duplicate final revisions.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveCmsRecord, publishCmsRecord, restoreCmsRevision } from "@/services/cms-crud";

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

describe("CMS Revision Collision Regression", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /**
   * Property 1: Bug Condition - Concurrent CMS Operations Generate Unique Revisions
   * 
   * This test simulates concurrent publish operations on the same entity.
   * On UNFIXED code, this should FAIL with duplicate revision numbers or 409 Conflict errors.
   * 
   * Expected counterexamples:
   * - Multiple operations generate the same revision number (e.g., revision 10 appears twice)
   * - 409 Conflict errors with constraint content_revisions_entity_table_entity_id_revision_key
   */
  it("handles concurrent publish operations with unique final revision numbers", async () => {
    // Track all revision numbers generated and any conflicts
    const generatedRevisions: number[] = [];
    const conflictErrors: string[] = [];
    let callCount = 0;

    // Simulate race condition: all concurrent operations calculate the same MAX(revision)
    // This mimics the bug where advisory lock is released between retries or
    // concurrent operations query MAX(revision) at similar times
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      
      if (url.includes("/rest/v1/rpc/cms_mutate_content_with_revision")) {
        callCount++;
        
        // Simulate the bug: first 3 calls all try to use revision 10 (collision)
        // This represents the race condition where multiple operations calculate
        // the same next revision number
        if (callCount <= 3) {
          const duplicateRevision = 10;
          generatedRevisions.push(duplicateRevision);
          
          // First operation succeeds with revision 10
          if (callCount === 1) {
            return jsonResponse({
              record: { id: "ag10-arrival", status: "published", revision: duplicateRevision },
              revision: duplicateRevision,
              revision_id: `revision-${duplicateRevision}`,
              debug: { next_revision: duplicateRevision }
            });
          }
          
          // Subsequent operations fail with 409 Conflict (duplicate key)
          const errorMessage = `duplicate key value violates unique constraint "content_revisions_entity_table_entity_id_revision_key"\nKey: (entity_table, entity_id, revision)=(hero_banners, ag10-arrival, ${duplicateRevision})`;
          conflictErrors.push(errorMessage);
          
          return jsonResponse({
            code: "23505",
            message: errorMessage,
            details: "content_revisions_entity_table_entity_id_revision_key"
          }, { status: 409, statusText: "Conflict" });
        }
        
        // After retries, operations succeed with different revisions
        const nextRevision = 10 + callCount - 3;
        generatedRevisions.push(nextRevision);
        return jsonResponse({
          record: { id: "ag10-arrival", status: "published", revision: nextRevision },
          revision: nextRevision,
          revision_id: `revision-${nextRevision}`,
          debug: { next_revision: nextRevision }
        });
      }
      
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    // Simulate 5 concurrent publish operations on the same entity
    // This is a scoped PBT approach for deterministic reproduction
    const concurrentOperations = Array.from({ length: 5 }, (_, i) =>
      publishCmsRecord({
        table: "hero_banners",
        idColumn: "id",
        idValue: "ag10-arrival",
        actorId: "00000000-0000-0000-0000-000000000001",
        changeSummary: `Concurrent publish ${i + 1}`
      }, env)
    );

    // Execute all operations concurrently
    const results = await Promise.all(concurrentOperations);

    // Extract revision numbers from results
    const resultRevisions = results.map(r => r.revision).filter((rev): rev is number => typeof rev === "number");

    // ASSERTION 1: All revision numbers must be unique (no duplicates)
    const uniqueRevisions = new Set(resultRevisions);
    expect(uniqueRevisions.size).toBe(resultRevisions.length);
    
    expect(conflictErrors.length).toBeGreaterThan(0);
    expect(new Set(generatedRevisions).size).toBeLessThan(generatedRevisions.length);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(concurrentOperations.length);
  });

  /**
   * Property 1: Bug Condition - Concurrent Archive Operations Generate Unique Revisions
   * 
   * This test simulates concurrent archive operations on the same entity.
   * On UNFIXED code, this should FAIL with duplicate revision numbers.
   */
  it("handles concurrent archive operations with unique final revision numbers", async () => {
    const generatedRevisions: number[] = [];
    const conflictErrors: string[] = [];
    let callCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      
      if (url.includes("/rest/v1/rpc/cms_mutate_content_with_revision")) {
        callCount++;
        
        // Simulate collision: first 2 calls try revision 5
        if (callCount <= 2) {
          const duplicateRevision = 5;
          generatedRevisions.push(duplicateRevision);
          
          if (callCount === 1) {
            return jsonResponse({
              record: { id: "hero-test", status: "archived", revision: duplicateRevision },
              revision: duplicateRevision,
              revision_id: `revision-${duplicateRevision}`
            });
          }
          
          const errorMessage = `duplicate key value violates unique constraint "content_revisions_entity_table_entity_id_revision_key"\nKey: (entity_table, entity_id, revision)=(hero_banners, hero-test, ${duplicateRevision})`;
          conflictErrors.push(errorMessage);
          
          return jsonResponse({
            code: "23505",
            message: errorMessage,
            details: "content_revisions_entity_table_entity_id_revision_key"
          }, { status: 409, statusText: "Conflict" });
        }
        
        const nextRevision = 5 + callCount - 2;
        generatedRevisions.push(nextRevision);
        return jsonResponse({
          record: { id: "hero-test", status: "archived", revision: nextRevision },
          revision: nextRevision,
          revision_id: `revision-${nextRevision}`
        });
      }
      
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    // Simulate 3 concurrent archive operations
    const concurrentOperations = Array.from({ length: 3 }, (_, i) =>
      archiveCmsRecord({
        table: "hero_banners",
        idColumn: "id",
        idValue: "hero-test",
        actorId: "00000000-0000-0000-0000-000000000001",
        changeSummary: `Concurrent archive ${i + 1}`
      }, env)
    );

    const results = await Promise.all(concurrentOperations);
    const resultRevisions = results.map(r => r.revision).filter((rev): rev is number => typeof rev === "number");

    // All revision numbers must be unique
    const uniqueRevisions = new Set(resultRevisions);
    expect(uniqueRevisions.size).toBe(resultRevisions.length);
    expect(conflictErrors.length).toBeGreaterThan(0);
    expect(new Set(generatedRevisions).size).toBeLessThan(generatedRevisions.length);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(concurrentOperations.length);
  });

  /**
   * Property 1: Bug Condition - Concurrent Restore Operations Generate Unique Revisions
   * 
   * This test simulates concurrent restore operations on the same entity.
   * On UNFIXED code, this should FAIL with duplicate revision numbers.
   */
  it("handles concurrent restore operations with unique final revision numbers", async () => {
    const generatedRevisions: number[] = [];
    const conflictErrors: string[] = [];
    let callCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      
      if (url.includes("/rest/v1/rpc/cms_mutate_content_with_revision")) {
        callCount++;
        
        // Simulate collision: first 2 calls try revision 8
        if (callCount <= 2) {
          const duplicateRevision = 8;
          generatedRevisions.push(duplicateRevision);
          
          if (callCount === 1) {
            return jsonResponse({
              record: { id: "hero-restore", status: "published", revision: duplicateRevision },
              revision: duplicateRevision,
              revision_id: `revision-${duplicateRevision}`
            });
          }
          
          const errorMessage = `duplicate key value violates unique constraint "content_revisions_entity_table_entity_id_revision_key"\nKey: (entity_table, entity_id, revision)=(hero_banners, hero-restore, ${duplicateRevision})`;
          conflictErrors.push(errorMessage);
          
          return jsonResponse({
            code: "23505",
            message: errorMessage,
            details: "content_revisions_entity_table_entity_id_revision_key"
          }, { status: 409, statusText: "Conflict" });
        }
        
        const nextRevision = 8 + callCount - 2;
        generatedRevisions.push(nextRevision);
        return jsonResponse({
          record: { id: "hero-restore", status: "published", revision: nextRevision },
          revision: nextRevision,
          revision_id: `revision-${nextRevision}`
        });
      }
      
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    // Simulate 3 concurrent restore operations
    const concurrentOperations = Array.from({ length: 3 }, (_, i) =>
      restoreCmsRevision({
        table: "hero_banners",
        entityId: "hero-restore",
        actorId: "00000000-0000-0000-0000-000000000001",
        snapshot: { id: "hero-restore", title: `Restored ${i + 1}`, revision: 3 },
        changeSummary: `Concurrent restore ${i + 1}`
      }, env)
    );

    const results = await Promise.all(concurrentOperations);
    const resultRevisions = results.map(r => r.revision).filter((rev): rev is number => typeof rev === "number");

    // All revision numbers must be unique
    const uniqueRevisions = new Set(resultRevisions);
    expect(uniqueRevisions.size).toBe(resultRevisions.length);
    expect(conflictErrors.length).toBeGreaterThan(0);
    expect(new Set(generatedRevisions).size).toBeLessThan(generatedRevisions.length);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(concurrentOperations.length);
  });

  /**
   * Property 1: Bug Condition - Mixed Concurrent Operations Generate Unique Revisions
   * 
   * This test simulates mixed concurrent operations (publish, archive, restore) on the same entity.
   * On UNFIXED code, this should FAIL with duplicate revision numbers.
   */
  it("handles mixed concurrent operations with unique final revision numbers", async () => {
    const generatedRevisions: number[] = [];
    const conflictErrors: string[] = [];
    let callCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      
      if (url.includes("/rest/v1/rpc/cms_mutate_content_with_revision")) {
        callCount++;
        const body = JSON.parse(String(init?.body));
        
        // Simulate collision: first 3 calls all try revision 15
        if (callCount <= 3) {
          const duplicateRevision = 15;
          generatedRevisions.push(duplicateRevision);
          
          if (callCount === 1) {
            return jsonResponse({
              record: { id: "hero-mixed", status: body.p_operation === "archive" ? "archived" : "published", revision: duplicateRevision },
              revision: duplicateRevision,
              revision_id: `revision-${duplicateRevision}`
            });
          }
          
          const errorMessage = `duplicate key value violates unique constraint "content_revisions_entity_table_entity_id_revision_key"\nKey: (entity_table, entity_id, revision)=(hero_banners, hero-mixed, ${duplicateRevision})`;
          conflictErrors.push(errorMessage);
          
          return jsonResponse({
            code: "23505",
            message: errorMessage,
            details: "content_revisions_entity_table_entity_id_revision_key"
          }, { status: 409, statusText: "Conflict" });
        }
        
        const nextRevision = 15 + callCount - 3;
        generatedRevisions.push(nextRevision);
        return jsonResponse({
          record: { id: "hero-mixed", status: body.p_operation === "archive" ? "archived" : "published", revision: nextRevision },
          revision: nextRevision,
          revision_id: `revision-${nextRevision}`
        });
      }
      
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    // Simulate mixed concurrent operations: 2 publish, 1 archive, 1 restore
    const concurrentOperations = [
      publishCmsRecord({
        table: "hero_banners",
        idColumn: "id",
        idValue: "hero-mixed",
        actorId: "00000000-0000-0000-0000-000000000001",
        changeSummary: "Concurrent publish 1"
      }, env),
      publishCmsRecord({
        table: "hero_banners",
        idColumn: "id",
        idValue: "hero-mixed",
        actorId: "00000000-0000-0000-0000-000000000001",
        changeSummary: "Concurrent publish 2"
      }, env),
      archiveCmsRecord({
        table: "hero_banners",
        idColumn: "id",
        idValue: "hero-mixed",
        actorId: "00000000-0000-0000-0000-000000000001",
        changeSummary: "Concurrent archive"
      }, env),
      restoreCmsRevision({
        table: "hero_banners",
        entityId: "hero-mixed",
        actorId: "00000000-0000-0000-0000-000000000001",
        snapshot: { id: "hero-mixed", title: "Restored", revision: 5 },
        changeSummary: "Concurrent restore"
      }, env)
    ];

    const results = await Promise.all(concurrentOperations);
    const resultRevisions = results.map(r => r.revision).filter((rev): rev is number => typeof rev === "number");

    // All revision numbers must be unique
    const uniqueRevisions = new Set(resultRevisions);
    expect(uniqueRevisions.size).toBe(resultRevisions.length);
    expect(conflictErrors.length).toBeGreaterThan(0);
    expect(new Set(generatedRevisions).size).toBeLessThan(generatedRevisions.length);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(concurrentOperations.length);
  });
});
