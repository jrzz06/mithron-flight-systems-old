import { describe, expect, it } from "vitest";
import { getRedisRestCredentials, normalizeRedisEnvValue } from "@/lib/redis-client";

describe("normalizeRedisEnvValue", () => {
  it("strips surrounding double quotes that break Upstash URL parsing", () => {
    expect(normalizeRedisEnvValue('"https://example.upstash.io"')).toBe("https://example.upstash.io");
  });

  it("strips surrounding single quotes", () => {
    expect(normalizeRedisEnvValue("'https://example.upstash.io'")).toBe("https://example.upstash.io");
  });

  it("trims plain values without altering them", () => {
    expect(normalizeRedisEnvValue("  https://example.upstash.io  ")).toBe("https://example.upstash.io");
  });

  it("returns empty for missing values", () => {
    expect(normalizeRedisEnvValue(undefined)).toBe("");
    expect(normalizeRedisEnvValue(null)).toBe("");
    expect(normalizeRedisEnvValue("")).toBe("");
  });
});

describe("getRedisRestCredentials", () => {
  it("rejects quote-broken URLs that cannot be parsed", () => {
    const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
    const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = '"not a url"';
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    expect(getRedisRestCredentials()).toBeNull();
    process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  });

  it("accepts quoted https URLs after normalize", () => {
    const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
    const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = '"https://example.upstash.io"';
    process.env.UPSTASH_REDIS_REST_TOKEN = '"secret-token"';
    expect(getRedisRestCredentials()).toEqual({
      url: "https://example.upstash.io",
      token: "secret-token"
    });
    process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  });
});
