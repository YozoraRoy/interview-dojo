import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanForSpeech, SentenceSplitter } from "./sentences.ts";

test("依句尾符號切句，跨片段也能湊齊", () => {
  const sp = new SentenceSplitter();
  assert.deepEqual(sp.push("本日はお越しいた"), []);
  assert.deepEqual(sp.push("だき、ありがとうございます。まず自己紹"), [
    "本日はお越しいただき、ありがとうございます。",
  ]);
  assert.deepEqual(sp.push("介をお願いします？"), ["まず自己紹介をお願いします？"]);
  assert.deepEqual(sp.flush(), []);
});

test("flush 會吐出沒有句尾符號的殘餘內容", () => {
  const sp = new SentenceSplitter();
  sp.push("以上です");
  assert.deepEqual(sp.flush(), ["以上です"]);
});

test("清除 markdown 與括號舞台提示", () => {
  assert.equal(cleanForSpeech("**結論**から（うなずく）お願いします。"), "結論からお願いします。");
});

test("清除 think 區塊", () => {
  assert.equal(cleanForSpeech("<think>考え中</think>こんにちは。"), "こんにちは。");
});
