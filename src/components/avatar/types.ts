import type { I18nKey } from "@/lib/i18n/messages.ts";

export type AvatarMode = "svg" | "3d" | "rive";
export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

export interface AvatarPreferences {
  mode: AvatarMode;
  svgCharacter: string;
  threeDCharacter: string;
  riveCharacter: string;
  customRiveName: string;
  customRiveBase64: string;
  customVrmName: string;
}

export const AVATAR_STORAGE_KEY = "interview_dojo_avatar_prefs_v1";

export const SVG_CHARACTERS: Array<{ id: string; labelKey: I18nKey }> = [
  { id: "shiba", labelKey: "charSvgShiba" },
  { id: "suit", labelKey: "charSvgSuit" },
];

export const THREE_D_CHARACTERS: Array<{ id: string; labelKey: I18nKey }> = [
  { id: "business_man", labelKey: "char3dMan" },
  { id: "shiba_3d", labelKey: "char3dShiba" },
  { id: "custom_vrm", labelKey: "char3dCustom" },
];

export const RIVE_CHARACTERS: Array<{
  id: string;
  labelKey: I18nKey;
  src?: string;
  artboard?: string;
}> = [
  { id: "avatar1", labelKey: "charRiveA1", src: "/rive/avatar-pack.riv", artboard: "Avatar 1" },
  { id: "avatar2", labelKey: "charRiveA2", src: "/rive/avatar-pack.riv", artboard: "Avatar 2" },
  { id: "avatar3", labelKey: "charRiveA3", src: "/rive/avatar-pack.riv", artboard: "Avatar 3" },
  { id: "teddy", labelKey: "charRiveTeddy", src: "/rive/teddy.riv", artboard: "Teddy" },
  { id: "custom", labelKey: "charRiveCustom" },
];

export const STATE_KEY_MAP: Record<AvatarState, I18nKey> = {
  idle: "stateIdle",
  listening: "stateListening",
  thinking: "stateThinking",
  speaking: "stateSpeaking",
};

export function getDefaultAvatarPrefs(): AvatarPreferences {
  return {
    mode: "svg",
    svgCharacter: "shiba",
    threeDCharacter: "business_man",
    riveCharacter: "avatar1",
    customRiveName: "",
    customRiveBase64: "",
    customVrmName: "",
  };
}

export function loadAvatarPrefs(): AvatarPreferences {
  const defaults = getDefaultAvatarPrefs();
  try {
    const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AvatarPreferences>;
    return {
      mode: parsed.mode === "rive" || parsed.mode === "3d" ? parsed.mode : "svg",
      svgCharacter: SVG_CHARACTERS.some((c) => c.id === parsed.svgCharacter)
        ? (parsed.svgCharacter as string)
        : defaults.svgCharacter,
      threeDCharacter: THREE_D_CHARACTERS.some((c) => c.id === parsed.threeDCharacter)
        ? (parsed.threeDCharacter as string)
        : defaults.threeDCharacter,
      riveCharacter: RIVE_CHARACTERS.some((c) => c.id === parsed.riveCharacter)
        ? (parsed.riveCharacter as string)
        : defaults.riveCharacter,
      customRiveName: typeof parsed.customRiveName === "string" ? parsed.customRiveName : "",
      customRiveBase64: typeof parsed.customRiveBase64 === "string" ? parsed.customRiveBase64 : "",
      customVrmName: typeof parsed.customVrmName === "string" ? parsed.customVrmName : "",
    };
  } catch {
    return defaults;
  }
}

export function saveAvatarPrefs(prefs: AvatarPreferences): void {
  try {
    localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    try {
      localStorage.setItem(
        AVATAR_STORAGE_KEY,
        JSON.stringify({ ...prefs, customRiveBase64: "" }),
      );
    } catch {
      // 忽略
    }
  }
}
