import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { renderHtmlReport } from "@/lib/export.ts";
import { computeMetrics } from "@/lib/metrics.ts";
import { getSession, isValidSessionId } from "@/lib/sessions.ts";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidSessionId(id)) {
    return NextResponse.json({ error: "無效的場次 ID" }, { status: 400 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到面試場次" }, { status: 404 });
  }

  let report = "";
  try {
    report = await readFile(join(config.privateDataDir, "reports", `${id}.md`), "utf8");
  } catch {
    // 尚未產生評分報告時仍可匯出對話紀錄
  }

  const { searchParams } = new URL(request.url);
  const rawLang = searchParams.get("lang") ?? "zh-TW";
  const lang = rawLang === "ja" || rawLang === "en" ? rawLang : "zh-TW";

  const metrics = computeMetrics(session.messages);
  const llmInfo = session.llmSummary
    ? `Live: ${session.llmSummary.liveModel ?? "-"} / Review: ${session.llmSummary.reviewModel ?? "-"} ($${(session.llmSummary.totalCostUsd ?? 0).toFixed(4)} USD)`
    : undefined;
  const html = renderHtmlReport({
    sessionId: session.id,
    createdAt: session.createdAt,
    metrics,
    turns: session.messages,
    report,
    lang,
    llmInfo,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="interview-report-${id}.html"`,
    },
  });
}
