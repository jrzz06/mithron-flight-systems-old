import { generateGeminiText } from "@/lib/gemini-client";
import { openAiCompatibleStream, ProviderRequestError } from "@/lib/ai/openai-compatible";
import {
  isRetryableProviderStatus,
  providerLabel,
  resolveAiProviderCredentials,
  type AiProviderCredential
} from "@/lib/ai/provider-pool";

export type StreamTextWithFallbackInput = {
  system: string;
  user: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
};

function textToReadableStream(text: string) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
}

async function streamWithCredential(credential: AiProviderCredential, input: StreamTextWithFallbackInput) {
  if (credential.provider === "gemini") {
    const historyBlock = input.history?.length
      ? `Conversation so far:\n${input.history
          .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
          .join("\n")}\n\n`
      : "";
    const text = await generateGeminiText({
      system: input.system,
      prompt: `${historyBlock}User: ${input.user}`,
      temperature: input.temperature,
      env: input.env,
      skipRateLimit: false
    });
    return textToReadableStream(text);
  }

  return openAiCompatibleStream({
    credential,
    system: input.system,
    user: input.user,
    history: input.history,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    signal: input.signal
  });
}

export async function streamTextWithFallback(input: StreamTextWithFallbackInput) {
  const env = input.env ?? process.env;
  const credentials = resolveAiProviderCredentials(env);

  if (!credentials.length) {
    throw new Error("No AI providers configured.");
  }

  let lastError: Error | null = null;

  for (let index = 0; index < credentials.length; index += 1) {
    const credential = credentials[index];
    const isLast = index === credentials.length - 1;

    try {
      const body = await streamWithCredential(credential, input);
      const format = credential.provider === "gemini" ? ("plain" as const) : ("sse" as const);
      console.info(`[ai/provider] stream succeeded via ${providerLabel(credential.provider)}`);
      return { body, provider: providerLabel(credential.provider), format };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = error instanceof ProviderRequestError ? error.status : undefined;
      const retryable =
        typeof status === "number"
          ? isRetryableProviderStatus(status)
          : /quota|rate.?limit|resource exhausted/i.test(lastError.message);

      if (!isLast && retryable) {
        console.warn(
          `[ai/provider] ${providerLabel(credential.provider)} stream failed (${status ?? "quota"}), trying next provider`
        );
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("No AI providers configured.");
}
