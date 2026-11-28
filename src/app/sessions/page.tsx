import Link from "next/link";
import { Suspense } from "react";
import { getCachedSessionList } from "@/lib/cache.ts";

async function SessionListContent() {
  const sessions = await getCachedSessionList();

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
        目前尚無歷史面試紀錄。請先前往{" "}
        <Link href="/" className="text-indigo-400 underline">
          面試道場
        </Link>{" "}
        開始一場模擬面試。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((item) => (
        <Link
          key={item.id}
          href={`/sessions/${item.id}`}
          className="group rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-indigo-500/50 hover:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-indigo-400">#{item.id}</span>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
              {item.turnCount} 輪
            </span>
          </div>
          <h2 className="mt-2 font-semibold text-white group-hover:text-indigo-300">
            {item.role}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {new Date(item.createdAt).toLocaleString()}
          </p>
        </Link>
      ))}
    </div>
  );
}

export default function SessionsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">歷史面試紀錄與復盤</h1>
          <p className="mt-1 text-xs text-slate-400">
            點擊任意場次即可回放整場錄影並跳轉對應逐字稿時間點。
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          回到面試道場
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
            讀取場次列表中…
          </div>
        }
      >
        <SessionListContent />
      </Suspense>
    </div>
  );
}
