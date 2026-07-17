import { generateGeminiText } from "@/lib/gemini-client";
import { openAiCompatibleCompletion, ProviderRequestError } from "@/lib/ai/openai-compatible";
import {
  isRetryableProviderStatus,
  providerLabel,
  resolveAiProviderCredentials,
  type AiProviderCredential
} from "@/lib/ai/provider-pool";

export type GenerateTextWithFallbackInput = {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  includeOpenAi?: boolean;
  skipGeminiRateLimit?: boolean;
  env?: Record<string, string | undefined>;
};

async function generateWithCredential(
  credential: AiProviderCredential,
  input: GenerateTextWithFallbackInput
) {
  if (credential.provider === "gemini") {
    return generateGeminiText({
      system: input.system,
      prompt: input.user,
      temperature: input.temperature,
      env: input.env,
      skipRateLimit: input.skipGeminiRateLimit
    });
  }

  return openAiCompatibleCompletion({
    credential,
    system: input.system,
    user: input.user,
    temperature: input.temperature,
    maxTokens: input.maxTokens
  });
}

export async function generateTextWithFallback(input: GenerateTextWithFallbackInput) {
  const env = input.env ?? process.env;
  const credentials = resolveAiProviderCredentials(env, { includeOpenAi: input.includeOpenAi ?? true });

  if (!credentials.length) {
    throw new Error(
      "AI assistance is not configured. Set GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY."
    );
  }

  let lastError: Error | null = null;

  for (let index = 0; index < credentials.length; index += 1) {
    const credential = credentials[index];
    const isLast = index === credentials.length - 1;

    try {
      const text = await generateWithCredential(credential, input);
      console.info(`[ai/provider] generate succeeded via ${providerLabel(credential.provider)}`);
      return { text, provider: providerLabel(credential.provider) };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = error instanceof ProviderRequestError ? error.status : undefined;
      const retryable =
        typeof status === "number"
          ? isRetryableProviderStatus(status)
          : /quota|rate.?limit|resource exhausted/i.test(lastError.message);

      if (!isLast && retryable) {
        console.warn(
          `[ai/provider] ${providerLabel(credential.provider)} failed (${status ?? "quota"}), trying next provider`
        );
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("No AI providers configured.");
}
