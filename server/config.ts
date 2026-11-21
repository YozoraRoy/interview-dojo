// 集中讀取設定。所有服務位址預設只指向本機 127.0.0.1。
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  host: "127.0.0.1",
  ollamaBaseUrl: env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  modelLive: env.LLM_MODEL_LIVE ?? "gemma4:e4b",
  modelReview: env.LLM_MODEL_REVIEW ?? "gemma4:12b",
  numCtx: Number(env.LLM_NUM_CTX ?? 8192),
  sttUrl: env.STT_URL ?? "http://127.0.0.1:8001",
  voicevoxUrl: env.VOICEVOX_URL ?? "http://127.0.0.1:50021",
  voicevoxSpeaker: Number(env.VOICEVOX_SPEAKER ?? 13),
  voicevoxSpeed: Number(env.VOICEVOX_SPEED ?? 1.05),
  // 私人資料（履歷、逐字稿）放在 repo 之外；未設定時退回 ./data（已被 gitignore）。
  privateDataDir: env.PRIVATE_DATA_DIR ?? "./data",
} as const;
