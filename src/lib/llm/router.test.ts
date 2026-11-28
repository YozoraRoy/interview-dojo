import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFallbackChain, parseByokFromHeaders } from "./router.ts";

describe("router 混搭路由與 Fallback 鏈", () => {
  it("無雲端 Key 時所有任務自動退回純本地 Ollama", () => {
    const live = buildFallbackChain("live");
    const persona = buildFallbackChain("persona");
    const review = buildFallbackChain("review");

    assert.deepEqual(
      live.map((c) => c.tier),
      ["local"],
    );
    assert.deepEqual(
      persona.map((c) => c.tier),
      ["local"],
    );
    assert.deepEqual(
      review.map((c) => c.tier),
      ["local"],
    );
  });

  it("有 Gemini BYOK Key 時：live 預設仍走本地，persona 優先 tier2，review 優先 tier3", () => {
    const byok = { liveMode: "local" as const, geminiKey: "test-gemini-key" };

    assert.deepEqual(
      buildFallbackChain("live", byok).map((c) => c.tier),
      ["local"],
    );
    assert.deepEqual(
      buildFallbackChain("persona", byok).map((c) => c.tier),
      ["tier2", "tier1", "local"],
    );
    assert.deepEqual(
      buildFallbackChain("review", byok).map((c) => c.tier),
      ["tier3", "tier2", "tier1", "local"],
    );
  });

  it("live 切換為 cloud 且超出預算時，自動縮減回 local 保底", () => {
    const byok = { liveMode: "cloud" as const, geminiKey: "test-gemini-key" };
    assert.deepEqual(
      buildFallbackChain("live", byok, false).map((c) => c.tier),
      ["tier1", "local"],
    );
    assert.deepEqual(
      buildFallbackChain("live", byok, true).map((c) => c.tier),
      ["local"],
    );
  });

  it("parseByokFromHeaders 正確擷取 Header 設定", () => {
    const headers = new Headers({
      "x-llm-mode": "cloud",
      "x-llm-byok-gemini": "g-key",
      "x-llm-tier3-model": "claude-sonnet",
    });
    const parsed = parseByokFromHeaders(headers);
    assert.equal(parsed.liveMode, "cloud");
    assert.equal(parsed.geminiKey, "g-key");
    assert.equal(parsed.tier3Model, "claude-sonnet");
  });
});
