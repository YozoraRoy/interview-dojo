import { updateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/sessions.ts";

export async function POST() {
  const session = await createSession();
  updateTag("sessions");
  return NextResponse.json({
    sessionId: session.id,
    role: session.role ?? "Tech Lead / PM",
  });
}
