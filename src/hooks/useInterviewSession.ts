"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarState } from "@/components/avatar/types.ts";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import { buildByokHeaders } from "@/lib/byok.ts";
import type { SpeechMetrics } from "@/lib/metrics.ts";
import type { SessionLLMSummary } from "@/lib/sessions.ts";

export interface TranscriptItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  offsetSec: number;
  audioBlobs?: Blob[];
}

export type ThinkStep = "idle" | "stt" | "llm" | "tts";

interface UseInterviewSessionOptions {
  speakerId: number;
  speedScale: number;
  camVideoRef: React.RefObject<HTMLVideoElement | null>;
  replayVideoRef: React.RefObject<HTMLVideoElement | null>;
}

function base64ToWavBlob(b64: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export function useInterviewSession({
  speakerId,
  speedScale,
  camVideoRef,
  replayVideoRef,
}: UseInterviewSessionOptions) {
  const { t } = useI18n();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [camDenied, setCamDenied] = useState(false);

  const [elapsedSec, setElapsedSec] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [mouthLevel, setMouthLevel] = useState(0);
  const [subtitle, setSubtitle] = useState("");
  const [statusText, setStatusText] = useState("");
  const [thinkStep, setThinkStep] = useState<ThinkStep>("idle");
  const [thinkDetail, setThinkDetail] = useState("");
  const [thinkElapsedSec, setThinkElapsedSec] = useState(0);

  const [messages, setMessages] = useState<TranscriptItem[]>([]);
  const [lastAssistantBlobs, setLastAssistantBlobs] = useState<Blob[]>([]);
  const [reviewReport, setReviewReport] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SpeechMetrics | null>(null);
  const [llmSummary, setLlmSummary] = useState<SessionLLMSummary | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fullRecorderRef = useRef<MediaRecorder | null>(null);
  const fullChunksRef = useRef<Blob[]>([]);
  const turnRecorderRef = useRef<MediaRecorder | null>(null);
  const turnChunksRef = useRef<Blob[]>([]);
  const startedAtMsRef = useRef<number>(0);

  const audioQueueRef = useRef<Blob[]>([]);
  const isPlayingQueueRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lipRafRef = useRef<number>(0);

  // 計時器
  useEffect(() => {
    if (!sessionId || sessionEnded) return;
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtMsRef.current) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [sessionId, sessionEnded]);

  // 思考計時器
  useEffect(() => {
    if (thinkStep === "idle") {
      setThinkElapsedSec(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setThinkElapsedSec((Date.now() - start) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [thinkStep]);

  const playBlobWithLipSync = useCallback((blob: Blob): Promise<void> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      let analyser: AnalyserNode | null = null;
      let dataArray: Uint8Array<ArrayBuffer> | null = null;

      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          void ctx.resume();
        }
        const source = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      } catch {
        analyser = null;
      }

      const tickMouth = () => {
        if (!analyser || !dataArray) {
          setMouthLevel(0.35 + Math.random() * 0.35);
        } else {
          analyser.getByteTimeDomainData(dataArray);
          let sumSq = 0;
          for (let i = 0; i < dataArray.length; i += 1) {
            const v = (dataArray[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / dataArray.length);
          setMouthLevel(Math.min(1, rms * 4.5));
        }
        lipRafRef.current = requestAnimationFrame(tickMouth);
      };

      const cleanup = () => {
        cancelAnimationFrame(lipRafRef.current);
        setMouthLevel(0);
        URL.revokeObjectURL(url);
        resolve();
      };

      audio.onplay = () => {
        setAvatarState("speaking");
        lipRafRef.current = requestAnimationFrame(tickMouth);
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      void audio.play().catch(cleanup);
    });
  }, []);

  const drainAudioQueue = useCallback(async () => {
    if (isPlayingQueueRef.current) return;
    isPlayingQueueRef.current = true;
    setPlaying(true);

    while (audioQueueRef.current.length > 0) {
      const next = audioQueueRef.current.shift();
      if (next) {
        await playBlobWithLipSync(next);
      }
    }

    isPlayingQueueRef.current = false;
    setPlaying(false);
    setAvatarState("idle");
  }, [playBlobWithLipSync]);

  const replayBlobs = useCallback(
    async (blobs: Blob[]) => {
      if (blobs.length === 0) return;
      audioQueueRef.current.push(...blobs);
      await drainAudioQueue();
    },
    [drainAudioQueue],
  );

  const sendTurn = useCallback(
    async (sid: string, body: BodyInit, contentType: string, offsetSec: number) => {
      setBusy(true);
      setThinkStep("stt");
      setThinkDetail(t("thinkReady"));
      setAvatarState("thinking");

      const turnBlobs: Blob[] = [];
      let assistantItemId: string | null = null;
      let assistantText = "";

      try {
        const res = await fetch(`/api/session/${sid}/turn`, {
          method: "POST",
          headers: {
            "content-type": contentType,
            "x-voicevox-speaker": String(speakerId),
            "x-voicevox-speed": String(speedScale),
            "x-offset-sec": String(offsetSec),
            ...buildByokHeaders(),
          },
          body,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (eventName: string, rawData: string) => {
          const data = JSON.parse(rawData) as Record<string, unknown>;
          if (eventName === "status") {
            const step = String(data.step ?? "");
            if (step === "stt") {
              setThinkStep("stt");
              setThinkDetail(t("thinkStt"));
              setStatusText(t("statusStt"));
            } else if (step === "llm_wait") {
              setThinkStep("llm");
              setThinkDetail(t("thinkLlmWait"));
              setStatusText(t("statusLlm"));
            } else if (step === "tts") {
              const index = Number(data.index ?? 1);
              setThinkStep("tts");
              setThinkDetail(t("thinkTts", { index }));
              setStatusText(t("statusTts", { index }));
            }
          } else if (eventName === "progress") {
            const chars = Number(data.chars ?? 0);
            setThinkStep("llm");
            setThinkDetail(t("thinkLlmGen", { chars }));
          } else if (eventName === "transcript") {
            const text = String(data.text ?? "");
            const offset = Number(data.offsetSec ?? 0);
            if (text && text !== "面接を始めてください。") {
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), role: "user", text, offsetSec: offset },
              ]);
            }
          } else if (eventName === "sentence") {
            const text = String(data.text ?? "");
            const offset = Number(data.offsetSec ?? 0);
            assistantText += (assistantText ? " " : "") + text;
            setSubtitle(assistantText);
            if (!assistantItemId) {
              assistantItemId = crypto.randomUUID();
              const newId = assistantItemId;
              setMessages((prev) => [
                ...prev,
                { id: newId, role: "assistant", text: assistantText, offsetSec: offset },
              ]);
            } else {
              const targetId = assistantItemId;
              setMessages((prev) =>
                prev.map((m) => (m.id === targetId ? { ...m, text: assistantText } : m)),
              );
            }
          } else if (eventName === "audio") {
            const wavBase64 = String(data.wavBase64 ?? "");
            if (wavBase64) {
              const blob = base64ToWavBlob(wavBase64);
              turnBlobs.push(blob);
              audioQueueRef.current.push(blob);
              void drainAudioQueue();
            }
          } else if (eventName === "done") {
            const tc = Number(data.turnCount ?? 0);
            setTurnCount(tc);
            setThinkStep("idle");
            setStatusText(t("statusYourTurn"));
            if (data.llmSummary) {
              setLlmSummary(data.llmSummary as SessionLLMSummary);
            }
            if (turnBlobs.length > 0) {
              setLastAssistantBlobs([...turnBlobs]);
              if (assistantItemId) {
                const targetId = assistantItemId;
                const savedBlobs = [...turnBlobs];
                setMessages((prev) =>
                  prev.map((m) => (m.id === targetId ? { ...m, audioBlobs: savedBlobs } : m)),
                );
              }
            }
          } else if (eventName === "error") {
            const msg = String(data.message ?? "Unknown error");
            setThinkStep("idle");
            setStatusText(t("statusError", { message: msg }));
            setAvatarState("idle");
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            let eventName = "message";
            let dataLine = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
            }
            if (dataLine) handleEvent(eventName, dataLine);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setThinkStep("idle");
        setStatusText(t("statusError", { message: msg }));
        setAvatarState("idle");
      } finally {
        setBusy(false);
      }
    },
    [drainAudioQueue, speakerId, speedScale, t],
  );

  const startInterview = useCallback(async () => {
    setBusy(true);
    setSessionEnded(false);
    setReviewReport(null);
    setMetrics(null);
    setLlmSummary(null);
    setMessages([]);
    setTurnCount(0);
    setElapsedSec(0);
    setLastAssistantBlobs([]);
    setStatusText(t("statusCamInit"));

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) track.stop();
      mediaStreamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      setHasCamera(true);
      setCamDenied(false);
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream;
      }

      fullChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) fullChunksRef.current.push(e.data);
      };
      rec.start(1000);
      fullRecorderRef.current = rec;
    } catch {
      setHasCamera(false);
      setCamDenied(true);
    }

    setStatusText(t("statusSessionStart"));
    try {
      const res = await fetch("/api/session/start", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sessionId: string };
      startedAtMsRef.current = Date.now();
      setSessionId(data.sessionId);
      await sendTurn(
        data.sessionId,
        JSON.stringify({ text: "面接を始めてください。" }),
        "application/json",
        0,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(t("statusError", { message: msg }));
      setBusy(false);
    }
  }, [camVideoRef, sendTurn, t]);

  const startTalking = useCallback(() => {
    if (!sessionId || busy || sessionEnded || recording || !mediaStreamRef.current) return;
    const audioTracks = mediaStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const audioStream = new MediaStream(audioTracks);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const rec = new MediaRecorder(audioStream, { mimeType });
    turnChunksRef.current = [];
    const pressOffset = Math.round((Date.now() - startedAtMsRef.current) / 100) / 10;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) turnChunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(turnChunksRef.current, { type: mimeType });
      void sendTurn(sessionId, blob, mimeType, pressOffset);
    };
    rec.start();
    turnRecorderRef.current = rec;
    setRecording(true);
    setAvatarState("listening");
    setStatusText(t("statusListening"));
  }, [busy, recording, sendTurn, sessionEnded, sessionId, t]);

  const stopTalking = useCallback(() => {
    if (!recording || !turnRecorderRef.current) return;
    setRecording(false);
    turnRecorderRef.current.stop();
    turnRecorderRef.current = null;
  }, [recording]);

  const sendTextTurn = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!sessionId || busy || sessionEnded || !trimmed) return;
      const offset = Math.round((Date.now() - startedAtMsRef.current) / 100) / 10;
      await sendTurn(sessionId, JSON.stringify({ text: trimmed }), "application/json", offset);
    },
    [busy, sendTurn, sessionEnded, sessionId],
  );

  const generateReviewOnly = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setStatusText(t("statusReviewing"));
    try {
      const res = await fetch(`/api/session/${sessionId}/review`, {
        method: "POST",
        headers: buildByokHeaders(),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        metrics?: SpeechMetrics;
        report?: string;
        llmSummary?: SessionLLMSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMetrics(data.metrics ?? null);
      setReviewReport(data.report ?? "");
      if (data.llmSummary) setLlmSummary(data.llmSummary);
      setStatusText(t("statusReviewDone"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(t("statusReviewFail", { message: msg }));
    } finally {
      setBusy(false);
    }
  }, [sessionId, t]);

  const finishInterview = useCallback(
    async (runReview: boolean) => {
      if (!sessionId || busy || sessionEnded) return;
      setBusy(true);
      setSessionEnded(true);
      setStatusText(t("statusSavingVideo"));

      const stopFullAndUpload = async () => {
        const rec = fullRecorderRef.current;
        if (rec && rec.state !== "inactive") {
          await new Promise<void>((resolve) => {
            rec.onstop = () => resolve();
            rec.stop();
          });
        }
        if (mediaStreamRef.current) {
          for (const track of mediaStreamRef.current.getTracks()) track.stop();
          mediaStreamRef.current = null;
        }
        if (fullChunksRef.current.length > 0) {
          const videoBlob = new Blob(fullChunksRef.current, { type: "video/webm" });
          await fetch(`/api/session/${sessionId}/recording`, {
            method: "POST",
            headers: { "content-type": "video/webm" },
            body: videoBlob,
          });
          if (replayVideoRef.current) {
            replayVideoRef.current.src = `/api/session/${sessionId}/recording`;
          }
        }
      };

      try {
        await stopFullAndUpload();
        if (runReview) {
          await generateReviewOnly();
        } else {
          setStatusText(t("statusEndedOnly"));
          setBusy(false);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusText(t("statusError", { message: msg }));
        setBusy(false);
      }
    },
    [busy, generateReviewOnly, replayVideoRef, sessionEnded, sessionId, t],
  );

  // Space 鍵盤按住說話
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!sessionId || busy || sessionEnded) return;
      e.preventDefault();
      startTalking();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (recording) {
        e.preventDefault();
        stopTalking();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [busy, recording, sessionEnded, sessionId, startTalking, stopTalking]);

  return {
    sessionId,
    busy,
    recording,
    sessionEnded,
    playing,
    hasCamera,
    camDenied,
    elapsedSec,
    turnCount,
    avatarState,
    mouthLevel,
    subtitle,
    statusText,
    thinkStep,
    thinkDetail,
    thinkElapsedSec,
    messages,
    lastAssistantBlobs,
    reviewReport,
    metrics,
    llmSummary,
    startInterview,
    startTalking,
    stopTalking,
    sendTextTurn,
    replayBlobs,
    finishInterview,
    generateReviewOnly,
  };
}
