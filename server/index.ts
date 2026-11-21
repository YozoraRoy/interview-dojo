import express from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.ts";
import { renderHtmlReport } from "./export.ts";
import { generateReview, streamChat, unloadModel } from "./llm.ts";
import { computeMetrics, type TurnEntry } from "./metrics.ts";
import { buildSystemPrompt, loadPersona } from "./persona.ts";
import { SentenceSplitter } from "./sentences.ts";
import { listSpeakers, synthesize, transcribe, unloadStt } from "./speech.ts";

interface Session {
  id: string;
  createdAt: string;
  startedAtMs: number;
  messages: TurnEntry[];
}

const sessions = new Map<string, Session>();

function isValidId(id: string): boolean {
  return /^[a-z0-9-]+$/i.test(id);
}

function sendSse(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function saveSession(session: Session): Promise<void> {
  const dir = join(config.privateDataDir, "sessions");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${session.id}.json`), JSON.stringify(session, null, 2), "utf8");
}

async function checkService(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const app = express();
app.use(express.static("public"));

app.get("/api/health", async (_req, res) => {
  const [ollama, stt, voicevox] = await Promise.all([
    checkService(`${config.ollamaBaseUrl}/api/version`),
    checkService(`${config.sttUrl}/health`),
    checkService(`${config.voicevoxUrl}/version`),
  ]);
  res.json({
    ok: ollama && stt && voicevox,
    services: { ollama, stt, voicevox },
    model: config.modelLive,
    modelReview: config.modelReview,
    speaker: config.voicevoxSpeaker,
  });
});

app.get("/api/speakers", async (_req, res) => {
  const speakers = await listSpeakers();
  res.json({ defaultSpeaker: config.voicevoxSpeaker, speakers });
});

app.post("/api/session/start", async (_req, res) => {
  const persona = await loadPersona();
  const id = randomUUID().slice(0, 8);
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    messages: [{ role: "system", content: buildSystemPrompt(persona) }],
  };
  sessions.set(id, session);
  res.json({ sessionId: id, role: persona.target_role ?? "Tech Lead / PM" });
});

// 同時接收音訊 (audio/*) 或文字/開場指令 (application/json)
app.post(
  "/api/session/:id/turn",
  express.raw({ type: () => true, limit: "25mb" }),
  async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "找不到面試場次，請重新開始。" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const ac = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    const speakerHeader = Number(req.headers["x-voicevox-speaker"]);
    const speedHeader = Number(req.headers["x-voicevox-speed"]);
    const offsetHeader = Number(req.headers["x-offset-sec"]);
    const speaker = Number.isFinite(speakerHeader) && speakerHeader > 0
      ? speakerHeader
      : config.voicevoxSpeaker;
    const speed = Number.isFinite(speedHeader) && speedHeader >= 0.5 && speedHeader <= 2.0
      ? speedHeader
      : config.voicevoxSpeed;
    const userOffsetSec = Number.isFinite(offsetHeader) && offsetHeader >= 0
      ? Math.round(offsetHeader * 10) / 10
      : Math.round((Date.now() - session.startedAtMs) / 100) / 10;

    try {
      let userText = "";
      const ctype = req.headers["content-type"] ?? "";

      if (ctype.includes("application/json")) {
        const body = JSON.parse(Buffer.from(req.body).toString("utf8")) as { text?: string };
        userText = (body.text ?? "").trim();
      } else {
        const audioBuf = Buffer.from(req.body);
        if (audioBuf.length < 500) {
          sendSse(res, "error", { message: "錄音時間太短，請按住按鈕再說一次。" });
          res.end();
          return;
        }
        sendSse(res, "status", { step: "stt" });
        userText = await transcribe(audioBuf, ctype || "audio/webm");
        if (!userText) {
          sendSse(res, "error", { message: "未能辨識出語音，請再試一次。" });
          res.end();
          return;
        }
      }

      sendSse(res, "transcript", { role: "user", text: userText, offsetSec: userOffsetSec });
      session.messages.push({ role: "user", content: userText, offsetSec: userOffsetSec });

      sendSse(res, "status", { step: "llm" });
      const assistantOffsetSec = Math.round((Date.now() - session.startedAtMs) / 100) / 10;
      const splitter = new SentenceSplitter();
      let fullReply = "";
      let ttsChain = Promise.resolve();

      const enqueueSentence = (sentence: string) => {
        ttsChain = ttsChain.then(async () => {
          if (ac.signal.aborted) return;
          sendSse(res, "sentence", { text: sentence, offsetSec: assistantOffsetSec });
          const wav = await synthesize(sentence, speaker, speed);
          if (ac.signal.aborted) return;
          sendSse(res, "audio", { wavBase64: wav.toString("base64") });
        });
      };

      for await (const chunk of streamChat(session.messages, ac.signal)) {
        fullReply += chunk;
        for (const s of splitter.push(chunk)) enqueueSentence(s);
      }
      for (const s of splitter.flush()) enqueueSentence(s);

      await ttsChain;
      session.messages.push({
        role: "assistant",
        content: fullReply.trim(),
        offsetSec: assistantOffsetSec,
      });
      await saveSession(session);
      // 扣除 system 與開場觸發指令，計算實際面試問答輪數
      const turnCount = Math.max(0, session.messages.filter((m) => m.role === "user").length - 1);
      sendSse(res, "done", {
        fullText: fullReply.trim(),
        offsetSec: assistantOffsetSec,
        turnCount,
        recommendedMaxTurns: 12,
      });
    } catch (err) {
      if (!ac.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        sendSse(res, "error", { message: msg });
      }
    } finally {
      res.end();
    }
  },
);

// P2：上傳整場錄影（webm）
app.post(
  "/api/session/:id/recording",
  express.raw({ type: () => true, limit: "500mb" }),
  async (req, res) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: "無效的場次 ID" });
      return;
    }
    const dir = join(config.privateDataDir, "recordings");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${id}.webm`);
    await writeFile(file, Buffer.from(req.body));
    res.json({ ok: true, bytes: Buffer.byteLength(req.body) });
  },
);

// P2：播放錄影（Express sendFile 內建 Range 支援時間軸跳轉）
app.get("/api/session/:id/recording", (req, res) => {
  const id = req.params.id;
  if (!isValidId(id)) {
    res.status(400).end();
    return;
  }
  const file = resolve(config.privateDataDir, "recordings", `${id}.webm`);
  if (!existsSync(file)) {
    res.status(404).json({ error: "尚未有錄影檔" });
    return;
  }
  res.sendFile(file);
});

// P3：結束面試 → 釋放 8GB VRAM（卸載即時模型與 STT）→ gemma4:12b 產出報告
app.post("/api/session/:id/review", async (req, res) => {
  const id = req.params.id;
  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: "找不到面試場次" });
    return;
  }
  try {
    await Promise.all([unloadModel(config.modelLive), unloadStt()]);
    const metrics = computeMetrics(session.messages);
    const report = await generateReview(session.messages, metrics);
    const dir = join(config.privateDataDir, "reports");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.md`), report, "utf8");
    res.json({ ok: true, metrics, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// 匯出整合對話紀錄與評分結果的單一 HTML 報告
app.get("/api/session/:id/export", async (req, res) => {
  const id = req.params.id;
  if (!isValidId(id)) {
    res.status(400).json({ error: "無效的場次 ID" });
    return;
  }

  let session = sessions.get(id);
  if (!session) {
    try {
      const raw = await readFile(join(config.privateDataDir, "sessions", `${id}.json`), "utf8");
      session = JSON.parse(raw) as Session;
    } catch {
      res.status(404).json({ error: "找不到面試場次" });
      return;
    }
  }

  let report = "";
  try {
    report = await readFile(join(config.privateDataDir, "reports", `${id}.md`), "utf8");
  } catch {
    // 尚未產生評分報告時仍可匯出對話紀錄
  }

  const metrics = computeMetrics(session.messages);
  const html = renderHtmlReport({
    sessionId: session.id,
    createdAt: session.createdAt,
    metrics,
    turns: session.messages,
    report,
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="interview-report-${id}.html"`);
  res.send(html);
});

app.listen(config.port, config.host, () => {
  console.log(`interview-dojo listening on http://${config.host}:${config.port}`);
});
