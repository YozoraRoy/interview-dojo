/**
 * 虛擬面試官渲染模組：支援方案一（SVG 立繪）、方案二（3D 狀態機 / VRM）與方案三（Rive 狀態機），
 * 並以 localStorage 記憶預設方案與所選人物。
 */

import { createAvatar3DEngine } from "./avatar3d.js";
import { t } from "./i18n.js";

const STORAGE_KEY = "interview_dojo_avatar_prefs_v1";
const BLINK_MIN_MS = 2400;
const BLINK_MAX_MS = 5200;
const BLINK_DURATION_MS = 130;

const STATE_KEY_MAP = {
  idle: "stateIdle",
  listening: "stateListening",
  thinking: "stateThinking",
  speaking: "stateSpeaking",
};

export const SVG_CHARACTERS = [
  { id: "shiba", labelKey: "charSvgShiba" },
  { id: "suit", labelKey: "charSvgSuit" },
];

export const THREE_D_CHARACTERS = [
  { id: "business_man", labelKey: "char3dMan" },
  { id: "shiba_3d", labelKey: "char3dShiba" },
  { id: "custom_vrm", labelKey: "char3dCustom" },
];

export const RIVE_CHARACTERS = [
  { id: "avatar1", labelKey: "charRiveA1", src: "rive/avatar-pack.riv", artboard: "Avatar 1" },
  { id: "avatar2", labelKey: "charRiveA2", src: "rive/avatar-pack.riv", artboard: "Avatar 2" },
  { id: "avatar3", labelKey: "charRiveA3", src: "rive/avatar-pack.riv", artboard: "Avatar 3" },
  { id: "teddy", labelKey: "charRiveTeddy", src: "rive/teddy.riv", artboard: "Teddy" },
  { id: "custom", labelKey: "charRiveCustom" },
];

function loadPrefs() {
  const defaults = {
    mode: "svg",
    svgCharacter: "shiba",
    threeDCharacter: "business_man",
    riveCharacter: "avatar1",
    customRiveName: "",
    customRiveBase64: "",
    customVrmName: "",
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === "rive" || parsed.mode === "3d" ? parsed.mode : "svg",
      svgCharacter: SVG_CHARACTERS.some((c) => c.id === parsed.svgCharacter)
        ? parsed.svgCharacter
        : defaults.svgCharacter,
      threeDCharacter: THREE_D_CHARACTERS.some((c) => c.id === parsed.threeDCharacter)
        ? parsed.threeDCharacter
        : defaults.threeDCharacter,
      riveCharacter: RIVE_CHARACTERS.some((c) => c.id === parsed.riveCharacter)
        ? parsed.riveCharacter
        : defaults.riveCharacter,
      customRiveName: typeof parsed.customRiveName === "string" ? parsed.customRiveName : "",
      customRiveBase64: typeof parsed.customRiveBase64 === "string" ? parsed.customRiveBase64 : "",
      customVrmName: typeof parsed.customVrmName === "string" ? parsed.customVrmName : "",
    };
  } catch {
    return defaults;
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 若自訂 .riv 超過 localStorage 容量限制，改為僅儲存設定不存二進位內容
    try {
      const lite = { ...prefs, customRiveBase64: "" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lite));
    } catch {
      // 忽略
    }
  }
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function buildShibaSvg() {
  return `
    <svg class="avatar-svg" viewBox="0 0 320 220" role="img" aria-label="穿西裝的柴犬面試官">
      <defs>
        <radialGradient id="shibaBg" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#1e293b" />
          <stop offset="100%" stop-color="#0b101b" />
        </radialGradient>
        <linearGradient id="suitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#1e3a5f" />
          <stop offset="100%" stop-color="#0f233d" />
        </linearGradient>
      </defs>
      <rect width="320" height="220" fill="url(#shibaBg)" />
      <rect x="20" y="22" width="64" height="86" rx="4" fill="#131c2e" opacity="0.65" />
      <rect x="236" y="28" width="62" height="72" rx="4" fill="#131c2e" opacity="0.55" />

      <g class="avatar-body-group">
        <path d="M 64 220 C 68 172, 102 156, 160 156 C 218 156, 252 172, 256 220 Z" fill="url(#suitGrad)" />
        <path d="M 130 158 L 160 205 L 142 220 L 114 176 Z" fill="#162d4c" />
        <path d="M 190 158 L 160 205 L 178 220 L 206 176 Z" fill="#162d4c" />
        <polygon points="134,158 186,158 160,204" fill="#f8fafc" />
        <polygon points="154,165 166,165 163,176 157,176" fill="#dc2626" />
        <polygon points="157,176 163,176 167,220 153,220" fill="#b91c1c" />
        <ellipse cx="160" cy="158" rx="22" ry="10" fill="#fef3c7" />

        <g class="avatar-head-group">
          <g class="shiba-ear-left">
            <polygon points="94,78 82,26 128,54" fill="#d97706" stroke="#b45309" stroke-width="2" stroke-linejoin="round" />
            <polygon points="97,71 90,38 119,56" fill="#fde68a" />
          </g>
          <g class="shiba-ear-right">
            <polygon points="226,78 238,26 192,54" fill="#d97706" stroke="#b45309" stroke-width="2" stroke-linejoin="round" />
            <polygon points="223,71 230,38 201,56" fill="#fde68a" />
          </g>
          <ellipse cx="160" cy="105" rx="64" ry="54" fill="#e08b26" />
          <ellipse cx="106" cy="116" rx="18" ry="15" fill="#e08b26" />
          <ellipse cx="214" cy="116" rx="18" ry="15" fill="#e08b26" />
          <path d="M 100 114 C 102 88, 128 92, 160 98 C 192 92, 218 88, 220 114 C 222 142, 194 159, 160 159 C 126 159, 98 142, 100 114 Z" fill="#fef3c7" />
          <ellipse cx="136" cy="79" rx="7" ry="4.5" fill="#fef3c7" transform="rotate(-12 136 79)" />
          <ellipse cx="184" cy="79" rx="7" ry="4.5" fill="#fef3c7" transform="rotate(12 184 79)" />

          <g class="avatar-eyes-open">
            <circle cx="134" cy="98" r="7.5" fill="#1e1b18" />
            <circle cx="136.5" cy="95.5" r="2.4" fill="#ffffff" />
            <circle cx="186" cy="98" r="7.5" fill="#1e1b18" />
            <circle cx="188.5" cy="95.5" r="2.4" fill="#ffffff" />
          </g>
          <g class="avatar-eyes-closed" opacity="0">
            <path d="M 125 99 Q 134 104 143 99" fill="none" stroke="#1e1b18" stroke-width="3" stroke-linecap="round" />
            <path d="M 177 99 Q 186 104 195 99" fill="none" stroke="#1e1b18" stroke-width="3" stroke-linecap="round" />
          </g>

          <ellipse cx="116" cy="113" rx="9" ry="5" fill="#fca5a5" opacity="0.45" />
          <ellipse cx="204" cy="113" rx="9" ry="5" fill="#fca5a5" opacity="0.45" />
          <ellipse cx="160" cy="112" rx="8" ry="5.5" fill="#1f2937" />
          <ellipse cx="158" cy="110.5" rx="2.5" ry="1.2" fill="#6b7280" />

          <path class="avatar-mouth-closed" d="M 148 124 Q 154 130 160 123 Q 166 130 172 124" fill="none" stroke="#374151" stroke-width="2.6" stroke-linecap="round" />
          <g class="avatar-mouth-open-group" opacity="0">
            <ellipse class="avatar-mouth-cavity" cx="160" cy="128" rx="10" ry="6" fill="#7f1d1d" />
            <ellipse class="avatar-mouth-tongue" cx="160" cy="131" rx="6" ry="3.2" fill="#fb7185" />
          </g>
        </g>
      </g>

      <g class="avatar-thought" opacity="0">
        <circle cx="242" cy="54" r="4" fill="#cbd5e1" />
        <circle cx="254" cy="43" r="6" fill="#cbd5e1" />
        <rect x="258" y="18" width="44" height="24" rx="12" fill="#e2e8f0" />
        <circle cx="271" cy="30" r="2.3" fill="#334155" />
        <circle cx="280" cy="30" r="2.3" fill="#334155" />
        <circle cx="289" cy="30" r="2.3" fill="#334155" />
      </g>
    </svg>
  `;
}

function buildSuitPersonSvg() {
  return `
    <svg class="avatar-svg" viewBox="0 0 320 220" role="img" aria-label="穿西裝的 Q 版面試官">
      <defs>
        <radialGradient id="suitBg" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#1f2937" />
          <stop offset="100%" stop-color="#0b0f17" />
        </radialGradient>
        <linearGradient id="darkSuit" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#334155" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
      </defs>
      <rect width="320" height="220" fill="url(#suitBg)" />
      <rect x="24" y="24" width="60" height="84" rx="4" fill="#111827" opacity="0.65" />
      <rect x="236" y="28" width="58" height="72" rx="4" fill="#111827" opacity="0.55" />

      <g class="avatar-body-group">
        <!-- 西裝身體 -->
        <path d="M 68 220 C 72 174, 106 156, 160 156 C 214 156, 248 174, 252 220 Z" fill="url(#darkSuit)" />
        <polygon points="134,158 186,158 160,206" fill="#f8fafc" />
        <polygon points="154,165 166,165 163,177 157,177" fill="#2563eb" />
        <polygon points="157,177 163,177 167,220 153,220" fill="#1d4ed8" />
        <path d="M 130 158 L 160 206 L 143 220 L 116 177 Z" fill="#1e293b" />
        <path d="M 190 158 L 160 206 L 177 220 L 204 177 Z" fill="#1e293b" />
        <!-- 脖子 -->
        <rect x="147" y="142" width="26" height="20" rx="8" fill="#fed7aa" />

        <g class="avatar-head-group">
          <!-- 後腦頭髮 -->
          <ellipse cx="160" cy="88" rx="58" ry="54" fill="#1f2937" />
          <!-- 耳朵 -->
          <circle cx="104" cy="105" r="10" fill="#fdba74" />
          <circle cx="216" cy="105" r="10" fill="#fdba74" />
          <!-- 臉 -->
          <ellipse cx="160" cy="102" rx="52" ry="49" fill="#fed7aa" />
          <!-- 瀏海 -->
          <path d="M 106 94 C 108 54, 134 40, 162 40 C 192 40, 214 58, 214 94 C 204 72, 186 64, 170 72 C 156 60, 136 62, 124 76 C 116 74, 110 82, 106 94 Z" fill="#1f2937" />
          <!-- 眉毛 -->
          <path d="M 124 85 Q 134 81 144 85" fill="none" stroke="#1f2937" stroke-width="2.5" stroke-linecap="round" />
          <path d="M 176 85 Q 186 81 196 85" fill="none" stroke="#1f2937" stroke-width="2.5" stroke-linecap="round" />
          <!-- 眼鏡框 -->
          <rect x="119" y="89" width="32" height="21" rx="6" fill="none" stroke="#475569" stroke-width="2.2" />
          <rect x="169" y="89" width="32" height="21" rx="6" fill="none" stroke="#475569" stroke-width="2.2" />
          <line x1="151" y1="99" x2="169" y2="99" stroke="#475569" stroke-width="2.2" />

          <!-- 眼睛（開眼） -->
          <g class="avatar-eyes-open">
            <circle cx="135" cy="99" r="5.5" fill="#111827" />
            <circle cx="137" cy="97" r="1.8" fill="#ffffff" />
            <circle cx="185" cy="99" r="5.5" fill="#111827" />
            <circle cx="187" cy="97" r="1.8" fill="#ffffff" />
          </g>
          <!-- 眼睛（眨眼） -->
          <g class="avatar-eyes-closed" opacity="0">
            <path d="M 127 100 Q 135 104 143 100" fill="none" stroke="#111827" stroke-width="2.6" stroke-linecap="round" />
            <path d="M 177 100 Q 185 104 193 100" fill="none" stroke="#111827" stroke-width="2.6" stroke-linecap="round" />
          </g>

          <ellipse cx="122" cy="116" rx="7" ry="3.8" fill="#fda4af" opacity="0.4" />
          <ellipse cx="198" cy="116" rx="7" ry="3.8" fill="#fda4af" opacity="0.4" />
          <path d="M 159 106 L 157 115 L 162 116" fill="none" stroke="#d97706" stroke-width="1.8" stroke-linecap="round" opacity="0.45" />

          <!-- 嘴巴 -->
          <path class="avatar-mouth-closed" d="M 149 127 Q 160 132 171 127" fill="none" stroke="#7c2d12" stroke-width="2.5" stroke-linecap="round" />
          <g class="avatar-mouth-open-group" opacity="0">
            <ellipse class="avatar-mouth-cavity" cx="160" cy="129" rx="9" ry="5" fill="#7f1d1d" />
            <ellipse class="avatar-mouth-tongue" cx="160" cy="132" rx="5.5" ry="2.8" fill="#fb7185" />
          </g>
        </g>
      </g>

      <g class="avatar-thought" opacity="0">
        <circle cx="242" cy="54" r="4" fill="#cbd5e1" />
        <circle cx="254" cy="43" r="6" fill="#cbd5e1" />
        <rect x="258" y="18" width="44" height="24" rx="12" fill="#e2e8f0" />
        <circle cx="271" cy="30" r="2.3" fill="#334155" />
        <circle cx="280" cy="30" r="2.3" fill="#334155" />
        <circle cx="289" cy="30" r="2.3" fill="#334155" />
      </g>
    </svg>
  `;
}

/**
 * 在指定容器建立虛擬面試官渲染器（支援 SVG 與 Rive 切換與設定記憶）。
 * @param {HTMLElement} container
 */
export function createInterviewerAvatar(container) {
  let prefs = loadPrefs();
  let currentState = "idle";
  let mouthLevel = 0;
  let targetMouth = 0;
  let blinkTimer = null;
  let rafId = null;
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let activeAudio = null;
  let riveInstance = null;
  let riveInputs = [];
  let engine3d = null;
  let customVrmBuffer = null;
  let lastTickMs = performance.now();

  container.innerHTML = `
    <div class="avatar-frame" data-state="idle">
      <div class="avatar-badge">
        <span class="avatar-dot"></span>
        <span class="avatar-name">面接官</span>
        <span class="avatar-state-text">待命中</span>
      </div>
      <div class="avatar-svg-host"></div>
      <div class="avatar-3d-host hidden">
        <div class="avatar-3d-hint hidden"></div>
      </div>
      <div class="avatar-rive-host hidden">
        <canvas class="avatar-rive-canvas"></canvas>
        <div class="avatar-rive-hint hidden"></div>
      </div>
    </div>
  `;

  const frameEl = container.querySelector(".avatar-frame");
  const nameEl = container.querySelector(".avatar-name");
  const stateTextEl = container.querySelector(".avatar-state-text");
  const svgHostEl = container.querySelector(".avatar-svg-host");
  const threeHostEl = container.querySelector(".avatar-3d-host");
  const threeHintEl = container.querySelector(".avatar-3d-hint");
  const riveHostEl = container.querySelector(".avatar-rive-host");
  const riveCanvasEl = container.querySelector(".avatar-rive-canvas");
  const riveHintEl = container.querySelector(".avatar-rive-hint");

  let svgRefs = null;

  function renderSvgCharacter() {
    const isSuit = prefs.svgCharacter === "suit";
    svgHostEl.innerHTML = isSuit ? buildSuitPersonSvg() : buildShibaSvg();
    nameEl.textContent = t(isSuit ? "badgeSvgSuit" : "badgeSvgShiba");
    svgRefs = {
      eyesOpen: svgHostEl.querySelector(".avatar-eyes-open"),
      eyesClosed: svgHostEl.querySelector(".avatar-eyes-closed"),
      mouthClosed: svgHostEl.querySelector(".avatar-mouth-closed"),
      mouthOpenGroup: svgHostEl.querySelector(".avatar-mouth-open-group"),
      mouthCavity: svgHostEl.querySelector(".avatar-mouth-cavity"),
      mouthTongue: svgHostEl.querySelector(".avatar-mouth-tongue"),
      thought: svgHostEl.querySelector(".avatar-thought"),
    };
    svgRefs.thought?.setAttribute("opacity", currentState === "thinking" ? "1" : "0");
  }

  function renderSvgMouth(level) {
    if (!svgRefs) return;
    const clamped = Math.max(0, Math.min(1, level));
    if (clamped < 0.06) {
      svgRefs.mouthClosed?.setAttribute("opacity", "1");
      svgRefs.mouthOpenGroup?.setAttribute("opacity", "0");
      return;
    }
    svgRefs.mouthClosed?.setAttribute("opacity", "0");
    svgRefs.mouthOpenGroup?.setAttribute("opacity", "1");
    const rx = 8 + clamped * 5.5;
    const ry = 3 + clamped * 9.5;
    const cy = 126 + clamped * 3.5;
    svgRefs.mouthCavity?.setAttribute("rx", rx.toFixed(2));
    svgRefs.mouthCavity?.setAttribute("ry", ry.toFixed(2));
    svgRefs.mouthCavity?.setAttribute("cy", cy.toFixed(2));
    svgRefs.mouthTongue?.setAttribute("rx", (rx * 0.62).toFixed(2));
    svgRefs.mouthTongue?.setAttribute("ry", Math.max(1.5, ry * 0.48).toFixed(2));
    svgRefs.mouthTongue?.setAttribute("cy", (cy + ry * 0.35).toFixed(2));
  }

  function cleanupRive() {
    if (riveInstance) {
      try {
        riveInstance.cleanup();
      } catch {
        // 忽略
      }
      riveInstance = null;
    }
    riveInputs = [];
  }

  let prevRiveState = "idle";

  function syncRiveInputs() {
    if (!riveInputs.length) return;
    const stateNum = { idle: 0, listening: 1, thinking: 2, speaking: 3 }[currentState] ?? 0;
    const stateChanged = prevRiveState !== currentState;
    prevRiveState = currentState;

    for (const input of riveInputs) {
      const n = input.name.toLowerCase();
      // 通用自訂角色命名
      if (n === "isspeaking" || n === "speaking" || n === "talk") {
        input.value = currentState === "speaking";
      } else if (n === "islistening" || n === "listening") {
        input.value = currentState === "listening";
      } else if (n === "isthinking" || n === "thinking") {
        input.value = currentState === "thinking";
      } else if (n === "state") {
        input.value = stateNum;
      } else if (n === "mouthopen" || n === "mouth" || n === "volume" || n === "level") {
        input.value = Math.round(mouthLevel * 100);
      }
      // Avatar Pack（isHappy / isSad）：依語音振幅與狀態自然開合微笑與表情切換
      else if (n === "ishappy") {
        input.value =
          currentState === "speaking"
            ? mouthLevel > 0.1
            : currentState === "listening";
      } else if (n === "issad") {
        input.value = currentState === "thinking";
      }
      // Teddy 泰迪熊（isChecking / numLook / isHandsUp / trigSuccess）
      else if (n === "ischecking") {
        input.value = currentState !== "idle";
      } else if (n === "ishandsup") {
        input.value = false;
      } else if (n === "numlook") {
        if (currentState === "speaking") {
          input.value = Math.round(35 + mouthLevel * 45);
        } else if (currentState === "listening") {
          input.value = Math.round(50 + Math.sin(Date.now() / 600) * 22);
        } else if (currentState === "thinking") {
          input.value = 18;
        } else {
          input.value = 50;
        }
      } else if (n === "trigsuccess" && stateChanged && currentState === "speaking") {
        if (typeof input.fire === "function") input.fire();
      }
    }
  }

  function initRiveFromSource({ src, buffer, artboard, label }) {
    cleanupRive();
    riveHintEl.classList.add("hidden");
    nameEl.textContent = `Rive・${label}`;

    if (!window.rive?.Rive) {
      riveHintEl.textContent = t("hintRiveNoRuntime");
      riveHintEl.classList.remove("hidden");
      return;
    }

    const rect = riveHostEl.getBoundingClientRect();
    riveCanvasEl.width = Math.max(320, Math.round((rect.width || 480) * (window.devicePixelRatio || 1)));
    riveCanvasEl.height = Math.max(180, Math.round((rect.height || 270) * (window.devicePixelRatio || 1)));

    const opts = {
      canvas: riveCanvasEl,
      autoplay: true,
      onLoad: () => {
        try {
          riveInstance.resizeDrawingSurfaceToCanvas();
          const names = riveInstance.stateMachineNames || [];
          if (names.length > 0) {
            const smName = names[0];
            riveInstance.play(smName);
            riveInputs = riveInstance.stateMachineInputs(smName) || [];
            riveHintEl.classList.add("hidden");
            syncRiveInputs();
          }
        } catch {
          // 忽略
        }
      },
      onLoadError: () => {
        riveHintEl.textContent = t("hintRiveError");
        riveHintEl.classList.remove("hidden");
      },
    };
    if (artboard) opts.artboard = artboard;
    if (buffer) opts.buffer = buffer;
    else opts.src = src;

    riveInstance = new window.rive.Rive(opts);
  }

  function applyRenderMode() {
    svgHostEl.classList.add("hidden");
    threeHostEl.classList.add("hidden");
    riveHostEl.classList.add("hidden");

    if (prefs.mode === "rive") {
      riveHostEl.classList.remove("hidden");
      if (prefs.riveCharacter === "custom") {
        if (prefs.customRiveBase64) {
          initRiveFromSource({
            buffer: base64ToArrayBuffer(prefs.customRiveBase64),
            label: prefs.customRiveName || t("charRiveCustom"),
          });
        } else {
          cleanupRive();
          nameEl.textContent = t("badgeRivePick");
          riveHintEl.textContent = t("hintRivePick");
          riveHintEl.classList.remove("hidden");
        }
      } else {
        const ch = RIVE_CHARACTERS.find((c) => c.id === prefs.riveCharacter) ?? RIVE_CHARACTERS[0];
        initRiveFromSource({
          src: ch.src,
          artboard: ch.artboard,
          label: t(ch.labelKey).replace(/^Rive\s*/, ""),
        });
      }
    } else if (prefs.mode === "3d") {
      cleanupRive();
      threeHostEl.classList.remove("hidden");
      threeHintEl.classList.add("hidden");
      if (!engine3d) {
        engine3d = createAvatar3DEngine(threeHostEl);
      }
      engine3d.setState(currentState);
      if (prefs.threeDCharacter === "custom_vrm") {
        if (customVrmBuffer) {
          nameEl.textContent = t("badge3dVrm", { name: prefs.customVrmName || "VRM" });
          engine3d.loadVrmBuffer(customVrmBuffer).catch(() => {
            threeHintEl.textContent = t("hintVrmError");
            threeHintEl.classList.remove("hidden");
          });
        } else {
          nameEl.textContent = t("badge3dPick");
          threeHintEl.textContent = t("hintVrmPick");
          threeHintEl.classList.remove("hidden");
          engine3d.loadBuiltIn("business_man");
        }
      } else {
        const ch = THREE_D_CHARACTERS.find((c) => c.id === prefs.threeDCharacter) ?? THREE_D_CHARACTERS[0];
        nameEl.textContent = t(ch.id === "shiba_3d" ? "badge3dShiba" : "badge3dMan");
        engine3d.loadBuiltIn(ch.id);
      }
    } else {
      cleanupRive();
      svgHostEl.classList.remove("hidden");
      renderSvgCharacter();
    }
  }

  function scheduleBlink() {
    const delay = BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
    blinkTimer = setTimeout(() => {
      if (prefs.mode === "svg" && svgRefs) {
        svgRefs.eyesOpen?.setAttribute("opacity", "0");
        svgRefs.eyesClosed?.setAttribute("opacity", "1");
        setTimeout(() => {
          svgRefs?.eyesOpen?.setAttribute("opacity", "1");
          svgRefs?.eyesClosed?.setAttribute("opacity", "0");
          scheduleBlink();
        }, BLINK_DURATION_MS);
      } else {
        scheduleBlink();
      }
    }, delay);
  }

  function tick(now) {
    const dt = (now - lastTickMs) / 1000;
    lastTickMs = now;

    if (activeAudio && analyser && freqData && !activeAudio.paused && !activeAudio.ended) {
      analyser.getByteTimeDomainData(freqData);
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) {
        const v = (freqData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / freqData.length);
      targetMouth = Math.min(1, Math.max(0, (rms - 0.015) * 6.5));
    } else if (currentState !== "speaking") {
      targetMouth = 0;
    }

    mouthLevel += (targetMouth - mouthLevel) * 0.42;
    if (prefs.mode === "svg") {
      renderSvgMouth(mouthLevel);
    } else if (prefs.mode === "3d") {
      engine3d?.update(dt, mouthLevel);
    } else {
      syncRiveInputs();
    }
    rafId = requestAnimationFrame(tick);
  }

  function setState(nextState) {
    currentState = STATE_KEY_MAP[nextState] ? nextState : "idle";
    frameEl.setAttribute("data-state", currentState);
    stateTextEl.textContent = t(STATE_KEY_MAP[currentState]);
    if (svgRefs?.thought) {
      svgRefs.thought.setAttribute("opacity", currentState === "thinking" ? "1" : "0");
    }
    if (currentState !== "speaking") {
      targetMouth = 0;
    }
    if (prefs.mode === "3d") {
      engine3d?.setState(currentState);
    } else if (prefs.mode === "rive") {
      syncRiveInputs();
    }
  }

  function setMouthOpen(level) {
    targetMouth = Math.max(0, Math.min(1, Number(level) || 0));
  }

  function attachAudioElement(audio) {
    activeAudio = audio;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.connect(audioCtx.destination);
        freqData = new Uint8Array(analyser.frequencyBinCount);
      }
      const source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
    } catch {
      if (currentState === "speaking") targetMouth = 0.45;
    }
  }

  function setMode(mode) {
    const next = mode === "rive" || mode === "3d" ? mode : "svg";
    if (prefs.mode === next) return;
    prefs.mode = next;
    savePrefs(prefs);
    applyRenderMode();
  }

  function setCharacter(characterId) {
    if (prefs.mode === "rive") {
      if (RIVE_CHARACTERS.some((c) => c.id === characterId)) {
        prefs.riveCharacter = characterId;
        savePrefs(prefs);
        applyRenderMode();
      }
    } else if (prefs.mode === "3d") {
      if (THREE_D_CHARACTERS.some((c) => c.id === characterId)) {
        prefs.threeDCharacter = characterId;
        savePrefs(prefs);
        applyRenderMode();
      }
    } else if (SVG_CHARACTERS.some((c) => c.id === characterId)) {
      prefs.svgCharacter = characterId;
      savePrefs(prefs);
      applyRenderMode();
    }
  }

  function loadCustomRiveBuffer(arrayBuffer, fileName) {
    prefs.mode = "rive";
    prefs.riveCharacter = "custom";
    prefs.customRiveName = fileName;
    prefs.customRiveBase64 = arrayBufferToBase64(arrayBuffer);
    savePrefs(prefs);
    applyRenderMode();
  }

  function loadCustomVrmBuffer(arrayBuffer, fileName) {
    customVrmBuffer = arrayBuffer;
    prefs.mode = "3d";
    prefs.threeDCharacter = "custom_vrm";
    prefs.customVrmName = fileName;
    savePrefs(prefs);
    applyRenderMode();
  }

  function getPreferences() {
    return { ...prefs };
  }

  function destroy() {
    if (blinkTimer) clearTimeout(blinkTimer);
    if (rafId) cancelAnimationFrame(rafId);
    cleanupRive();
    engine3d?.destroy();
    if (audioCtx) audioCtx.close().catch(() => {});
  }

  window.addEventListener("resize", () => engine3d?.resize());

  applyRenderMode();
  scheduleBlink();
  rafId = requestAnimationFrame(tick);

  function refreshLocale() {
    stateTextEl.textContent = t(STATE_KEY_MAP[currentState] || "stateIdle");
    if (prefs.mode === "svg") {
      nameEl.textContent = t(prefs.svgCharacter === "suit" ? "badgeSvgSuit" : "badgeSvgShiba");
    } else if (prefs.mode === "3d") {
      if (prefs.threeDCharacter === "custom_vrm") {
        nameEl.textContent = customVrmBuffer
          ? t("badge3dVrm", { name: prefs.customVrmName || "VRM" })
          : t("badge3dPick");
        if (!customVrmBuffer) threeHintEl.textContent = t("hintVrmPick");
      } else {
        nameEl.textContent = t(prefs.threeDCharacter === "shiba_3d" ? "badge3dShiba" : "badge3dMan");
      }
    } else if (prefs.mode === "rive") {
      if (prefs.riveCharacter === "custom") {
        nameEl.textContent = prefs.customRiveBase64
          ? `Rive・${prefs.customRiveName || ""}`
          : t("badgeRivePick");
        if (!prefs.customRiveBase64) riveHintEl.textContent = t("hintRivePick");
      } else {
        const ch = RIVE_CHARACTERS.find((c) => c.id === prefs.riveCharacter) ?? RIVE_CHARACTERS[0];
        nameEl.textContent = `Rive・${t(ch.labelKey).replace(/^Rive\s*/, "")}`;
      }
    }
  }

  return {
    setState,
    setMouthOpen,
    attachAudioElement,
    setMode,
    setCharacter,
    loadCustomRiveBuffer,
    loadCustomVrmBuffer,
    getPreferences,
    refreshLocale,
    destroy,
  };
}
