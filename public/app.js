const $ = (id) => document.getElementById(id);

const healthEl = $("health");
const camEl = $("cam");
const camOffEl = $("camOff");
const avatarEl = $("avatar");
const subtitleEl = $("subtitle");
const btnStart = $("btnStart");
const btnTalk = $("btnTalk");
const statusEl = $("status");
const logEl = $("log");
const textForm = $("textForm");
const textInput = $("textInput");
const btnSend = $("btnSend");

let sessionId = null;
let mediaStream = null;
let recorder = null;
let chunks = [];
let busy = false;

// 音訊播放佇列：確保面試官一句接一句照順序唸
const audioQueue = [];
let playing = false;

function enqueueAudio(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  audioQueue.push(url);
  if (!playing) playNext();
}

function playNext() {
  if (audioQueue.length === 0) {
    playing = false;
    avatarEl.classList.remove("speaking");
    return;
  }
  playing = true;
  avatarEl.classList.add("speaking");
  const url = audioQueue.shift();
  const audio = new Audio(url);
  audio.onended = () => {
    URL.revokeObjectURL(url);
    playNext();
  };
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    playNext();
  };
  audio.play().catch(() => playNext());
}

function appendLog(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return div;
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const h = await res.json();
    const parts = [
      `Ollama:${h.services.ollama ? "OK" : "離線"}`,
      `STT:${h.services.stt ? "OK" : "離線"}`,
      `VOICEVOX:${h.services.voicevox ? "OK" : "離線"}`,
    ];
    healthEl.textContent = `${parts.join(" ｜ ")} (${h.model})`;
    healthEl.className = `health ${h.ok ? "ok" : "err"}`;
  } catch {
    healthEl.textContent = "無法連線後端";
    healthEl.className = "health err";
  }
}

async function sendTurn(body, contentType) {
  busy = true;
  btnTalk.disabled = true;
  btnSend.disabled = true;
  let assistantEl = null;
  let acc = "";

  try {
    const res = await fetch(`/api/session/${sessionId}/turn`, {
      method: "POST",
      headers: contentType ? { "Content-Type": contentType } : {},
      body,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const evLine = block.split("\n").find((l) => l.startsWith("event:"));
        const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
        if (!evLine || !dataLine) continue;
        const ev = evLine.slice(6).trim();
        const data = JSON.parse(dataLine.slice(5).trim());

        if (ev === "status") {
          statusEl.textContent = data.step === "stt" ? "辨識語音中…" : "面試官思考與合成語音中…";
        } else if (ev === "transcript") {
          appendLog("user", data.text);
        } else if (ev === "sentence") {
          acc += (acc ? " " : "") + data.text;
          subtitleEl.textContent = data.text;
          if (!assistantEl) assistantEl = appendLog("assistant", acc);
          else assistantEl.textContent = acc;
          logEl.scrollTop = logEl.scrollHeight;
        } else if (ev === "audio") {
          enqueueAudio(data.wavBase64);
        } else if (ev === "done") {
          statusEl.textContent = "輪到你回答（按住說話）";
        } else if (ev === "error") {
          statusEl.textContent = `錯誤：${data.message}`;
        }
      }
    }
  } finally {
    busy = false;
    btnTalk.disabled = false;
    btnSend.disabled = false;
  }
}

btnStart.addEventListener("click", async () => {
  btnStart.disabled = true;
  statusEl.textContent = "開啟鏡頭與麥克風中…";
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    camEl.srcObject = mediaStream;
    camOffEl.style.display = "none";
  } catch {
    camOffEl.textContent = "未取得鏡頭/麥克風權限（仍可用文字備用輸入）";
  }

  statusEl.textContent = "建立面試場次…";
  const res = await fetch("/api/session/start", { method: "POST" });
  const data = await res.json();
  sessionId = data.sessionId;
  logEl.innerHTML = "";
  textInput.disabled = false;

  await sendTurn(JSON.stringify({ text: "面接を始めてください。" }), "application/json");
  btnStart.textContent = "重新開始";
  btnStart.disabled = false;
});

function startRecording() {
  if (!sessionId || busy || !mediaStream || recorder?.state === "recording") return;
  const audioStream = new MediaStream(mediaStream.getAudioTracks());
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  chunks = [];
  recorder = new MediaRecorder(audioStream, { mimeType: mime });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: mime });
    await sendTurn(blob, mime);
  };
  recorder.start();
  btnTalk.classList.add("recording");
  btnTalk.textContent = "錄音中…放開送出";
  statusEl.textContent = "聆聽中…";
}

function stopRecording() {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
    btnTalk.classList.remove("recording");
    btnTalk.textContent = "按住說話（或按住空白鍵）";
  }
}

btnTalk.addEventListener("pointerdown", startRecording);
window.addEventListener("pointerup", stopRecording);

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat && document.activeElement !== textInput) {
    e.preventDefault();
    startRecording();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && document.activeElement !== textInput) {
    e.preventDefault();
    stopRecording();
  }
});

textForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text || !sessionId || busy) return;
  textInput.value = "";
  await sendTurn(JSON.stringify({ text }), "application/json");
});

checkHealth();
setInterval(checkHealth, 15000);
