import { NextResponse } from "next/server";
import { generateTextWithFallback } from "@/lib/ai/generate-text";
import { buildEditorAiSystemPrompt, buildEditorAiUserPrompt } from "@/lib/editor/ai-prompts";
import type { EditorAiAction } from "@/lib/editor/types";
import { shouldRefuseEditorAiInput, refusalText } from "@/lib/assistant/guards";
import { normalizeProductDescriptionHtml } from "@/lib/product-description-normalize";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { requireEditorAiPermission } from "@/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runEditorAi(input: {
  action: EditorAiAction;
  text: string;
  documentType?: string;
}) {
  const { text: rewritten } = await generateTextWithFallback({
    system: buildEditorAiSystemPrompt(input.documentType),
    user: buildEditorAiUserPrompt(input),
    temperature: 0.4,
    includeOpenAi: true
  });

  if (input.action === "normalize_structure") {
    const html = normalizeProductDescriptionHtml(rewritten) ?? normalizeProductDescriptionHtml(input.text);
    return { text: rewritten, html: html ?? undefined };
  }

  return { text: rewritten };
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireEditorAiPermission();
    const limit = await checkDistributedRateLimit(`editor-ai:${userId}`, 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const body = (await request.json()) as {
      action?: EditorAiAction;
      text?: string;
      documentType?: string;
    };
    const action = body.action;
    const text = body.text?.trim();
    const documentType = body.documentType?.trim() || undefined;

    if (!action || !text) {
      return NextResponse.json({ error: "Action and selected text are required." }, { status: 400 });
    }

    if (text.length > 20_000) {
      return NextResponse.json({ error: "Selected text is too long." }, { status: 400 });
    }

    if (shouldRefuseEditorAiInput(text).refuse) {
      return NextResponse.json({ error: refusalText() }, { status: 400 });
    }

    const result = await runEditorAi({ action, text, documentType });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI assistance failed.";
    const status = /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
