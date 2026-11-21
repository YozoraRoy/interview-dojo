import type { SpeechMetrics, TurnEntry } from "./metrics.ts";

export interface ExportPayload {
  sessionId: string;
  createdAt: string;
  metrics: SpeechMetrics;
  turns: TurnEntry[];
  report: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSec(sec?: number): string {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return "";
  const s = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

/** 輕量 Markdown 轉 HTML（處理標題、粗體、清單、引用、換行，並確保先做 HTML 跳脫）。 */
function renderMarkdownSafe(md: string): string {
  const lines = escapeHtml(md).split(/\r?\n/);
  const out: string[] = [];
  let inList = false;

  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,3}\s+/.test(line)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      const level = line.match(/^(#{1,3})/)![1].length;
      out.push(`<h${level + 1}>${inline(line.replace(/^#{1,3}\s+/, ""))}</h${level + 1}>`);
    } else if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^([-*]|\d+\.)\s+/, ""))}</li>`);
    } else if (line.startsWith("&gt;")) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ""))}</blockquote>`);
    } else if (line.trim() === "" || line.trim() === "---") {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (line.trim() === "---") out.push("<hr>");
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

/** 產生單一自包含、支援列印 PDF 的 HTML 面試復盤報告。 */
export function renderHtmlReport(data: ExportPayload): string {
  const visibleTurns = data.turns.filter(
    (t, idx) => t.role !== "system" && !(idx === 1 && t.content === "面接を始めてください。"),
  );

  const turnsHtml = visibleTurns
    .map((t) => {
      const roleLabel = t.role === "assistant" ? "面試官" : "應試者";
      const cls = t.role === "assistant" ? "assistant" : "user";
      const ts = formatSec(t.offsetSec);
      const tsHtml = ts ? `<span class="ts">[${ts}]</span>` : "";
      return `<div class="turn ${cls}">
  <div class="turn-meta">${tsHtml}<strong>${roleLabel}</strong></div>
  <div class="turn-body">${escapeHtml(t.content)}</div>
</div>`;
    })
    .join("\n");

  const fillerDetail =
    Object.entries(data.metrics.fillers)
      .map(([k, v]) => `${escapeHtml(k)}: ${v}`)
      .join("、") || "無";

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>模擬面試復盤報告 - ${escapeHtml(data.sessionId)}</title>
  <style>
    :root { --bg:#0f1217; --card:#171b22; --border:#2a303c; --text:#e6e9ef; --muted:#9aa4b2; --accent:#3b82f6; }
    * { box-sizing: border-box; }
    body { margin:0; padding:28px 18px; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); line-height:1.65; }
    .container { max-width:920px; margin:0 auto; display:flex; flex-direction:column; gap:20px; }
    .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:20px 24px; }
    h1 { margin:0 0 6px; font-size:1.4rem; }
    h2 { margin:0 0 12px; font-size:1.15rem; border-bottom:1px solid var(--border); padding-bottom:8px; }
    h3, h4 { margin:14px 0 6px; font-size:1rem; color:#93c5fd; }
    .meta { color:var(--muted); font-size:0.86rem; }
    .chips { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; }
    .chip { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:6px 12px; font-size:0.86rem; }
    .turn { padding:10px 14px; border-radius:8px; margin-bottom:10px; border:1px solid var(--border); }
    .turn.assistant { background:#131720; }
    .turn.user { background:#1b2434; }
    .turn-meta { font-size:0.8rem; color:var(--muted); margin-bottom:4px; }
    .ts { color:#93c5fd; margin-right:6px; font-family:monospace; }
    blockquote { margin:8px 0; padding:8px 12px; border-left:3px solid var(--accent); background:rgba(59,130,246,0.08); border-radius:4px; }
    ul { padding-left:20px; margin:6px 0; }
    code { background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:4px; }
    hr { border:0; border-top:1px solid var(--border); margin:14px 0; }
    @media print {
      body { background:#fff; color:#111; padding:0; }
      .card { background:#fff; border-color:#ddd; break-inside:avoid; }
      .turn.assistant, .turn.user, .chip { background:#f8fafc; border-color:#ddd; color:#111; }
      h3, h4, .ts { color:#1d4ed8; }
    }
  </style>
</head>
<body>
  <div class="container">
    <section class="card">
      <h1>模擬面試復盤報告</h1>
      <div class="meta">場次 ID：${escapeHtml(data.sessionId)} ｜ 時間：${escapeHtml(data.createdAt)}</div>
      <div class="chips">
        <div class="chip">有效回答：<strong>${data.metrics.userTurns}</strong> 次</div>
        <div class="chip">總字數：<strong>${data.metrics.totalChars}</strong> 字（平均 ${data.metrics.avgCharsPerTurn} 字）</div>
        <div class="chip">日文填充詞：<strong>${data.metrics.fillerTotal}</strong> 次（${fillerDetail}）</div>
      </div>
    </section>

    <section class="card">
      <h2>AI 面試官復盤與評分</h2>
      ${data.report ? renderMarkdownSafe(data.report) : "<p class='meta'>尚未產生評分報告。</p>"}
    </section>

    <section class="card">
      <h2>完整對話紀錄（${visibleTurns.length} 則）</h2>
      ${turnsHtml || "<p class='meta'>尚無對話紀錄。</p>"}
    </section>
  </div>
</body>
</html>`;
}
