import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.ts";
import type { TurnEntry } from "./metrics.ts";
import { buildSystemPrompt, loadPersona } from "./persona.ts";

export interface SessionLLMSummary {
  liveModel?: string;
  reviewModel?: string;
  totalCostUsd?: number;
}

export interface Session {
  id: string;
  createdAt: string;
  startedAtMs: number;
  role?: string;
  llmSummary?: SessionLLMSummary;
  messages: TurnEntry[];
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  role: string;
  turnCount: number;
}

export function isValidSessionId(id: string): boolean {
  return /^[a-z0-9-]+$/i.test(id);
}

function getSessionsDir(): string {
  return join(config.privateDataDir, "sessions");
}

function getSessionPath(id: string): string {
  return join(getSessionsDir(), `${id}.json`);
}

/** 建立新面試場次並立即寫入磁碟，確保跨 Route Handler 與 HMR 狀態一致。 */
export async function createSession(): Promise<Session> {
  const persona = await loadPersona();
  const id = randomUUID().slice(0, 8);
  const role = persona.target_role ?? "Tech Lead / PM";
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    role,
    messages: [{ role: "system", content: buildSystemPrompt(persona) }],
  };
  await saveSession(session);
  return session;
}

/** 從磁碟讀取指定面試場次，找不到或格式不合法時回傳 null。 */
export async function getSession(id: string): Promise<Session | null> {
  if (!isValidSessionId(id)) return null;
  try {
    const raw = await readFile(getSessionPath(id), "utf8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** 將面試場次持久化至 data/sessions/{id}.json。 */
export async function saveSession(session: Session): Promise<void> {
  if (!isValidSessionId(session.id)) {
    throw new Error(`無效的場次 ID: ${session.id}`);
  }
  await mkdir(getSessionsDir(), { recursive: true });
  await writeFile(getSessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
}

/** 列出所有已儲存的歷史面試摘要（依建立時間由新到舊排序）。 */
export async function listSessions(): Promise<SessionSummary[]> {
  try {
    const files = await readdir(getSessionsDir());
    const summaries: SessionSummary[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const id = file.slice(0, -5);
      const session = await getSession(id);
      if (!session) continue;
      const turnCount = Math.max(
        0,
        session.messages.filter((m) => m.role === "user").length - 1,
      );
      summaries.push({
        id: session.id,
        createdAt: session.createdAt,
        role: session.role ?? "Tech Lead / PM",
        turnCount,
      });
    }
    return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}
