import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { streamChat } from "@/lib/llm.ts";
import { parseByokFromHeaders } from "@/lib/llm/router.ts";
import type { LLMResultMeta } from "@/lib/llm/types.ts";
import { SentenceSplitter } from "@/lib/sentences.ts";
import { getSession, saveSession } from "@/lib/sessions.ts";
import { synthesize, transcribe } from "@/lib/speech.ts";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const RECOMMENDED_MAX_TURNS = 12;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json(
      { error: "找不到面試場次，請重新開始。" },
      { status: 404 },
    );
  }

  const ctype = request.headers.get("content-type") ?? "";
  const rawBytes = await request.arrayBuffer();
  if (rawBytes.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "音訊檔案不可超過 25 MB。" },
      { status: 413 },
    );
  }

  const speakerHeader = Number(request.headers.get("x-voicevox-speaker"));
  const speedHeader = Number(request.headers.get("x-voicevox-speed"));
  const offsetHeader = Number(request.headers.get("x-offset-sec"));

  const speaker =
    Number.isFinite(speakerHeader) && speakerHeader > 0
      ? speakerHeader
      : config.voicevoxSpeaker;
  const speed =
    Number.isFinite(speedHeader) && speedHeader >= 0.5 && speedHeader <= 2.0
      ? speedHeader
      : config.voicevoxSpeed;
  const userOffsetSec =
    Number.isFinite(offsetHeader) && offsetHeader >= 0
      ? Math.round(offsetHeader * 10) / 10
      : Math.round((Date.now() - session.startedAtMs) / 100) / 10;

  const byok = parseByokFromHeaders(request.headers);
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendSse = (event: string, data: unknown) => {
        if (abortController.signal.aborted) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        let userText = "";
        if (ctype.includes("application/json")) {
          const parsed = JSON.parse(Buffer.from(rawBytes).toString("utf8")) as {
            text?: string;
          };
          userText = (parsed.text ?? "").trim();
        } else {
          const audioBuf = Buffer.from(rawBytes);
          if (audioBuf.length < 500) {
            sendSse("error", { message: "錄音時間太短，請按住按鈕再說一次。" });
            return;
          }
          sendSse("status", { step: "stt" });
          userText = await transcribe(audioBuf, ctype || "audio/webm");
          if (!userText) {
            sendSse("error", { message: "未能辨識出語音，請再試一次。" });
            return;
          }
        }

        sendSse("transcript", {
          role: "user",
          text: userText,
          offsetSec: userOffsetSec,
        });
        session.messages.push({
          role: "user",
          content: userText,
          offsetSec: userOffsetSec,
        });

        sendSse("status", { step: "llm_wait" });
        const assistantOffsetSec =
          Math.round((Date.now() - session.startedAtMs) / 100) / 10;
        const splitter = new SentenceSplitter();
        let fullReply = "";
        let sentenceCount = 0;
        let lastProgressAt = 0;
        let ttsChain = Promise.resolve();

        const enqueueSentence = (sentence: string) => {
          sentenceCount += 1;
          const idx = sentenceCount;
          ttsChain = ttsChain.then(async () => {
            if (abortController.signal.aborted) return;
            sendSse("status", { step: "tts", index: idx });
            sendSse("sentence", { text: sentence, offsetSec: assistantOffsetSec });
            const wav = await synthesize(sentence, speaker, speed);
            if (abortController.signal.aborted) return;
            sendSse("audio", { wavBase64: wav.toString("base64") });
          });
        };

        let llmMeta: LLMResultMeta | undefined;
        for await (const chunk of streamChat(
          session.messages,
          abortController.signal,
          byok,
          (meta) => {
            llmMeta = meta;
          },
        )) {
          fullReply += chunk;
          const now = Date.now();
          if (now - lastProgressAt >= 180) {
            lastProgressAt = now;
            sendSse("progress", {
              step: "llm_gen",
              chars: fullReply.trim().length,
              sentences: sentenceCount,
            });
          }
          for (const s of splitter.push(chunk)) enqueueSentence(s);
        }
        for (const s of splitter.flush()) enqueueSentence(s);

        await ttsChain;
        session.messages.push({
          role: "assistant",
          content: fullReply.trim(),
          offsetSec: assistantOffsetSec,
        });
        if (llmMeta) {
          const prevCost = session.llmSummary?.totalCostUsd ?? 0;
          session.llmSummary = {
            liveModel: `${llmMeta.provider}:${llmMeta.model}`,
            reviewModel: session.llmSummary?.reviewModel,
            totalCostUsd:
              Math.round((prevCost + llmMeta.estimatedCostUsd) * 1_000_000) / 1_000_000,
          };
        }
        await saveSession(session);

        const turnCount = Math.max(
          0,
          session.messages.filter((m) => m.role === "user").length - 1,
        );
        sendSse("done", {
          fullText: fullReply.trim(),
          offsetSec: assistantOffsetSec,
          turnCount,
          recommendedMaxTurns: RECOMMENDED_MAX_TURNS,
          llmMeta,
          llmSummary: session.llmSummary,
        });
      } catch (err) {
        if (!abortController.signal.aborted) {
          const msg = err instanceof Error ? err.message : String(err);
          sendSse("error", { message: msg });
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
