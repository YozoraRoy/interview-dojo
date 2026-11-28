import { config } from "../../config.ts";
import type {
  LLMGenerateOptions,
  LLMMessage,
  LLMProvider,
  LLMStreamChunk,
  LLMUsage,
} from "../types.ts";

export class OllamaProvider implements LLMProvider {
  readonly id = "ollama" as const;
  private readonly baseUrl: string;

  constructor(baseUrl = config.ollamaBaseUrl) {
    this.baseUrl = baseUrl;
  }

  async *streamChat(
    messages: LLMMessage[],
    options: LLMGenerateOptions,
  ): AsyncIterable<LLMStreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        stream: true,
        think: false,
        options: {
          num_ctx: config.numCtx,
          temperature: options.temperature ?? 0.6,
        },
        messages,
      }),
      signal: options.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama 回應錯誤 ${res.status}: ${await res.text()}`);
    }

    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      pending += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (!line) continue;
        const obj = JSON.parse(line) as {
          message?: { content?: string };
          error?: string;
          prompt_eval_count?: number;
          eval_count?: number;
          done?: boolean;
        };
        if (obj.error) throw new Error(obj.error);
        if (obj.message?.content) {
          yield { text: obj.message.content };
        }
        if (obj.done) {
          yield {
            usage: {
              inputTokens: obj.prompt_eval_count ?? 0,
              outputTokens: obj.eval_count ?? 0,
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
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        think: false,
        ...(options.formatJson ? { format: "json" } : {}),
        options: {
          num_ctx: config.numCtx,
          temperature: options.temperature ?? 0.4,
        },
        messages,
      }),
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama 錯誤 ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: data.message?.content?.trim() ?? "",
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }
}
