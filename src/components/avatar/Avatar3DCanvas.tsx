"use client";

import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import type { AvatarState } from "./types.ts";

interface Avatar3DCanvasProps {
  character: string;
  customVrmBuffer: ArrayBuffer | null;
  state: AvatarState;
  mouthLevel: number;
}

interface ProceduralRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  mouth?: THREE.Mesh;
  leftEye?: THREE.Mesh;
  rightEye?: THREE.Mesh;
}

const FSM_PRESETS: Record<
  AvatarState,
  { headX: number; headY: number; headZ: number; bodyLeanX: number }
> = {
  idle: { headX: 0, headY: 0, headZ: 0, bodyLeanX: 0 },
  listening: { headX: 0.05, headY: 0, headZ: 0.03, bodyLeanX: 0.06 },
  thinking: { headX: -0.06, headY: 0.14, headZ: -0.14, bodyLeanX: -0.03 },
  speaking: { headX: 0.02, headY: 0, headZ: 0, bodyLeanX: 0.04 },
};

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function buildProceduralRig(type: "business_man" | "shiba_3d"): ProceduralRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  head.position.set(0, 1.38, 0);
  body.add(head);
  root.add(body);

  const isShiba = type === "shiba_3d";
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
  const tieMat = new THREE.MeshStandardMaterial({
    color: isShiba ? 0xdc2626 : 0x2563eb,
    roughness: 0.45,
  });

  // 軀幹與西裝
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.32), suitMat);
  torso.position.set(0, 0.88, 0);
  body.add(torso);

  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.46, 0.34), shirtMat);
  shirt.position.set(0, 1.0, 0.01);
  body.add(shirt);

  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.35), tieMat);
  tie.position.set(0, 0.94, 0.02);
  body.add(tie);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.25 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });

  let leftEye: THREE.Mesh;
  let rightEye: THREE.Mesh;
  let mouth: THREE.Mesh;

  if (isShiba) {
    const furMat = new THREE.MeshStandardMaterial({ color: 0xe5942b, roughness: 0.75 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35 });

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 24), furMat);
    head.add(headMesh);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 18), creamMat);
    muzzle.position.set(0, -0.05, 0.16);
    muzzle.scale.set(1.1, 0.85, 0.9);
    head.add(muzzle);

    const earGeo = new THREE.ConeGeometry(0.08, 0.18, 4);
    const leftEar = new THREE.Mesh(earGeo, furMat);
    leftEar.position.set(-0.15, 0.23, 0);
    leftEar.rotation.z = 0.28;
    const rightEar = new THREE.Mesh(earGeo, furMat);
    rightEar.position.set(0.15, 0.23, 0);
    rightEar.rotation.z = -0.28;
    head.add(leftEar, rightEar);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), noseMat);
    nose.position.set(0, -0.02, 0.28);
    head.add(nose);

    const eyeGeo = new THREE.SphereGeometry(0.028, 12, 12);
    leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.09, 0.05, 0.22);
    rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.09, 0.05, 0.22);
    head.add(leftEye, rightEye);

    mouth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.04), mouthMat);
    mouth.position.set(0, -0.1, 0.25);
    head.add(mouth);
  } else {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf4c49c, roughness: 0.62 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.8 });

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), skinMat);
    head.add(headMesh);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.228, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.52),
      hairMat,
    );
    hair.position.set(0, 0.02, -0.01);
    head.add(hair);

    const eyeGeo = new THREE.SphereGeometry(0.024, 12, 12);
    leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.075, 0.03, 0.2);
    rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.075, 0.03, 0.2);
    head.add(leftEye, rightEye);

    mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.022, 0.03), mouthMat);
    mouth.position.set(0, -0.08, 0.2);
    head.add(mouth);
  }

  return { root, body, head, mouth, leftEye, rightEye };
}

export default function Avatar3DCanvas({
  character,
  customVrmBuffer,
  state,
  mouthLevel,
}: Avatar3DCanvasProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<AvatarState>(state);
  const mouthRef = useRef<number>(mouthLevel);
  const [hint, setHint] = useState<string | null>(null);

  stateRef.current = state;
  mouthRef.current = mouthLevel;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (character === "custom_vrm" && !customVrmBuffer) {
      setHint(t("hintVrmPick"));
      return;
    }

    setHint(null);
    let disposed = false;
    let rafId = 0;

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 260;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 20);
    camera.position.set(0, 1.38, 1.45);
    camera.lookAt(0, 1.32, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 1.1);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(1.2, 2.2, 2.0);
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.6);
    rimLight.position.set(-1.5, 1.6, -1.2);
    scene.add(hemi, keyLight, rimLight);

    let rig: ProceduralRig | null = null;
    let vrm: VRM | null = null;

    if (character === "custom_vrm" && customVrmBuffer) {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      loader.parse(
        customVrmBuffer.slice(0),
        "",
        (gltf) => {
          if (disposed) return;
          const loadedVrm = gltf.userData.vrm as VRM | undefined;
          if (!loadedVrm) {
            setHint(t("hintVrmError"));
            return;
          }
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.combineSkeletons(gltf.scene);
          loadedVrm.scene.rotation.y = Math.PI;
          scene.add(loadedVrm.scene);
          vrm = loadedVrm;

          const headNode = loadedVrm.humanoid?.getNormalizedBoneNode("head");
          if (headNode) {
            const worldPos = new THREE.Vector3();
            headNode.getWorldPosition(worldPos);
            camera.position.set(0, worldPos.y + 0.04, 1.15);
            camera.lookAt(0, worldPos.y - 0.02, 0);
          }
        },
        () => {
          if (!disposed) setHint(t("hintVrmError"));
        },
      );
    } else {
      const rigType = character === "shiba_3d" ? "shiba_3d" : "business_man";
      rig = buildProceduralRig(rigType);
      scene.add(rig.root);
    }

    const resizeObserver = new ResizeObserver(() => {
      if (disposed || !container) return;
      const w = container.clientWidth || 360;
      const h = container.clientHeight || 260;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let lastRenderAt = 0;
    let elapsed = 0;
    let curHeadX = 0;
    let curHeadY = 0;
    let curHeadZ = 0;
    let curBodyX = 0;
    let nextBlinkAt = 2.6;

    const animate = (now: number) => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);

      // 節流至 30 FPS，避免與本地 Ollama / Whisper 搶佔 GPU
      if (now - lastRenderAt < 33) return;
      const dt = lastRenderAt ? Math.min((now - lastRenderAt) / 1000, 0.1) : 0.033;
      lastRenderAt = now;
      elapsed += dt;

      const preset = FSM_PRESETS[stateRef.current];
      const mouth = mouthRef.current;

      curHeadX = damp(curHeadX, preset.headX, 6, dt);
      curHeadY = damp(curHeadY, preset.headY, 6, dt);
      curHeadZ = damp(curHeadZ, preset.headZ, 6, dt);
      curBodyX = damp(curBodyX, preset.bodyLeanX, 5, dt);

      const breath = Math.sin(elapsed * 1.8) * 0.012;
      const isBlinking = elapsed >= nextBlinkAt && elapsed <= nextBlinkAt + 0.13;
      if (elapsed > nextBlinkAt + 0.13) {
        nextBlinkAt = elapsed + 2.4 + Math.random() * 2.8;
      }

      if (rig) {
        rig.body.rotation.x = curBodyX;
        rig.body.position.y = breath;
        rig.head.rotation.set(
          curHeadX + (stateRef.current === "speaking" ? Math.sin(elapsed * 8) * 0.025 * mouth : 0),
          curHeadY,
          curHeadZ,
        );
        if (rig.mouth) {
          rig.mouth.scale.y = 1 + mouth * 3.8;
        }
        const eyeScaleY = isBlinking ? 0.1 : 1;
        if (rig.leftEye) rig.leftEye.scale.y = eyeScaleY;
        if (rig.rightEye) rig.rightEye.scale.y = eyeScaleY;
      }

      if (vrm) {
        const headBone = vrm.humanoid?.getNormalizedBoneNode("head");
        if (headBone) {
          headBone.rotation.set(curHeadX, curHeadY, curHeadZ);
        }
        vrm.expressionManager?.setValue("aa", mouth);
        vrm.expressionManager?.setValue("blink", isBlinking ? 1 : 0);
        vrm.expressionManager?.setValue("happy", stateRef.current === "speaking" ? 0.25 : 0);
        vrm.update(dt);
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [character, customVrmBuffer, t]);

  return (
    <div className="relative h-full w-full bg-slate-900">
      <div ref={containerRef} className="h-full w-full" />
      {hint && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4 text-center text-sm text-slate-300">
          {hint}
        </div>
      )}
    </div>
  );
}
