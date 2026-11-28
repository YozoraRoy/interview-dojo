import type {
  LLMGenerateOptions,
  LLMMessage,
  LLMProvider,
  LLMStreamChunk,
  LLMUsage,
} from "../types.ts";

function toGeminiBody(messages: LLMMessage[], options: LLMGenerateOptions) {
  const systemTexts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean);

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  return {
    ...(systemTexts.length > 0
      ? { systemInstruction: { parts: [{ text: systemTexts.join("\n\n") }] } }
      : {}),
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.6,
      ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
      ...(options.formatJson ? { responseMimeType: "application/json" } : {}),
    },
  };
}

export class GeminiProvider implements LLMProvider {
  readonly id = "gemini" as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async *streamChat(
    messages: LLMMessage[],
    options: LLMGenerateOptions,
  ): AsyncIterable<LLMStreamChunk> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toGeminiBody(messages, options)),
      signal: options.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Gemini API 錯誤 ${res.status}: ${await res.text()}`);
    }

    const decoder = new TextDecoder();
    let pending = "";

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      pending += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        const parsed = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          error?: { message?: string };
        };

        if (parsed.error?.message) {
          throw new Error(parsed.error.message);
        }

        const text = parsed.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("");
        if (text) {
          yield { text };
        }
        if (parsed.usageMetadata) {
          yield {
            usage: {
              inputTokens: parsed.usageMetadata.promptTokenCount ?? 0,
              outputTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
            },
          };
        }
      }
    }
  }

  async completeChat(
    messages: LLMMessage[],
    options: LLMGenerateOptions,
  ): Promise<{ text: string; usage?: LLMUsage }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toGeminiBody(messages, options)),
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(`Gemini API 錯誤 ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

    return {
      text,
      usage: data.usageMetadata
        ? {
            inputTokens: data.usageMetadata.promptTokenCount ?? 0,
            outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
          }
        : undefined,
    };
  }
}
