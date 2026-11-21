import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { config } from "./config.ts";

export interface Persona {
  name?: string;
  target_role?: string;
  years?: number;
  highlights?: string[];
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
      return (doc?.persona ?? {}) as Persona;
    } catch {
      // 試下一個
    }
  }
  return {};
}

export function buildSystemPrompt(persona: Persona): string {
  const highlights = (persona.highlights ?? []).map((h) => `- ${h}`).join("\n");
  return `あなたは日本のIT企業の中途採用面接官（技術部長）です。応募者はソフトウェアアーキテクト／テックリード／PM候補です。

## 話し方のルール（音声で読み上げられます）
- 必ず自然なビジネス敬語（です・ます調）で話す。
- 1回の発言は2〜3文以内。質問は必ず1つだけ。
- マークダウン、箇条書き、絵文字、括弧書きの動作説明は使わない。
- 応募者の直前の回答の具体的な内容（数字・技術名・判断）を拾って深掘りする。毎回「詳しく教えてください」だけで終わらない。

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
氏名: ${persona.name ?? "未設定"}
志望職種: ${persona.target_role ?? "未設定"}
経験年数: ${persona.years ?? "未設定"}
主な実績:
${highlights || "- （未設定）"}`;
}
