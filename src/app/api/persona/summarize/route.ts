import { NextResponse } from "next/server";
import { parseByokFromHeaders } from "@/lib/llm/router.ts";
import {
  isAllowedResumeFileName,
  MAX_RESUME_FILE_BYTES,
  MAX_RESUME_INPUT_CHARS,
  summarizeResumeToPersona,
} from "@/lib/persona.ts";

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    text?: string;
    fileName?: string;
    fileSize?: number;
  };

  if (body.fileName && !isAllowedResumeFileName(body.fileName)) {
    return NextResponse.json(
      { error: "僅支援 .txt 或 .md 純文字檔案。" },
      { status: 400 },
    );
  }
  if (typeof body.fileSize === "number" && body.fileSize > MAX_RESUME_FILE_BYTES) {
    return NextResponse.json(
      { error: "檔案大小不可超過 50 KB。" },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "請輸入或匯入履歷內容。" },
      { status: 400 },
    );
  }
  if (text.length > MAX_RESUME_INPUT_CHARS) {
    return NextResponse.json(
      { error: `內容不可超過 ${MAX_RESUME_INPUT_CHARS} 字元。` },
      { status: 400 },
    );
  }

  try {
    const byok = parseByokFromHeaders(request.headers);
    const persona = await summarizeResumeToPersona(text, byok);
    return NextResponse.json({ persona });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
