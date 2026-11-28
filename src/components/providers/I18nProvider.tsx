"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  translateMessage,
  type AppLang,
  type I18nKey,
} from "@/lib/i18n/messages.ts";

const LANG_STORAGE_KEY = "interview_dojo_lang_v1";

interface I18nContextValue {
  lang: AppLang;
  setLang: (next: AppLang) => void;
  t: (key: I18nKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY) as AppLang | null;
      if (saved && SUPPORTED_LANGS.includes(saved)) {
        setLangState(saved);
      }
    } catch {
      // 忽略 localStorage 讀取失敗
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh-TW" ? "zh-Hant" : lang;
  }, [lang]);

  const setLang = useCallback((next: AppLang) => {
    if (!SUPPORTED_LANGS.includes(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // 忽略
    }
  }, []);

  const t = useCallback(
    (key: I18nKey, vars?: Record<string, string | number>) =>
      translateMessage(lang, key, vars),
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n 必須在 I18nProvider 內使用");
  }
  return ctx;
}
