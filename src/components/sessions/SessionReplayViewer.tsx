"use client";

import { useRef } from "react";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import type { SpeechMetrics, TurnEntry } from "@/lib/metrics.ts";
import type { SessionLLMSummary } from "@/lib/sessions.ts";

interface SessionReplayViewerProps {
  sessionId: string;
  createdAt: string;
  role: string;
  hasRecording: boolean;
  turns: TurnEntry[];
  metrics: SpeechMetrics;
  report: string;
  llmSummary?: SessionLLMSummary;
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SessionReplayViewer({
  sessionId,
  createdAt,
  role,
  hasRecording,
  turns,
  metrics,
  report,
  llmSummary,
}: SessionReplayViewerProps) {
  const { lang, t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const visibleTurns = turns.filter(
    (item, idx) =>
      item.role !== "system" && !(idx === 1 && item.content === "面接を始めてください。"),
  );

  const seekTo = (offsetSec?: number) => {
    if (typeof offsetSec !== "number" || !videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, offsetSec);
    void videoRef.current.play();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div>
          <h1 className="text-lg font-bold text-white">
            Session {sessionId} — {role}
          </h1>
          <p className="text-xs text-slate-400">
            {new Date(createdAt).toLocaleString()}
            {llmSummary
              ? ` ｜ Live: ${llmSummary.liveModel ?? "-"} / Review: ${llmSummary.reviewModel ?? "-"} ($${(llmSummary.totalCostUsd ?? 0).toFixed(4)})`
              : ""}
          </p>
        </div>
        <a
          href={`/api/session/${sessionId}/export?lang=${encodeURIComponent(lang)}`}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          {t("btnExport")}
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            {hasRecording ? (
              <video
                ref={videoRef}
                src={`/api/session/${sessionId}/recording`}
                controls
                playsInline
                className="aspect-video w-full"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-slate-500">
                尚無錄影檔案
              </div>
            )}
          </div>

          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-white">{t("reviewTitle")}</h2>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
                  {t("metricTurns", { n: metrics.userTurns })}
                </span>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
                  {t("metricChars", {
                    total: metrics.totalChars,
                    avg: metrics.avgCharsPerTurn,
                  })}
                </span>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
                  {t("metricFillers", { n: metrics.fillerTotal })}
                </span>
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200">
              {report || "（此場次尚未產生 AI 復盤報告）"}
            </pre>
          </section>
        </div>

        <aside className="flex h-[600px] flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 lg:col-span-5">
          <h2 className="mb-3 text-sm font-bold text-white">{t("transcriptTitle")}</h2>
          <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
            {visibleTurns.map((item, i) => (
              <div
                key={`${i}-${item.offsetSec ?? 0}`}
                className={`rounded-lg border p-2.5 text-xs ${
                  item.role === "assistant"
                    ? "border-indigo-500/25 bg-indigo-950/30 text-slate-100"
                    : "border-slate-700 bg-slate-950/70 text-slate-200"
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold">
                    {item.role === "assistant" ? t("roleAssistant") : t("roleUser")}
                  </span>
                  {typeof item.offsetSec === "number" && (
                    <button
                      type="button"
                      onClick={() => seekTo(item.offsetSec)}
                      className="font-mono text-sky-400 underline hover:text-sky-300"
                    >
                      {formatSec(item.offsetSec)}
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{item.content}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
