"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarStage } from "@/components/avatar/AvatarStage.tsx";
import {
  getDefaultAvatarPrefs,
  loadAvatarPrefs,
  RIVE_CHARACTERS,
  saveAvatarPrefs,
  SVG_CHARACTERS,
  THREE_D_CHARACTERS,
  type AvatarMode,
  type AvatarPreferences,
} from "@/components/avatar/types.ts";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import { useInterviewSession } from "@/hooks/useInterviewSession.ts";
import { buildByokHeaders } from "@/lib/byok.ts";
import type { Persona } from "@/lib/persona.ts";
import { PersonaDrawer } from "./PersonaDrawer.tsx";

interface SpeakerOption {
  id: number;
  name: string;
}

interface HealthResponse {
  ok: boolean;
  services: { ollama: boolean; stt: boolean; voicevox: boolean; cloud?: boolean };
  model: string;
  modelReview: string;
  speaker: number;
}

interface InterviewWorkspaceProps {
  initialPersona: Persona;
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function InterviewWorkspace({ initialPersona }: InterviewWorkspaceProps) {
  const { lang, t } = useI18n();

  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);
  const riveInputRef = useRef<HTMLInputElement | null>(null);
  const vrmInputRef = useRef<HTMLInputElement | null>(null);

  const [avatarPrefs, setAvatarPrefs] = useState<AvatarPreferences>(getDefaultAvatarPrefs);
  const [customVrmBuffer, setCustomVrmBuffer] = useState<ArrayBuffer | null>(null);

  const [speakers, setSpeakers] = useState<SpeakerOption[]>([]);
  const [speakerId, setSpeakerId] = useState<number>(13);
  const [speedScale, setSpeedScale] = useState<number>(1.05);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [textInput, setTextInput] = useState("");

  useEffect(() => {
    setAvatarPrefs(loadAvatarPrefs());
    try {
      const savedSpeaker = Number(localStorage.getItem("interview_dojo_speaker_v1"));
      if (Number.isFinite(savedSpeaker) && savedSpeaker > 0) setSpeakerId(savedSpeaker);
      const savedSpeed = Number(localStorage.getItem("interview_dojo_speed_v1"));
      if (Number.isFinite(savedSpeed) && savedSpeed >= 0.85 && savedSpeed <= 1.35) {
        setSpeedScale(savedSpeed);
      }
    } catch {
      // 忽略
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchSpeakers = async () => {
      try {
        const res = await fetch("/api/speakers");
        if (!res.ok) return;
        const data = (await res.json()) as {
          defaultSpeaker: number;
          speakers: SpeakerOption[];
        };
        if (!active) return;
        setSpeakers(data.speakers ?? []);
        if (data.defaultSpeaker && !localStorage.getItem("interview_dojo_speaker_v1")) {
          setSpeakerId(data.defaultSpeaker);
        }
      } catch {
        // VOICEVOX 未啟動時保持空清單
      }
    };
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/health", { headers: buildByokHeaders() });
        if (!res.ok) {
          if (active) setHealth(null);
          return;
        }
        const data = (await res.json()) as HealthResponse;
        if (active) setHealth(data);
      } catch {
        if (active) setHealth(null);
      }
    };
    void fetchSpeakers();
    void fetchHealth();
    const timer = setInterval(fetchHealth, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const session = useInterviewSession({
    speakerId,
    speedScale,
    camVideoRef,
    replayVideoRef,
  });

  const updatePrefs = (updater: (prev: AvatarPreferences) => AvatarPreferences) => {
    setAvatarPrefs((prev) => {
      const next = updater(prev);
      saveAvatarPrefs(next);
      return next;
    });
  };

  const handleModeChange = (mode: AvatarMode) => {
    updatePrefs((prev) => ({ ...prev, mode }));
  };

  const currentCharList =
    avatarPrefs.mode === "rive"
      ? RIVE_CHARACTERS
      : avatarPrefs.mode === "3d"
        ? THREE_D_CHARACTERS
        : SVG_CHARACTERS;

  const activeCharId =
    avatarPrefs.mode === "rive"
      ? avatarPrefs.riveCharacter
      : avatarPrefs.mode === "3d"
        ? avatarPrefs.threeDCharacter
        : avatarPrefs.svgCharacter;

  const handleCharacterChange = (nextId: string) => {
    if (nextId === "custom" && !avatarPrefs.customRiveBase64) {
      riveInputRef.current?.click();
    } else if (nextId === "custom_vrm" && !customVrmBuffer) {
      vrmInputRef.current?.click();
    }
    updatePrefs((prev) => {
      if (prev.mode === "rive") return { ...prev, riveCharacter: nextId };
      if (prev.mode === "3d") return { ...prev, threeDCharacter: nextId };
      return { ...prev, svgCharacter: nextId };
    });
  };

  const handleRiveUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    updatePrefs((prev) => ({
      ...prev,
      mode: "rive",
      riveCharacter: "custom",
      customRiveName: file.name,
      customRiveBase64: base64,
    }));
  };

  const handleVrmUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const buf = await file.arrayBuffer();
    setCustomVrmBuffer(buf);
    updatePrefs((prev) => ({
      ...prev,
      mode: "3d",
      threeDCharacter: "custom_vrm",
      customVrmName: file.name,
    }));
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const val = textInput;
    setTextInput("");
    await session.sendTextTurn(val);
  };

  const seekReplay = (offsetSec: number) => {
    if (!session.sessionEnded || !replayVideoRef.current) return;
    replayVideoRef.current.currentTime = Math.max(0, offsetSec);
    void replayVideoRef.current.play();
  };

  const elapsedMin = Math.floor(session.elapsedSec / 60);
  const showHardLimit = session.turnCount >= 14 || elapsedMin >= 22;
  const showSoftLimit = !showHardLimit && (session.turnCount >= 10 || elapsedMin >= 15);
  const selectedSpeakerName =
    speakers.find((s) => s.id === speakerId)?.name ?? `ID ${speakerId}`;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      {/* 控制與設定工具列 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
            {(["svg", "3d", "rive"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  avatarPrefs.mode === m
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {m === "svg" ? t("modeSvg") : m === "3d" ? t("mode3d") : t("modeRive")}
              </button>
            ))}
          </div>

          <select
            value={activeCharId}
            onChange={(e) => handleCharacterChange(e.target.value)}
            aria-label={t("avatarSelectAria")}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
          >
            {currentCharList.map((item) => {
              let label = t(item.labelKey);
              if (item.id === "custom" && avatarPrefs.customRiveName) {
                label = t("charCustomPrefix", { name: avatarPrefs.customRiveName });
              } else if (item.id === "custom_vrm" && avatarPrefs.customVrmName) {
                label = t("charCustomPrefix", { name: avatarPrefs.customVrmName });
              }
              return (
                <option key={item.id} value={item.id}>
                  {label}
                </option>
              );
            })}
          </select>

          {avatarPrefs.mode === "rive" && (
            <>
              <button
                type="button"
                onClick={() => riveInputRef.current?.click()}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs hover:bg-slate-700"
              >
                {t("btnLoadRive")}
              </button>
              <input
                ref={riveInputRef}
                type="file"
                accept=".riv"
                className="hidden"
                onChange={handleRiveUpload}
              />
            </>
          )}

          {avatarPrefs.mode === "3d" && (
            <>
              <button
                type="button"
                onClick={() => vrmInputRef.current?.click()}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs hover:bg-slate-700"
              >
                {t("btnLoadVrm")}
              </button>
              <input
                ref={vrmInputRef}
                type="file"
                accept=".vrm"
                className="hidden"
                onChange={handleVrmUpload}
              />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <label className="flex items-center gap-1.5">
            <span>{t("voiceLabel")}</span>
            <select
              value={speakerId}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpeakerId(v);
                localStorage.setItem("interview_dojo_speaker_v1", String(v));
              }}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            >
              {speakers.length === 0 ? (
                <option value={speakerId}>Speaker #{speakerId}</option>
              ) : (
                speakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span>
              {t("speedLabel")} {speedScale.toFixed(2)}x
            </span>
            <input
              type="range"
              min={0.85}
              max={1.35}
              step={0.05}
              value={speedScale}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpeedScale(v);
                localStorage.setItem("interview_dojo_speed_v1", String(v));
              }}
              className="w-20 accent-indigo-500"
            />
          </label>

          {session.sessionId && !session.sessionEnded && (
            <span className="rounded-full bg-rose-500/20 px-2.5 py-1 font-mono text-rose-300">
              ● REC {formatSec(session.elapsedSec)} ｜{" "}
              {t("turnBadge", { turns: session.turnCount, max: 12 })}
            </span>
          )}

          <div className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1">
            <span
              className={`h-2 w-2 rounded-full ${
                health?.ok ? "bg-emerald-400" : health ? "bg-amber-400" : "bg-rose-500"
              }`}
            />
            <span>
              {!health
                ? t("healthOffline")
                : health.ok
                  ? `LLM / STT / TTS ${t("healthOnline")}`
                  : `Ollama:${health.services.ollama ? "✓" : "✗"} STT:${health.services.stt ? "✓" : "✗"} TTS:${health.services.voicevox ? "✓" : "✗"}`}
            </span>
          </div>
        </div>
      </div>

      {/* 主雙欄舞台 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AvatarStage
              prefs={avatarPrefs}
              state={session.avatarState}
              mouthLevel={session.mouthLevel}
              customVrmBuffer={customVrmBuffer}
            />

            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <video
                ref={camVideoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full -scale-x-100 object-cover ${
                  !session.hasCamera || session.sessionEnded ? "hidden" : ""
                }`}
              />
              <video
                ref={replayVideoRef}
                controls
                playsInline
                className={`h-full w-full object-cover ${
                  !session.sessionEnded ? "hidden" : ""
                }`}
              />
              {!session.hasCamera && !session.sessionEnded && (
                <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-slate-400">
                  {session.camDenied ? t("camDenied") : t("camOff")}
                </div>
              )}
            </div>
          </div>

          {/* 字幕列 */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
              {t("avatarBadgeChar")}
            </div>
            <p className="flex-1 text-sm text-slate-200">
              {session.subtitle || t("subtitleInit")}
            </p>
            <button
              type="button"
              disabled={session.lastAssistantBlobs.length === 0 || session.playing}
              onClick={() => void session.replayBlobs(session.lastAssistantBlobs)}
              title={t("btnReplayLastTitle")}
              className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-40"
            >
              {t("btnReplayLast")}
            </button>
          </div>

          {/* AI 三階段進度條 */}
          {session.thinkStep !== "idle" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/30 bg-indigo-950/30 px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className={session.thinkStep === "stt" ? "font-bold text-indigo-300" : "text-slate-400"}>
                  {t("stepStt")}
                </span>
                <span className="text-slate-600">›</span>
                <span className={session.thinkStep === "llm" ? "font-bold text-indigo-300" : "text-slate-400"}>
                  {t("stepLlm")}
                </span>
                <span className="text-slate-600">›</span>
                <span className={session.thinkStep === "tts" ? "font-bold text-indigo-300" : "text-slate-400"}>
                  {t("stepTts")}
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-300">
                <span>{session.thinkDetail}</span>
                <span className="font-mono text-indigo-300">
                  {session.thinkElapsedSec.toFixed(1)}s
                </span>
              </div>
            </div>
          )}

          {/* 控制按鈕列 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={session.busy}
              onClick={() => void session.startInterview()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {session.sessionId ? t("btnRestart") : t("btnStart")}
            </button>

            <button
              type="button"
              disabled={!session.sessionId || session.busy || session.sessionEnded}
              onMouseDown={session.startTalking}
              onMouseUp={session.stopTalking}
              onMouseLeave={session.stopTalking}
              onTouchStart={session.startTalking}
              onTouchEnd={session.stopTalking}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
                session.recording
                  ? "bg-rose-600 text-white"
                  : "border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
              }`}
            >
              {session.recording ? t("btnTalkRecording") : t("btnTalkIdle")}
            </button>

            <button
              type="button"
              disabled={!session.sessionId || session.busy || session.sessionEnded}
              onClick={() => void session.finishInterview(false)}
              title={t("btnEndOnlyTitle")}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            >
              {t("btnEndOnly")}
            </button>

            <button
              type="button"
              disabled={!session.sessionId || session.busy}
              onClick={() => {
                if (session.sessionEnded) {
                  void session.generateReviewOnly();
                } else {
                  void session.finishInterview(true);
                }
              }}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-40"
            >
              {session.sessionEnded && !session.reviewReport
                ? t("btnGenerateReview")
                : t("btnFinish")}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>{session.statusText || t("statusIdle")}</span>
            {session.llmSummary && (
              <span className="font-mono text-[11px] text-slate-400">
                Live: {session.llmSummary.liveModel ?? "-"}
                {session.llmSummary.reviewModel
                  ? ` | Review: ${session.llmSummary.reviewModel}`
                  : ""}
                {` ($${(session.llmSummary.totalCostUsd ?? 0).toFixed(4)})`}
              </span>
            )}
          </div>

          {(showSoftLimit || showHardLimit) && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                showHardLimit
                  ? "border-rose-500/40 bg-rose-950/40 text-rose-200"
                  : "border-amber-500/40 bg-amber-950/40 text-amber-200"
              }`}
            >
              {showHardLimit
                ? t("limitHard", { turns: session.turnCount, min: elapsedMin })
                : t("limitWarn", { turns: session.turnCount, max: 12, min: elapsedMin })}
            </div>
          )}

          <PersonaDrawer initialPersona={initialPersona} />

          {/* 復盤報告區 */}
          {session.reviewReport !== null && (
            <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-white">{t("reviewTitle")}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {session.metrics && (
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
                        {t("metricTurns", { n: session.metrics.userTurns })}
                      </span>
                      <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
                        {t("metricChars", {
                          total: session.metrics.totalChars,
                          avg: session.metrics.avgCharsPerTurn,
                        })}
                      </span>
                      <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
                        {t("metricFillers", { n: session.metrics.fillerTotal })}
                      </span>
                    </div>
                  )}
                  {session.sessionId && (
                    <a
                      href={`/api/session/${session.sessionId}/export?lang=${encodeURIComponent(lang)}`}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      {t("btnExport")}
                    </a>
                  )}
                </div>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200">
                {session.reviewReport}
              </pre>
            </section>
          )}
        </section>

        {/* 右側對話紀錄 */}
        <aside className="flex h-[680px] flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 lg:col-span-4">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-white">{t("transcriptTitle")}</h2>
            <p className="text-xs text-slate-400">{t("transcriptHint")}</p>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
            {session.messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg border p-2.5 text-xs ${
                  m.role === "assistant"
                    ? "border-indigo-500/25 bg-indigo-950/30 text-slate-100"
                    : "border-slate-700 bg-slate-950/70 text-slate-200"
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold">
                    {m.role === "assistant" ? t("roleAssistant") : t("roleUser")}
                  </span>
                  <div className="flex items-center gap-2">
                    {m.audioBlobs && m.audioBlobs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void session.replayBlobs(m.audioBlobs ?? [])}
                        title={t("btnMsgReplayTitle")}
                        className="hover:text-white"
                      >
                        🔊
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => seekReplay(m.offsetSec)}
                      title={t("tsTitle")}
                      className={`font-mono ${
                        session.sessionEnded
                          ? "cursor-pointer text-sky-400 underline"
                          : "cursor-default"
                      }`}
                    >
                      {formatSec(m.offsetSec)}
                    </button>
                  </div>
                </div>
                <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleTextSubmit} className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={!session.sessionId || session.busy || session.sessionEnded}
              placeholder={t("textPlaceholder")}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={!session.sessionId || session.busy || session.sessionEnded}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            >
              {t("btnSend")}
            </button>
          </form>
        </aside>
      </div>

      <footer className="pb-4 text-center text-xs text-slate-500">
        {t("footerCredit", { credit: `VOICEVOX:${selectedSpeakerName}` })}
      </footer>
    </div>
  );
}
