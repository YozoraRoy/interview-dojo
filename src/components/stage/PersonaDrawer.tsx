"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider.tsx";
import { buildByokHeaders } from "@/lib/byok.ts";
import type { Persona } from "@/lib/persona.ts";

interface PersonaDrawerProps {
  initialPersona: Persona;
}

const MAX_INPUT_CHARS = 6000;
const MAX_FILE_BYTES = 50 * 1024;

export function PersonaDrawer({ initialPersona }: PersonaDrawerProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [resumeText, setResumeText] = useState("");
  const [name, setName] = useState(initialPersona.name ?? "");
  const [targetRole, setTargetRole] = useState(initialPersona.target_role ?? "");
  const [years, setYears] = useState(
    initialPersona.years !== undefined ? String(initialPersona.years) : "",
  );
  const [highlights, setHighlights] = useState(
    (initialPersona.highlights ?? []).join("\n"),
  );
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".txt") && !lower.endsWith(".md")) {
      setMsg(t("personaErrExt"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMsg(t("personaErrSize"));
      return;
    }
    const content = await file.text();
    if (content.length > MAX_INPUT_CHARS) {
      setResumeText(content.slice(0, MAX_INPUT_CHARS));
      setMsg(t("personaTruncated"));
    } else {
      setResumeText(content);
      setMsg("");
    }
  };

  const handleSummarize = async () => {
    const trimmed = resumeText.trim();
    if (!trimmed) {
      setMsg(t("personaErrEmpty"));
      return;
    }
    setBusy(true);
    setMsg(t("personaSummarizing"));
    try {
      const res = await fetch("/api/persona/summarize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...buildByokHeaders(),
        },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = (await res.json()) as { persona?: Persona; error?: string };
      if (!res.ok || !data.persona) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setName(data.persona.name ?? "");
      setTargetRole(data.persona.target_role ?? "");
      setYears(data.persona.years !== undefined ? String(data.persona.years) : "");
      setHighlights((data.persona.highlights ?? []).join("\n"));
      setMsg(t("personaSummarized"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMsg(t("personaErrGeneric", { message }));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const payload: Persona = {
        name: name.trim(),
        target_role: targetRole.trim(),
        years: years.trim() ? Number(years) : undefined,
        highlights: highlights
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5),
      };
      const res = await fetch("/api/persona", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMsg(t("personaSaved"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMsg(t("personaErrGeneric", { message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
      <summary className="cursor-pointer font-medium text-slate-200 select-none">
        {t("personaDrawerTitle")}
      </summary>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{t("resumeSourceLabel")}</span>
            <span>
              {resumeText.length} / {MAX_INPUT_CHARS}
            </span>
          </div>
          <textarea
            rows={4}
            maxLength={MAX_INPUT_CHARS}
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder={t("resumePlaceholder")}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50"
            >
              {t("btnImportResume")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              disabled={busy}
              onClick={handleSummarize}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {t("btnSummarizeResume")}
            </button>
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-800 pt-3">
          <div className="text-xs text-slate-400">{t("personaAppliedLabel")}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-slate-300">
              <span>{t("personaNameLabel")}</span>
              <input
                type="text"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-300">
              <span>{t("personaRoleLabel")}</span>
              <input
                type="text"
                maxLength={120}
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-300">
              <span>{t("personaYearsLabel")}</span>
              <input
                type="number"
                min={0}
                max={60}
                step={0.5}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
              />
            </label>
          </div>
          <label className="block space-y-1 text-xs text-slate-300">
            <span>{t("personaHighlightsLabel")}</span>
            <textarea
              rows={4}
              value={highlights}
              onChange={(e) => setHighlights(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {t("btnSavePersona")}
            </button>
            {msg && <span className="text-xs text-amber-300">{msg}</span>}
          </div>
        </div>
      </div>
    </details>
  );
}
