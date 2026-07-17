import {
  providerEndpoint,
  type AiProviderCredential,
  type AiProviderKind
} from "@/lib/ai/provider-pool";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class ProviderRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}

function buildOpenAiCompatibleHeaders(credential: AiProviderCredential) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credential.apiKey}`,
    "Content-Type": "application/json"
  };

  if (credential.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL?.trim() || "https://mithron.com";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME?.trim() || "Mithron";
  }

  return headers;
}

function buildMessages(input: {
  system: string;
  user: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  return [
    { role: "system" as const, content: input.system },
    ...(input.history?.slice(-10).map((message) => ({ role: message.role, content: message.content })) ?? []),
    { role: "user" as const, content: input.user }
  ];
}

export async function openAiCompatibleCompletion(input: {
  credential: AiProviderCredential;
  system: string;
  user: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}) {
  if (input.credential.provider === "gemini") {
    throw new ProviderRequestError("Gemini must use generateGeminiText adapter.");
  }

  const endpoint = providerEndpoint(input.credential.provider as Exclude<AiProviderKind, "gemini">);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildOpenAiCompatibleHeaders(input.credential),
    signal: input.signal,
    body: JSON.stringify({
      model: input.credential.model,
      temperature: input.temperature ?? 0.4,
      max_tokens: input.maxTokens ?? 512,
      stream: false,
      messages: buildMessages(input)
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ProviderRequestError(
      `${input.credential.provider} provider error (${response.status}): ${detail || response.statusText}`,
      response.status
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new ProviderRequestError(`${input.credential.provider} returned an empty response.`, 502);
  }

  return text;
}

export async function openAiCompatibleStream(input: {
  credential: AiProviderCredential;
  system: string;
  user: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}) {
  if (input.credential.provider === "gemini") {
    throw new ProviderRequestError("Gemini must use generateGeminiText adapter.");
  }

  const endpoint = providerEndpoint(input.credential.provider as Exclude<AiProviderKind, "gemini">);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildOpenAiCompatibleHeaders(input.credential),
    signal: input.signal,
    body: JSON.stringify({
      model: input.credential.model,
      temperature: input.temperature ?? 0.2,
      top_p: 0.9,
      max_completion_tokens: input.maxTokens ?? 512,
      stream: true,
      messages: buildMessages(input)
    })
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new ProviderRequestError(
      `${input.credential.provider} provider error (${response.status}): ${detail || response.statusText}`,
      response.status
    );
  }

  return response.body;
}
