import {
  createInterviewerAvatar,
  RIVE_CHARACTERS,
  SVG_CHARACTERS,
  THREE_D_CHARACTERS,
} from "./avatar.js";
import { applyI18nToDom, getLang, setLang, t } from "./i18n.js";

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
const langSelect = $("langSelect");

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
      opt.textContent = t("charCustomPrefix", { name: prefs.customRiveName });
    } else if (item.id === "custom_vrm" && prefs.customVrmName) {
      opt.textContent = t("charCustomPrefix", { name: prefs.customVrmName });
    } else {
      opt.textContent = t(item.labelKey);
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
const resumeInput = $("resumeInput");
const resumeCharCount = $("resumeCharCount");
const btnImportResume = $("btnImportResume");
const resumeFileInput = $("resumeFileInput");
const btnSummarizeResume = $("btnSummarizeResume");
const personaNameEl = $("personaName");
const personaRoleEl = $("personaRole");
const personaYearsEl = $("personaYears");
const personaHighlightsEl = $("personaHighlights");
const personaPromptCount = $("personaPromptCount");
const btnSavePersona = $("btnSavePersona");
const personaMsgEl = $("personaMsg");

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
let lastTurnCount = 0;
let lastMaxTurns = 12;
let lastHealthData = null;
let lastMetrics = null;
let statusState = { key: "statusIdle", vars: {} };
let thinkState = { key: "thinkReady", vars: {} };

function setStatus(key, vars = {}) {
  statusState = { key, vars };
  statusEl.textContent = t(key, vars);
}

function setThinkDetail(key, vars = {}) {
  thinkState = { key, vars };
  thinkDetailEl.textContent = t(key, vars);
}

function renderTurnBadge() {
  turnBadge.textContent = t("turnBadge", { turns: lastTurnCount, max: lastMaxTurns });
}

function renderHealth() {
  if (!lastHealthData) return;
  if (lastHealthData.error) {
    healthEl.textContent = t("healthOffline");
    healthEl.className = "health err";
    return;
  }
  const h = lastHealthData;
  const parts = [
    `Ollama:${h.services.ollama ? t("healthOnline") : t("healthDown")}`,
    `STT:${h.services.stt ? t("healthOnline") : t("healthDown")}`,
    `VOICEVOX:${h.services.voicevox ? t("healthOnline") : t("healthDown")}`,
  ];
  healthEl.textContent = `${parts.join(" ｜ ")} (${h.model})`;
  healthEl.className = `health ${h.ok ? "ok" : "err"}`;
}

function renderMetricsBar() {
  if (!lastMetrics) return;
  const m = lastMetrics;
  metricsBar.innerHTML = [
    t("metricTurns", { n: m.userTurns }),
    t("metricChars", { total: m.totalChars, avg: m.avgCharsPerTurn }),
    t("metricFillers", { n: m.fillerTotal }),
  ]
    .map((txt) => `<span class="metric-chip">${txt}</span>`)
    .join("");
}

function applyAllLocale() {
  applyI18nToDom();
  syncAvatarToolbar();
  interviewerAvatar.refreshLocale();
  updateCredit();
  renderHealth();
  renderTurnBadge();
  renderMetricsBar();
  setStatus(statusState.key, statusState.vars);
  if (!thinkProgressEl.classList.contains("hidden")) {
    setThinkDetail(thinkState.key, thinkState.vars);
  }
  if (sessionId) {
    btnStart.textContent = t("btnRestart");
  }
  if (sessionEnded) {
    btnFinish.textContent = t("btnGenerateReview");
  }
  if (turnRecorder?.state === "recording") {
    btnTalk.textContent = t("btnTalkRecording");
  }
}

langSelect.value = getLang();
langSelect.addEventListener("change", () => {
  setLang(langSelect.value);
  applyAllLocale();
});

const audioQueue = [];
let playing = false;
let currentAudio = null;
let lastTurnBlobs = [];
let thinkStartMs = 0;
let thinkTimerHandle = null;

function startThinkProgress(initialStep, detailKey, detailVars = {}) {
  thinkStartMs = performance.now();
  thinkProgressEl.classList.remove("hidden");
  setThinkStep(initialStep, detailKey, detailVars);
  clearInterval(thinkTimerHandle);
  thinkTimerHandle = setInterval(() => {
    const sec = (performance.now() - thinkStartMs) / 1000;
    thinkElapsedEl.textContent = `${sec.toFixed(1)}s`;
  }, 100);
}

function setThinkStep(step, detailKey, detailVars = {}) {
  const order = ["stt", "llm", "tts"];
  const activeIdx = order.indexOf(step);
  order.forEach((key, idx) => {
    const el = thinkStepEls[key];
    if (!el) return;
    el.classList.toggle("done", activeIdx > idx);
    el.classList.toggle("active", activeIdx === idx);
  });
  if (detailKey) setThinkDetail(detailKey, detailVars);
}

function finishThinkProgress(detailKey, detailVars = {}) {
  clearInterval(thinkTimerHandle);
  thinkTimerHandle = null;
  Object.values(thinkStepEls).forEach((el) => {
    if (!el) return;
    el.classList.remove("active");
    el.classList.add("done");
  });
  if (detailKey) setThinkDetail(detailKey, detailVars);
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
  footerCredit.textContent = t("footerCredit", { credit });
}

function appendLog(role, text, offsetSec, turnBlobs) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  if (typeof offsetSec === "number") {
    const ts = document.createElement("span");
    ts.className = "msg-ts";
    ts.textContent = `[${formatSec(offsetSec)}]`;
    ts.title = t("tsTitle");
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
    btn.title = t("btnMsgReplayTitle");
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
    lastHealthData = await res.json();
    renderHealth();
  } catch {
    lastHealthData = { error: true };
    renderHealth();
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
  startThinkProgress(isAudioTurn ? "stt" : "llm", isAudioTurn ? "thinkStt" : "thinkLlmWait");

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
            setStatus("statusStt");
            setThinkStep("stt", "thinkStt");
          } else if (data.step === "llm_wait" || data.step === "llm") {
            setStatus("statusLlm");
            setThinkStep("llm", "thinkLlmWait");
          } else if (data.step === "tts") {
            setStatus("statusTts", { index: data.index ?? 1 });
            setThinkStep("tts", "thinkTts", { index: data.index ?? 1 });
          }
          if (!playing) interviewerAvatar.setState("thinking");
        } else if (ev === "progress") {
          if (data.step === "llm_gen") {
            setThinkStep("llm", "thinkLlmGen", { chars: data.chars ?? 0 });
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
          lastTurnCount = data.turnCount ?? 0;
          lastMaxTurns = data.recommendedMaxTurns ?? 12;
          renderTurnBadge();
          checkLimitNotice(lastTurnCount, lastMaxTurns);
          finishThinkProgress("thinkDone");
          setStatus("statusYourTurn");
          if (!playing) interviewerAvatar.setState("idle");
        } else if (ev === "error") {
          finishThinkProgress("thinkError", { message: data.message });
          setStatus("statusError", { message: data.message });
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
    limitBanner.textContent = t("limitHard", {
      turns,
      min: Math.floor(elapsedMin),
    });
    limitBanner.classList.remove("hidden");
  } else if (turns >= maxTurns - 2 || elapsedMin >= 15) {
    limitBanner.textContent = t("limitWarn", {
      turns,
      max: maxTurns,
      min: Math.floor(elapsedMin),
    });
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
  lastTurnCount = 0;
  lastMaxTurns = 12;
  renderTurnBadge();
  replayEl.classList.add("hidden");
  camEl.classList.remove("hidden");
  setStatus("statusCamInit");

  try {
    if (!mediaStream) {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
    camEl.srcObject = mediaStream;
    camOffEl.style.display = "none";
  } catch {
    camOffEl.textContent = t("camDenied");
  }

  setStatus("statusSessionStart");
  const res = await fetch("/api/session/start", { method: "POST" });
  const data = await res.json();
  sessionId = data.sessionId;
  sessionStartMs = Date.now();
  sessionEnded = false;
  logEl.innerHTML = "";
  textInput.disabled = false;
  btnEndOnly.disabled = false;
  btnFinish.textContent = t("btnFinish");
  btnFinish.disabled = false;

  startFullRecording();
  await sendTurn(JSON.stringify({ text: "面接を始めてください。" }), "application/json");
  btnStart.textContent = t("btnRestart");
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

  setStatus("statusSavingVideo");
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
    btnFinish.textContent = t("btnGenerateReview");
    btnFinish.disabled = false;
    setStatus("statusEndedOnly");
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

  setStatus("statusReviewing");
  try {
    const res = await fetch(`/api/session/${sessionId}/review`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Review failed");

    lastMetrics = data.metrics;
    renderMetricsBar();
    reviewBody.textContent = data.report;
    reviewPanel.classList.remove("hidden");
    btnFinish.textContent = t("btnFinish");
    setStatus("statusReviewDone");
  } catch (err) {
    btnFinish.disabled = false;
    setStatus("statusReviewFail", { message: err.message });
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
  btnTalk.textContent = t("btnTalkRecording");
  setStatus("statusListening");
}

function stopTalking() {
  if (turnRecorder && turnRecorder.state === "recording") {
    turnRecorder.stop();
    interviewerAvatar.setState("thinking");
    btnTalk.classList.remove("recording");
    btnTalk.textContent = t("btnTalkIdle");
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
  window.location.href = `/api/session/${sessionId}/export?lang=${encodeURIComponent(getLang())}`;
});

const MAX_RESUME_CHARS = 6000;
const MAX_PROMPT_CHARS = 800;
const MAX_FILE_BYTES = 50 * 1024;
let lastImportedFileName = "";
let lastImportedFileSize = 0;

function updateResumeCounts() {
  const len = resumeInput.value.length;
  resumeCharCount.textContent = `${len} / ${MAX_RESUME_CHARS}`;
  resumeCharCount.classList.toggle("over", len >= MAX_RESUME_CHARS);

  const preview = [
    personaNameEl.value.trim(),
    personaRoleEl.value.trim(),
    personaYearsEl.value.trim(),
    ...personaHighlightsEl.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 5),
  ].join("\n");
  const pLen = preview.length;
  personaPromptCount.textContent = `${pLen} / ${MAX_PROMPT_CHARS}`;
  personaPromptCount.classList.toggle("over", pLen > MAX_PROMPT_CHARS);
}

function setPersonaMsg(text, isErr = false) {
  personaMsgEl.textContent = text;
  personaMsgEl.classList.toggle("err", isErr);
}

function fillPersonaForm(p = {}) {
  personaNameEl.value = p.name ?? "";
  personaRoleEl.value = p.target_role ?? "";
  personaYearsEl.value = p.years !== undefined ? String(p.years) : "";
  personaHighlightsEl.value = Array.isArray(p.highlights) ? p.highlights.join("\n") : "";
  updateResumeCounts();
}

async function loadPersonaForm() {
  try {
    const res = await fetch("/api/persona");
    if (!res.ok) return;
    const data = await res.json();
    fillPersonaForm(data.persona);
  } catch {
    // 忽略
  }
}

resumeInput.addEventListener("input", () => {
  lastImportedFileName = "";
  lastImportedFileSize = 0;
  updateResumeCounts();
});
[personaNameEl, personaRoleEl, personaYearsEl, personaHighlightsEl].forEach((el) => {
  el.addEventListener("input", updateResumeCounts);
});

btnImportResume.addEventListener("click", () => resumeFileInput.click());
resumeFileInput.addEventListener("change", async () => {
  const file = resumeFileInput.files?.[0];
  resumeFileInput.value = "";
  if (!file) return;

  if (!/\.(txt|md)$/i.test(file.name)) {
    setPersonaMsg(t("personaErrExt"), true);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setPersonaMsg(t("personaErrSize"), true);
    return;
  }
  const text = await file.text();
  lastImportedFileName = file.name;
  lastImportedFileSize = file.size;
  if (text.length > MAX_RESUME_CHARS) {
    resumeInput.value = text.slice(0, MAX_RESUME_CHARS);
    setPersonaMsg(t("personaTruncated"), true);
  } else {
    resumeInput.value = text;
    setPersonaMsg("");
  }
  updateResumeCounts();
});

btnSummarizeResume.addEventListener("click", async () => {
  const text = resumeInput.value.trim();
  if (!text) {
    setPersonaMsg(t("personaErrEmpty"), true);
    return;
  }
  btnSummarizeResume.disabled = true;
  setPersonaMsg(t("personaSummarizing"));
  try {
    const res = await fetch("/api/persona/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, MAX_RESUME_CHARS),
        fileName: lastImportedFileName || undefined,
        fileSize: lastImportedFileSize || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Summarize failed");
    fillPersonaForm(data.persona);
    setPersonaMsg(t("personaSummarized"));
  } catch (err) {
    setPersonaMsg(t("personaErrGeneric", { message: err.message }), true);
  } finally {
    btnSummarizeResume.disabled = false;
  }
});

btnSavePersona.addEventListener("click", async () => {
  const highlights = personaHighlightsEl.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  const yearsVal = personaYearsEl.value.trim();
  const payload = {
    name: personaNameEl.value.trim(),
    target_role: personaRoleEl.value.trim(),
    years: yearsVal ? Number(yearsVal) : undefined,
    highlights,
  };
  btnSavePersona.disabled = true;
  try {
    const res = await fetch("/api/persona", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    fillPersonaForm(data.persona);
    setPersonaMsg(t("personaSaved"));
  } catch (err) {
    setPersonaMsg(t("personaErrGeneric", { message: err.message }), true);
  } finally {
    btnSavePersona.disabled = false;
  }
});

applyAllLocale();
loadPersonaForm();
loadSpeakers();
checkHealth();
setInterval(checkHealth, 15000);
