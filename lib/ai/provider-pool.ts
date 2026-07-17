import { resolveGroqApiKeys } from "@/lib/assistant/groq-keys";
import { getGeminiApiKey, getGeminiTextModel } from "@/lib/gemini-client";

export type AiProviderKind = "groq" | "openrouter" | "cerebras" | "gemini" | "openai";

export type AiProviderCredential = {
  provider: AiProviderKind;
  apiKey: string;
  model: string;
};

const DEFAULT_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.1-8b-instruct";
const DEFAULT_CEREBRAS_MODEL = "llama3.1-8b";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/** HTTP statuses where trying the next provider/key may succeed. */
export function isRetryableProviderStatus(status: number) {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

/** @deprecated Use isRetryableProviderStatus */
export function isGroqKeyRetryableStatus(status: number) {
  return isRetryableProviderStatus(status);
}

export function resolveAiProviderCredentials(
  env: Record<string, string | undefined> = process.env,
  options?: { includeOpenAi?: boolean }
): AiProviderCredential[] {
  const credentials: AiProviderCredential[] = [];

  const groqModel = env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  for (const apiKey of resolveGroqApiKeys(env)) {
    credentials.push({ provider: "groq", apiKey, model: groqModel });
  }

  const openRouterKey = env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    credentials.push({
      provider: "openrouter",
      apiKey: openRouterKey,
      model: env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
    });
  }

  const cerebrasKey = env.CEREBRAS_API_KEY?.trim();
  if (cerebrasKey) {
    credentials.push({
      provider: "cerebras",
      apiKey: cerebrasKey,
      model: env.CEREBRAS_MODEL?.trim() || DEFAULT_CEREBRAS_MODEL
    });
  }

  const geminiKey = getGeminiApiKey(env);
  if (geminiKey) {
    credentials.push({
      provider: "gemini",
      apiKey: geminiKey,
      model: getGeminiTextModel(env)
    });
  }

  if (options?.includeOpenAi) {
    const openAiKey = env.OPENAI_API_KEY?.trim();
    if (openAiKey) {
      credentials.push({
        provider: "openai",
        apiKey: openAiKey,
        model: env.OPENAI_EDITOR_MODEL?.trim() || DEFAULT_OPENAI_MODEL
      });
    }
  }

  return credentials;
}

export function providerEndpoint(provider: AiProviderKind) {
  switch (provider) {
    case "groq":
      return "https://api.groq.com/openai/v1/chat/completions";
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "cerebras":
      return "https://api.cerebras.ai/v1/chat/completions";
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    default:
      throw new Error(`Provider ${provider} does not use OpenAI-compatible endpoints.`);
  }
}

export function providerLabel(provider: AiProviderKind) {
  switch (provider) {
    case "groq":
      return "groq";
    case "openrouter":
      return "openrouter";
    case "cerebras":
      return "cerebras";
    case "gemini":
      return "gemini";
    case "openai":
      return "openai";
  }
}
