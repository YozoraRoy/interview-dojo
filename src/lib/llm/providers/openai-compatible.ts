import type {
  LLMGenerateOptions,
  LLMMessage,
  LLMProvider,
  LLMStreamChunk,
  LLMUsage,
  ProviderId,
} from "../types.ts";

export interface OpenAICompatibleConfig {
  id: Exclude<ProviderId, "ollama" | "gemini">;
  baseUrl: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: Exclude<ProviderId, "ollama" | "gemini">;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly extraHeaders?: Record<string, string>;

  constructor(cfg: OpenAICompatibleConfig) {
    this.id = cfg.id;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.apiKey = cfg.apiKey;
    this.extraHeaders = cfg.extraHeaders;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };
  }

  async *streamChat(
    messages: LLMMessage[],
    options: LLMGenerateOptions,
  ): AsyncIterable<LLMStreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: options.model,
        stream: true,
        stream_options: { include_usage: true },
        temperature: options.temperature ?? 0.6,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        messages,
      }),
      signal: options.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`${this.id} API 錯誤 ${res.status}: ${await res.text()}`);
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
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          error?: { message?: string };
        };

        if (parsed.error?.message) {
          throw new Error(parsed.error.message);
        }

        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          yield { text: delta };
        }
        if (parsed.usage) {
          yield {
            usage: {
              inputTokens: parsed.usage.prompt_tokens ?? 0,
              outputTokens: parsed.usage.completion_tokens ?? 0,
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
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: options.model,
        stream: false,
        temperature: options.temperature ?? 0.4,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...(options.formatJson ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(`${this.id} API 錯誤 ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: data.choices?.[0]?.message?.content?.trim() ?? "",
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens ?? 0,
            outputTokens: data.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }
}
