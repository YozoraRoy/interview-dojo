# interview-dojo

全本地（$0 API 費）的 AI 視訊模擬面試練習工具。先做日文，英文之後。

- LLM：Ollama（qwen2.5:7b 即時對話、gemma4:12b 事後評分）
- STT：faster-whisper　TTS：VOICEVOX（日文）
- 前端：瀏覽器 getUserMedia / MediaRecorder

> 所有服務僅綁定 127.0.0.1，不送出任何資料。個人履歷與錄影絕不放進本 repo，請設定 `PRIVATE_DATA_DIR` 指向 repo 外部。

VOICEVOX 角色語音使用時須標示出處（例如「VOICEVOX:ずんだもん」）。

狀態：P0 環境建置中。
