// 把 LLM 串流輸出切成「一句一句」，讓 TTS 可以邊生成邊合成。

const TERMINATORS = new Set(["。", "！", "？", "!", "?", "\n"]);

/** 移除不該被唸出來的記號（markdown、括號內的舞台提示）。 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class SentenceSplitter {
  private buffer = "";

  /** 餵入新片段，回傳這次湊齊的完整句子。 */
  push(chunk: string): string[] {
    const out: string[] = [];
    for (const ch of chunk) {
      this.buffer += ch;
      if (TERMINATORS.has(ch)) {
        const s = cleanForSpeech(this.buffer);
        this.buffer = "";
        if (s.length > 0) out.push(s);
      }
    }
    return out;
  }

  /** 串流結束時，吐出剩下沒有句尾符號的內容。 */
  flush(): string[] {
    const s = cleanForSpeech(this.buffer);
    this.buffer = "";
    return s.length > 0 ? [s] : [];
  }
}
