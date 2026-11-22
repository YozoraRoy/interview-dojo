/**
 * 方案二：3D 虛擬面試官引擎（Three.js + 有限狀態機 FSM + @pixiv/three-vrm 支援）。
 * 內建兩個程序化 3D 角色：
 *  - business_man：穿商務襯衫的男性面試官
 *  - shiba_3d：穿西裝的柴犬部長
 * 並支援載入自訂本地 .vrm 3D 角色檔，全部共用同一套狀態機與口型驅動。
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

/** 有限狀態機定義：每個狀態對應一組目標姿態與微動作行為。 */
const FSM_PRESETS = {
  idle: {
    headX: 0.0,
    headY: 0.0,
    headZ: 0.0,
    bodyLeanX: 0.0,
    eyeX: 0.0,
    eyeY: 0.0,
    browTilt: 0.0,
    earAlert: 0.0,
  },
  listening: {
    headX: 0.05,
    headY: 0.0,
    headZ: 0.03,
    bodyLeanX: 0.06,
    eyeX: 0.0,
    eyeY: 0.01,
    browTilt: 0.08,
    earAlert: 0.16,
  },
  thinking: {
    headX: -0.06,
    headY: 0.14,
    headZ: -0.14,
    bodyLeanX: -0.03,
    eyeX: 0.03,
    eyeY: 0.025,
    browTilt: -0.12,
    earAlert: -0.06,
  },
  speaking: {
    headX: 0.02,
    headY: 0.0,
    headZ: 0.0,
    bodyLeanX: 0.04,
    eyeX: 0.0,
    eyeY: 0.0,
    browTilt: 0.06,
    earAlert: 0.08,
  },
};

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function buildBusinessManRig() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  head.position.set(0, 1.38, 0);
  body.add(head);
  root.add(body);

  // 材質
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe8f1fb, roughness: 0.72 });
  const collarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });
  const tieMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf4c49c, roughness: 0.62 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.55, roughness: 0.3 });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.5 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.5 });

  // 軀幹（商務襯衫）
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.85, 24), shirtMat);
  torso.position.set(0, 0.75, 0);
  torso.scale.set(1.22, 1, 0.68);
  body.add(torso);

  // 左右肩膀與襯衫袖子
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 16), shirtMat);
    shoulder.position.set(side * 0.44, 1.04, 0);
    body.add(shoulder);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.65, 16), shirtMat);
    arm.position.set(side * 0.49, 0.72, 0.02);
    arm.rotation.z = side * 0.08;
    body.add(arm);
  }

  // 襯衫領口（左右翻領）
  for (const side of [-1, 1]) {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.08), collarMat);
    collar.position.set(side * 0.1, 1.15, 0.19);
    collar.rotation.z = side * 0.42;
    collar.rotation.y = -side * 0.25;
    body.add(collar);
  }

  // 領帶結與領帶身
  const tieKnot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.06), tieMat);
  tieKnot.position.set(0, 1.11, 0.23);
  body.add(tieKnot);

  const tieBody = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.44, 0.03), tieMat);
  tieBody.position.set(0, 0.86, 0.245);
  body.add(tieBody);

  // 左胸名牌
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.075, 0.015),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }),
  );
  badge.position.set(0.2, 0.96, 0.235);
  body.add(badge);
  const badgeLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.015, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x60a5fa }),
  );
  badgeLine.position.set(0.2, 0.97, 0.238);
  body.add(badgeLine);

  // 脖子
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.22, 18), skinMat);
  neck.position.set(0, 1.23, 0);
  body.add(neck);

  // 頭部
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.29, 28, 24), skinMat);
  cranium.scale.set(0.95, 1.08, 0.96);
  cranium.position.set(0, 0.14, 0);
  head.add(cranium);

  // 耳朵
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 14), skinMat);
    ear.scale.set(0.55, 1.0, 0.75);
    ear.position.set(side * 0.27, 0.13, 0);
    head.add(ear);
  }

  // 頭髮（頂部 + 後腦 + 瀏海）
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.305, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  hairTop.scale.set(0.97, 1.06, 1.0);
  hairTop.position.set(0, 0.17, -0.015);
  head.add(hairTop);

  const bang = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.12), hairMat);
  bang.position.set(0.02, 0.34, 0.21);
  bang.rotation.z = -0.08;
  head.add(bang);

  // 眉毛
  const brows = [];
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.024, 0.025), hairMat);
    brow.position.set(side * 0.105, 0.255, 0.255);
    head.add(brow);
    brows.push({ mesh: brow, side });
  }

  // 眼鏡框
  for (const side of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.009, 10, 24), glassMat);
    frame.scale.set(1.15, 0.85, 1);
    frame.position.set(side * 0.105, 0.165, 0.275);
    head.add(frame);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), glassMat);
  bridge.position.set(0, 0.17, 0.275);
  head.add(bridge);

  // 眼睛（眼白 + 可動瞳孔 + 眨眼群組）
  const eyeGroups = [];
  const pupils = [];
  for (const side of [-1, 1]) {
    const eg = new THREE.Group();
    eg.position.set(side * 0.105, 0.165, 0.242);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.044, 16, 16), eyeWhiteMat);
    white.scale.set(1.05, 0.85, 0.55);
    eg.add(white);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 14), pupilMat);
    pupil.position.set(0, 0, 0.018);
    eg.add(pupil);

    head.add(eg);
    eyeGroups.push(eg);
    pupils.push(pupil);
  }

  // 鼻子
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.075, 12), skinMat);
  nose.position.set(0, 0.1, 0.28);
  nose.rotation.x = Math.PI * 0.5;
  head.add(nose);

  // 嘴巴（閉嘴線 + 開嘴立體口腔）
  const mouthClosed = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.015, 0.015),
    new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.6 }),
  );
  mouthClosed.position.set(0, 0.01, 0.268);
  head.add(mouthClosed);

  const mouthOpen = new THREE.Group();
  mouthOpen.position.set(0, 0.005, 0.262);
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 14), mouthMat);
  cavity.scale.set(1.15, 0.75, 0.45);
  mouthOpen.add(cavity);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), tongueMat);
  tongue.position.set(0, -0.018, 0.012);
  tongue.scale.set(1.0, 0.55, 0.5);
  mouthOpen.add(tongue);
  mouthOpen.visible = false;
  head.add(mouthOpen);

  return {
    root,
    body,
    head,
    brows,
    eyeGroups,
    pupils,
    ears: [],
    mouthClosed,
    mouthOpen,
    cameraTargetY: 1.32,
  };
}

function buildShiba3DRig() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  head.position.set(0, 1.34, 0);
  body.add(head);
  root.add(body);

  const suitMat = new THREE.MeshStandardMaterial({ color: 0x162d4c, roughness: 0.72 });
  const lapelMat = new THREE.MeshStandardMaterial({ color: 0x0f2038, roughness: 0.75 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
  const tieMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
  const furMat = new THREE.MeshStandardMaterial({ color: 0xe08b26, roughness: 0.85 });
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xfca5a5, roughness: 0.8, transparent: true, opacity: 0.55 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.5 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.5 });

  // 深藍西裝身體
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.35, 0.86, 24), suitMat);
  torso.position.set(0, 0.74, 0);
  torso.scale.set(1.22, 1, 0.7);
  body.add(torso);

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 14), suitMat);
    shoulder.position.set(side * 0.45, 1.03, 0);
    body.add(shoulder);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.64, 16), suitMat);
    arm.position.set(side * 0.5, 0.71, 0.02);
    arm.rotation.z = side * 0.08;
    body.add(arm);

    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.05), lapelMat);
    lapel.position.set(side * 0.13, 0.99, 0.235);
    lapel.rotation.z = -side * 0.26;
    body.add(lapel);
  }

  // 白襯衫倒三角 + 紅領帶
  const shirtV = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.4, 4), shirtMat);
  shirtV.position.set(0, 1.02, 0.22);
  shirtV.rotation.x = Math.PI;
  shirtV.rotation.y = Math.PI * 0.25;
  shirtV.scale.set(1, 1, 0.25);
  body.add(shirtV);

  const tieKnot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.055), tieMat);
  tieKnot.position.set(0, 1.12, 0.25);
  body.add(tieKnot);

  const tieBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.4, 0.03), tieMat);
  tieBody.position.set(0, 0.89, 0.26);
  body.add(tieBody);

  // 柴犬胸毛
  const chestFur = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), creamMat);
  chestFur.scale.set(1.2, 0.55, 0.7);
  chestFur.position.set(0, 1.2, 0.12);
  body.add(chestFur);

  // 柴犬頭部
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 24), furMat);
  skull.scale.set(1.12, 0.95, 0.95);
  skull.position.set(0, 0.18, 0);
  head.add(skull);

  // 兩頰蓬鬆毛 + 奶油白臉部
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 16), creamMat);
    cheek.position.set(side * 0.21, 0.08, 0.15);
    head.add(cheek);

    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), blushMat);
    blush.scale.set(1.2, 0.65, 0.35);
    blush.position.set(side * 0.23, 0.11, 0.27);
    head.add(blush);
  }

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 18), creamMat);
  muzzle.scale.set(1.15, 0.88, 1.05);
  muzzle.position.set(0, 0.09, 0.25);
  head.add(muzzle);

  // 柴犬豆眉
  const brows = [];
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), creamMat);
    brow.scale.set(1.2, 0.7, 0.4);
    brow.position.set(side * 0.12, 0.32, 0.27);
    head.add(brow);
    brows.push({ mesh: brow, side });
  }

  // 三角耳朵（可動）
  const ears = [];
  for (const side of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.25, 0.42, 0.0);
    earGroup.rotation.z = -side * 0.32;

    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.28, 4), furMat);
    outer.position.set(0, 0.12, 0);
    outer.rotation.y = Math.PI * 0.25;
    earGroup.add(outer);

    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.19, 4), creamMat);
    inner.position.set(0, 0.1, 0.035);
    inner.rotation.y = Math.PI * 0.25;
    earGroup.add(inner);

    head.add(earGroup);
    ears.push({ mesh: earGroup, side, baseRotZ: -side * 0.32 });
  }

  // 眼睛（可動瞳孔 + 眨眼）
  const eyeGroups = [];
  const pupils = [];
  for (const side of [-1, 1]) {
    const eg = new THREE.Group();
    eg.position.set(side * 0.145, 0.21, 0.285);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 16), darkMat);
    eye.scale.set(1, 1, 0.7);
    eg.add(eye);

    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    shine.position.set(0.014, 0.016, 0.03);
    eg.add(shine);

    head.add(eg);
    eyeGroups.push(eg);
    pupils.push(shine);
  }

  // 柴犬鼻頭
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 14), darkMat);
  nose.scale.set(1.25, 0.85, 0.85);
  nose.position.set(0, 0.14, 0.4);
  head.add(nose);

  // 閉嘴 + 張嘴口腔
  const mouthClosed = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, 0.016), darkMat);
  mouthClosed.position.set(0, 0.04, 0.375);
  head.add(mouthClosed);

  const mouthOpen = new THREE.Group();
  mouthOpen.position.set(0, 0.03, 0.368);
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 14), mouthMat);
  cavity.scale.set(1.15, 0.8, 0.55);
  mouthOpen.add(cavity);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), tongueMat);
  tongue.position.set(0, -0.022, 0.02);
  tongue.scale.set(1.0, 0.55, 0.65);
  mouthOpen.add(tongue);
  mouthOpen.visible = false;
  head.add(mouthOpen);

  return {
    root,
    body,
    head,
    brows,
    eyeGroups,
    pupils,
    ears,
    mouthClosed,
    mouthOpen,
    cameraTargetY: 1.32,
  };
}

/**
 * 建立 3D 虛擬面試官引擎（含有限狀態機與 VRM 載入器）。
 * @param {HTMLElement} hostEl
 */
export function createAvatar3DEngine(hostEl) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "avatar-3d-canvas";
  hostEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1322);

  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 30);
  camera.position.set(0, 1.48, 2.25);
  camera.lookAt(0, 1.32, 0);

  // 柔和視訊會議三點打光
  scene.add(new THREE.AmbientLight(0xdbeafe, 0.9));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
  keyLight.position.set(1.8, 2.8, 2.5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.65);
  rimLight.position.set(-2.0, 1.8, -1.6);
  scene.add(rimLight);

  // 簡潔辦公室背景板
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 5),
    new THREE.MeshStandardMaterial({ color: 0x111a2e, roughness: 0.95 }),
  );
  wall.position.set(0, 1.5, -1.3);
  scene.add(wall);

  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.08, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }),
  );
  desk.position.set(0, 0.56, 0.45);
  scene.add(desk);

  let activeRig = null;
  let activeVrm = null;
  let currentState = "idle";
  let elapsed = 0;
  let renderAccum = 0;
  let nextBlinkAt = 2.6;
  let blinkPhase = 0;

  // 狀態機平滑內部值
  const fsm = {
    headX: 0,
    headY: 0,
    headZ: 0,
    bodyLeanX: 0,
    eyeX: 0,
    eyeY: 0,
    browTilt: 0,
    earAlert: 0,
  };

  function clearCharacter() {
    if (activeRig) {
      scene.remove(activeRig.root);
      activeRig = null;
    }
    if (activeVrm) {
      scene.remove(activeVrm.scene);
      VRMUtils.deepDispose(activeVrm.scene);
      activeVrm = null;
    }
  }

  function resize() {
    const rect = hostEl.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || 480));
    const h = Math.max(180, Math.round(rect.height || 270));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function loadBuiltIn(characterId) {
    clearCharacter();
    activeRig = characterId === "shiba_3d" ? buildShiba3DRig() : buildBusinessManRig();
    scene.add(activeRig.root);
    camera.position.set(0, 1.48, 2.15);
    camera.lookAt(0, activeRig.cameraTargetY, 0);
    resize();
  }

  async function loadVrmBuffer(arrayBuffer) {
    clearCharacter();
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: "application/octet-stream" }));
    try {
      const gltf = await loader.loadAsync(blobUrl);
      const vrm = gltf.userData.vrm;
      if (!vrm) throw new Error("檔案不是有效的 VRM 模型");
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
      activeVrm = vrm;
      scene.add(vrm.scene);

      // 自動對準頭部高度
      const headNode = vrm.humanoid?.getNormalizedBoneNode("head");
      const headY = headNode ? headNode.getWorldPosition(new THREE.Vector3()).y : 1.45;
      camera.position.set(0, headY + 0.04, 1.25);
      camera.lookAt(0, headY - 0.04, 0);
      resize();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  function setState(nextState) {
    currentState = FSM_PRESETS[nextState] ? nextState : "idle";
  }

  function update(dt, mouthLevel) {
    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    elapsed += safeDt;
    // 節流至約 30 FPS，降低與本機 Ollama / Whisper 競爭 GPU 的機率
    renderAccum += safeDt;
    if (renderAccum < 1 / 32) return;
    const stepDt = Math.min(0.08, renderAccum);
    renderAccum = 0;

    const preset = FSM_PRESETS[currentState] ?? FSM_PRESETS.idle;

    // 依狀態機疊加自然微動作
    let targetHeadX = preset.headX;
    let targetHeadY = preset.headY;
    let targetHeadZ = preset.headZ;
    if (currentState === "listening") {
      targetHeadX += Math.sin(elapsed * 2.6) * 0.065;
    } else if (currentState === "speaking") {
      targetHeadX += Math.sin(elapsed * 5.2) * 0.03 + mouthLevel * 0.04;
      targetHeadY += Math.sin(elapsed * 1.9) * 0.05;
    } else if (currentState === "idle") {
      targetHeadY += Math.sin(elapsed * 0.7) * 0.045;
    }

    fsm.headX = damp(fsm.headX, targetHeadX, 7, stepDt);
    fsm.headY = damp(fsm.headY, targetHeadY, 7, stepDt);
    fsm.headZ = damp(fsm.headZ, targetHeadZ, 7, stepDt);
    fsm.bodyLeanX = damp(fsm.bodyLeanX, preset.bodyLeanX, 6, stepDt);
    fsm.eyeX = damp(fsm.eyeX, preset.eyeX, 8, stepDt);
    fsm.eyeY = damp(fsm.eyeY, preset.eyeY, 8, stepDt);
    fsm.browTilt = damp(fsm.browTilt, preset.browTilt, 8, stepDt);
    fsm.earAlert = damp(fsm.earAlert, preset.earAlert, 9, stepDt);

    // 隨機眨眼計算（0 = 張開，1 = 全閉）
    if (elapsed >= nextBlinkAt) {
      blinkPhase = 1;
      nextBlinkAt = elapsed + 2.4 + Math.random() * 2.8;
    }
    let blinkValue = 0;
    if (blinkPhase > 0) {
      blinkPhase = Math.max(0, blinkPhase - stepDt * 7.5);
      blinkValue = Math.sin(blinkPhase * Math.PI);
    }

    const breatheY = Math.sin(elapsed * 1.8) * 0.012;

    if (activeRig) {
      activeRig.body.position.y = breatheY;
      activeRig.body.rotation.x = fsm.bodyLeanX;
      activeRig.head.rotation.set(fsm.headX, fsm.headY, fsm.headZ);

      for (const eg of activeRig.eyeGroups) {
        eg.scale.y = Math.max(0.08, 1 - blinkValue * 0.92);
      }
      for (const p of activeRig.pupils) {
        p.position.x = fsm.eyeX;
        p.position.y = fsm.eyeY;
      }
      for (const b of activeRig.brows) {
        b.mesh.rotation.z = b.side * fsm.browTilt;
      }
      for (const e of activeRig.ears) {
        e.mesh.rotation.z = e.baseRotZ + e.side * fsm.earAlert;
      }

      if (mouthLevel > 0.06) {
        activeRig.mouthClosed.visible = false;
        activeRig.mouthOpen.visible = true;
        activeRig.mouthOpen.scale.set(0.85 + mouthLevel * 0.45, 0.35 + mouthLevel * 1.15, 1);
      } else {
        activeRig.mouthClosed.visible = true;
        activeRig.mouthOpen.visible = false;
      }
    }

    if (activeVrm) {
      activeVrm.update(stepDt);
      const headBone = activeVrm.humanoid?.getNormalizedBoneNode("head");
      if (headBone) {
        headBone.rotation.set(fsm.headX, fsm.headY, fsm.headZ);
      }
      const em = activeVrm.expressionManager;
      if (em) {
        em.setValue("blink", blinkValue);
        em.setValue("aa", Math.min(1, mouthLevel * 1.1));
        em.setValue("happy", currentState === "listening" ? 0.35 : 0);
      }
    }

    renderer.render(scene, camera);
  }

  function destroy() {
    clearCharacter();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    loadBuiltIn,
    loadVrmBuffer,
    setState,
    update,
    resize,
    destroy,
  };
}
