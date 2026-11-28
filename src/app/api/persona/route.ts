import { updateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  loadPersona,
  MAX_PERSONA_PROMPT_CHARS,
  MAX_RESUME_FILE_BYTES,
  MAX_RESUME_INPUT_CHARS,
  savePersona,
  type Persona,
} from "@/lib/persona.ts";

export async function GET() {
  const persona = await loadPersona();
  return NextResponse.json({
    persona,
    limits: {
      maxInputChars: MAX_RESUME_INPUT_CHARS,
      maxPromptChars: MAX_PERSONA_PROMPT_CHARS,
      maxFileBytes: MAX_RESUME_FILE_BYTES,
    },
  });
}

export async function PUT(request: Request) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Persona;
  const saved = await savePersona(body);
  updateTag("persona");
  return NextResponse.json({ ok: true, persona: saved });
}
