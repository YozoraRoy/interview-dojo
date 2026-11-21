import express from "express";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.ts";
import { streamChat, type ChatMessage } from "./llm.ts";
import { buildSystemPrompt, loadPersona } from "./persona.ts";
import { SentenceSplitter } from "./sentences.ts";
import { synthesize, transcribe } from "./speech.ts";

interface Session {
  id: string;
  createdAt: string;
  messages: ChatMessage[];
}

const sessions = new Map<string, Session>();

function sendSse(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function saveSession(session: Session): Promise<void> {
  const dir = join(config.privateDataDir, "sessions");
  await mkdir(dir, { recursive: true });
  // 不儲存 system prompt 以外的敏感環境資訊，僅存對話紀錄
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
    speaker: config.voicevoxSpeaker,
  });
});

app.post("/api/session/start", async (_req, res) => {
  const persona = await loadPersona();
  const id = randomUUID().slice(0, 8);
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    messages: [{ role: "system", content: buildSystemPrompt(persona) }],
  };
  sessions.set(id, session);
  res.json({ sessionId: id, role: persona.target_role ?? "Tech Lead / PM" });
});

// 同時接收音訊 (multipart/form-data) 或文字/開場指令 (application/json)
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

      sendSse(res, "transcript", { role: "user", text: userText });
      session.messages.push({ role: "user", content: userText });

      sendSse(res, "status", { step: "llm" });
      const splitter = new SentenceSplitter();
      let fullReply = "";
      // 序列化 TTS 合成，確保播放順序與句子順序一致
      let ttsChain = Promise.resolve();

      const enqueueSentence = (sentence: string) => {
        ttsChain = ttsChain.then(async () => {
          if (ac.signal.aborted) return;
          sendSse(res, "sentence", { text: sentence });
          const wav = await synthesize(sentence);
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
      session.messages.push({ role: "assistant", content: fullReply.trim() });
      await saveSession(session);
      sendSse(res, "done", { fullText: fullReply.trim() });
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

app.listen(config.port, config.host, () => {
  console.log(`interview-dojo listening on http://${config.host}:${config.port}`);
});
