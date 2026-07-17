import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

describe("supabase migration integrity", () => {
  it("has migration files to validate", () => {
    expect(listMigrationFiles().length).toBeGreaterThan(0);
  });

  it("contains no empty, truncated, or non-SQL migration files", () => {
    const suspicious: string[] = [];

    for (const file of listMigrationFiles()) {
      const raw = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const withoutComments = raw
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();

      // A valid migration must have meaningful SQL: at least one statement
      // terminator and enough content to not be a stray character (the historic
      // failure mode was a file whose entire contents were the single char "u").
      const hasStatement = withoutComments.includes(";");
      const hasBody = withoutComments.length >= 12;

      if (!hasStatement || !hasBody) {
        suspicious.push(file);
      }
    }

    expect(suspicious, `Corrupt or empty migrations: ${suspicious.join(", ")}`).toEqual([]);
  });
});
