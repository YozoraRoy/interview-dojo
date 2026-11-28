import assert from "node:assert/strict";
import { test } from "node:test";
import { renderHtmlReport } from "./export.ts";

test("匯出 HTML 報告包含對話、指標與跳脫安全處理", () => {
  const html = renderHtmlReport({
    sessionId: "abc12345",
    createdAt: "2026-11-21T12:00:00Z",
    metrics: {
      userTurns: 1,
      totalChars: 20,
      avgCharsPerTurn: 20,
      fillerTotal: 1,
      fillers: { "えー/えっと": 1 },
    },
    turns: [
      { role: "system", content: "SECRET_SYSTEM_PROMPT" },
      { role: "user", content: "面接を始めてください。" },
      { role: "assistant", content: "本日はよろしくお願いします。", offsetSec: 2.1 },
      { role: "user", content: "えっと、<script>alert(1)</script>を対応しました。", offsetSec: 12.4 },
    ],
    report: "## 1. 總評\n- **優點**：表現不錯",
  });

  assert.ok(!html.includes("SECRET_SYSTEM_PROMPT"), "不應匯出 system prompt");
  assert.ok(!html.includes("<script>alert(1)</script>"), "應跳脫 HTML 標籤");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("[00:12]"));
  assert.ok(html.includes("<strong>優點</strong>"));
});
