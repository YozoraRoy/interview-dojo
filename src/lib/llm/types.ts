/** Issue #7：外部 LLM 供應商、三層混搭路由與 BYOK 抽象型別。 */

export type LLMTaskType = "live" | "persona" | "review";

export type LLMTier = "local" | "tier1" | "tier2" | "tier3";

export type ProviderId =
  | "ollama"
  | "gemini"
  | "openrouter"
  | "openai"
  | "groq"
  | "deepseek";

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResultMeta {
  provider: ProviderId;
  model: string;
  tier: LLMTier;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMGenerateOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  formatJson?: boolean;
  signal?: AbortSignal;
}

export interface LLMStreamChunk {
  text?: string;
  usage?: LLMUsage;
}

export interface LLMProvider {
  readonly id: ProviderId;
  streamChat(
    messages: LLMMessage[],
    options: LLMGenerateOptions,
  ): AsyncIterable<LLMStreamChunk>;
  completeChat(
    messages: LLMMessage[],
    options: LLMGenerateOptions,
  ): Promise<{ text: string; usage?: LLMUsage }>;
}

export interface ByokConfig {
  liveMode?: "local" | "cloud";
  geminiKey?: string;
  openrouterKey?: string;
  openaiKey?: string;
  groqKey?: string;
  deepseekKey?: string;
  tier1Model?: string;
  tier2Model?: string;
  tier3Model?: string;
}

export interface RouteCandidate {
  provider: LLMProvider;
  tier: LLMTier;
  model: string;
}
