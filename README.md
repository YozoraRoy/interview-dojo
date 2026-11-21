# interview-dojo

全本地（$0 API 費）的 AI 視訊模擬面試練習工具。先做日文，英文之後。

- LLM：Ollama（`gemma4:e4b` 即時對話、`gemma4:12b` 事後評分）
- STT：faster-whisper（`large-v3-turbo` GPU）
- TTS：VOICEVOX（日文）
- 前端：瀏覽器 `getUserMedia` / `MediaRecorder`

> 所有服務僅綁定 `127.0.0.1`，不送出任何資料。個人履歷與錄影絕不放進本 repo，請設定 `PRIVATE_DATA_DIR` 指向 repo 外部。

## 快速啟動（P1 MVP）

1. 安裝 Node 依賴：`pnpm install`
2. 確認 Python STT 環境：`services/stt` 已建立 `.venv` 並安裝 `requirements.txt`
3. 啟動全部服務與 Web：`powershell -ExecutionPolicy Bypass -File scripts/start-all.ps1`
4. 用瀏覽器開啟 `http://127.0.0.1:3000`

## 授權與出處標示

- 程式碼授權：MIT
- 使用 VOICEVOX 角色語音時須標示出處（例如「VOICEVOX:ずんだもん」）。
