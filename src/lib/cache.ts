import { cacheLife, cacheTag } from "next/cache";
import { loadPersona, type Persona } from "./persona.ts";
import { listSessions, type SessionSummary } from "./sessions.ts";

/** 快取本地 persona.yaml 讀取結果，並在 PUT /api/persona 時透過 updateTag('persona') 失效。 */
export async function getCachedPersona(): Promise<Persona> {
  "use cache";
  cacheTag("persona");
  cacheLife("minutes");
  return loadPersona();
}

/** 快取本地歷史場次列表，並在開賽或復盤完成時透過 updateTag('sessions') 失效。 */
export async function getCachedSessionList(): Promise<SessionSummary[]> {
  "use cache";
  cacheTag("sessions");
  cacheLife("minutes");
  return listSessions();
}
