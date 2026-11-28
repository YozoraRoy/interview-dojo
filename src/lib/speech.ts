import { config } from "./config.ts";

export interface SpeakerOption {
  id: number;
  label: string;
  credit: string;
}

// 精選適合模擬面試的 VOICEVOX 角色，並對應中文標籤
const CURATED_SPEAKERS: Array<{ id: number; label: string; character: string }> = [
  { id: 13, label: "成熟男聲（技術部長風）— 青山龍星", character: "青山龍星" },
  { id: 11, label: "干練男聲（Tech Lead 風）— 玄野武宏", character: "玄野武宏" },
  { id: 21, label: "知性男聲（沉穩主管風）— 剣崎雌雄", character: "剣崎雌雄" },
  { id: 52, label: "溫和男聲 — 雀松朱司", character: "雀松朱司" },
  { id: 30, label: "專業女聲（播報員風）— No.7 アナウンス", character: "No.7" },
  { id: 29, label: "知性女聲 — No.7 ノーマル", character: "No.7" },
  { id: 16, label: "溫柔女聲 — 九州そら", character: "九州そら" },
  { id: 9, label: "俐落女聲 — 波音リツ", character: "波音リツ" },
  { id: 3, label: "趣味少年音 — ずんだもん", character: "ずんだもん" },
];

/** 取得可用的面試官聲音清單（確認 VOICEVOX 實際有支援的 ID）。 */
export async function listSpeakers(): Promise<SpeakerOption[]> {
  try {
    const res = await fetch(`${config.voicevoxUrl}/speakers`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error("fetch speakers failed");
    const raw = (await res.json()) as Array<{
      name: string;
      styles: Array<{ id: number; name: string }>;
    }>;
    const available = new Set<number>();
    for (const sp of raw) {
      for (const st of sp.styles) available.add(st.id);
    }
    const filtered = CURATED_SPEAKERS.filter((s) => available.has(s.id)).map((s) => ({
      id: s.id,
      label: s.label,
      credit: `VOICEVOX:${s.character}`,
    }));
    if (filtered.length > 0) return filtered;
  } catch {
    // 若 VOICEVOX 暫時離線，先回傳預設清單
  }
  return CURATED_SPEAKERS.map((s) => ({
    id: s.id,
    label: s.label,
    credit: `VOICEVOX:${s.character}`,
  }));
}

/** 語音辨識：把瀏覽器錄下的音訊轉給本地 faster-whisper。 */
export async function transcribe(audio: Buffer, mime: string): Promise<string> {
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audio)], { type: mime }), `speech.${ext}`);
  form.append("language", "ja");
  const res = await fetch(`${config.sttUrl}/transcribe`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`STT 回應錯誤 ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text: string };
  return data.text;
}

/** 卸載 STT 模型釋放 VRAM。 */
export async function unloadStt(): Promise<void> {
  try {
    await fetch(`${config.sttUrl}/unload`, { method: "POST", signal: AbortSignal.timeout(3000) });
  } catch {
    // 忽略離線情況
  }
}

/** 語音合成：VOICEVOX audio_query → synthesis，回傳 WAV。 */
export async function synthesize(
  text: string,
  speaker = config.voicevoxSpeaker,
  speed = config.voicevoxSpeed,
): Promise<Buffer> {
  const qRes = await fetch(
    `${config.voicevoxUrl}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
    { method: "POST" },
  );
  if (!qRes.ok) throw new Error(`VOICEVOX audio_query 錯誤 ${qRes.status}`);
  const query = (await qRes.json()) as Record<string, unknown>;
  query.speedScale = speed;
  const sRes = await fetch(`${config.voicevoxUrl}/synthesis?speaker=${speaker}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!sRes.ok) throw new Error(`VOICEVOX synthesis 錯誤 ${sRes.status}`);
  return Buffer.from(await sRes.arrayBuffer());
}
