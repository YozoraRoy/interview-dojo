import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { listSpeakers } from "@/lib/speech.ts";

export async function GET() {
  const speakers = await listSpeakers();
  return NextResponse.json({
    defaultSpeaker: config.voicevoxSpeaker,
    speakers,
  });
}
