import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { getTodaySpendUsd } from "@/lib/llm/ledger.ts";
import { hasAnyCloudKey, parseByokFromHeaders } from "@/lib/llm/router.ts";

async function checkService(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const byok = parseByokFromHeaders(request.headers);
  const hasCloudKey = hasAnyCloudKey(byok);

  const [ollama, stt, voicevox, todaySpendUsd] = await Promise.all([
    checkService(`${config.ollamaBaseUrl}/api/version`),
    checkService(`${config.sttUrl}/health`),
    checkService(`${config.voicevoxUrl}/version`),
    getTodaySpendUsd().catch(() => 0),
  ]);

  return NextResponse.json({
    ok: (ollama || hasCloudKey) && stt && voicevox,
    services: { ollama, stt, voicevox, cloud: hasCloudKey },
    model: config.modelLive,
    modelReview: config.modelReview,
    speaker: config.voicevoxSpeaker,
    todaySpendUsd,
    dailyBudgetUsd: config.dailyBudgetUsd,
  });
}
