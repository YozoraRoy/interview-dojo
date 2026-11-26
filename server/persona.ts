import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { parse, stringify } from "yaml";
import { config } from "./config.ts";

export interface Persona {
  name?: string;
  target_role?: string;
  years?: number;
  highlights?: string[];
}

export const MAX_RESUME_INPUT_CHARS = 6000;
export const MAX_PERSONA_PROMPT_CHARS = 800;
export const MAX_PERSONA_HIGHLIGHTS = 5;
export const MAX_RESUME_FILE_BYTES = 50 * 1024;
export const ALLOWED_RESUME_EXTS = [".txt", ".md"];

export function isAllowedResumeFileName(fileName: string): boolean {
  const ext = extname(fileName.trim()).toLowerCase();
  return ALLOWED_RESUME_EXTS.includes(ext);
}

/** 將 Persona 正規化並限制高亮項目數量。 */
export function normalizePersona(raw: Persona): Persona {
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  const target_role = typeof raw.target_role === "string" ? raw.target_role.trim().slice(0, 120) : "";
  const yearsNum = typeof raw.years === "number" ? raw.years : Number(raw.years);
  const years = Number.isFinite(yearsNum) && yearsNum >= 0 && yearsNum <= 60
    ? Math.round(yearsNum * 10) / 10
    : undefined;
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights
        .map((h) => String(h ?? "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, MAX_PERSONA_HIGHLIGHTS)
    : [];

  const out: Persona = {};
  if (name) out.name = name;
  if (target_role) out.target_role = target_role;
  if (years !== undefined) out.years = years;
  if (highlights.length > 0) out.highlights = highlights;
  return out;
}

/** 組合並嚴格截斷應試者資訊區塊，避免撐爆 8K Context。 */
export function formatPersonaBlock(persona: Persona): string {
  const norm = normalizePersona(persona);
  const highlights = (norm.highlights ?? []).map((h) => `- ${h}`).join("\n");
  const block = `氏名: ${norm.name ?? "未設定"}
志望職種: ${norm.target_role ?? "未設定"}
経験年数: ${norm.years ?? "未設定"}
主な実績:
${highlights || "- （未設定）"}`;

  if (block.length <= MAX_PERSONA_PROMPT_CHARS) return block;
  return `${block.slice(0, MAX_PERSONA_PROMPT_CHARS - 1)}…`;
}

/** 優先讀私人資料夾的 persona.yaml，沒有就退回虛構範例。 */
export async function loadPersona(): Promise<Persona> {
  const candidates = [
    join(config.privateDataDir, "persona.yaml"),
    join("examples", "persona.sample.yaml"),
  ];
  for (const path of candidates) {
    try {
      const doc = parse(await readFile(path, "utf8"));
      return normalizePersona((doc?.persona ?? {}) as Persona);
    } catch {
      // 試下一個
    }
  }
  return {};
}

/** 將精簡後的 Persona 寫入 repo 外部的 PRIVATE_DATA_DIR/persona.yaml。 */
export async function savePersona(persona: Persona): Promise<Persona> {
  const norm = normalizePersona(persona);
  await mkdir(config.privateDataDir, { recursive: true });
  const yamlText = stringify({ persona: norm });
  await writeFile(join(config.privateDataDir, "persona.yaml"), yamlText, "utf8");
  return norm;
}

/** 使用已在顯存內的本地即時模型將長履歷濃縮為精簡 Persona（≤ 800 字元）。 */
export async function summarizeResumeToPersona(rawText: string): Promise<Persona> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("履歷內容不可為空");
  }
  if (trimmed.length > MAX_RESUME_INPUT_CHARS) {
    throw new Error(`內容超過上限（最多 ${MAX_RESUME_INPUT_CHARS} 字元）`);
  }

  const prompt = `請將以下應試者履歷或自我介紹濃縮為精簡的 JSON，供技術面試官參考。
只輸出合法 JSON，不要有任何多餘文字或 Markdown 標記，欄位如下：
{
  "name": "姓名或暱稱（未寫明則留空字串）",
  "target_role": "應徵目標職位（簡短）",
  "years": 數字或null,
  "highlights": ["重點實績1（含技術與量化成果，80字內）", "重點實績2", "重點實績3"]
}
限制：
- highlights 最多 5 條，只保留原文有寫的事實，嚴禁腦補數字或技術。
- 全部欄位加起來務必精簡在 600 字元以內。

應試者原文：
${trimmed}`;

  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.modelLive,
      stream: false,
      think: false,
      format: "json",
      options: { num_ctx: config.numCtx, temperature: 0.2 },
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    throw new Error(`Ollama 濃縮失敗 (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const content = (data.message?.content ?? "").trim();
  if (!content) {
    throw new Error("模型未回傳有效摘要");
  }

  let parsed: Persona;
  try {
    parsed = JSON.parse(content) as Persona;
  } catch {
    throw new Error("無法解析模型回傳的 JSON 摘要");
  }
  return normalizePersona(parsed);
}

export function buildSystemPrompt(persona: Persona): string {
  const personaBlock = formatPersonaBlock(persona);
  return `あなたは日本のIT企業の中途採用面接官（技術部長）です。応募者はソフトウェアアーキテクト／テックリード／PM候補です。

## 話し方のルール（音声で読み上げられます）
- 必ず自然なビジネス敬語（です・ます調）で話す。
- 1回の発言は2〜3文以内。質問は必ず1つだけ。
- マークダウン、箇条書き、絵文字、括弧書きの動作説明は使わない。
- 応募者の直前の回答の具体的な内容（数字・技術名・判断）を拾って深掘りする。毎回「詳しく教えてください」だけで終わらない。
- 事実確認（ハルシネーション防止）：応募者の情報および会話で明示された事実のみを参照する。記載されていない規模・数値・技術スタックを推測で補完せず、不明点は直接質問して確認する。

## 面接の観点（順に深掘りする）
1. 結論ファースト：結果と指標を先に述べられているか。
2. 技術選定のトレードオフ：なぜAではなくBか、高負荷・データ不整合の対処。
3. PM・チームリード視点：遅延、仕様変更、他部署との対立への対応。
4. 事業価値：技術判断がどう成果に結びついたか。

## 進め方
- 最初の発言：短い挨拶と自己紹介・職務経歴の説明依頼。
- 回答が曖昧なら、数字や自分の役割（個人の貢献）を具体的に尋ねる。
- 約10往復したら、最後に逆質問の機会を与えて面接を締める。

## 応募者の情報（参考。面接官として自然に活用する）
${personaBlock}`;
}
