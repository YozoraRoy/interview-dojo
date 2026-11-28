"use client";

import { Rive } from "@rive-app/canvas";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import { RIVE_CHARACTERS, type AvatarState } from "./types.ts";

interface AvatarRiveCanvasProps {
  character: string;
  customRiveBase64: string;
  state: AvatarState;
  mouthLevel: number;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function AvatarRiveCanvas({
  character,
  customRiveBase64,
  state,
  mouthLevel,
}: AvatarRiveCanvasProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const riveRef = useRef<Rive | null>(null);
  const stateRef = useRef<AvatarState>(state);
  const mouthRef = useRef<number>(mouthLevel);
  const [hint, setHint] = useState<string | null>(null);

  stateRef.current = state;
  mouthRef.current = mouthLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let rafId = 0;

    if (riveRef.current) {
      riveRef.current.cleanup();
      riveRef.current = null;
    }

    const meta = RIVE_CHARACTERS.find((c) => c.id === character);
    if (character === "custom" && !customRiveBase64) {
      setHint(t("hintRivePick"));
      return;
    }

    setHint(null);

    try {
      const options: ConstructorParameters<typeof Rive>[0] = {
        canvas,
        autoplay: true,
        onLoad: () => {
          if (disposed || !riveRef.current) return;
          riveRef.current.resizeDrawingSurfaceToCanvas();
          const names = riveRef.current.stateMachineNames;
          if (names.length > 0) {
            riveRef.current.play(names[0]);
          }
        },
        onLoadError: () => {
          if (!disposed) setHint(t("hintRiveError"));
        },
      };

      if (character === "custom" && customRiveBase64) {
        options.buffer = base64ToArrayBuffer(customRiveBase64);
      } else if (meta?.src) {
        options.src = meta.src;
        if (meta.artboard) options.artboard = meta.artboard;
      }

      const instance = new Rive(options);
      riveRef.current = instance;

      const syncLoop = () => {
        if (disposed) return;
        const r = riveRef.current;
        if (r) {
          const curState = stateRef.current;
          const mouth = mouthRef.current;
          for (const smName of r.stateMachineNames) {
            const inputs = r.stateMachineInputs(smName) ?? [];
            for (const input of inputs) {
              const name = input.name.toLowerCase();
              if (name === "isspeaking" || name === "speaking") {
                input.value = curState === "speaking";
              } else if (name === "islistening" || name === "listening" || name === "ischecking") {
                input.value = curState === "listening";
              } else if (name === "isthinking" || name === "thinking" || name === "ishandsup") {
                input.value = curState === "thinking";
              } else if (name === "ishappy") {
                input.value = curState === "speaking" && mouth > 0.25;
              } else if (name === "mouthopen" || name === "mouth" || name === "numlook") {
                input.value = name === "numlook" ? 50 : mouth;
              }
            }
          }
        }
        rafId = requestAnimationFrame(syncLoop);
      };
      rafId = requestAnimationFrame(syncLoop);
    } catch {
      setHint(t("hintRiveError"));
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (riveRef.current) {
        riveRef.current.cleanup();
        riveRef.current = null;
      }
    };
  }, [character, customRiveBase64, t]);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-slate-900">
      <canvas ref={canvasRef} className="h-full w-full object-contain" />
      {hint && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4 text-center text-sm text-slate-300">
          {hint}
        </div>
      )}
    </div>
  );
}
