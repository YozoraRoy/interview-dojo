const $ = (id) => document.getElementById(id);

const healthEl = $("health");
const speakerSelect = $("speakerSelect");
const speedRange = $("speedRange");
const speedVal = $("speedVal");
const recBadge = $("recBadge");
const timerEl = $("timer");
const camEl = $("cam");
const replayEl = $("replay");
const camOffEl = $("camOff");
const avatarEl = $("avatar");
const subtitleEl = $("subtitle");
const btnStart = $("btnStart");
const btnTalk = $("btnTalk");
const btnFinish = $("btnFinish");
const statusEl = $("status");
const logEl = $("log");
const textForm = $("textForm");
const textInput = $("textInput");
const btnSend = $("btnSend");
const reviewPanel = $("reviewPanel");
const metricsBar = $("metricsBar");
const reviewBody = $("reviewBody");
const btnExport = $("btnExport");
const footerCredit = $("footerCredit");

let sessionId = null;
let sessionStartMs = 0;
let timerHandle = null;
let mediaStream = null;
let turnRecorder = null;
let turnChunks = [];
let fullRecorder = null;
let fullChunks = [];
let busy = false;
let speakersList = [];

const audioQueue = [];
let playing = false;

function formatSec(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function updateCredit() {
  const sp = speakersList.find((x) => String(x.id) === speakerSelect.value);
  const credit = sp ? sp.credit : "VOICEVOX:青山龍星";
  footerCredit.textContent = `音訊由 VOICEVOX 合成（${credit}）｜所有錄影與評分僅存本機`;
}

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

function appendLog(role, text, offsetSec) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  if (typeof offsetSec === "number") {
    const ts = document.createElement("span");
    ts.className = "msg-ts";
    ts.textContent = `[${formatSec(offsetSec)}]`;
    ts.title = "面試結束後點擊可跳轉至該時間點";
    ts.addEventListener("click", () => {
      if (!replayEl.classList.contains("hidden")) {
        replayEl.currentTime = offsetSec;
        replayEl.play().catch(() => {});
      }
    });
    div.appendChild(ts);
  }
  const span = document.createElement("span");
  span.className = "msg-text";
  span.textContent = text;
  div.appendChild(span);
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return span;
}

async function loadSpeakers() {
  try {
    const res = await fetch("/api/speakers");
    const data = await res.json();
    speakersList = data.speakers ?? [];
    speakerSelect.innerHTML = "";
    for (const sp of speakersList) {
      const opt = document.createElement("option");
      opt.value = String(sp.id);
      opt.textContent = sp.label;
      if (sp.id === data.defaultSpeaker) opt.selected = true;
      speakerSelect.appendChild(opt);
    }
    updateCredit();
  } catch {
    // 忽略
  }
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
  let assistantSpan = null;
  let acc = "";
  const offsetSec = sessionStartMs ? Math.round((Date.now() - sessionStartMs) / 100) / 10 : 0;

  try {
    const headers = {
      "X-Voicevox-Speaker": speakerSelect.value || "13",
      "X-Voicevox-Speed": speedRange.value || "1.05",
      "X-Offset-Sec": String(offsetSec),
    };
    if (contentType) headers["Content-Type"] = contentType;

    const res = await fetch(`/api/session/${sessionId}/turn`, {
      method: "POST",
      headers,
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
          if (data.text !== "面接を始めてください。") {
            appendLog("user", data.text, data.offsetSec);
          }
        } else if (ev === "sentence") {
          acc += (acc ? " " : "") + data.text;
          subtitleEl.textContent = data.text;
          if (!assistantSpan) assistantSpan = appendLog("assistant", acc, data.offsetSec);
          else assistantSpan.textContent = acc;
          logEl.scrollTop = logEl.scrollHeight;
        } else if (ev === "audio") {
          enqueueAudio(data.wavBase64);
        } else if (ev === "done") {
          statusEl.textContent = "輪到你回答（按住說話，結束後點「結束面試並評分」）";
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

function startFullRecording() {
  if (!mediaStream) return;
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";
  fullChunks = [];
  fullRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
  fullRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) fullChunks.push(e.data);
  };
  fullRecorder.start(1000);
  recBadge.classList.remove("hidden");
  timerHandle = setInterval(() => {
    timerEl.textContent = formatSec((Date.now() - sessionStartMs) / 1000);
  }, 1000);
}

function stopFullRecording() {
  return new Promise((resolve) => {
    clearInterval(timerHandle);
    recBadge.classList.add("hidden");
    if (!fullRecorder || fullRecorder.state === "inactive") {
      resolve(null);
      return;
    }
    fullRecorder.onstop = () => {
      resolve(new Blob(fullChunks, { type: "video/webm" }));
    };
    fullRecorder.stop();
  });
}

btnStart.addEventListener("click", async () => {
  btnStart.disabled = true;
  reviewPanel.classList.add("hidden");
  replayEl.classList.add("hidden");
  camEl.classList.remove("hidden");
  statusEl.textContent = "開啟鏡頭與麥克風中…";

  try {
    if (!mediaStream) {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
    camEl.srcObject = mediaStream;
    camOffEl.style.display = "none";
  } catch {
    camOffEl.textContent = "未取得鏡頭/麥克風權限（仍可用文字備用輸入）";
  }

  statusEl.textContent = "建立面試場次…";
  const res = await fetch("/api/session/start", { method: "POST" });
  const data = await res.json();
  sessionId = data.sessionId;
  sessionStartMs = Date.now();
  logEl.innerHTML = "";
  textInput.disabled = false;
  btnFinish.disabled = false;

  startFullRecording();
  await sendTurn(JSON.stringify({ text: "面接を始めてください。" }), "application/json");
  btnStart.textContent = "重新開始";
  btnStart.disabled = false;
});

btnFinish.addEventListener("click", async () => {
  if (!sessionId || busy) return;
  btnFinish.disabled = true;
  btnTalk.disabled = true;
  btnSend.disabled = true;
  btnStart.disabled = true;

  statusEl.textContent = "儲存整場錄影中…";
  const videoBlob = await stopFullRecording();
  if (videoBlob && videoBlob.size > 0) {
    await fetch(`/api/session/${sessionId}/recording`, {
      method: "POST",
      headers: { "Content-Type": "video/webm" },
      body: videoBlob,
    });
    camEl.classList.add("hidden");
    replayEl.src = `/api/session/${sessionId}/recording`;
    replayEl.classList.remove("hidden");
  }

  statusEl.textContent = "正在切換至 gemma4:12b 產出評分報告（約 10–25 秒）…";
  try {
    const res = await fetch(`/api/session/${sessionId}/review`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "評分失敗");

    const m = data.metrics;
    metricsBar.innerHTML = [
      `有效回答 ${m.userTurns} 次`,
      `總計 ${m.totalChars} 字（平均 ${m.avgCharsPerTurn} 字）`,
      `填充詞 ${m.fillerTotal} 次`,
    ]
      .map((t) => `<span class="metric-chip">${t}</span>`)
      .join("");
    reviewBody.textContent = data.report;
    reviewPanel.classList.remove("hidden");
    statusEl.textContent = "復盤完成！可點擊右側逐字稿時間跳轉回放。";
  } catch (err) {
    statusEl.textContent = `評分失敗：${err.message}`;
  } finally {
    btnStart.disabled = false;
  }
});

function startTalking() {
  if (!sessionId || busy || !mediaStream || turnRecorder?.state === "recording") return;
  const audioStream = new MediaStream(mediaStream.getAudioTracks());
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  turnChunks = [];
  turnRecorder = new MediaRecorder(audioStream, { mimeType: mime });
  turnRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) turnChunks.push(e.data);
  };
  turnRecorder.onstop = async () => {
    const blob = new Blob(turnChunks, { type: mime });
    await sendTurn(blob, mime);
  };
  turnRecorder.start();
  btnTalk.classList.add("recording");
  btnTalk.textContent = "錄音中…放開送出";
  statusEl.textContent = "聆聽中…";
}

function stopTalking() {
  if (turnRecorder && turnRecorder.state === "recording") {
    turnRecorder.stop();
    btnTalk.classList.remove("recording");
    btnTalk.textContent = "按住說話（或按住空白鍵）";
  }
}

btnTalk.addEventListener("pointerdown", startTalking);
window.addEventListener("pointerup", stopTalking);

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat && document.activeElement !== textInput) {
    e.preventDefault();
    startTalking();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && document.activeElement !== textInput) {
    e.preventDefault();
    stopTalking();
  }
});

textForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text || !sessionId || busy) return;
  textInput.value = "";
  await sendTurn(JSON.stringify({ text }), "application/json");
});

speakerSelect.addEventListener("change", updateCredit);
speedRange.addEventListener("input", () => {
  speedVal.textContent = Number(speedRange.value).toFixed(2);
});
btnExport.addEventListener("click", () => {
  if (!sessionId) return;
  window.location.href = `/api/session/${sessionId}/export`;
});

loadSpeakers();
checkHealth();
setInterval(checkHealth, 15000);
