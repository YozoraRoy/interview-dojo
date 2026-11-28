import { config } from "./config.ts";
import { completeWithFallback, streamWithFallback } from "./llm/router.ts";
import type { ByokConfig, LLMResultMeta } from "./llm/types.ts";
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

/** 依路由策略（預設本地 Ollama，可選雲端 Tier 1 + 自動降級）進行串流對話。 */
export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
  byok?: ByokConfig,
  onComplete?: (meta: LLMResultMeta) => void,
): AsyncGenerator<string> {
  const windowed = trimMessagesForLive(messages);
  yield* streamWithFallback(
    "live",
    windowed,
    { temperature: 0.6, signal },
    byok,
    onComplete,
  );
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

function buildReviewPrompt(turns: TurnEntry[], metrics: SpeechMetrics): string {
  const transcript = turns
    .filter((t, idx) => t.role !== "system" && !(idx === 1 && t.content === "面接を始めてください。"))
    .map((t) => {
      const tag = t.role === "assistant" ? "面試官" : "應試者";
      const ts = typeof t.offsetSec === "number" ? `[${Math.floor(t.offsetSec)}s] ` : "";
      return `${ts}${tag}：${t.content}`;
    })
    .join("\n");

  return `請你擔任熟悉日本 IT 企業中途採用（Tech Lead / 架構師 / PM）的資深面試教練，根據以下面試逐字稿與口語指標，用**繁體中文**產出一份具體、不客套的 Markdown 復盤報告（日文改良範例請保留日文）。

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
}

/** 產出結構化面試復盤報告並回傳實際使用模型與預估費用。 */
export async function generateReviewWithMeta(
  turns: TurnEntry[],
  metrics: SpeechMetrics,
  byok?: ByokConfig,
): Promise<{ report: string; meta: LLMResultMeta }> {
  const prompt = buildReviewPrompt(turns, metrics);
  const { text, meta } = await completeWithFallback(
    "review",
    [{ role: "user", content: prompt }],
    { temperature: 0.4 },
    byok,
  );
  return { report: text.trim(), meta };
}

/** 相容舊介面：直接回傳復盤報告字串。 */
export async function generateReview(
  turns: TurnEntry[],
  metrics: SpeechMetrics,
  byok?: ByokConfig,
): Promise<string> {
  const { report } = await generateReviewWithMeta(turns, metrics, byok);
  return report;
}
