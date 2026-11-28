import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMetrics } from "./metrics.ts";

test("計算回答次數、字數與填充詞並排除開場觸發詞", () => {
  const m = computeMetrics([
    { role: "system", content: "sys" },
    { role: "user", content: "面接を始めてください。" },
    { role: "assistant", content: "こんにちは。" },
    { role: "user", content: "えっと、マイクロサービス化を主導しました。あの、レイテンシを削減しました。" },
    { role: "assistant", content: "なるほど。" },
    { role: "user", content: "はい、40%削減です。" },
  ]);
  assert.equal(m.userTurns, 2);
  assert.equal(m.fillerTotal, 2);
  assert.equal(m.fillers["えー/えっと"], 1);
  assert.equal(m.fillers["あの/あのー"], 1);
  assert.ok(m.avgCharsPerTurn > 10);
});
