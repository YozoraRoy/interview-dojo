import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { updateTag } from "next/cache";
import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { generateReviewWithMeta, unloadModel } from "@/lib/llm.ts";
import { isOverDailyBudget } from "@/lib/llm/ledger.ts";
import { buildFallbackChain, parseByokFromHeaders } from "@/lib/llm/router.ts";
import { computeMetrics } from "@/lib/metrics.ts";
import { getSession, saveSession } from "@/lib/sessions.ts";
import { unloadStt } from "@/lib/speech.ts";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到面試場次" }, { status: 404 });
  }

  try {
    const byok = parseByokFromHeaders(request.headers);
    const overBudget = await isOverDailyBudget();
    const chain = buildFallbackChain("review", byok, overBudget);
    const primaryIsLocal = chain[0]?.provider.id === "ollama";

    // 僅在實際會使用本地 Ollama 大模型時卸載 VRAM；走雲端時直接跳過以省下等待時間
    if (primaryIsLocal) {
      await Promise.all([unloadModel(config.modelLive), unloadStt()]);
    }

    const metrics = computeMetrics(session.messages);
    const { report, meta } = await generateReviewWithMeta(
      session.messages,
      metrics,
      byok,
    );

    const prevCost = session.llmSummary?.totalCostUsd ?? 0;
    session.llmSummary = {
      liveModel: session.llmSummary?.liveModel ?? config.modelLive,
      reviewModel: `${meta.provider}:${meta.model}`,
      totalCostUsd: Math.round((prevCost + meta.estimatedCostUsd) * 1_000_000) / 1_000_000,
    };
    await saveSession(session);

    const dir = join(config.privateDataDir, "reports");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.md`), report, "utf8");
    updateTag("sessions");
    return NextResponse.json({
      ok: true,
      metrics,
      report,
      llmMeta: meta,
      llmSummary: session.llmSummary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
