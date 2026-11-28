import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { parseRangeHeader } from "@/lib/range.ts";
import { isValidSessionId } from "@/lib/sessions.ts";

const MAX_RECORDING_BYTES = 500 * 1024 * 1024;

function getRecordingPath(id: string): string {
  return resolve(join(config.privateDataDir, "recordings", `${id}.webm`));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidSessionId(id)) {
    return NextResponse.json({ error: "無效的場次 ID" }, { status: 400 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "缺少錄影串流內容" }, { status: 400 });
  }

  const dir = join(config.privateDataDir, "recordings");
  await mkdir(dir, { recursive: true });
  const filePath = getRecordingPath(id);

  let totalBytes = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_RECORDING_BYTES) {
        callback(new Error("錄影檔案超過 500 MB 上限"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    const webStream = request.body as unknown as NodeWebReadableStream<Uint8Array>;
    await pipeline(Readable.fromWeb(webStream), sizeGuard, createWriteStream(filePath));
    return NextResponse.json({ ok: true, bytes: totalBytes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("500 MB") ? 413 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidSessionId(id)) {
    return new NextResponse(null, { status: 400 });
  }

  const filePath = getRecordingPath(id);
  let fileSize: number;
  try {
    const info = await stat(filePath);
    fileSize = info.size;
  } catch {
    return NextResponse.json({ error: "尚未有錄影檔" }, { status: 404 });
  }

  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    const webStream = Readable.toWeb(createReadStream(filePath)) as unknown as BodyInit;
    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "video/webm",
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const parsed = parseRangeHeader(rangeHeader, fileSize);
  if (!parsed) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const { start, end } = parsed;
  const chunkSize = end - start + 1;
  const webStream = Readable.toWeb(
    createReadStream(filePath, { start, end }),
  ) as unknown as BodyInit;

  return new Response(webStream, {
    status: 206,
    headers: {
      "Content-Type": "video/webm",
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": String(chunkSize),
      "Accept-Ranges": "bytes",
    },
  });
}
