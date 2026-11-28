export interface ByteRange {
  start: number;
  end: number;
}

/**
 * 解析 HTTP Range header（支援 `bytes=start-end`、`bytes=start-`、`bytes=-suffix`）。
 * 格式不合法或超出檔案大小時回傳 null。
 */
export function parseRangeHeader(rangeHeader: string, fileSize: number): ByteRange | null {
  if (fileSize <= 0 || !rangeHeader.startsWith("bytes=")) return null;
  const spec = rangeHeader.slice(6).split(",")[0]?.trim() ?? "";
  const dashIdx = spec.indexOf("-");
  if (dashIdx < 0) return null;

  const rawStart = spec.slice(0, dashIdx).trim();
  const rawEnd = spec.slice(dashIdx + 1).trim();

  let start: number;
  let end: number;

  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else {
    start = Number(rawStart);
    if (!Number.isInteger(start) || start < 0 || start >= fileSize) return null;
    if (rawEnd === "") {
      end = fileSize - 1;
    } else {
      end = Number(rawEnd);
      if (!Number.isInteger(end) || end < start) return null;
      end = Math.min(end, fileSize - 1);
    }
  }

  return { start, end };
}
