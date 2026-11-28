import { NextResponse } from "next/server";
import { createProviderById, parseByokFromHeaders } from "@/lib/llm/router.ts";
import type { ProviderId } from "@/lib/llm/types.ts";

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    provider?: ProviderId;
    model?: string;
  };

  const providerId = body.provider ?? "ollama";
  const byok = parseByokFromHeaders(request.headers);
  const provider = createProviderById(providerId, byok);

  if (!provider) {
    return NextResponse.json(
      { ok: false, error: `尚未設定 ${providerId} 的 API Key。` },
      { status: 400 },
    );
  }

  const defaultModels: Record<ProviderId, string> = {
    ollama: "gemma4:e4b",
    gemini: "gemini-2.5-flash-lite",
    openrouter: "google/gemini-2.5-flash-lite",
    openai: "gpt-4o-mini",
    groq: "llama-3.3-70b-versatile",
    deepseek: "deepseek-chat",
  };
  const model = body.model?.trim() || defaultModels[providerId];

  try {
    const start = Date.now();
    const res = await provider.completeChat(
      [{ role: "user", content: "Reply with OK only." }],
      { model, temperature: 0, maxTokens: 16, signal: AbortSignal.timeout(15000) },
    );
    return NextResponse.json({
      ok: true,
      provider: providerId,
      model,
      latencyMs: Date.now() - start,
      sample: res.text.slice(0, 40),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
