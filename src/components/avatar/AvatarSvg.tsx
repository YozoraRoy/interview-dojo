"use client";

import { useEffect, useState } from "react";
import type { AvatarState } from "./types.ts";

interface AvatarSvgProps {
  character: string;
  state: AvatarState;
  mouthLevel: number;
}

export function AvatarSvg({ character, state, mouthLevel }: AvatarSvgProps) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let blinkTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleBlink = () => {
      const wait = 2400 + Math.random() * 2800;
      timerId = setTimeout(() => {
        setBlinking(true);
        blinkTimeoutId = setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 130);
      }, wait);
    };

    scheduleBlink();
    return () => {
      if (timerId) clearTimeout(timerId);
      if (blinkTimeoutId) clearTimeout(blinkTimeoutId);
    };
  }, []);

  const headTilt =
    state === "thinking"
      ? "rotate(-4 160 130)"
      : state === "listening"
        ? "translate(0 2)"
        : state === "speaking"
          ? `translate(0 ${(-mouthLevel * 2).toFixed(2)})`
          : undefined;

  if (character === "suit") {
    const ry = 2 + mouthLevel * 8;
    return (
      <svg viewBox="0 0 320 260" className="h-full w-full select-none" aria-hidden="true">
        <defs>
          <radialGradient id="bgGlowSuit" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0b1220" />
          </radialGradient>
        </defs>
        <rect width="320" height="260" fill="url(#bgGlowSuit)" />
        {/* 西裝與領帶 */}
        <path d="M88 260 C92 204 120 190 160 190 C200 190 228 204 232 260 Z" fill="#1e293b" stroke="#334155" strokeWidth="2" />
        <path d="M138 192 L160 226 L182 192 Z" fill="#f8fafc" />
        <path d="M155 198 L165 198 L168 242 L160 250 L152 242 Z" fill="#3b82f6" />
        {/* 頭部 */}
        <g transform={headTilt}>
          <rect x="148" y="168" width="24" height="28" rx="10" fill="#f3c6a5" />
          <circle cx="160" cy="116" r="56" fill="#f5cba7" stroke="#d4a373" strokeWidth="1.5" />
          {/* 頭髮 */}
          <path d="M104 114 C104 68 134 52 162 52 C194 52 216 70 216 114 C205 90 185 84 160 84 C135 84 114 92 104 114 Z" fill="#1e293b" />
          {/* 眼鏡與眼睛 */}
          {blinking ? (
            <>
              <line x1="128" y1="116" x2="148" y2="116" stroke="#1e293b" strokeWidth="2.6" strokeLinecap="round" />
              <line x1="172" y1="116" x2="192" y2="116" stroke="#1e293b" strokeWidth="2.6" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="138" cy="116" r="5" fill="#1e293b" />
              <circle cx="182" cy="116" r="5" fill="#1e293b" />
              <circle cx="140" cy="114" r="1.5" fill="#ffffff" />
              <circle cx="184" cy="114" r="1.5" fill="#ffffff" />
            </>
          )}
          <rect x="123" y="106" width="30" height="20" rx="5" fill="none" stroke="#475569" strokeWidth="2" />
          <rect x="167" y="106" width="30" height="20" rx="5" fill="none" stroke="#475569" strokeWidth="2" />
          <line x1="153" y1="115" x2="167" y2="115" stroke="#475569" strokeWidth="2" />
          {/* 嘴巴 */}
          <ellipse cx="160" cy="145" rx="11" ry={ry} fill="#991b1b" stroke="#7f1d1d" strokeWidth="1.5" />
        </g>
      </svg>
    );
  }

  // 預設：柴犬部長（shiba）
  const shibaMouthRy = 2.5 + mouthLevel * 9.5;
  return (
    <svg viewBox="0 0 320 260" className="h-full w-full select-none" aria-hidden="true">
      <defs>
        <radialGradient id="bgGlowShiba" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0b1220" />
        </radialGradient>
      </defs>
      <rect width="320" height="260" fill="url(#bgGlowShiba)" />
      {/* 西裝身體 */}
      <path d="M84 260 C90 202 118 188 160 188 C202 188 230 202 236 260 Z" fill="#1e293b" stroke="#334155" strokeWidth="2" />
      <path d="M138 190 L160 226 L182 190 Z" fill="#f8fafc" />
      <path d="M155 196 L165 196 L168 242 L160 250 L152 242 Z" fill="#dc2626" />
      {/* 柴犬頭部 */}
      <g transform={headTilt}>
        <polygon points="105,94 114,44 142,74" fill="#d97706" stroke="#b45309" strokeWidth="2" />
        <polygon points="215,94 206,44 178,74" fill="#d97706" stroke="#b45309" strokeWidth="2" />
        <polygon points="112,86 118,56 135,76" fill="#fef3c7" />
        <polygon points="208,86 202,56 185,76" fill="#fef3c7" />
        <ellipse cx="160" cy="122" rx="60" ry="52" fill="#e5942b" stroke="#b45309" strokeWidth="2" />
        <path d="M114 134 C114 110 138 112 160 120 C182 112 206 110 206 134 C206 164 185 174 160 174 C135 174 114 164 114 134 Z" fill="#fef3c7" />
        {/* 豆豆眉 */}
        <ellipse cx="136" cy="96" rx="7" ry="4" fill="#fde68a" />
        <ellipse cx="184" cy="96" rx="7" ry="4" fill="#fde68a" />
        {/* 眼睛 */}
        {blinking ? (
          <>
            <line x1="128" y1="112" x2="144" y2="112" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
            <line x1="176" y1="112" x2="192" y2="112" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="136" cy="112" r="5.5" fill="#1e293b" />
            <circle cx="184" cy="112" r="5.5" fill="#1e293b" />
            <circle cx="138" cy="110" r="1.8" fill="#ffffff" />
            <circle cx="186" cy="110" r="1.8" fill="#ffffff" />
          </>
        )}
        {/* 鼻子與嘴巴 */}
        <ellipse cx="160" cy="130" rx="8" ry="5.5" fill="#1e293b" />
        <ellipse cx="160" cy="149" rx="11" ry={shibaMouthRy} fill="#991b1b" stroke="#78350f" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
