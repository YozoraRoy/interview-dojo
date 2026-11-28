import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const tempDir = await mkdtemp(join(tmpdir(), "interview-dojo-ledger-"));
process.env.PRIVATE_DATA_DIR = tempDir;
process.env.DAILY_BUDGET_USD = "0.05";

const { estimateCostUsd, getTodaySpendUsd, isOverDailyBudget, recordUsage } = await import(
  "./ledger.ts"
);

describe("ledger 費用估算與每日預算控管", () => {
  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("本地 Ollama 與免費模型估算為 0 美元", () => {
    assert.equal(
      estimateCostUsd("ollama", "gemma4:e4b", { inputTokens: 2000, outputTokens: 500 }),
      0,
    );
    assert.equal(
      estimateCostUsd("openrouter", "qwen/qwen3:free", {
        inputTokens: 2000,
        outputTokens: 500,
      }),
      0,
    );
  });

  it("累計紀錄達標後觸發每日預算保護", async () => {
    assert.equal(await isOverDailyBudget(), false);

    await recordUsage({
      provider: "gemini",
      model: "gemini-2.5-pro",
      tier: "tier3",
      inputTokens: 10000,
      outputTokens: 4000,
      estimatedCostUsd: 0.055,
    });

    assert.ok((await getTodaySpendUsd()) >= 0.05);
    assert.equal(await isOverDailyBudget(), true);
  });
});
