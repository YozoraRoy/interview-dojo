"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import { buildByokHeaders, loadByokConfig, saveByokConfig } from "@/lib/byok.ts";
import type { ByokConfig, ProviderId } from "@/lib/llm/types.ts";

const PROVIDERS: Array<{
  id: Exclude<ProviderId, "ollama">;
  label: string;
  keyField: keyof Pick<
    ByokConfig,
    "geminiKey" | "openrouterKey" | "openaiKey" | "groqKey" | "deepseekKey"
  >;
  placeholder: string;
}> = [
  { id: "gemini", label: "Google Gemini API Key", keyField: "geminiKey", placeholder: "AIza..." },
  { id: "openrouter", label: "OpenRouter API Key", keyField: "openrouterKey", placeholder: "sk-or-v1-..." },
  { id: "openai", label: "OpenAI API Key", keyField: "openaiKey", placeholder: "sk-..." },
  { id: "groq", label: "Groq API Key", keyField: "groqKey", placeholder: "gsk_..." },
  { id: "deepseek", label: "DeepSeek API Key", keyField: "deepseekKey", placeholder: "sk-..." },
];

export function SettingsClient() {
  const { t } = useI18n();
  const [speakerId, setSpeakerId] = useState("13");
  const [speed, setSpeed] = useState("1.05");
  const [byok, setByok] = useState<ByokConfig>({ liveMode: "local" });
  const [savedMsg, setSavedMsg] = useState("");
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const s = localStorage.getItem("interview_dojo_speaker_v1");
      if (s) setSpeakerId(s);
      const sp = localStorage.getItem("interview_dojo_speed_v1");
      if (sp) setSpeed(sp);
    } catch {
      // 忽略
    }
    setByok(loadByokConfig());
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("interview_dojo_speaker_v1", speakerId);
      localStorage.setItem("interview_dojo_speed_v1", speed);
      saveByokConfig(byok);
      setSavedMsg("已儲存語音與 BYOK 設定至本機瀏覽器（Key 絕不寫入後端磁碟）。");
    } catch {
      setSavedMsg("儲存失敗。");
    }
  };

  const handleTestProvider = async (providerId: ProviderId) => {
    setTestResults((prev) => ({ ...prev, [providerId]: "測試連線中…" }));
    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...buildByokHeaders(byok),
        },
        body: JSON.stringify({ provider: providerId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        model?: string;
        latencyMs?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setTestResults((prev) => ({
          ...prev,
          [providerId]: `失敗：${data.error ?? `HTTP ${res.status}`}`,
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [providerId]: `✓ 連線成功（${data.model} · ${data.latencyMs}ms）`,
        }));
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: `失敗：${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="text-base font-bold text-white">語音預設（VOICEVOX）</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-300">
            <span>{t("voiceLabel")} ID</span>
            <input
              type="number"
              value={speakerId}
              onChange={(e) => setSpeakerId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-300">
            <span>{t("speedLabel")} (0.85 - 1.35)</span>
            <input
              type="number"
              step="0.05"
              min="0.85"
              max="1.35"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h2 className="text-base font-bold text-white">
            外部 LLM API Key 與混搭梯隊（BYOK）
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            履歷濃縮與事後總評優先使用雲端梯隊以略過 8GB VRAM 卸載；即時對話預設維持本地 Ollama，亦可切換為雲端 Tier 1。無 Key 或達每日預算時自動退回純本地。
          </p>
        </div>

        <label className="block space-y-1 text-xs text-slate-300">
          <span>即時對話（modelLive）路由模式</span>
          <select
            value={byok.liveMode ?? "local"}
            onChange={(e) =>
              setByok((prev) => ({
                ...prev,
                liveMode: e.target.value === "cloud" ? "cloud" : "local",
              }))
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="local">Local Ollama 優先（零成本・預設）</option>
            <option value="cloud">Cloud Tier 1 優先（低延遲雲端小模型 + Ollama 保底）</option>
          </select>
        </label>

        <div className="space-y-3">
          {PROVIDERS.map((p) => (
            <div key={p.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{p.label}</span>
                {testResults[p.id] && (
                  <span
                    className={
                      testResults[p.id].startsWith("✓")
                        ? "text-emerald-400"
                        : testResults[p.id].startsWith("測試")
                          ? "text-amber-300"
                          : "text-rose-400"
                    }
                  >
                    {testResults[p.id]}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  value={byok[p.keyField] ?? ""}
                  onChange={(e) =>
                    setByok((prev) => ({ ...prev, [p.keyField]: e.target.value }))
                  }
                  placeholder={p.placeholder}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                />
                <button
                  type="button"
                  onClick={() => void handleTestProvider(p.id)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
                >
                  測試連線
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-300">
            <span>Tier 1 自訂模型（選填）</span>
            <input
              type="text"
              value={byok.tier1Model ?? ""}
              onChange={(e) => setByok((prev) => ({ ...prev, tier1Model: e.target.value }))}
              placeholder="gemini-2.5-flash-lite"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-300">
            <span>Tier 2 自訂模型（選填）</span>
            <input
              type="text"
              value={byok.tier2Model ?? ""}
              onChange={(e) => setByok((prev) => ({ ...prev, tier2Model: e.target.value }))}
              placeholder="gemini-2.5-flash"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-300">
            <span>Tier 3 自訂模型（選填）</span>
            <input
              type="text"
              value={byok.tier3Model ?? ""}
              onChange={(e) => setByok((prev) => ({ ...prev, tier3Model: e.target.value }))}
              placeholder="anthropic/claude-sonnet-4"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600"
            />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
        >
          {t("btnSavePersona")}
        </button>
        {savedMsg && <span className="text-xs text-emerald-400">{savedMsg}</span>}
      </div>
    </form>
  );
}
