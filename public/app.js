import {
  createInterviewerAvatar,
  RIVE_CHARACTERS,
  SVG_CHARACTERS,
  THREE_D_CHARACTERS,
} from "./avatar.js";

const $ = (id) => document.getElementById(id);

const interviewerStageEl = $("interviewerStage");
const interviewerAvatar = createInterviewerAvatar(interviewerStageEl);
const btnModeSvg = $("btnModeSvg");
const btnMode3d = $("btnMode3d");
const btnModeRive = $("btnModeRive");
const characterSelect = $("characterSelect");
const btnLoadRive = $("btnLoadRive");
const riveFileInput = $("riveFileInput");
const btnLoadVrm = $("btnLoadVrm");
const vrmFileInput = $("vrmFileInput");

function syncAvatarToolbar() {
  const prefs = interviewerAvatar.getPreferences();
  const isSvg = prefs.mode === "svg";
  const is3d = prefs.mode === "3d";
  const isRive = prefs.mode === "rive";
  btnModeSvg.classList.toggle("active", isSvg);
  btnMode3d.classList.toggle("active", is3d);
  btnModeRive.classList.toggle("active", isRive);
  btnLoadRive.classList.toggle("hidden", !isRive);
  btnLoadVrm.classList.toggle("hidden", !is3d);

  const list = isRive ? RIVE_CHARACTERS : is3d ? THREE_D_CHARACTERS : SVG_CHARACTERS;
  const activeId = isRive
    ? prefs.riveCharacter
    : is3d
      ? prefs.threeDCharacter
      : prefs.svgCharacter;
  characterSelect.innerHTML = "";
  for (const item of list) {
    const opt = document.createElement("option");
    opt.value = item.id;
    if (item.id === "custom" && prefs.customRiveName) {
      opt.textContent = `自訂：${prefs.customRiveName}`;
    } else if (item.id === "custom_vrm" && prefs.customVrmName) {
      opt.textContent = `自訂：${prefs.customVrmName}`;
    } else {
      opt.textContent = item.label;
    }
    if (item.id === activeId) opt.selected = true;
    characterSelect.appendChild(opt);
  }
}

btnModeSvg.addEventListener("click", () => {
  interviewerAvatar.setMode("svg");
  syncAvatarToolbar();
});
btnMode3d.addEventListener("click", () => {
  interviewerAvatar.setMode("3d");
  syncAvatarToolbar();
});
btnModeRive.addEventListener("click", () => {
  interviewerAvatar.setMode("rive");
  syncAvatarToolbar();
});
characterSelect.addEventListener("change", () => {
  if (characterSelect.value === "custom") {
    const prefs = interviewerAvatar.getPreferences();
    if (!prefs.customRiveBase64) riveFileInput.click();
  } else if (characterSelect.value === "custom_vrm") {
    vrmFileInput.click();
  }
  interviewerAvatar.setCharacter(characterSelect.value);
  syncAvatarToolbar();
});
btnLoadRive.addEventListener("click", () => riveFileInput.click());
riveFileInput.addEventListener("change", async () => {
  const file = riveFileInput.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  interviewerAvatar.loadCustomRiveBuffer(buf, file.name);
  syncAvatarToolbar();
  riveFileInput.value = "";
});
btnLoadVrm.addEventListener("click", () => vrmFileInput.click());
vrmFileInput.addEventListener("change", async () => {
  const file = vrmFileInput.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  interviewerAvatar.loadCustomVrmBuffer(buf, file.name);
  syncAvatarToolbar();
  vrmFileInput.value = "";
});

syncAvatarToolbar();

const healthEl = $("health");
const speakerSelect = $("speakerSelect");
const speedRange = $("speedRange");
const speedVal = $("speedVal");
const recBadge = $("recBadge");
const timerEl = $("timer");
const turnBadge = $("turnBadge");
const limitBanner = $("limitBanner");
const camEl = $("cam");
const replayEl = $("replay");
const camOffEl = $("camOff");
const avatarEl = $("avatar");
const subtitleEl = $("subtitle");
const btnReplayLast = $("btnReplayLast");
const thinkProgressEl = $("thinkProgress");
const thinkDetailEl = $("thinkDetail");
const thinkElapsedEl = $("thinkElapsed");
const thinkStepEls = {
  stt: thinkProgressEl.querySelector('[data-step="stt"]'),
  llm: thinkProgressEl.querySelector('[data-step="llm"]'),
  tts: thinkProgressEl.querySelector('[data-step="tts"]'),
};
const btnStart = $("btnStart");
const btnTalk = $("btnTalk");
const btnEndOnly = $("btnEndOnly");
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
let sessionEnded = false;
let speakersList = [];

const audioQueue = [];
let playing = false;
let currentAudio = null;
let lastTurnBlobs = [];
let thinkStartMs = 0;
let thinkTimerHandle = null;

function startThinkProgress(initialStep, detailText) {
  thinkStartMs = performance.now();
  thinkProgressEl.classList.remove("hidden");
  setThinkStep(initialStep, detailText);
  clearInterval(thinkTimerHandle);
  thinkTimerHandle = setInterval(() => {
    const sec = (performance.now() - thinkStartMs) / 1000;
    thinkElapsedEl.textContent = `${sec.toFixed(1)}s`;
  }, 100);
}

function setThinkStep(step, detailText) {
  const order = ["stt", "llm", "tts"];
  const activeIdx = order.indexOf(step);
  order.forEach((key, idx) => {
    const el = thinkStepEls[key];
    if (!el) return;
    el.classList.toggle("done", activeIdx > idx);
    el.classList.toggle("active", activeIdx === idx);
  });
  if (detailText) thinkDetailEl.textContent = detailText;
}

function finishThinkProgress(finalDetail) {
  clearInterval(thinkTimerHandle);
  thinkTimerHandle = null;
  Object.values(thinkStepEls).forEach((el) => {
    if (!el) return;
    el.classList.remove("active");
    el.classList.add("done");
  });
  if (finalDetail) thinkDetailEl.textContent = finalDetail;
  const sec = thinkStartMs ? (performance.now() - thinkStartMs) / 1000 : 0;
  thinkElapsedEl.textContent = `${sec.toFixed(1)}s`;
}

function base64ToWavBlob(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "audio/wav" });
}

function stopAudioPlayback() {
  audioQueue.length = 0;
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio = null;
  }
  playing = false;
  avatarEl.classList.remove("speaking");
  interviewerAvatar.setState(busy ? "thinking" : "idle");
}

function replayBlobs(blobs) {
  if (!blobs || blobs.length === 0) return;
  stopAudioPlayback();
  for (const blob of blobs) {
    audioQueue.push(blob);
  }
  playNext();
}

function enqueueAudio(base64, turnBlobs) {
  const blob = base64ToWavBlob(base64);
  if (turnBlobs) turnBlobs.push(blob);
  lastTurnBlobs = turnBlobs ? [...turnBlobs] : [blob];
  btnReplayLast.disabled = false;
  audioQueue.push(blob);
  if (!playing) playNext();
}

function playNext() {
  if (audioQueue.length === 0) {
    playing = false;
    currentAudio = null;
    avatarEl.classList.remove("speaking");
    interviewerAvatar.setState(busy ? "thinking" : "idle");
    return;
  }
  playing = true;
  avatarEl.classList.add("speaking");
  interviewerAvatar.setState("speaking");
  const blob = audioQueue.shift();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  interviewerAvatar.attachAudioElement(audio);
  audio.onended = () => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) playNext();
  };
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) playNext();
  };
  audio.play().catch(() => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) playNext();
  });
}

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

function appendLog(role, text, offsetSec, turnBlobs) {
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
  if (role === "assistant" && turnBlobs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msg-replay";
    btn.textContent = "🔊";
    btn.title = "重播這段語音";
    btn.addEventListener("click", () => replayBlobs(turnBlobs));
    div.appendChild(btn);
  }
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
  const turnBlobs = [];
  const offsetSec = sessionStartMs ? Math.round((Date.now() - sessionStartMs) / 100) / 10 : 0;
  const isAudioTurn = !contentType || !contentType.includes("application/json");
  startThinkProgress(isAudioTurn ? "stt" : "llm", isAudioTurn ? "語音辨識中…" : "等待 AI 回應…");

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
          if (data.step === "stt") {
            statusEl.textContent = "辨識語音中…";
            setThinkStep("stt", "faster-whisper 語音辨識中…");
          } else if (data.step === "llm_wait" || data.step === "llm") {
            statusEl.textContent = "面試官思考中…";
            setThinkStep("llm", "等待本地模型開始思考…");
          } else if (data.step === "tts") {
            statusEl.textContent = `正在合成第 ${data.index ?? 1} 句語音…`;
            setThinkStep("tts", `VOICEVOX 合成第 ${data.index ?? 1} 句語音中…`);
          }
          if (!playing) interviewerAvatar.setState("thinking");
        } else if (ev === "progress") {
          if (data.step === "llm_gen") {
            setThinkStep("llm", `AI 生成回應中（已產生 ${data.chars ?? 0} 字）…`);
          }
        } else if (ev === "transcript") {
          if (data.text !== "面接を始めてください。") {
            appendLog("user", data.text, data.offsetSec);
          }
        } else if (ev === "sentence") {
          acc += (acc ? " " : "") + data.text;
          subtitleEl.textContent = data.text;
          if (!assistantSpan) assistantSpan = appendLog("assistant", acc, data.offsetSec, turnBlobs);
          else assistantSpan.textContent = acc;
          logEl.scrollTop = logEl.scrollHeight;
        } else if (ev === "audio") {
          enqueueAudio(data.wavBase64, turnBlobs);
        } else if (ev === "done") {
          const turns = data.turnCount ?? 0;
          const maxTurns = data.recommendedMaxTurns ?? 12;
          turnBadge.textContent = `${turns}/${maxTurns} 輪`;
          checkLimitNotice(turns, maxTurns);
          finishThinkProgress("本輪回應完成");
          statusEl.textContent = "輪到你回答（按住說話，結束後點「結束面試並評分」）";
          if (!playing) interviewerAvatar.setState("idle");
        } else if (ev === "error") {
          finishThinkProgress(`發生錯誤：${data.message}`);
          statusEl.textContent = `錯誤：${data.message}`;
          if (!playing) interviewerAvatar.setState("idle");
        }
      }
    }
  } finally {
    busy = false;
    if (!sessionEnded) {
      btnTalk.disabled = false;
      btnSend.disabled = false;
    }
  }
}

function checkLimitNotice(turns, maxTurns = 12) {
  const elapsedMin = sessionStartMs ? (Date.now() - sessionStartMs) / 60000 : 0;
  if (turns >= maxTurns + 2 || elapsedMin >= 22) {
    limitBanner.textContent =
      `已進行 ${turns} 輪（${Math.floor(elapsedMin)} 分鐘），接近本地模型 8K Context 與錄影記憶體上限；建議立即按「結束面試並評分」以確保報告品質與不產生幻覺。`;
    limitBanner.classList.remove("hidden");
  } else if (turns >= maxTurns - 2 || elapsedMin >= 15) {
    limitBanner.textContent =
      `已達建議練習長度（${turns}/${maxTurns} 輪・${Math.floor(elapsedMin)} 分鐘），可準備收尾並按「結束面試並評分」。建議拆成多場 15 分鐘專題練習，效果最佳。`;
    limitBanner.classList.remove("hidden");
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
    checkLimitNotice(Number((turnBadge.textContent.split("/")[0]) || 0));
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
  limitBanner.classList.add("hidden");
  turnBadge.textContent = "0/12 輪";
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
  sessionEnded = false;
  logEl.innerHTML = "";
  textInput.disabled = false;
  btnEndOnly.disabled = false;
  btnFinish.textContent = "結束面試並評分";
  btnFinish.disabled = false;

  startFullRecording();
  await sendTurn(JSON.stringify({ text: "面接を始めてください。" }), "application/json");
  btnStart.textContent = "重新開始";
  btnStart.disabled = false;
});

async function finalizeInterviewSession() {
  if (sessionEnded) return;
  sessionEnded = true;
  stopAudioPlayback();
  btnEndOnly.disabled = true;
  btnTalk.disabled = true;
  btnSend.disabled = true;
  textInput.disabled = true;
  interviewerAvatar.setState("idle");

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
}

btnEndOnly.addEventListener("click", async () => {
  if (!sessionId || busy || sessionEnded) return;
  btnStart.disabled = true;
  btnFinish.disabled = true;
  try {
    await finalizeInterviewSession();
    btnFinish.textContent = "產生評分報告";
    btnFinish.disabled = false;
    statusEl.textContent = "面試已結束（已儲存錄影，可點擊右側時間跳轉回放，或按「產生評分報告」）。";
  } finally {
    btnStart.disabled = false;
  }
});

btnFinish.addEventListener("click", async () => {
  if (!sessionId || busy) return;
  btnFinish.disabled = true;
  btnEndOnly.disabled = true;
  btnTalk.disabled = true;
  btnSend.disabled = true;
  btnStart.disabled = true;

  await finalizeInterviewSession();

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
    btnFinish.textContent = "結束面試並評分";
    statusEl.textContent = "復盤完成！可點擊右側逐字稿時間跳轉回放。";
  } catch (err) {
    btnFinish.disabled = false;
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
  interviewerAvatar.setState("listening");
  btnTalk.classList.add("recording");
  btnTalk.textContent = "錄音中…放開送出";
  statusEl.textContent = "聆聽中…";
}

function stopTalking() {
  if (turnRecorder && turnRecorder.state === "recording") {
    turnRecorder.stop();
    interviewerAvatar.setState("thinking");
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
btnReplayLast.addEventListener("click", () => {
  replayBlobs(lastTurnBlobs);
});
btnExport.addEventListener("click", () => {
  if (!sessionId) return;
  window.location.href = `/api/session/${sessionId}/export`;
});

loadSpeakers();
checkHealth();
setInterval(checkHealth, 15000);
