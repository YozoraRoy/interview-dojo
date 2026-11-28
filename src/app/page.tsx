import { Suspense } from "react";
import { InterviewWorkspace } from "@/components/stage/InterviewWorkspace.tsx";
import { getCachedPersona } from "@/lib/cache.ts";

async function PersonaStageLoader() {
  const persona = await getCachedPersona();
  return <InterviewWorkspace initialPersona={persona} />;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-400">
          載入面試舞台中…
        </div>
      }
    >
      <PersonaStageLoader />
    </Suspense>
  );
}
