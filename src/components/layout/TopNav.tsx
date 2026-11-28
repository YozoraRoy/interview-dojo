"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import type { AppLang } from "@/lib/i18n/messages.ts";

function NavLinks() {
  const pathname = usePathname();
  const { t } = useI18n();

  const navItems = [
    { href: "/", label: t("navStage") },
    { href: "/sessions", label: t("navSessions") },
    { href: "/settings", label: t("navSettings") },
  ];

  return (
    <>
      {navItems.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-indigo-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function TopNav() {
  const { lang, setLang, t } = useI18n();

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-bold tracking-tight text-white">
            interview-dojo
          </Link>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
            {t("brandBadge")}
          </span>
        </div>

        <nav className="flex items-center gap-2">
          <Suspense fallback={<div className="h-8 w-44" />}>
            <NavLinks />
          </Suspense>

          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as AppLang)}
            aria-label={t("langAria")}
            className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="ja">🌐 日本語</option>
            <option value="en">🌐 English</option>
            <option value="zh-TW">🌐 繁體中文</option>
          </select>
        </nav>
      </div>
    </header>
  );
}
