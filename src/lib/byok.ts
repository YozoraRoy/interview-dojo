import type { ByokConfig } from "./llm/types.ts";

const BYOK_STORAGE_KEY = "interview_dojo_byok_v1";

export function loadByokConfig(): ByokConfig {
  if (typeof window === "undefined") return { liveMode: "local" };
  try {
    const raw = localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return { liveMode: "local" };
    const parsed = JSON.parse(raw) as ByokConfig;
    return {
      liveMode: parsed.liveMode === "cloud" ? "cloud" : "local",
      geminiKey: parsed.geminiKey ?? "",
      openrouterKey: parsed.openrouterKey ?? "",
      openaiKey: parsed.openaiKey ?? "",
      groqKey: parsed.groqKey ?? "",
      deepseekKey: parsed.deepseekKey ?? "",
      tier1Model: parsed.tier1Model ?? "",
      tier2Model: parsed.tier2Model ?? "",
      tier3Model: parsed.tier3Model ?? "",
    };
  } catch {
    return { liveMode: "local" };
  }
}

export function saveByokConfig(cfg: ByokConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // 忽略
  }
}

/** 產生傳給本機 Next.js 後端轉發的 BYOK Headers（僅存記憶體、不落盤）。 */
export function buildByokHeaders(cfg: ByokConfig = loadByokConfig()): Record<string, string> {
  const headers: Record<string, string> = {
    "x-llm-mode": cfg.liveMode === "cloud" ? "cloud" : "local",
  };
  if (cfg.geminiKey?.trim()) headers["x-llm-byok-gemini"] = cfg.geminiKey.trim();
  if (cfg.openrouterKey?.trim()) headers["x-llm-byok-openrouter"] = cfg.openrouterKey.trim();
  if (cfg.openaiKey?.trim()) headers["x-llm-byok-openai"] = cfg.openaiKey.trim();
  if (cfg.groqKey?.trim()) headers["x-llm-byok-groq"] = cfg.groqKey.trim();
  if (cfg.deepseekKey?.trim()) headers["x-llm-byok-deepseek"] = cfg.deepseekKey.trim();
  if (cfg.tier1Model?.trim()) headers["x-llm-tier1-model"] = cfg.tier1Model.trim();
  if (cfg.tier2Model?.trim()) headers["x-llm-tier2-model"] = cfg.tier2Model.trim();
  if (cfg.tier3Model?.trim()) headers["x-llm-tier3-model"] = cfg.tier3Model.trim();
  return headers;
}
