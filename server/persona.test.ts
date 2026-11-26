import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSystemPrompt,
  formatPersonaBlock,
  isAllowedResumeFileName,
  MAX_PERSONA_PROMPT_CHARS,
  normalizePersona,
} from "./persona.ts";

test("isAllowedResumeFileName 只允許 .txt 與 .md 副檔名", () => {
  assert.equal(isAllowedResumeFileName("resume.txt"), true);
  assert.equal(isAllowedResumeFileName("CV_2026.MD"), true);
  assert.equal(isAllowedResumeFileName("resume.pdf"), false);
  assert.equal(isAllowedResumeFileName("script.exe"), false);
  assert.equal(isAllowedResumeFileName("noext"), false);
});

test("formatPersonaBlock 會嚴格限制背景區塊不超過 800 字元", () => {
  const longText = "Kubernetesマイクロサービス設計と決済基盤の移行プロジェクト。".repeat(30);
  const block = formatPersonaBlock({
    name: "測試者",
    target_role: "Tech Lead",
    years: 8,
    highlights: [longText, longText, longText, longText, longText],
  });
  assert.ok(block.length <= MAX_PERSONA_PROMPT_CHARS);
  assert.ok(block.endsWith("…"));
});

test("normalizePersona 最多保留 5 條 highlights 並過濾空白", () => {
  const norm = normalizePersona({
    name: "  Alex  ",
    years: 7,
    highlights: [" a ", "", "b", "c", "d", "e", "f"],
  });
  assert.equal(norm.name, "Alex");
  assert.equal(norm.years, 7);
  assert.deepEqual(norm.highlights, ["a", "b", "c", "d", "e"]);
});

test("buildSystemPrompt 包含防幻覺規則與截斷後的背景資訊", () => {
  const prompt = buildSystemPrompt({
    name: "佐藤",
    target_role: "Architect",
    years: 10,
    highlights: ["日均 100 萬請求分散式快取架構"],
  });
  assert.match(prompt, /ハルシネーション防止/);
  assert.match(prompt, /推測で補完せず/);
  assert.match(prompt, /日均 100 萬請求分散式快取架構/);
});
