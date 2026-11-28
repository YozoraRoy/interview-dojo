"use client";

import dynamic from "next/dynamic";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import { AvatarSvg } from "./AvatarSvg.tsx";
import { STATE_KEY_MAP, type AvatarPreferences, type AvatarState } from "./types.ts";

const Avatar3DCanvas = dynamic(() => import("./Avatar3DCanvas.tsx"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-400">
      Loading 3D Engine…
    </div>
  ),
});

const AvatarRiveCanvas = dynamic(() => import("./AvatarRiveCanvas.tsx"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-400">
      Loading Rive Engine…
    </div>
  ),
});

interface AvatarStageProps {
  prefs: AvatarPreferences;
  state: AvatarState;
  mouthLevel: number;
  customVrmBuffer: ArrayBuffer | null;
}

export function AvatarStage({
  prefs,
  state,
  mouthLevel,
  customVrmBuffer,
}: AvatarStageProps) {
  const { t } = useI18n();

  const badgeLabel =
    prefs.mode === "svg"
      ? prefs.svgCharacter === "suit"
        ? t("badgeSvgSuit")
        : t("badgeSvgShiba")
      : prefs.mode === "3d"
        ? prefs.threeDCharacter === "shiba_3d"
          ? t("badge3dShiba")
          : prefs.threeDCharacter === "custom_vrm"
            ? prefs.customVrmName
              ? t("badge3dVrm", { name: prefs.customVrmName })
              : t("badge3dPick")
            : t("badge3dMan")
        : prefs.riveCharacter === "custom" && !prefs.customRiveBase64
          ? t("badgeRivePick")
          : `Rive · ${prefs.customRiveName || prefs.riveCharacter}`;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-inner">
      {prefs.mode === "svg" && (
        <AvatarSvg
          character={prefs.svgCharacter}
          state={state}
          mouthLevel={mouthLevel}
        />
      )}
      {prefs.mode === "3d" && (
        <Avatar3DCanvas
          character={prefs.threeDCharacter}
          customVrmBuffer={customVrmBuffer}
          state={state}
          mouthLevel={mouthLevel}
        />
      )}
      {prefs.mode === "rive" && (
        <AvatarRiveCanvas
          character={prefs.riveCharacter}
          customRiveBase64={prefs.customRiveBase64}
          state={state}
          mouthLevel={mouthLevel}
        />
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded-full bg-slate-950/75 px-3 py-1 text-xs text-slate-200 backdrop-blur">
        <span>{badgeLabel}</span>
        <span className="text-slate-500">·</span>
        <span
          className={
            state === "speaking"
              ? "text-emerald-400"
              : state === "thinking"
                ? "text-amber-400"
                : state === "listening"
                  ? "text-sky-400"
                  : "text-slate-400"
          }
        >
          {t(STATE_KEY_MAP[state])}
        </span>
      </div>
    </div>
  );
}
