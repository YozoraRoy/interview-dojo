import { config } from "../config.ts";
import { estimateCostUsd, isOverDailyBudget, recordUsage } from "./ledger.ts";
import { GeminiProvider } from "./providers/gemini.ts";
import { OllamaProvider } from "./providers/ollama.ts";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.ts";
import type {
  ByokConfig,
  LLMGenerateOptions,
  LLMMessage,
  LLMProvider,
  LLMResultMeta,
  LLMTaskType,
  LLMUsage,
  ProviderId,
  RouteCandidate,
} from "./types.ts";

/** 從 HTTP Headers 解析前端傳入的 BYOK 設定（僅於該次請求記憶體中使用）。 */
export function parseByokFromHeaders(headers: Headers): ByokConfig {
  const mode = headers.get("x-llm-mode");
  return {
    liveMode: mode === "cloud" ? "cloud" : "local",
    geminiKey: headers.get("x-llm-byok-gemini")?.trim() || undefined,
    openrouterKey: headers.get("x-llm-byok-openrouter")?.trim() || undefined,
    openaiKey: headers.get("x-llm-byok-openai")?.trim() || undefined,
    groqKey: headers.get("x-llm-byok-groq")?.trim() || undefined,
    deepseekKey: headers.get("x-llm-byok-deepseek")?.trim() || undefined,
    tier1Model: headers.get("x-llm-tier1-model")?.trim() || undefined,
    tier2Model: headers.get("x-llm-tier2-model")?.trim() || undefined,
    tier3Model: headers.get("x-llm-tier3-model")?.trim() || undefined,
  };
}

function resolveKeys(byok?: ByokConfig) {
  return {
    gemini: byok?.geminiKey || config.geminiApiKey,
    openrouter: byok?.openrouterKey || config.openrouterApiKey,
    openai: byok?.openaiKey || config.openaiApiKey,
    groq: byok?.groqKey || config.groqApiKey,
    deepseek: byok?.deepseekKey || config.deepseekApiKey,
  };
}

export function hasAnyCloudKey(byok?: ByokConfig): boolean {
  const keys = resolveKeys(byok);
  return Boolean(
    keys.gemini || keys.openrouter || keys.openai || keys.groq || keys.deepseek,
  );
}

export function createProviderById(
  id: ProviderId,
  byok?: ByokConfig,
): LLMProvider | null {
  const keys = resolveKeys(byok);
  switch (id) {
    case "ollama":
      return new OllamaProvider();
    case "gemini":
      return keys.gemini ? new GeminiProvider(keys.gemini) : null;
    case "openrouter":
      return keys.openrouter
        ? new OpenAICompatibleProvider({
            id: "openrouter",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: keys.openrouter,
            extraHeaders: { "X-Title": "interview-dojo" },
          })
        : null;
    case "openai":
      return keys.openai
        ? new OpenAICompatibleProvider({
            id: "openai",
            baseUrl: "https://api.openai.com/v1",
            apiKey: keys.openai,
          })
        : null;
    case "groq":
      return keys.groq
        ? new OpenAICompatibleProvider({
            id: "groq",
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: keys.groq,
          })
        : null;
    case "deepseek":
      return keys.deepseek
        ? new OpenAICompatibleProvider({
            id: "deepseek",
            baseUrl: "https://api.deepseek.com/v1",
            apiKey: keys.deepseek,
          })
        : null;
  }
}

function buildTierCandidates(byok?: ByokConfig): {
  tier1: RouteCandidate[];
  tier2: RouteCandidate[];
  tier3: RouteCandidate[];
} {
  const keys = resolveKeys(byok);
  const t1Custom = byok?.tier1Model || config.llmTier1Model;
  const t2Custom = byok?.tier2Model || config.llmTier2Model;
  const t3Custom = byok?.tier3Model || config.llmTier3Model;

  const tier1: RouteCandidate[] = [];
  const tier2: RouteCandidate[] = [];
  const tier3: RouteCandidate[] = [];

  if (keys.gemini) {
    const p = createProviderById("gemini", byok)!;
    tier1.push({ provider: p, tier: "tier1", model: t1Custom || "gemini-2.5-flash-lite" });
    tier2.push({ provider: p, tier: "tier2", model: t2Custom || "gemini-2.5-flash" });
    tier3.push({ provider: p, tier: "tier3", model: t3Custom || "gemini-2.5-pro" });
  }
  if (keys.groq) {
    const p = createProviderById("groq", byok)!;
    tier1.push({ provider: p, tier: "tier1", model: t1Custom || "llama-3.3-70b-versatile" });
  }
  if (keys.deepseek) {
    const p = createProviderById("deepseek", byok)!;
    tier2.push({ provider: p, tier: "tier2", model: t2Custom || "deepseek-chat" });
    tier3.push({ provider: p, tier: "tier3", model: t3Custom || "deepseek-reasoner" });
  }
  if (keys.openai) {
    const p = createProviderById("openai", byok)!;
    tier2.push({ provider: p, tier: "tier2", model: t2Custom || "gpt-4o-mini" });
    tier3.push({ provider: p, tier: "tier3", model: t3Custom || "gpt-4.1" });
  }
  if (keys.openrouter) {
    const p = createProviderById("openrouter", byok)!;
    tier1.push({
      provider: p,
      tier: "tier1",
      model: t1Custom || "google/gemini-2.5-flash-lite",
    });
    tier2.push({
      provider: p,
      tier: "tier2",
      model: t2Custom || "google/gemini-2.5-flash",
    });
    tier3.push({
      provider: p,
      tier: "tier3",
      model: t3Custom || "anthropic/claude-sonnet-4",
    });
  }

  return { tier1, tier2, tier3 };
}

/** 根據任務型別、BYOK 設定與預算上限，建立依序降級的候選路由鏈。 */
export function buildFallbackChain(
  task: LLMTaskType,
  byok?: ByokConfig,
  overBudget = false,
): RouteCandidate[] {
  const localModel = task === "review" ? config.modelReview : config.modelLive;
  const localCandidate: RouteCandidate = {
    provider: new OllamaProvider(),
    tier: "local",
    model: localModel,
  };

  if (overBudget || !hasAnyCloudKey(byok)) {
    return [localCandidate];
  }

  const { tier1, tier2, tier3 } = buildTierCandidates(byok);

  if (task === "live") {
    if (byok?.liveMode !== "cloud") {
      return [localCandidate];
    }
    return [...tier1, localCandidate];
  }

  if (task === "persona") {
    return [...tier2, ...tier1, localCandidate];
  }

  // task === "review"
  return [...tier3, ...tier2, ...tier1, localCandidate];
}

export async function* streamWithFallback(
  task: LLMTaskType,
  messages: LLMMessage[],
  options: Omit<LLMGenerateOptions, "model">,
  byok?: ByokConfig,
  onComplete?: (meta: LLMResultMeta) => void,
): AsyncIterable<string> {
  const overBudget = await isOverDailyBudget();
  const chain = buildFallbackChain(task, byok, overBudget);

  let lastError: unknown;
  for (const candidate of chain) {
    let emittedAny = false;
    let usage: LLMUsage | undefined;
    try {
      for await (const chunk of candidate.provider.streamChat(messages, {
        ...options,
        model: candidate.model,
      })) {
        if (chunk.text) {
          emittedAny = true;
          yield chunk.text;
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }

      const meta: LLMResultMeta = {
        provider: candidate.provider.id,
        model: candidate.model,
        tier: candidate.tier,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        estimatedCostUsd: estimateCostUsd(candidate.provider.id, candidate.model, usage),
      };
      await recordUsage(meta).catch(() => {});
      onComplete?.(meta);
      return;
    } catch (err) {
      lastError = err;
      // 若已經開始輸出句子，為避免語意混亂直接拋錯；否則無縫降級下一個候選
      if (emittedAny || options.signal?.aborted) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("所有 LLM 路由候選皆失敗");
}

export async function completeWithFallback(
  task: LLMTaskType,
  messages: LLMMessage[],
  options: Omit<LLMGenerateOptions, "model">,
  byok?: ByokConfig,
): Promise<{ text: string; meta: LLMResultMeta }> {
  const overBudget = await isOverDailyBudget();
  const chain = buildFallbackChain(task, byok, overBudget);

  let lastError: unknown;
  for (const candidate of chain) {
    try {
      const result = await candidate.provider.completeChat(messages, {
        ...options,
        model: candidate.model,
      });
      const meta: LLMResultMeta = {
        provider: candidate.provider.id,
        model: candidate.model,
        tier: candidate.tier,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        estimatedCostUsd: estimateCostUsd(
          candidate.provider.id,
          candidate.model,
          result.usage,
        ),
      };
      await recordUsage(meta).catch(() => {});
      return { text: result.text, meta };
    } catch (err) {
      lastError = err;
      if (options.signal?.aborted) throw err;
    }
  }

  throw lastError ?? new Error("所有 LLM 路由候選皆失敗");
}
