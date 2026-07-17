import { describe, expect, it } from "vitest";
import {
  isRetryableProviderStatus,
  providerEndpoint,
  resolveAiProviderCredentials
} from "@/lib/ai/provider-pool";

describe("ai provider pool", () => {
  it("orders providers groq -> openrouter -> cerebras -> gemini", () => {
    const env = {
      GROQ_API_KEY: "groq-1",
      GROQ_API_KEYS: "groq-2",
      OPENROUTER_API_KEY: "or-1",
      CEREBRAS_API_KEY: "cb-1",
      GEMINI_API_KEY: "gem-1",
      GROQ_MODEL: "groq-model",
      OPENROUTER_MODEL: "or-model",
      CEREBRAS_MODEL: "cb-model",
      GEMINI_TEXT_MODEL: "gem-model"
    };

    const credentials = resolveAiProviderCredentials(env);
    expect(credentials.map((entry) => entry.provider)).toEqual([
      "groq",
      "groq",
      "openrouter",
      "cerebras",
      "gemini"
    ]);
    expect(credentials[0]).toMatchObject({ apiKey: "groq-1", model: "groq-model" });
    expect(credentials[2]).toMatchObject({ apiKey: "or-1", model: "or-model" });
  });

  it("skips providers without keys", () => {
    const credentials = resolveAiProviderCredentials({
      CEREBRAS_API_KEY: "cb-only",
      CEREBRAS_MODEL: "cb-model"
    });
    expect(credentials).toEqual([{ provider: "cerebras", apiKey: "cb-only", model: "cb-model" }]);
  });

  it("includes openai only when requested for editor fallback", () => {
    const env = {
      GEMINI_API_KEY: "gem-1",
      OPENAI_API_KEY: "oa-1",
      OPENAI_EDITOR_MODEL: "gpt-test"
    };

    expect(resolveAiProviderCredentials(env).map((entry) => entry.provider)).toEqual(["gemini"]);
    expect(resolveAiProviderCredentials(env, { includeOpenAi: true }).map((entry) => entry.provider)).toEqual([
      "gemini",
      "openai"
    ]);
  });

  it("maps retryable provider statuses", () => {
    expect(isRetryableProviderStatus(401)).toBe(true);
    expect(isRetryableProviderStatus(429)).toBe(true);
    expect(isRetryableProviderStatus(503)).toBe(true);
    expect(isRetryableProviderStatus(400)).toBe(false);
  });

  it("maps openai-compatible endpoints", () => {
    expect(providerEndpoint("groq")).toContain("groq.com");
    expect(providerEndpoint("openrouter")).toContain("openrouter.ai");
    expect(providerEndpoint("cerebras")).toContain("cerebras.ai");
  });
});
