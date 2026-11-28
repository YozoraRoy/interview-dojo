import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SessionReplayViewer } from "@/components/sessions/SessionReplayViewer.tsx";
import { config } from "@/lib/config.ts";
import { computeMetrics } from "@/lib/metrics.ts";
import { getSession } from "@/lib/sessions.ts";

async function SessionDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    notFound();
  }

  let hasRecording = false;
  try {
    await access(/*turbopackIgnore: true*/ join(config.privateDataDir, "recordings", `${id}.webm`));
    hasRecording = true;
  } catch {
    hasRecording = false;
  }

  let report = "";
  try {
    report = await readFile(
      /*turbopackIgnore: true*/ join(config.privateDataDir, "reports", `${id}.md`),
      "utf8",
    );
  } catch {
    report = "";
  }

  const metrics = computeMetrics(session.messages);

  return (
    <SessionReplayViewer
      sessionId={session.id}
      createdAt={session.createdAt}
      role={session.role ?? "Tech Lead / PM"}
      hasRecording={hasRecording}
      turns={session.messages}
      metrics={metrics}
      report={report}
      llmSummary={session.llmSummary}
    />
  );
}

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div>
        <Link
          href="/sessions"
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          ← 返回歷史紀錄列表
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
            載入場次錄影與復盤報告中…
          </div>
        }
      >
        <SessionDetailLoader params={params} />
      </Suspense>
    </div>
  );
}
