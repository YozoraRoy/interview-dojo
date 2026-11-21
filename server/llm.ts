import { config } from "./config.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 呼叫 Ollama 串流對話，逐片段 yield 文字。 */
export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.modelLive,
      stream: true,
      think: false,
      options: { num_ctx: config.numCtx, temperature: 0.6 },
      messages,
    }),
    signal,
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
      const obj = JSON.parse(line) as { message?: { content?: string }; error?: string };
      if (obj.error) throw new Error(obj.error);
      if (obj.message?.content) yield obj.message.content;
    }
  }
}
