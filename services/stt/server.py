"""本地語音辨識服務（faster-whisper）。僅綁定 127.0.0.1，不送出任何資料。

環境變數：
  STT_MODEL   模型名稱，預設 large-v3-turbo
  STT_DEVICE  cpu 或 cuda，預設 cpu
  STT_COMPUTE 計算精度，預設 int8（cuda 可用 float16 / int8_float16）
  STT_PROMPT  initial_prompt，用於注入技術關鍵字
"""
import os
import tempfile
import time



def _add_cuda_dll_dirs() -> None:
    """Windows 上讓 ctranslate2 找得到 pip 安裝的 cuBLAS / cuDNN DLL。"""
    if os.name != "nt":
        return
    try:
        import nvidia.cublas
        import nvidia.cudnn
    except ImportError:
        return
    for pkg in (nvidia.cublas, nvidia.cudnn):
        for base in pkg.__path__:
            bin_dir = os.path.join(base, "bin")
            if os.path.isdir(bin_dir):
                os.add_dll_directory(bin_dir)
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ["PATH"]


_add_cuda_dll_dirs()

from fastapi import FastAPI, File, Form, UploadFile  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

MODEL_NAME = os.getenv("STT_MODEL", "large-v3-turbo")
DEVICE = os.getenv("STT_DEVICE", "cpu")
COMPUTE = os.getenv("STT_COMPUTE", "int8")
DEFAULT_PROMPT = os.getenv(
    "STT_PROMPT",
    "技術面接。Node.js, TypeScript, React, C#, .NET, Azure, GCP, "
    "マイクロサービス, 要件定義, 職務経歴書, レイテンシ, アーキテクチャ",
)

app = FastAPI(title="interview-dojo STT")
_model = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE)
    return _model


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME, "device": DEVICE, "compute": COMPUTE}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("ja"),
    prompt: str = Form(""),
):
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(await audio.read())
        path = f.name
    try:
        t0 = time.time()
        segments, info = get_model().transcribe(
            path,
            language=language,
            initial_prompt=prompt or DEFAULT_PROMPT,
            vad_filter=True,
            beam_size=1,
        )
        text = "".join(s.text for s in segments).strip()
        return {
            "text": text,
            "language": info.language,
            "audio_sec": round(info.duration, 2),
            "elapsed_sec": round(time.time() - t0, 2),
        }
    finally:
        os.unlink(path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("STT_PORT", "8001")))
