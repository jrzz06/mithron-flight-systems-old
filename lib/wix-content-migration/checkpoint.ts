import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { checkpointPath, runsDir } from "./paths.ts";
import type { CheckpointState } from "./types.ts";

export function createCheckpoint(input: {
  runId: string;
  mode: "DRY_RUN" | "APPLIED";
  batchSize: number;
}): CheckpointState {
  const now = new Date().toISOString();
  const state: CheckpointState = {
    version: 1,
    run_id: input.runId,
    created_at: now,
    updated_at: now,
    mode: input.mode,
    fingerprint_by_slug: {},
    completed_slugs: [],
    failed_slugs: [],
    last_success_slug: null,
    batch_size: input.batchSize
  };
  writeCheckpoint(state);
  return state;
}

export function readCheckpoint(runId: string): CheckpointState | null {
  const path = checkpointPath(runId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as CheckpointState;
}

export function writeCheckpoint(state: CheckpointState) {
  mkdirSync(runsDir(state.run_id), { recursive: true });
  const next = { ...state, updated_at: new Date().toISOString() };
  writeFileSync(checkpointPath(state.run_id), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function markCheckpointSuccess(state: CheckpointState, slug: string, fingerprint: string) {
  const completed = new Set(state.completed_slugs);
  completed.add(slug);
  const failed = new Set(state.failed_slugs);
  failed.delete(slug);
  return writeCheckpoint({
    ...state,
    completed_slugs: [...completed],
    failed_slugs: [...failed],
    fingerprint_by_slug: {
      ...state.fingerprint_by_slug,
      [slug]: fingerprint
    },
    last_success_slug: slug
  });
}

export function markCheckpointFailure(state: CheckpointState, slug: string) {
  const failed = new Set(state.failed_slugs);
  failed.add(slug);
  return writeCheckpoint({
    ...state,
    failed_slugs: [...failed]
  });
}

export function isSlugAlreadyMigrated(state: CheckpointState, slug: string, fingerprint: string) {
  return state.fingerprint_by_slug[slug] === fingerprint && state.completed_slugs.includes(slug);
}
