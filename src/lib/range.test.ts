import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRangeHeader } from "./range.ts";

describe("parseRangeHeader HTTP Range 解析", () => {
  it("正確解析完整起訖範圍與夾緊檔案結尾", () => {
    assert.deepEqual(parseRangeHeader("bytes=0-1023", 5000), { start: 0, end: 1023 });
    assert.deepEqual(parseRangeHeader("bytes=4000-9999", 5000), { start: 4000, end: 4999 });
  });

  it("正確解析開放結尾與尾端後綴範圍", () => {
    assert.deepEqual(parseRangeHeader("bytes=500-", 5000), { start: 500, end: 4999 });
    assert.deepEqual(parseRangeHeader("bytes=-512", 5000), { start: 4488, end: 4999 });
  });

  it("拒絕無效或越界 Range", () => {
    assert.equal(parseRangeHeader("bytes=5000-", 5000), null);
    assert.equal(parseRangeHeader("bytes=300-100", 5000), null);
    assert.equal(parseRangeHeader("items=0-10", 5000), null);
    assert.equal(parseRangeHeader("bytes=0-10", 0), null);
  });
});
