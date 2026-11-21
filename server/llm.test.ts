import assert from "node:assert/strict";
import { test } from "node:test";
import { trimMessagesForLive, type ChatMessage } from "./llm.ts";

test("超過輪數上限時保留 system prompt 與最近對話", () => {
  const msgs: ChatMessage[] = [{ role: "system", content: "SYS" }];
  for (let i = 1; i <= 15; i++) {
    msgs.push({ role: "user", content: `u${i}` });
    msgs.push({ role: "assistant", content: `a${i}` });
  }
  const trimmed = trimMessagesForLive(msgs, 12);
  assert.equal(trimmed.length, 1 + 24);
  assert.equal(trimmed[0].content, "SYS");
  assert.equal(trimmed[1].content, "u4");
  assert.equal(trimmed.at(-1)?.content, "a15");
});
