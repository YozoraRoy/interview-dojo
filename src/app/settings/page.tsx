import { SettingsClient } from "@/components/settings/SettingsClient.tsx";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">系統設定</h1>
        <p className="mt-1 text-xs text-slate-400">
          設定語音合成偏好與未來外部 LLM API Key（BYOK）。
        </p>
      </div>
      <SettingsClient />
    </div>
  );
}
