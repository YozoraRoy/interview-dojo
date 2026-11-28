import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.ts";
import type { LLMResultMeta, LLMUsage, ProviderId } from "./types.ts";

interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICE_TABLE: Array<{ match: string; price: ModelPrice }> = [
  { match: ":free", price: { inputPerMillion: 0, outputPerMillion: 0 } },
  { match: "gemini-2.5-flash-lite", price: { inputPerMillion: 0.1, outputPerMillion: 0.4 } },
  { match: "gemini-2.5-flash", price: { inputPerMillion: 0.3, outputPerMillion: 2.5 } },
  { match: "gemini-2.5-pro", price: { inputPerMillion: 1.25, outputPerMillion: 10.0 } },
  { match: "gpt-4o-mini", price: { inputPerMillion: 0.15, outputPerMillion: 0.6 } },
  { match: "gpt-4.1-mini", price: { inputPerMillion: 0.4, outputPerMillion: 1.6 } },
  { match: "gpt-4.1", price: { inputPerMillion: 2.0, outputPerMillion: 8.0 } },
  { match: "deepseek-chat", price: { inputPerMillion: 0.27, outputPerMillion: 1.1 } },
  { match: "deepseek-v3", price: { inputPerMillion: 0.27, outputPerMillion: 1.1 } },
  { match: "deepseek-reasoner", price: { inputPerMillion: 0.55, outputPerMillion: 2.19 } },
  { match: "deepseek-r1", price: { inputPerMillion: 0.55, outputPerMillion: 2.19 } },
  { match: "claude", price: { inputPerMillion: 3.0, outputPerMillion: 15.0 } },
];

export interface DailyLedgerEntry {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  calls: number;
}

export type UsageLedger = Record<string, DailyLedgerEntry>;

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getLedgerPath(): string {
  return join(config.privateDataDir, "usage-ledger.json");
}

/** 依供應商與模型名稱計算單次呼叫的預估美元成本。 */
export function estimateCostUsd(
  provider: ProviderId,
  model: string,
  usage?: LLMUsage,
): number {
  if (provider === "ollama" || !usage) return 0;
  const lower = model.toLowerCase();
  const matched = PRICE_TABLE.find((p) => lower.includes(p.match));
  const price = matched?.price ?? { inputPerMillion: 0.5, outputPerMillion: 1.5 };
  const cost =
    (usage.inputTokens / 1_000_000) * price.inputPerMillion +
    (usage.outputTokens / 1_000_000) * price.outputPerMillion;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function readUsageLedger(): Promise<UsageLedger> {
  try {
    const raw = await readFile(/*turbopackIgnore: true*/ getLedgerPath(), "utf8");
    return JSON.parse(raw) as UsageLedger;
  } catch {
    return {};
  }
}

export async function getTodaySpendUsd(): Promise<number> {
  const ledger = await readUsageLedger();
  return ledger[getTodayKey()]?.totalCostUsd ?? 0;
}

export async function isOverDailyBudget(): Promise<boolean> {
  if (!Number.isFinite(config.dailyBudgetUsd) || config.dailyBudgetUsd <= 0) {
    return false;
  }
  const spend = await getTodaySpendUsd();
  return spend >= config.dailyBudgetUsd;
}

/** 將單次用量累加寫入 data/usage-ledger.json（僅記帳金額與 Token，絕不存 Key）。 */
export async function recordUsage(meta: LLMResultMeta): Promise<void> {
  const ledger = await readUsageLedger();
  const key = getTodayKey();
  const prev = ledger[key] ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    calls: 0,
  };
  ledger[key] = {
    inputTokens: prev.inputTokens + meta.inputTokens,
    outputTokens: prev.outputTokens + meta.outputTokens,
    totalCostUsd: Math.round((prev.totalCostUsd + meta.estimatedCostUsd) * 1_000_000) / 1_000_000,
    calls: prev.calls + 1,
  };
  await mkdir(config.privateDataDir, { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ getLedgerPath(), JSON.stringify(ledger, null, 2), "utf8");
}
