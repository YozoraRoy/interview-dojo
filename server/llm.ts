import { config } from "./config.ts";
import type { SpeechMetrics, TurnEntry } from "./metrics.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 保留 system prompt 與最近 maxPairs 輪對話，避免長面試撐爆 8192 context
 * 而擠掉角色設定或造成 VRAM KV-cache 溢位。
 */
export function trimMessagesForLive(
  messages: ChatMessage[],
  maxPairs = 12,
): ChatMessage[] {
  if (messages.length <= 1 + maxPairs * 2) return messages;
  const [system, ...rest] = messages;
  if (system?.role !== "system") return messages.slice(-maxPairs * 2);
  return [system, ...rest.slice(-maxPairs * 2)];
}

/** 呼叫 Ollama 串流對話，逐片段 yield 文字。 */
export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const windowed = trimMessagesForLive(messages);
  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.modelLive,
      stream: true,
      think: false,
      options: { num_ctx: config.numCtx, temperature: 0.6 },
      messages: windowed,
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

/** 立即從 VRAM 卸載指定模型（keep_alive: 0），為評分大模型騰出顯存。 */
export async function unloadModel(model: string): Promise<void> {
  try {
    await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [], keep_alive: 0 }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 若模型未載入可忽略
  }
}

/** 使用評分模型（gemma4:12b）產出繁體中文＋日文改良範例的結構化面試報告。 */
export async function generateReview(
  turns: TurnEntry[],
  metrics: SpeechMetrics,
): Promise<string> {
  const transcript = turns
    .filter((t, idx) => t.role !== "system" && !(idx === 1 && t.content === "面接を始めてください。"))
    .map((t) => {
      const tag = t.role === "assistant" ? "面試官" : "應試者";
      const ts = typeof t.offsetSec === "number" ? `[${Math.floor(t.offsetSec)}s] ` : "";
      return `${ts}${tag}：${t.content}`;
    })
    .join("\n");

  const prompt = `請你擔任熟悉日本 IT 企業中途採用（Tech Lead / 架構師 / PM）的資深面試教練，根據以下面試逐字稿與口語指標，用**繁體中文**產出一份具體、不客套的 Markdown 復盤報告（日文改良範例請保留日文）。

## 口語量化指標
- 有效回答次數：${metrics.userTurns} 次
- 總字數：${metrics.totalChars} 字（平均每次 ${metrics.avgCharsPerTurn} 字）
- 日文填充詞（えー/あの等）次數：${metrics.fillerTotal} 次（明細：${JSON.stringify(metrics.fillers)}）

## 面試逐字稿
${transcript || "（尚無有效對話內容）"}

## 報告格式要求
請嚴格包含以下四個區塊，每個維度與診斷都要引用逐字稿中的實際發言：
1. **總評與錄取風險摘要**（3 行內講重點）
2. **四維度評分**（1–5 分）
   - 結論先行（結論ファースト）
   - 架構與技術取捨（Trade-off）
   - PM／團隊領導與跨部門協調
   - 商務日語自然度與敬語
3. **口語不清診斷與道地日文改寫（朗讀練習專區）**
   請針對應試者的實際回答，逐條挑出「口語不清楚／停頓過多／語句斷裂／中式日語語序／敬語不夠道地」的句子（盡量涵蓋所有可改善的回答，最多 5 條），每條必須固定用以下格式呈現，方便之後反覆開口練習：
   - **問題原話** [時間點]：「引用應試者原話」
   - **診斷說明**：指出哪裡口齒/語意模糊、助詞或敬語錯誤、或為何不夠道地
   - **推薦口語說法（可直接照唸）**：> 「改成自然、簡潔、符合日本 IT 資深工程師／PM 面試現場的口語敬語（難讀漢字可附括號假名）」
   - **更進階的表達替換（選用）**：列出 1–2 個更道地的關鍵片語或連接詞替換（例如把「そして」換成「その結果」「具体的には」等）
4. **下次練習行動清單**（2–3 個具體動作）`;

  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.modelReview,
      stream: false,
      think: false,
      options: { num_ctx: 8192, temperature: 0.4 },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`評分模型錯誤 ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() ?? "";
}
