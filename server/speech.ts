import { config } from "./config.ts";

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

/** 語音合成：VOICEVOX audio_query → synthesis，回傳 WAV。 */
export async function synthesize(text: string): Promise<Buffer> {
  const speaker = config.voicevoxSpeaker;
  const qRes = await fetch(
    `${config.voicevoxUrl}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
    { method: "POST" },
  );
  if (!qRes.ok) throw new Error(`VOICEVOX audio_query 錯誤 ${qRes.status}`);
  const query = (await qRes.json()) as Record<string, unknown>;
  query.speedScale = config.voicevoxSpeed;
  const sRes = await fetch(`${config.voicevoxUrl}/synthesis?speaker=${speaker}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!sRes.ok) throw new Error(`VOICEVOX synthesis 錯誤 ${sRes.status}`);
  return Buffer.from(await sRes.arrayBuffer());
}
