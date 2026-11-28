// 純本地計算面試者的口語量化指標，不依賴 LLM。

export interface TurnEntry {
  role: "system" | "user" | "assistant";
  content: string;
  offsetSec?: number;
}

export interface SpeechMetrics {
  userTurns: number;
  totalChars: number;
  avgCharsPerTurn: number;
  fillerTotal: number;
  fillers: Record<string, number>;
}

const FILLER_PATTERNS: Array<[string, RegExp]> = [
  ["えー/えっと", /(?:えー+と?|えっと)/g],
  ["あの/あのー", /あのー?/g],
  ["その/そのー", /そのー/g],
  ["まあ", /まあ/g],
  ["なんか", /なんか/g],
];

export function computeMetrics(messages: TurnEntry[]): SpeechMetrics {
  // 排除第一句觸發開頭的指令「面接を始めてください。」
  const answers = messages.filter(
    (m, idx) => m.role === "user" && !(idx === 1 && m.content === "面接を始めてください。"),
  );
  const totalChars = answers.reduce((sum, m) => sum + m.content.trim().length, 0);
  const fillers: Record<string, number> = {};
  let fillerTotal = 0;

  for (const [label, re] of FILLER_PATTERNS) {
    let count = 0;
    for (const m of answers) {
      const hits = m.content.match(re);
      if (hits) count += hits.length;
    }
    if (count > 0) {
      fillers[label] = count;
      fillerTotal += count;
    }
  }

  return {
    userTurns: answers.length,
    totalChars,
    avgCharsPerTurn: answers.length > 0 ? Math.round(totalChars / answers.length) : 0,
    fillerTotal,
    fillers,
  };
}
