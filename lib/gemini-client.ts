import { acquireGeminiTextSlot } from "./gemini-rate-limit.ts";
import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  DEFAULT_GEMINI_TEXT_MODEL,
  estimateGeminiTokens
} from "./gemini-model-policy.ts";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
        inlineData?: { mimeType?: string; data?: string };
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string };
};

export function getGeminiApiKey(env: Record<string, string | undefined> = process.env) {
  return env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
}

export function getGeminiTextModel(env: Record<string, string | undefined> = process.env) {
  return env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_GEMINI_TEXT_MODEL;
}

export function getGeminiImageModel(env: Record<string, string | undefined> = process.env) {
  return env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
}

function extractGeminiText(payload: GeminiGenerateContentResponse) {
  return payload.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export async function generateGeminiText(input: {
  system: string;
  prompt: string;
  temperature?: number;
  env?: Record<string, string | undefined>;
  maxWaitMs?: number;
  skipRateLimit?: boolean;
}) {
  const env = input.env ?? process.env;
  const apiKey = getGeminiApiKey(env);
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = getGeminiTextModel(env);
  if (!input.skipRateLimit) {
    await acquireGeminiTextSlot({
      model,
      system: input.system,
      prompt: input.prompt,
      maxWaitMs: input.maxWaitMs,
      env
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: { temperature: input.temperature ?? 0.4 }
      })
    }
  );

  const payload = (await response.json()) as GeminiGenerateContentResponse;
  if (!response.ok) {
    const message = payload.error?.message ?? `Gemini text request failed (${response.status}).`;
    if (/quota|rate.?limit|resource exhausted/i.test(message)) {
      throw new Error(`Gemini quota/rate limit: ${message}`);
    }
    throw new Error(message);
  }

  const text = extractGeminiText(payload);
  if (!text) {
    throw new Error("Gemini returned an empty text response.");
  }

  return text;
}

export async function generateGeminiImage(input: {
  prompt: string;
  env?: Record<string, string | undefined>;
}) {
  const env = input.env ?? process.env;
  const apiKey = getGeminiApiKey(env);
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = getGeminiImageModel(env);
  await acquireGeminiTextSlot({
    model,
    prompt: input.prompt,
    estimatedTokens: estimateGeminiTokens(input.prompt),
    env,
    maxWaitMs: Number(env.GEMINI_IMAGE_RATE_LIMIT_MAX_WAIT_MS ?? "60000")
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
      })
    }
  );

  const payload = (await response.json()) as GeminiGenerateContentResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gemini image request failed (${response.status}).`);
  }

  const inlineData = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!inlineData?.data) {
    throw new Error("Gemini returned no image data.");
  }

  return {
    base64: inlineData.data,
    mimeType: inlineData.mimeType ?? "image/png"
  };
}
